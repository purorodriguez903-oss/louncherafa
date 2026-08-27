// Controller for RAFA AUTH - Multi-Tier User & License Management System 2026
let currentAuthToken = localStorage.getItem('rafaAuthToken') || sessionStorage.getItem('rafaAuthToken') || localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken') || '';
let allAuthUsers = [];
let allAuthKeys = [];
let currentAuthData = null;
let currentTierFilter = 'ALL';

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Admin-Token': currentAuthToken
    };
}

function showAuthToast(msg, isSuccess = true) {
    const toast = document.getElementById('authToast');
    if (!toast) return;
    document.getElementById('authToastMsg').innerText = msg;
    document.getElementById('authToastIcon').innerText = isSuccess ? '✔' : '✖';
    toast.style.borderColor = isSuccess ? '#a855f7' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// Auto-Login & Session Verification on Load
window.addEventListener('DOMContentLoaded', async () => {
    if (currentAuthToken) {
        const ok = await verifyAuthToken(currentAuthToken);
        if (ok) return;
    }
    document.getElementById('authLoginModal').style.display = 'flex';
});

async function verifyAuthToken(token) {
    try {
        const res = await fetch('/api/admin/verify-session', {
            headers: { 'X-Admin-Token': token }
        });
        if (res.ok) {
            currentAuthToken = token;
            document.getElementById('authLoginModal').style.display = 'none';
            document.getElementById('authMainApp').style.display = 'flex';
            
            await loadAuthData();
            startLiveAuthPolling();
            return true;
        }
    } catch (e) {
        console.error('Session verify error:', e);
    }
    localStorage.removeItem('rafaAuthToken');
    sessionStorage.removeItem('rafaAuthToken');
    currentAuthToken = '';
    return false;
}

// Handle Login
async function handleAuthLogin(e) {
    e.preventDefault();
    const pass = document.getElementById('authPasswordInput').value;
    const rememberMe = document.getElementById('authRememberMe').checked;
    const errEl = document.getElementById('authLoginError');
    errEl.style.display = 'none';

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass, rememberMe })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            currentAuthToken = data.token;
            if (rememberMe) {
                localStorage.setItem('rafaAuthToken', data.token);
            } else {
                sessionStorage.setItem('rafaAuthToken', data.token);
            }

            document.getElementById('authLoginModal').style.display = 'none';
            document.getElementById('authMainApp').style.display = 'flex';

            await loadAuthData();
            startLiveAuthPolling();
            showAuthToast("¡Bienvenido al Centro RAFA AUTH!");
        } else {
            errEl.innerText = data.message || "Contraseña incorrecta. Acceso denegado.";
            errEl.style.display = 'block';
        }
    } catch (err) {
        errEl.innerText = "Error al conectar con el servidor.";
        errEl.style.display = 'block';
    }
}

function logoutAuthAdmin() {
    localStorage.removeItem('rafaAuthToken');
    sessionStorage.removeItem('rafaAuthToken');
    location.reload();
}

// Switch Tabs
function switchAuthTab(tabId) {
    document.querySelectorAll('.sidebar-tabs .sidebar-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });

    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) {
        targetPane.classList.add('active');
        targetPane.style.display = 'block';
    }

    loadAuthData();
}

// Load All Data from Backend API
async function loadAuthData() {
    try {
        const res = await fetch('/api/auth/data', {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) return;

        currentAuthData = data;
        allAuthUsers = data.users || [];
        allAuthKeys = data.keys || [];

        // Render Metrics
        document.getElementById('statTotalUsers').innerText = allAuthUsers.length;
        const supremeCount = allAuthUsers.filter(u => u.subscription === 'Supreme').length;
        const basicCount = allAuthUsers.filter(u => u.subscription === 'Basico').length;
        
        document.getElementById('statSupremeUsers').innerText = supremeCount;
        document.getElementById('statBasicUsers').innerText = basicCount;
        document.getElementById('statActiveOnlineUsers').innerText = data.activeSessions ? data.activeSessions.length : 0;

        document.getElementById('subSupremeCount').innerText = `${supremeCount} Usuarios`;
        document.getElementById('subBasicCount').innerText = `${basicCount} Usuarios`;

        // Render Tables
        renderUsersTable(allAuthUsers);
        renderAuthKeysTable(allAuthKeys);
        renderLiveTelemetryTable(data.activeSessions || []);

        // Free Mode State
        if (data.freeMode) {
            const freeToggle = document.getElementById('freeModeMasterToggle');
            const freeTier = document.getElementById('freeModeTierSelect');
            const freeUser = document.getElementById('freeUniversalUserInput');
            const freePass = document.getElementById('freeUniversalPassInput');
            const freeBadge = document.getElementById('freeModeNavBadge');
            const freeTitle = document.getElementById('freeModeStatusTitle');

            if (freeToggle) freeToggle.checked = !!data.freeMode.active;
            if (freeTier) freeTier.value = data.freeMode.defaultTier || 'Basico';
            if (freeUser) freeUser.value = data.freeMode.universalUser || 'FREE';
            if (freePass) freePass.value = data.freeMode.universalPass || 'FREE';

            if (freeBadge) freeBadge.style.display = data.freeMode.active ? 'inline-block' : 'none';
            if (freeTitle) {
                freeTitle.innerHTML = data.freeMode.active 
                    ? `<span style="color: #10b981;">🔓 MODO GRATIS ACTIVADO: Todos los usuarios tienen acceso ${data.freeMode.defaultTier || 'Básico'}</span>`
                    : `🔓 Modo Panel Gratuito (Global Free Access)`;
            }
        }

        // Broadcast State
        if (data.broadcast) {
            const bTitle = document.getElementById('previewAlertTitle');
            const bBody = document.getElementById('previewAlertBody');
            const bIcon = document.getElementById('previewAlertIcon');
            const bActive = document.getElementById('broadcastActiveToggle');

            if (bTitle) bTitle.innerText = data.broadcast.title || 'AVISO';
            if (bBody) bBody.innerText = data.broadcast.message || 'Sin mensaje';
            if (bActive) bActive.checked = !!data.broadcast.active;
            if (bIcon) {
                bIcon.innerText = data.broadcast.type === 'maintenance' ? '⚠️' : (data.broadcast.type === 'supreme' ? '👑' : '📢');
            }
        }

    } catch (e) {
        console.error('Error loading auth data:', e);
    }
}

function startLiveAuthPolling() {
    setInterval(loadAuthData, 2500);
}

// ========================================================
// USERS MANAGEMENT
// ========================================================
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    let filtered = users;
    if (currentTierFilter !== 'ALL') {
        filtered = users.filter(u => u.subscription === currentTierFilter);
    }

    if (!filtered || filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No se encontraron usuarios registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isSupreme = u.subscription === 'Supreme';
        const subBadge = isSupreme 
            ? `<span style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid #fbbf24; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem;">👑 SUPREME</span>`
            : `<span style="background: rgba(0, 229, 255, 0.15); color: var(--primary); border: 1px solid var(--primary); padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem;">⭐ BÁSICO</span>`;

        let statusBadge = `<span class="badge-active">ACTIVO</span>`;
        if (u.status === 'expired') statusBadge = `<span class="badge-expired">EXPIRADO</span>`;

        const hwidDisplay = u.hwid && u.hwid !== 'HWID-PENDING'
            ? `<span class="badge-hwid" title="${u.hwid}">${u.hwid.slice(0, 12)}...</span>`
            : `<span style="color: var(--text-dim); font-size: 0.8rem;">Sin Vincular</span>`;

        return `
            <tr>
                <td>
                    <b style="color: #fff; font-size: 0.95rem;">${u.username}</b>
                    ${u.label ? `<div style="font-size: 0.75rem; color: var(--text-dim);">${u.label}</div>` : ''}
                </td>
                <td><code style="color: #cbd5e1; font-family: var(--font-mono);">${u.password}</code></td>
                <td>${subBadge}</td>
                <td style="color: var(--text-main); font-size: 0.85rem;">${u.remaining || '30 Días'}</td>
                <td>${hwidDisplay}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    <button onclick="toggleUserTierChange('${u.username}', '${u.subscription}')" class="btn-action" style="color: #fbbf24; border-color: rgba(251, 191, 36, 0.4); margin-right: 0.3rem;" title="Cambiar Plan (Supreme/Básico)">💎 Plan</button>
                    ${u.hwid ? `<button onclick="resetUserHwid('${u.username}')" class="btn-action" style="color: var(--warning); border-color: rgba(251, 191, 36, 0.4); margin-right: 0.3rem;" title="Resetear HWID">🔄 HWID</button>` : ''}
                    <button onclick="renewUserAccount('${u.username}')" class="btn-action" style="color: var(--success); border-color: rgba(0, 255, 170, 0.4); margin-right: 0.3rem;" title="Añadir 30 Días">+30D</button>
                    <button onclick="deleteUserAccount('${u.username}')" class="btn-action" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" title="Eliminar Usuario">🗑</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterUserTier(tier) {
    currentTierFilter = tier;
    ['filterTierAll', 'filterTierSupreme', 'filterTierBasic'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.color = 'var(--text-muted)';
            el.style.borderColor = 'var(--border-color)';
            el.style.background = 'rgba(255,255,255,0.04)';
        }
    });

    const activeBtn = document.getElementById(
        tier === 'ALL' ? 'filterTierAll' :
        tier === 'Supreme' ? 'filterTierSupreme' : 'filterTierBasic'
    );
    if (activeBtn) {
        activeBtn.style.color = 'var(--primary)';
        activeBtn.style.borderColor = 'var(--primary)';
        activeBtn.style.background = 'rgba(0,229,255,0.15)';
    }

    renderUsersTable(allAuthUsers);
}

function filterUsersTable() {
    const q = document.getElementById('searchUserInput').value.toLowerCase().trim();
    if (!q) return renderUsersTable(allAuthUsers);

    const filtered = allAuthUsers.filter(u => 
        u.username.toLowerCase().includes(q) ||
        u.password.toLowerCase().includes(q) ||
        (u.hwid && u.hwid.toLowerCase().includes(q)) ||
        (u.label && u.label.toLowerCase().includes(q))
    );
    renderUsersTable(filtered);
}

function openCreateUserModal() {
    document.getElementById('createUserModal').classList.add('show');
}
function closeCreateUserModal() {
    document.getElementById('createUserModal').classList.remove('show');
}
function toggleUserCustomDays(val) {
    document.getElementById('userCustomDaysGroup').style.display = val === 'custom' ? 'block' : 'none';
}

async function submitCreateUser(e) {
    e.preventDefault();
    const username = document.getElementById('newUsernameInput').value.trim();
    const password = document.getElementById('newUserPasswordInput').value.trim();
    const subscription = document.getElementById('newUserSubscriptionSelect').value;
    const duration = document.getElementById('newUserDurationSelect').value;
    const customDays = document.getElementById('userCustomDays').value;
    const label = document.getElementById('newUserLabelInput').value.trim();

    try {
        const res = await fetch('/api/auth/user/create', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, password, subscription, duration, customDays, label })
        });
        const data = await res.json();
        if (data.success) {
            closeCreateUserModal();
            showAuthToast(`¡Usuario '${username}' (${subscription}) creado exitosamente!`);
            loadAuthData();
        } else {
            showAuthToast(data.error || "Error al crear usuario", false);
        }
    } catch (e) {
        showAuthToast("Error de conexión al crear usuario", false);
    }
}

async function deleteUserAccount(username) {
    if (!confirm(`¿Seguro que deseas eliminar el usuario '${username}'?`)) return;
    try {
        const res = await fetch('/api/auth/user/delete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`Usuario '${username}' eliminado`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al eliminar", false);
    }
}

async function resetUserHwid(username) {
    if (!confirm(`¿Desvincular HWID del usuario '${username}'? Podrá iniciar sesión en otra PC.`)) return;
    try {
        const res = await fetch('/api/auth/user/reset-hwid', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`HWID del usuario '${username}' liberado`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al resetear HWID", false);
    }
}

async function renewUserAccount(username) {
    try {
        const res = await fetch('/api/auth/user/renew', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, days: 30 })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`Usuario '${username}' renovado +30 Días (${data.remaining})`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al renovar cuenta", false);
    }
}

async function toggleUserTierChange(username, currentTier) {
    const newTier = currentTier === 'Supreme' ? 'Basico' : 'Supreme';
    if (!confirm(`¿Cambiar suscripción del usuario '${username}' a ${newTier}?`)) return;

    try {
        const res = await fetch('/api/auth/user/change-tier', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, subscription: newTier })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`¡Plan de '${username}' cambiado a ${newTier}!`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al cambiar plan", false);
    }
}

// ========================================================
// KEYS GENERATOR
// ========================================================
function renderAuthKeysTable(keys) {
    const tbody = document.getElementById('authKeysTableBody');
    if (!tbody) return;

    if (!keys || keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2.5rem;">No hay licencias generadas aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = keys.map(k => {
        const isSupreme = k.subscription === 'Supreme';
        const subBadge = isSupreme 
            ? `<span style="background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid #fbbf24; padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem;">👑 SUPREME</span>`
            : `<span style="background: rgba(0, 229, 255, 0.15); color: var(--primary); border: 1px solid var(--primary); padding: 0.25rem 0.6rem; border-radius: 4px; font-weight: 800; font-size: 0.8rem;">⭐ BÁSICO</span>`;

        const hwidDisplay = k.hwid && k.hwid !== 'HWID-PENDING'
            ? `<span class="badge-hwid" title="${k.hwid}">${k.hwid.slice(0, 12)}...</span>`
            : `<span style="color: var(--text-dim); font-size: 0.8rem;">Sin Vincular</span>`;

        return `
            <tr>
                <td><code style="color: var(--primary); font-weight: 700; font-family: var(--font-mono); font-size: 0.95rem;">${k.key}</code></td>
                <td>${subBadge}</td>
                <td><b>${k.label || 'Licencia'}</b></td>
                <td style="color: var(--text-main); font-size: 0.85rem;">${k.remaining || k.duration || '30 Días'}</td>
                <td>${hwidDisplay}</td>
                <td><span class="badge-active">ACTIVA</span></td>
                <td style="text-align: right;">
                    ${k.hwid ? `<button onclick="resetAuthKeyHwid('${k.key}')" class="btn-action" style="color: var(--warning); border-color: rgba(251, 191, 36, 0.4); margin-right: 0.3rem;" title="Resetear HWID">🔄 HWID</button>` : ''}
                    <button onclick="renewAuthKey('${k.key}')" class="btn-action" style="color: var(--success); border-color: rgba(0, 255, 170, 0.4); margin-right: 0.3rem;" title="Añadir 30 Días">+30D</button>
                    <button onclick="deleteAuthKey('${k.key}')" class="btn-action" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" title="Eliminar Clave">🗑</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterAuthKeysTable() {
    const q = document.getElementById('searchAuthKeyInput').value.toLowerCase().trim();
    if (!q) return renderAuthKeysTable(allAuthKeys);

    const filtered = allAuthKeys.filter(k => 
        k.key.toLowerCase().includes(q) ||
        (k.label && k.label.toLowerCase().includes(q)) ||
        (k.hwid && k.hwid.toLowerCase().includes(q))
    );
    renderAuthKeysTable(filtered);
}

function openGenerateAuthKeysModal() {
    document.getElementById('generateAuthKeysModal').classList.add('show');
}
function closeGenerateAuthKeysModal() {
    document.getElementById('generateAuthKeysModal').classList.remove('show');
}
function toggleKeyAuthCustomDays(val) {
    document.getElementById('keyAuthCustomDaysGroup').style.display = val === 'custom' ? 'block' : 'none';
}

async function submitGenerateAuthKeys(e) {
    e.preventDefault();
    const subscription = document.getElementById('keyAuthSubSelect').value;
    const duration = document.getElementById('keyAuthDurSelect').value;
    const customDays = document.getElementById('keyAuthCustomDays').value;
    const count = document.getElementById('keyAuthCountInput').value;
    const label = document.getElementById('keyAuthLabelInput').value.trim();

    try {
        const res = await fetch('/api/auth/key/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ subscription, duration, customDays, count, label })
        });
        const data = await res.json();
        if (data.success) {
            closeGenerateAuthKeysModal();
            showAuthToast(`¡Se han generado ${data.created.length} clave(s) ${subscription}!`);
            loadAuthData();
        } else {
            showAuthToast(data.error || "Error al generar claves", false);
        }
    } catch (e) {
        showAuthToast("Error de conexión al generar claves", false);
    }
}

async function deleteAuthKey(key) {
    if (!confirm(`¿Eliminar la clave ${key}?`)) return;
    try {
        const res = await fetch('/api/auth/key/delete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast("Clave eliminada");
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al eliminar clave", false);
    }
}

async function resetAuthKeyHwid(key) {
    try {
        const res = await fetch('/api/auth/key/reset-hwid', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast("HWID reseteado");
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al resetear HWID", false);
    }
}

async function renewAuthKey(key) {
    try {
        const res = await fetch('/api/auth/key/renew', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key, days: 30 })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`Clave extendida +30 Días (${data.remaining})`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al renovar clave", false);
    }
}

// ========================================================
// FREE MODE CONFIGURATION
// ========================================================
async function toggleFreeModeConfig() {
    const active = document.getElementById('freeModeMasterToggle').checked;
    await saveFreeModeSettings(active);
}

async function saveFreeModeSettings(overrideActive) {
    const active = overrideActive !== undefined ? overrideActive : document.getElementById('freeModeMasterToggle').checked;
    const defaultTier = document.getElementById('freeModeTierSelect').value;
    const universalUser = document.getElementById('freeUniversalUserInput').value.trim() || 'FREE';
    const universalPass = document.getElementById('freeUniversalPassInput').value.trim() || 'FREE';

    try {
        const res = await fetch('/api/auth/freemode/toggle', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ active, defaultTier, universalUser, universalPass })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(active ? "🔓 Modo Panel Gratis ACTIVADO para todas las PCs" : "🔒 Modo Panel Gratis DESACTIVADO");
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al guardar modo gratis", false);
    }
}

// ========================================================
// BROADCAST REAL-TIME MESSAGES
// ========================================================
async function submitAuthBroadcast(e) {
    e.preventDefault();
    const type = document.getElementById('broadcastTypeSelect').value;
    const title = document.getElementById('broadcastTitleInput').value.trim();
    const message = document.getElementById('broadcastMsgInput').value.trim();
    const active = document.getElementById('broadcastActiveToggle').checked;

    try {
        const res = await fetch('/api/auth/broadcast/send', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ type, title, message, active })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast("¡Mensaje transmitido en tiempo real al panel!");
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al transmitir mensaje", false);
    }
}

// ========================================================
// TELEMETRY LIVE SESSIONS TABLE
// ========================================================
function renderLiveTelemetryTable(sessions) {
    const tbody = document.getElementById('authLiveSessionsTable');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 2rem;">No hay clientes conectados en este momento.</td></tr>`;
        return;
    }

    tbody.innerHTML = sessions.map(s => {
        const subBadge = s.subscription === 'Supreme'
            ? `<span style="color: #fbbf24; font-weight: 700;">👑 SUPREME</span>`
            : `<span style="color: var(--primary); font-weight: 700;">⭐ BÁSICO</span>`;

        return `
            <tr>
                <td>
                    <b style="color: #fff;">${s.username || (s.hwid ? s.hwid.slice(0, 14) + '...' : 'Cliente')}</b>
                </td>
                <td>${subBadge}</td>
                <td style="color: var(--text-muted);">${s.emulator || 'PC / Emulador'}</td>
                <td style="color: var(--text-dim);">${s.ip || '127.0.0.1'}</td>
                <td style="color: var(--success); font-weight: 600;">Hace ${Math.floor((Date.now() - (s.lastSeen || Date.now())) / 1000)}s</td>
                <td><span class="badge-active">EN VIVO</span></td>
            </tr>
        `;
    }).join('');
}
