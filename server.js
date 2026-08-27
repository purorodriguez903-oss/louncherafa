const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-Memory Live Sessions Tracker (Heartbeats)
const activeSessions = new Map();

// In-Memory Admin Tokens & Brute Force Rate Limiter
const adminTokens = new Map(); // token -> { createdAt, expiresAt, ip }
const failedAttempts = new Map(); // ip -> { count, lockedUntil }

// Ensure required directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Helper to read and write config
function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (!parsed.keys) parsed.keys = [];
            if (!parsed.killSwitch) parsed.killSwitch = { active: false, reason: "Juego en mantenimiento." };
            if (!parsed.discord) parsed.discord = { enabled: false, webhookUrl: "" };
            return parsed;
        }
    } catch (e) {
        console.error('Error reading config.json:', e);
    }
    return { keys: [], killSwitch: { active: false }, discord: { enabled: false } };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.error('Error saving config.json:', e);
        return false;
    }
}

// Clean up expired sessions & tokens
function cleanupHousekeeping() {
    const now = Date.now();
    for (const [hwid, session] of activeSessions.entries()) {
        if (now - session.lastSeen > 60000) {
            activeSessions.delete(hwid);
        }
    }
    for (const [token, data] of adminTokens.entries()) {
        if (now > data.expiresAt) {
            adminTokens.delete(token);
        }
    }
    for (const [ip, data] of failedAttempts.entries()) {
        if (now > data.lockedUntil && data.count === 0) {
            failedAttempts.delete(ip);
        }
    }
}
setInterval(cleanupHousekeeping, 15000);

// Format file size nicely
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Calculate SHA-256 checksum of a file
function getFileChecksum(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (e) {
        return null;
    }
}

// Synchronize DLL file sizes and timestamps from disk
function refreshDllMetadata() {
    const config = getConfig();
    if (!config.dlls) return config;

    config.dlls.forEach(dll => {
        const filePath = path.join(UPLOADS_DIR, dll.filename);
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            dll.size = formatBytes(stats.size);
            dll.checksum = getFileChecksum(filePath);
            dll.exists = true;
        } else {
            dll.exists = false;
        }
    });

    const launcherPath = path.join(UPLOADS_DIR, 'Launcher_RafaPanel.exe');
    if (fs.existsSync(launcherPath)) {
        const stats = fs.statSync(launcherPath);
        config.launcher = {
            filename: 'Launcher_RafaPanel.exe',
            size: formatBytes(stats.size),
            checksum: getFileChecksum(launcherPath),
            updatedAt: stats.mtime.toISOString(),
            exists: true
        };
    }

    saveConfig(config);
    return config;
}

// Discord Webhook Sender
function sendDiscordEmbed({ title, description, color = 0x00F0FF, fields = [] }) {
    try {
        const config = getConfig();
        if (!config.discord || !config.discord.enabled || !config.discord.webhookUrl) return;

        const webhookUrl = new URL(config.discord.webhookUrl);
        const payload = JSON.stringify({
            username: "RafaPanel Cloud Bot",
            avatar_url: "https://raw.githubusercontent.com/feathericons/feather/master/icons/zap.png",
            embeds: [{
                title: title,
                description: description,
                color: color,
                fields: fields,
                footer: { text: "RAFA PANEL VIP 2026 • Encrypted Cloud Defense" },
                timestamp: new Date().toISOString()
            }]
        });

        const req = https.request(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        });
        req.on('error', (err) => console.error('[Discord Webhook Error]', err.message));
        req.write(payload);
        req.end();
    } catch (e) {
        console.error('[Discord Webhook Exception]', e);
    }
}

// MIME type resolver
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.ico': 'image/x-icon',
        '.svg': 'image/svg+xml',
        '.dll': 'application/x-msdownload',
        '.exe': 'application/x-msdownload'
    };
    return mimeMap[ext] || 'application/octet-stream';
}

// Lightweight multipart form-data parser
function parseMultipartFormData(req, callback) {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) return callback(new Error('Formato multipart inválido'));

    const boundary = match[1] || match[2];
    const boundaryBuffer = Buffer.from('--' + boundary);
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        try {
            const body = Buffer.concat(chunks);
            let start = 0;
            const fields = {};
            let fileData = null;
            let fileName = '';
            let fieldName = '';

            while ((start = body.indexOf(boundaryBuffer, start)) !== -1) {
                start += boundaryBuffer.length;
                if (body[start] === 45 && body[start + 1] === 45) break;

                const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
                if (headerEnd === -1) break;

                const headerText = body.slice(start, headerEnd).toString('utf8');
                const contentStart = headerEnd + 4;
                const nextBoundary = body.indexOf(boundaryBuffer, contentStart);
                if (nextBoundary === -1) break;

                const contentEnd = nextBoundary - 2;
                const partContent = body.slice(contentStart, contentEnd);

                const dispMatch = headerText.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
                if (dispMatch) {
                    fieldName = dispMatch[1];
                    const fn = dispMatch[2];
                    if (fn) {
                        fileName = fn;
                        fileData = partContent;
                    } else {
                        fields[fieldName] = partContent.toString('utf8').trim();
                    }
                }
                start = nextBoundary;
            }

            callback(null, { fields, file: fileData ? { filename: fileName, data: fileData } : null });
        } catch (err) {
            callback(err);
        }
    });
}

// Generate Random Key (e.g. RAFA-9A7B-4C2E-8F1D)
function generateRandomKey(prefix = "RAFA") {
    const segment = () => crypto.randomBytes(2).toString('hex').toUpperCase();
    return `${prefix}-${segment()}-${segment()}-${segment()}`;
}

// Calculate remaining time string
function getRemainingTimeString(expiresAt) {
    if (!expiresAt) return "Permanente / Lifetime VIP";
    const now = Date.now();
    const exp = new Date(expiresAt).getTime();
    const diffMs = exp - now;
    if (diffMs <= 0) return "Expirada";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h restantes`;
    if (hours > 0) return `${hours}h ${minutes}m restantes`;
    return `${minutes}m restantes`;
}

// Safe Timing Compare for Passwords
function safeCompare(input, secret) {
    if (typeof input !== 'string' || typeof secret !== 'string') return false;
    const bufA = Buffer.from(input);
    const bufB = Buffer.from(secret);
    if (bufA.length !== bufB.length) {
        // Dummy timing to prevent length leak
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

// Main HTTP Server
const server = http.createServer((req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // Global Defense & Security Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password, X-Admin-Token');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    const sendJson = (statusCode, obj) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
    };

    // Check Admin Authentication (Supports Session Tokens or direct Password)
    const checkAdminAuth = (bodyPassword) => {
        const config = getConfig();
        const headerToken = req.headers['x-admin-token'];
        const authHeader = req.headers['authorization'];
        let token = headerToken;
        if (!token && authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        }

        // Validate Token
        if (token && adminTokens.has(token)) {
            const tokData = adminTokens.get(token);
            if (Date.now() < tokData.expiresAt) {
                return true;
            } else {
                adminTokens.delete(token);
            }
        }

        // Direct Password fallback
        const headerPass = req.headers['x-admin-password'];
        const candidate = headerPass || bodyPassword;
        if (candidate && safeCompare(candidate, config.server.adminPassword)) {
            return true;
        }

        return false;
    };

    const readBody = (callback) => {
        let bodyStr = '';
        req.on('data', chunk => bodyStr += chunk);
        req.on('end', () => {
            try {
                const parsed = bodyStr ? JSON.parse(bodyStr) : {};
                callback(null, parsed);
            } catch (e) {
                callback(e, {});
            }
        });
    };

    // --- API ROUTES ---

    // 1. Admin Login & Session Generation (With Brute Force Shield)
    if (pathname === '/api/admin/login' && req.method === 'POST') {
        return readBody((err, data) => {
            const now = Date.now();
            const ipData = failedAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };

            if (now < ipData.lockedUntil) {
                const waitSec = Math.ceil((ipData.lockedUntil - now) / 1000);
                return sendJson(429, {
                    success: false,
                    error: "BLOCKED",
                    message: `Demasiados intentos fallidos. Bloqueo de seguridad activo por ${waitSec} segundos.`
                });
            }

            const config = getConfig();
            const { password, rememberMe } = data;

            if (safeCompare(password, config.server.adminPassword)) {
                // Reset failed attempts on success
                failedAttempts.delete(clientIp);

                // Generate Crypto Session Token
                const token = crypto.randomBytes(32).toString('hex');
                const ttl = rememberMe ? (30 * 86400000) : (86400000); // 30 days or 24 hours
                const expiresAt = now + ttl;

                adminTokens.set(token, { ip: clientIp, createdAt: now, expiresAt });

                return sendJson(200, {
                    success: true,
                    token: token,
                    expiresAt: expiresAt,
                    message: "Autenticación exitosa"
                });
            } else {
                ipData.count += 1;
                if (ipData.count >= 5) {
                    ipData.lockedUntil = now + (10 * 60 * 1000); // 10 minutes lock
                }
                failedAttempts.set(clientIp, ipData);

                return sendJson(401, {
                    success: false,
                    error: "INVALID_CREDENTIALS",
                    message: "Contraseña incorrecta. Acceso denegado."
                });
            }
        });
    }

    // 2. Validate Active Admin Session Token
    if (pathname === '/api/admin/verify-session' && req.method === 'GET') {
        const isAuth = checkAdminAuth();
        return sendJson(isAuth ? 200 : 401, { authenticated: isAuth });
    }

    // 3. Get Public Config
    if (pathname === '/api/config' && req.method === 'GET') {
        const config = refreshDllMetadata();
        cleanupHousekeeping();
        return sendJson(200, {
            status: config.status,
            security: {
                allowFreeAccess: config.security.allowFreeAccess,
                loginRequired: config.security.loginRequired,
                accessKey: config.security.accessKey
            },
            killSwitch: config.killSwitch || { active: false },
            stats: {
                dllDownloads: config.stats.dllDownloads,
                launcherDownloads: config.stats.launcherDownloads,
                activeUsers: activeSessions.size
            },
            dlls: config.dlls,
            launcher: config.launcher
        });
    }

    // 4. File Integrity & SHA-256 Checksums (Anti-Tamper)
    if (pathname === '/api/integrity' && req.method === 'GET') {
        const config = refreshDllMetadata();
        const integrityMap = {};
        if (config.launcher && config.launcher.exists) {
            integrityMap[config.launcher.filename] = config.launcher.checksum;
        }
        if (config.dlls) {
            config.dlls.forEach(d => {
                if (d.exists) integrityMap[d.filename] = d.checksum;
            });
        }
        return sendJson(200, {
            success: true,
            version: config.status.version,
            checksums: integrityMap
        });
    }

    // 5. Verify Key & HWID Binding (Launcher Auth)
    if (pathname === '/api/verify-key' && req.method === 'POST') {
        return readBody((err, data) => {
            const config = getConfig();
            const { key, hwid, emulator } = data;

            // Check Emergency Kill Switch
            if (config.killSwitch && config.killSwitch.active) {
                return sendJson(200, {
                    success: false,
                    freeze: true,
                    message: config.killSwitch.reason || "Juego en mantenimiento. Cheat pausado por seguridad."
                });
            }

            // Check Free Access Mode
            if (config.security.allowFreeAccess) {
                if (hwid) {
                    activeSessions.set(hwid, { hwid, emulator: emulator || "Emulador", ip: clientIp, lastSeen: Date.now() });
                }
                return sendJson(200, {
                    success: true,
                    isFree: true,
                    freeze: false,
                    remaining: "Modo Gratis Activo (24/7)",
                    message: "Acceso Gratuito Concedido"
                });
            }

            if (!key) {
                return sendJson(400, { success: false, message: "Por favor introduce una clave de acceso." });
            }

            const cleanKey = key.trim().toUpperCase();

            // Master Admin Key
            if (safeCompare(cleanKey, config.security.accessKey.toUpperCase()) || safeCompare(cleanKey, "RAFAPANEL")) {
                if (hwid) {
                    activeSessions.set(hwid, { hwid, emulator: emulator || "Emulador", ip: clientIp, lastSeen: Date.now() });
                }
                return sendJson(200, {
                    success: true,
                    isMaster: true,
                    freeze: false,
                    remaining: "Master VIP (Ilimitado)",
                    message: "Acceso Master Concedido"
                });
            }

            // Find in Keys Database
            const keyObj = config.keys.find(k => k.key.toUpperCase() === cleanKey);
            if (!keyObj) {
                return sendJson(200, { success: false, message: "Clave invalida o inexistente." });
            }

            if (keyObj.status === 'banned') {
                return sendJson(200, { success: false, message: "Esta licencia ha sido suspendida/baneada." });
            }

            const now = Date.now();

            // First time activation (Bind HWID & set expiration)
            if (!keyObj.usedAt) {
                keyObj.usedAt = new Date().toISOString();
                keyObj.hwid = hwid || "HWID-PENDING";
                keyObj.lastIp = clientIp;

                if (keyObj.durationDays && keyObj.durationDays > 0) {
                    keyObj.expiresAt = new Date(now + keyObj.durationDays * 86400000).toISOString();
                } else {
                    keyObj.expiresAt = null;
                }

                saveConfig(config);
                sendDiscordEmbed({
                    title: "🔑 Nueva Clave Activada",
                    description: `El usuario ha activado su licencia VIP exitosamente.`,
                    color: 0x00FF88,
                    fields: [
                        { name: "Clave", value: `\`${keyObj.key}\``, inline: true },
                        { name: "Duración", value: keyObj.duration || `${keyObj.durationDays}d`, inline: true },
                        { name: "HWID", value: `\`${keyObj.hwid.slice(0, 16)}...\``, inline: true }
                    ]
                });
            } else {
                // Check HWID Match
                if (keyObj.hwid && hwid && keyObj.hwid !== hwid && keyObj.hwid !== "HWID-PENDING") {
                    return sendJson(200, {
                        success: false,
                        error: "HWID_MISMATCH",
                        message: "Esta clave esta vinculada a otra PC. Solicita un reset de HWID al administrador."
                    });
                }

                if (hwid && (!keyObj.hwid || keyObj.hwid === "HWID-PENDING")) {
                    keyObj.hwid = hwid;
                    saveConfig(config);
                }

                if (keyObj.expiresAt) {
                    const expTime = new Date(keyObj.expiresAt).getTime();
                    if (now > expTime) {
                        keyObj.status = 'expired';
                        saveConfig(config);
                        return sendJson(200, { success: false, message: "Tu licencia ha expirado. Renueva tu clave." });
                    }
                }
            }

            if (hwid) {
                activeSessions.set(hwid, { hwid, emulator: emulator || "Emulador", ip: clientIp, lastSeen: Date.now() });
            }

            config.stats.totalKeyVerifications = (config.stats.totalKeyVerifications || 0) + 1;
            saveConfig(config);

            const remainingStr = getRemainingTimeString(keyObj.expiresAt);

            return sendJson(200, {
                success: true,
                freeze: false,
                key: keyObj.key,
                label: keyObj.label,
                remaining: remainingStr,
                expiresAt: keyObj.expiresAt,
                message: "Licencia VIP autorizada"
            });
        });
    }

    // 6. Heartbeat Endpoint
    if (pathname === '/api/heartbeat' && req.method === 'POST') {
        return readBody((err, data) => {
            const config = getConfig();
            const { hwid, emulator, version } = data;

            if (hwid) {
                activeSessions.set(hwid, {
                    hwid,
                    emulator: emulator || "Buscando...",
                    version: version || "v3.2",
                    ip: clientIp,
                    lastSeen: Date.now()
                });
            }

            cleanupHousekeeping();

            return sendJson(200, {
                ok: true,
                freeze: config.killSwitch ? config.killSwitch.active : false,
                freezeReason: config.killSwitch ? config.killSwitch.reason : "",
                allowFree: config.security.allowFreeAccess,
                activeUsers: activeSessions.size
            });
        });
    }

    // 7. Live Stats & Analytics for Admin Panel
    if (pathname === '/api/stats/live' && req.method === 'GET') {
        cleanupHousekeeping();
        const config = getConfig();
        const sessions = Array.from(activeSessions.values());

        const emulators = {};
        sessions.forEach(s => {
            const emu = s.emulator || "Desconocido";
            emulators[emu] = (emulators[emu] || 0) + 1;
        });

        return sendJson(200, {
            activeUsers: sessions.length,
            sessions: sessions,
            emulators: emulators,
            totalLauncherDownloads: config.stats.launcherDownloads || 0,
            totalDllDownloads: config.stats.dllDownloads || 0,
            totalKeys: config.keys.length,
            killSwitch: config.killSwitch || { active: false },
            rafaSafe: config.rafaSafe || {}
        });
    }

    // --- RAFA SAFE APPLICATION API ROUTES ---

    // 7.1 Get RAFA SAFE Configuration (Public & App Sync)
    if (pathname === '/api/safe/config' && req.method === 'GET') {
        const config = getConfig();
        return sendJson(200, {
            success: true,
            rafaSafe: config.rafaSafe || {}
        });
    }

    // 7.2 Toggle Feature Hide/Show in RAFA SAFE (Admin Protected)
    if (pathname === '/api/safe/toggle-feature' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            if (!config.rafaSafe) config.rafaSafe = { features: [], hiddenCount: 0 };

            const { featureId, hidden } = data;
            const feat = config.rafaSafe.features.find(f => f.id === featureId);
            if (!feat) return sendJson(404, { error: 'Función no encontrada' });

            feat.hidden = !!hidden;
            const hiddenTotal = config.rafaSafe.features.filter(f => f.hidden).length;
            config.rafaSafe.hiddenCount = hiddenTotal;

            // Trigger In-Panel Update Notice on any change
            config.rafaSafe.alert = {
                type: "update",
                title: "NUEVA ACTUALIZACIÓN DE MÓDULOS",
                message: hidden 
                    ? `La función '${feat.name}' ha sido ocultada por seguridad en la nube. Presiona 'Iniciar' para recargar.` 
                    : `La función '${feat.name}' está disponible nuevamente en el panel.`,
                active: true
            };

            saveConfig(config);

            sendDiscordEmbed({
                title: hidden ? "🙈 Función Ocultada en RAFA SAFE" : "👁️ Función Visible en RAFA SAFE",
                description: `La función **${feat.name}** ahora está **${hidden ? 'OCULTA' : 'VISIBLE'}** en los paneles de los usuarios.`,
                color: hidden ? 0xF59E0B : 0x00F0FF
            });

            return sendJson(200, {
                success: true,
                feature: feat,
                hiddenCount: hiddenTotal,
                alert: config.rafaSafe.alert,
                rafaSafe: config.rafaSafe
            });
        });
    }

    // 7.3 Broadcast Live Alert to RAFA SAFE (Admin Protected)
    if (pathname === '/api/safe/alert' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            if (!config.rafaSafe) config.rafaSafe = {};

            const { type, title, message, active } = data;
            config.rafaSafe.alert = {
                type: type || "custom",
                title: title || "ALERTA DEL SISTEMA",
                message: message || "",
                active: !!active
            };
            saveConfig(config);

            sendDiscordEmbed({
                title: `📢 Alerta Transmitida a RAFA SAFE: ${title}`,
                description: message,
                color: type === 'maintenance' ? 0xEF4444 : (type === 'new_feature' ? 0x10B981 : 0xA855F7)
            });

            return sendJson(200, {
                success: true,
                alert: config.rafaSafe.alert
            });
        });
    }

    // 8. Keys Management: List Keys (Admin Protected)
    if (pathname === '/api/keys/list' && req.method === 'GET') {
        if (!checkAdminAuth()) return sendJson(401, { error: 'No autorizado' });
        const config = getConfig();
        const now = Date.now();

        const formatted = config.keys.map(k => {
            let status = k.status || 'active';
            if (k.expiresAt && new Date(k.expiresAt).getTime() < now) {
                status = 'expired';
            }
            return {
                ...k,
                status,
                remaining: getRemainingTimeString(k.expiresAt)
            };
        });

        return sendJson(200, { keys: formatted });
    }

    // 9. Keys Management: Generate Keys (Admin Protected)
    if (pathname === '/api/keys/generate' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            const { count = 1, duration = '30d', customDays, label = "Usuario VIP" } = data;

            let durationDays = 30;
            let durLabel = "30 Días";

            if (duration === '1d') { durationDays = 1; durLabel = "1 Día"; }
            else if (duration === '7d') { durationDays = 7; durLabel = "7 Días"; }
            else if (duration === '30d') { durationDays = 30; durLabel = "30 Días"; }
            else if (duration === 'lifetime') { durationDays = -1; durLabel = "Permanente"; }
            else if (duration === 'custom' && customDays) {
                durationDays = parseInt(customDays) || 30;
                durLabel = `${durationDays} Días`;
            }

            const createdKeys = [];
            const numToCreate = Math.min(Math.max(parseInt(count) || 1, 1), 50);

            for (let i = 0; i < numToCreate; i++) {
                const newKey = {
                    key: generateRandomKey("RAFA"),
                    duration: durLabel,
                    durationDays: durationDays,
                    label: numToCreate === 1 ? label : `${label} #${i + 1}`,
                    createdAt: new Date().toISOString(),
                    expiresAt: null,
                    hwid: null,
                    usedAt: null,
                    status: 'active'
                };
                config.keys.unshift(newKey);
                createdKeys.push(newKey);
            }

            saveConfig(config);

            sendDiscordEmbed({
                title: "💎 Nuevas Licencias Creadas",
                description: `Se han generado **${createdKeys.length}** nueva(s) clave(s) VIP (${durLabel}).`,
                color: 0xA855F7,
                fields: createdKeys.slice(0, 5).map(k => ({ name: k.label, value: `\`${k.key}\``, inline: true }))
            });

            return sendJson(200, { success: true, created: createdKeys });
        });
    }

    // 10. Keys Management: Reset HWID (Admin Protected)
    if (pathname === '/api/keys/reset-hwid' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            const target = config.keys.find(k => k.key === data.key);
            if (!target) return sendJson(404, { error: 'Clave no encontrada' });

            target.hwid = null;
            saveConfig(config);

            sendDiscordEmbed({
                title: "🔄 HWID Reseteado",
                description: `Se ha liberado el hardware vinculado a la clave \`${target.key}\` (${target.label}).`,
                color: 0xF59E0B
            });

            return sendJson(200, { success: true, message: 'HWID reseteado exitosamente' });
        });
    }

    // 11. Keys Management: Delete Key (Admin Protected)
    if (pathname === '/api/keys/delete' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            config.keys = config.keys.filter(k => k.key !== data.key);
            saveConfig(config);
            return sendJson(200, { success: true, message: 'Clave eliminada' });
        });
    }

    // 12. Keys Management: Renew Key (Admin Protected)
    if (pathname === '/api/keys/renew' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            const target = config.keys.find(k => k.key === data.key);
            if (!target) return sendJson(404, { error: 'Clave no encontrada' });

            const addDays = parseInt(data.days) || 30;
            const now = Date.now();
            let baseTime = now;
            if (target.expiresAt && new Date(target.expiresAt).getTime() > now) {
                baseTime = new Date(target.expiresAt).getTime();
            }
            target.expiresAt = new Date(baseTime + addDays * 86400000).toISOString();
            target.status = 'active';
            saveConfig(config);

            return sendJson(200, { success: true, remaining: getRemainingTimeString(target.expiresAt) });
        });
    }

    // 13. Emergency Kill Switch / Panic Mode (Admin Protected)
    if (pathname === '/api/killswitch' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            const active = !!data.active;
            const reason = data.reason || "Juego en mantenimiento o actualización. Inyección pausada por seguridad.";

            config.killSwitch = { active, reason };
            if (active) {
                config.status.state = "maintenance";
                config.status.stateLabel = "EN MANTENIMIENTO (PAUSADO)";
            } else {
                config.status.state = "undetected";
                config.status.stateLabel = "INDETECTADO (SEGURO)";
            }
            saveConfig(config);

            sendDiscordEmbed({
                title: active ? "🚨 KILL SWITCH ACTIVADO (CHEAT PAUSADO)" : "✅ SISTEMA RESTAURADO (CHEAT SEGURO)",
                description: active ? `**Motivo:** ${reason}\nTodos los Launchers han sido pausados para evitar detecciones.` : "El servicio de inyección ha sido reactivado y se encuentra 100% operativo.",
                color: active ? 0xEF4444 : 0x10B981
            });

            return sendJson(200, { success: true, killSwitch: config.killSwitch });
        });
    }

    // 14. Discord Webhook Config & Test (Admin Protected)
    if (pathname === '/api/discord/save' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();
            config.discord = {
                enabled: !!data.enabled,
                webhookUrl: data.webhookUrl || "",
                notifyOnDll: !!data.notifyOnDll,
                notifyOnKey: !!data.notifyOnKey,
                notifyOnKillSwitch: !!data.notifyOnKillSwitch
            };
            saveConfig(config);

            if (config.discord.enabled && config.discord.webhookUrl) {
                sendDiscordEmbed({
                    title: "🤖 Discord Webhook Conectado",
                    description: "La integración de alertas automáticas para **RafaPanel VIP** está funcionando correctamente.",
                    color: 0x5865F2
                });
            }

            return sendJson(200, { success: true, discord: config.discord });
        });
    }

    // 15. Update General Config (Admin Protected)
    if (pathname === '/api/config/update' && req.method === 'POST') {
        return readBody((err, data) => {
            if (!checkAdminAuth(data.password)) return sendJson(401, { error: 'No autorizado' });
            const config = getConfig();

            if (data.status) {
                config.status = { ...config.status, ...data.status, lastUpdated: new Date().toISOString() };
            }
            if (data.security) {
                config.security = { ...config.security, ...data.security };
            }
            if (data.adminPassword) {
                config.server.adminPassword = data.adminPassword;
            }

            saveConfig(config);

            if (data.status && data.status.broadcastAlert) {
                sendDiscordEmbed({
                    title: "📢 Alerta Global Actualizada",
                    description: data.status.broadcastAlert,
                    color: 0x00F0FF
                });
            }

            return sendJson(200, { success: true, config });
        });
    }

    // 16. DLL Upload Route (Admin Protected multipart)
    const dllUploadMatch = pathname.match(/^\/api\/upload\/dll\/([a-zA-Z0-9_-]+)$/);
    if (dllUploadMatch && req.method === 'POST') {
        const dllId = dllUploadMatch[1];
        return parseMultipartFormData(req, (err, parsed) => {
            if (err) return sendJson(400, { error: err.message });
            if (!checkAdminAuth(parsed.fields.password)) return sendJson(401, { error: 'No autorizado' });

            const config = getConfig();
            const targetDll = config.dlls.find(d => d.id === dllId);
            if (!targetDll) return sendJson(404, { error: `Módulo DLL '${dllId}' no registrado` });
            if (!parsed.file) return sendJson(400, { error: 'No se subió ningún archivo' });

            const destPath = path.join(UPLOADS_DIR, targetDll.filename);
            fs.writeFileSync(destPath, parsed.file.data);

            const stats = fs.statSync(destPath);
            targetDll.size = formatBytes(stats.size);
            targetDll.checksum = getFileChecksum(destPath);
            targetDll.updatedAt = stats.mtime.toISOString();
            targetDll.exists = true;
            saveConfig(config);

            sendDiscordEmbed({
                title: "📦 Módulo DLL Actualizado",
                description: `Se ha actualizado el módulo **${targetDll.name}** (\`${targetDll.filename}\`).`,
                color: 0x00F0FF,
                fields: [
                    { name: "Tamaño", value: targetDll.size, inline: true },
                    { name: "Categoría", value: targetDll.category, inline: true },
                    { name: "SHA-256", value: `\`${targetDll.checksum.slice(0, 16)}...\``, inline: true }
                ]
            });

            return sendJson(200, {
                success: true,
                message: `Módulo ${targetDll.filename} actualizado exitosamente`,
                dll: targetDll
            });
        });
    }

    // 17. Launcher Executable Upload Route (Admin Protected multipart)
    if (pathname === '/api/upload/launcher' && req.method === 'POST') {
        return parseMultipartFormData(req, (err, parsed) => {
            if (err) return sendJson(400, { error: err.message });
            if (!checkAdminAuth(parsed.fields.password)) return sendJson(401, { error: 'No autorizado' });
            if (!parsed.file) return sendJson(400, { error: 'No se subió ningún archivo' });

            const destPath = path.join(UPLOADS_DIR, 'Launcher_RafaPanel.exe');
            fs.writeFileSync(destPath, parsed.file.data);

            const stats = fs.statSync(destPath);
            const config = getConfig();
            config.launcher = {
                filename: 'Launcher_RafaPanel.exe',
                size: formatBytes(stats.size),
                checksum: getFileChecksum(destPath),
                updatedAt: stats.mtime.toISOString(),
                exists: true
            };
            saveConfig(config);

            sendDiscordEmbed({
                title: "🚀 Launcher .EXE Actualizado",
                description: `Se ha subido una nueva versión de **Launcher_RafaPanel.exe** a la nube.`,
                color: 0x10B981,
                fields: [
                    { name: "Tamaño", value: config.launcher.size, inline: true },
                    { name: "SHA-256", value: `\`${config.launcher.checksum.slice(0, 16)}...\``, inline: true }
                ]
            });

            return sendJson(200, {
                success: true,
                message: 'Launcher_RafaPanel.exe subido exitosamente a la nube',
                launcher: config.launcher
            });
        });
    }

    // 18. Download Launcher Executable (.EXE)
    if ((pathname === '/api/download/launcher' || pathname === '/download/launcher' || pathname === '/api/download/Launcher_RafaPanel.exe') && req.method === 'GET') {
        const filePath = path.join(UPLOADS_DIR, 'Launcher_RafaPanel.exe');
        if (!fs.existsSync(filePath)) return sendJson(404, { error: 'Launcher_RafaPanel.exe no está subido aún en el servidor' });

        const config = getConfig();
        config.stats.launcherDownloads = (config.stats.launcherDownloads || 0) + 1;
        saveConfig(config);

        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="Launcher_RafaPanel.exe"',
            'Content-Length': fs.statSync(filePath).size
        });
        return fs.createReadStream(filePath).pipe(res);
    }

    // 19. Download DLL by ID (Launcher download)
    const downloadMatch = pathname.match(/^\/api\/download\/([a-zA-Z0-9_-]+)$/);
    if (downloadMatch && req.method === 'GET') {
        const dllId = downloadMatch[1];
        
        // Safety check if requested launcher via ID
        if (dllId.toLowerCase() === 'launcher') {
            const filePath = path.join(UPLOADS_DIR, 'Launcher_RafaPanel.exe');
            if (!fs.existsSync(filePath)) return sendJson(404, { error: 'Launcher_RafaPanel.exe no está subido aún' });

            const config = getConfig();
            config.stats.launcherDownloads = (config.stats.launcherDownloads || 0) + 1;
            saveConfig(config);

            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': 'attachment; filename="Launcher_RafaPanel.exe"',
                'Content-Length': fs.statSync(filePath).size
            });
            return fs.createReadStream(filePath).pipe(res);
        }

        const config = getConfig();
        const targetDll = config.dlls.find(d => d.id === dllId);
        if (!targetDll) return sendJson(404, { error: 'Módulo no encontrado' });

        const filePath = path.join(UPLOADS_DIR, targetDll.filename);
        if (!fs.existsSync(filePath)) return sendJson(404, { error: `Archivo ${targetDll.filename} no disponible` });

        config.stats.dllDownloads = (config.stats.dllDownloads || 0) + 1;
        saveConfig(config);

        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${targetDll.filename}"`,
            'Content-Length': fs.statSync(filePath).size
        });
        return fs.createReadStream(filePath).pipe(res);
    }

    // --- STATIC FILES SERVING (PUBLIC DIR) ---
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    if (pathname === '/admin' || pathname === '/admin/') {
        reqPath = '/admin.html';
    }
    const safePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

    if (!safePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Acceso denegado');
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            const fallbackIndex = path.join(PUBLIC_DIR, 'index.html');
            if (fs.existsSync(fallbackIndex)) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                return fs.createReadStream(fallbackIndex).pipe(res);
            }
            res.writeHead(404);
            return res.end('Página no encontrada');
        }

        res.writeHead(200, { 'Content-Type': getMimeType(safePath) });
        fs.createReadStream(safePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`   RAFA PANEL CLOUD DEFENSE - ONLINE 24/7`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin.html`);
    console.log(`=========================================`);
});
