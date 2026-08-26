const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure required directories exist
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Helper to read and write config
function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading config.json:', e);
    }
    return {};
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

// Format file size nicely
function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
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
            updatedAt: stats.mtime.toISOString(),
            exists: true
        };
    }

    saveConfig(config);
    return config;
}

// Simple MIME type resolver
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
    if (!match) return callback(new Error('No multipart boundary found'));

    const boundary = match[1] || match[2];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const boundaryBuffer = Buffer.from('--' + boundary);
        const endBoundaryBuffer = Buffer.from('--' + boundary + '--');

        const parts = [];
        let startIndex = 0;

        while ((startIndex = buffer.indexOf(boundaryBuffer, startIndex)) !== -1) {
            let nextIndex = buffer.indexOf(boundaryBuffer, startIndex + boundaryBuffer.length);
            if (nextIndex === -1) {
                nextIndex = buffer.indexOf(endBoundaryBuffer, startIndex + boundaryBuffer.length);
            }
            if (nextIndex === -1) break;

            const partBuffer = buffer.slice(startIndex + boundaryBuffer.length, nextIndex);
            startIndex = nextIndex;

            // Find header delimiter \r\n\r\n
            const headerEndIndex = partBuffer.indexOf('\r\n\r\n');
            if (headerEndIndex !== -1) {
                const headerStr = partBuffer.slice(0, headerEndIndex).toString('utf8');
                let bodyBuffer = partBuffer.slice(headerEndIndex + 4);
                
                // Trim trailing \r\n
                if (bodyBuffer.length >= 2 && bodyBuffer[bodyBuffer.length - 2] === 0x0D && bodyBuffer[bodyBuffer.length - 1] === 0x0A) {
                    bodyBuffer = bodyBuffer.slice(0, bodyBuffer.length - 2);
                }

                const nameMatch = headerStr.match(/name="([^"]+)"/);
                const filenameMatch = headerStr.match(/filename="([^"]+)"/);

                if (nameMatch) {
                    parts.push({
                        name: nameMatch[1],
                        filename: filenameMatch ? filenameMatch[1] : null,
                        data: bodyBuffer,
                        text: filenameMatch ? null : bodyBuffer.toString('utf8')
                    });
                }
            }
        }

        callback(null, parts);
    });
    req.on('error', err => callback(err));
}

// Server Request Handler
const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // 1. API: Get Public Status
    if (pathname === '/api/status' && req.method === 'GET') {
        const config = refreshDllMetadata();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            status: config.status,
            security: {
                loginRequired: config.security.loginRequired,
                allowFreeAccess: config.security.allowFreeAccess
            },
            dlls: config.dlls,
            launcher: config.launcher,
            stats: config.stats
        }));
    }

    // 2. API: Verify Access Key (For Launcher & Web)
    if (pathname === '/api/verify-key' && (req.method === 'GET' || req.method === 'POST')) {
        const config = getConfig();
        const inputKey = parsedUrl.searchParams.get('key') || '';

        if (config.security.allowFreeAccess) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, valid: true, freeMode: true, message: 'Acceso Gratuito Activado' }));
        }

        if (inputKey === config.security.accessKey) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, valid: true, freeMode: false, message: 'Clave Valida' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, valid: false, message: 'Clave Incorrecta' }));
    }

    // 3. API: Download File (DLL / Launcher)
    if (pathname.startsWith('/api/download/')) {
        const fileId = pathname.replace('/api/download/', '').toLowerCase();
        const config = getConfig();

        let targetFilename = '';
        let isLauncher = false;

        if (fileId === 'launcher' || fileId === 'launcher_rafapanel.exe') {
            targetFilename = 'Launcher_RafaPanel.exe';
            isLauncher = true;
        } else if (fileId === 'dll' || fileId === 'edkide' || fileId === 'edkide.dll') {
            targetFilename = 'edkide.dll';
        } else {
            const foundDll = config.dlls.find(d => d.id === fileId || d.filename.toLowerCase() === fileId || d.filename.toLowerCase() === fileId + '.dll');
            if (foundDll) {
                targetFilename = foundDll.filename;
            }
        }

        if (!targetFilename) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'Archivo no encontrado' }));
        }

        const filePath = path.join(UPLOADS_DIR, targetFilename);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: `El archivo ${targetFilename} aun no ha sido subido al servidor.` }));
        }

        // Increment stats counter
        if (isLauncher) {
            config.stats.launcherDownloads = (config.stats.launcherDownloads || 0) + 1;
        } else {
            config.stats.dllDownloads = (config.stats.dllDownloads || 0) + 1;
        }
        saveConfig(config);

        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${targetFilename}"`,
            'Content-Length': stat.size
        });

        const readStream = fs.createReadStream(filePath);
        return readStream.pipe(res);
    }

    // 4. API: Admin Login
    if (pathname === '/api/admin/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const config = getConfig();
                if (data.password === config.server.adminPassword) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, token: 'admin-authorized-token-2026' }));
                } else {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: false, error: 'Contraseña de Administrador incorrecta' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'JSON Invalido' }));
            }
        });
        return;
    }

    // 5. API: Admin Update Settings (Login, Key, Broadcast, Status)
    if (pathname === '/api/admin/settings' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const config = getConfig();

                if (data.security) {
                    if (typeof data.security.loginRequired === 'boolean') config.security.loginRequired = data.security.loginRequired;
                    if (typeof data.security.allowFreeAccess === 'boolean') config.security.allowFreeAccess = data.security.allowFreeAccess;
                    if (data.security.accessKey) config.security.accessKey = data.security.accessKey;
                }

                if (data.status) {
                    if (data.status.state) config.status.state = data.status.state;
                    if (data.status.stateLabel) config.status.stateLabel = data.status.stateLabel;
                    if (data.status.version) config.status.version = data.status.version;
                    if (data.status.title) config.status.title = data.status.title;
                    if (data.status.subtitle) config.status.subtitle = data.status.subtitle;
                    if (data.status.broadcastAlert !== undefined) config.status.broadcastAlert = data.status.broadcastAlert;
                    if (typeof data.status.showAlert === 'boolean') config.status.showAlert = data.status.showAlert;
                    config.status.lastUpdated = new Date().toISOString();
                }

                if (data.server && data.server.adminPassword) {
                    config.server.adminPassword = data.server.adminPassword;
                }

                saveConfig(config);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: true, message: 'Configuracion guardada exitosamente', config }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // 6. API: Admin Upload / Replace DLL
    if (pathname === '/api/admin/upload-dll' && req.method === 'POST') {
        parseMultipartFormData(req, (err, parts) => {
            if (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: err.message }));
            }

            const dllIdPart = parts.find(p => p.name === 'dllId');
            const filePart = parts.find(p => p.name === 'file' && p.filename);

            if (!dllIdPart || !filePart) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ success: false, error: 'Faltan campos dllId o archivo' }));
            }

            const dllId = dllIdPart.text.trim();
            const config = getConfig();
            let targetFilename = '';

            if (dllId === 'launcher') {
                targetFilename = 'Launcher_RafaPanel.exe';
            } else {
                const item = config.dlls.find(d => d.id === dllId);
                if (item) {
                    targetFilename = item.filename;
                    item.updatedAt = new Date().toISOString();
                } else {
                    targetFilename = filePart.filename;
                }
            }

            const destination = path.join(UPLOADS_DIR, targetFilename);
            fs.writeFileSync(destination, filePart.data);

            config.status.lastUpdated = new Date().toISOString();
            saveConfig(config);
            refreshDllMetadata();

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
                success: true,
                message: `Archivo ${targetFilename} actualizado correctamente.`,
                filename: targetFilename,
                size: formatBytes(filePart.data.length)
            }));
        });
        return;
    }

    // 7. Serve Static Files (Public Web UI)
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';

    const fullStaticPath = path.join(PUBLIC_DIR, safePath);

    if (fs.existsSync(fullStaticPath) && fs.statSync(fullStaticPath).isFile()) {
        const mime = getMimeType(fullStaticPath);
        res.writeHead(200, { 'Content-Type': mime });
        return fs.createReadStream(fullStaticPath).pipe(res);
    }

    // Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 - Pagina no encontrada</h1>');
});

server.listen(PORT, () => {
    refreshDllMetadata();
    console.log(`========================================================`);
    console.log(`  RAFA PANEL - SERVIDOR WEB 24/7 EN LINEA`);
    console.log(`  URL Local:   http://localhost:${PORT}`);
    console.log(`  Admin Panel: http://localhost:${PORT}/admin.html`);
    console.log(`========================================================`);
});
