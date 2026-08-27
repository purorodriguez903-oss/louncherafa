// Admin Dashboard Controller for RafaPanel Cloud with 100% Separated Dual-App Workspaces
let currentAdminToken = localStorage.getItem('rafaAdminToken') || sessionStorage.getItem('rafaAdminToken') || localStorage.getItem('rafaAuthToken') || sessionStorage.getItem('rafaAuthToken') || '';
let emulatorsChart = null;
let currentConfig = null;
let allKeys = [];
let pendingFeatureToHide = null;

// Helper to get auth headers
function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Admin-Token': currentAdminToken
    };
}

// Toast Notification
function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    const msgEl = document.getElementById('toastMsg');
    const iconEl = document.getElementById('toastIcon');
    msgEl.innerText = message;
    iconEl.innerText = isSuccess ? '✔' : '✖';
    toast.style.borderColor = isSuccess ? 'var(--primary)' : 'var(--danger)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// Auto-Login & Session Verification on Load
window.addEventListener('DOMContentLoaded', async () => {
    if (currentAdminToken) {
        const ok = await verifyTokenSession(currentAdminToken);
        if (ok) return;
    }
    document.getElementById('loginModal').style.display = 'flex';
});

async function verifyTokenSession(token) {
    try {
        const res = await fetch('/api/admin/verify-session', {
            headers: { 'X-Admin-Token': token }
        });
        if (res.ok) {
            currentAdminToken = token;
            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('adminApp').style.display = 'flex';
            
            initEmulatorsChart();
            loadAllAdminData();
            startLiveTelemetryPolling();
            return true;
        }
    } catch (e) {
        console.error('Session verify error:', e);
    }
    localStorage.removeItem('rafaAdminToken');
    sessionStorage.removeItem('rafaAdminToken');
    currentAdminToken = '';
    return false;
}

// Login Handler
async function handleLogin(e) {
    e.preventDefault();
    const pass = document.getElementById('adminPasswordInput').value;
    const rememberMe = document.getElementById('rememberMeCheckbox').checked;
    const errEl = document.getElementById('loginError');
    errEl.style.display = 'none';

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass, rememberMe })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            currentAdminToken = data.token;
            if (rememberMe) {
                localStorage.setItem('rafaAdminToken', data.token);
            } else {
                sessionStorage.setItem('rafaAdminToken', data.token);
            }

            document.getElementById('loginModal').style.display = 'none';
            document.getElementById('adminApp').style.display = 'flex';

            initEmulatorsChart();
            loadAllAdminData();
            startLiveTelemetryPolling();
            showToast("¡Bienvenido al Panel de Administración!");
        } else {
            errEl.innerText = data.message || "Contraseña incorrecta. Acceso denegado.";
            errEl.style.display = 'block';
        }
    } catch (err) {
        errEl.innerText = "Error al conectar con el servidor.";
        errEl.style.display = 'block';
    }
}

function logoutAdmin() {
    localStorage.removeItem('rafaAdminToken');
    sessionStorage.removeItem('rafaAdminToken');
    location.reload();
}

// ========================================================
// 100% PURE SEPARATION: DUAL-APP SWITCHER
// ========================================================
function handleAppSwitch(appId) {
    const launcherNav = document.getElementById('launcherNavGroup');
    const safeNav = document.getElementById('safeNavGroup');
    const workspaceLauncher = document.getElementById('appWorkspaceLauncher');
    const workspaceSafe = document.getElementById('appWorkspaceSafe');
    const badge = document.getElementById('activeAppBadgeNav');

    if (appId === 'rafa_safe') {
        // HIDE LAUNCHER WORKSPACE & SIDEBAR
        launcherNav.style.display = 'none';
        workspaceLauncher.style.display = 'none';

        // SHOW RAFA SAFE WORKSPACE & SIDEBAR
        safeNav.style.display = 'flex';
        workspaceSafe.style.display = 'block';

        if (badge) {
            badge.innerText = "APP: RAFA SAFE (PANEL CLOUD)";
            badge.style.color = "#a855f7";
        }

        switchSafeTab('mockup_safe');
        showToast("Entrando al menú exclusivo: RAFA SAFE");
    } else {
        // HIDE RAFA SAFE WORKSPACE & SIDEBAR
        safeNav.style.display = 'none';
        workspaceSafe.style.display = 'none';

        // SHOW LAUNCHER WORKSPACE & SIDEBAR
        launcherNav.style.display = 'flex';
        workspaceLauncher.style.display = 'block';

        if (badge) {
            badge.innerText = "APP: RAFA LAUNCHER (DX11)";
            badge.style.color = "var(--primary)";
        }

        switchLauncherTab('dash_launcher');
        showToast("Entrando al menú exclusivo: RAFA Launcher");
    }
}

// Switch tabs inside RAFA Launcher Workspace
function switchLauncherTab(tabId) {
    const navGroup = document.getElementById('launcherNavGroup');
    const workspace = document.getElementById('appWorkspaceLauncher');

    // Remove active from launcher tab buttons
    navGroup.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        }
    });

    // Hide all launcher panes
    workspace.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });

    // Show target pane
    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) {
        targetPane.classList.add('active');
        targetPane.style.display = 'block';
    }

    if (tabId === 'keys_launcher') loadKeysTable();
    if (tabId === 'dash_launcher') loadLiveStats();
}

// Switch tabs inside RAFA SAFE Workspace
function switchSafeTab(tabId) {
    const navGroup = document.getElementById('safeNavGroup');
    const topSubnav = document.getElementById('safeTopSubnav');
    const workspace = document.getElementById('appWorkspaceSafe');

    // Remove active from safe tab buttons in sidebar
    if (navGroup) {
        navGroup.querySelectorAll('.sidebar-tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            }
        });
    }

    // Update top subnav buttons
    if (topSubnav) {
        topSubnav.querySelectorAll('.subnav-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-subtab') === tabId) {
                btn.classList.add('active');
            }
        });
    }

    // Hide all safe panes
    workspace.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
        pane.style.display = 'none';
    });

    // Show target pane
    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) {
        targetPane.classList.add('active');
        targetPane.style.display = 'block';
    }

    loadSafePanelData();
    if (tabId === 'keys_safe') loadSafeKeysTable();
}

// Emulators Chart.js Setup
function initEmulatorsChart() {
    const ctx = document.getElementById('emulatorsChart');
    if (!ctx || emulatorsChart) return;

    emulatorsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Sin Emulador'],
            datasets: [{
                data: [1],
                backgroundColor: ['#00e5ff', '#a855f7', '#10b981', '#fbbf24', '#ef4444', '#64748b'],
                borderWidth: 2,
                borderColor: '#10121a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 } }
                }
            }
        }
    });
}

// Load All Admin Data
async function loadAllAdminData() {
    try {
        const res = await fetch('/api/config');
        currentConfig = await res.json();

        // Populate Security & Kill Switch UI
        document.getElementById('allowFreeAccessToggle').checked = !!currentConfig.security.allowFreeAccess;
        document.getElementById('masterAccessKeyInput').value = currentConfig.security.accessKey || 'RAFAPANEL';
        document.getElementById('broadcastAlertInput').value = currentConfig.status.broadcastAlert || '';

        // Populate Discord settings
        if (currentConfig.discord) {
            document.getElementById('discordEnabledToggle').checked = !!currentConfig.discord.enabled;
            document.getElementById('discordWebhookUrl').value = currentConfig.discord.webhookUrl || '';
            document.getElementById('discordNotifyDll').checked = !!currentConfig.discord.notifyOnDll;
            document.getElementById('discordNotifyKey').checked = !!currentConfig.discord.notifyOnKey;
            document.getElementById('discordNotifyKillSwitch').checked = !!currentConfig.discord.notifyOnKillSwitch;
        }

        // Kill Switch Banner state
        updateKillSwitchUI(currentConfig.killSwitch);

        // Populate DLLs table
        renderDllsTable(currentConfig.dlls);

        // Populate Launcher info & update logs
        if (currentConfig.launcher) {
            document.getElementById('adminLauncherFilename').innerText = currentConfig.launcher.filename;
            document.getElementById('adminLauncherMeta').innerText = `Tamaño: ${currentConfig.launcher.size || '--'} • Actualizado: ${new Date(currentConfig.launcher.updatedAt || Date.now()).toLocaleDateString()}`;
            const extUrlInput = document.getElementById('adminLauncherExternalUrl');
            const badgeEl = document.getElementById('launcherUrlBadge');
            if (extUrlInput) extUrlInput.value = currentConfig.launcher.externalUrl || '';
            if (badgeEl) {
                if (currentConfig.launcher.externalUrl && currentConfig.launcher.externalUrl.length > 5) {
                    badgeEl.innerText = 'MediaFire / Externo Activo';
                    badgeEl.style.background = 'rgba(16, 185, 129, 0.15)';
                    badgeEl.style.color = 'var(--success)';
                } else {
                    badgeEl.innerText = 'Nube Directa';
                    badgeEl.style.background = 'rgba(0, 229, 255, 0.15)';
                    badgeEl.style.color = 'var(--primary)';
                }
            }
        }
        renderLauncherLogs(currentConfig.launcherLogs, currentConfig.launcher);

        loadLiveStats();
        loadKeysTable();
        loadSafePanelData();
    } catch (e) {
        console.error('Error loading config:', e);
    }
}

// Live Telemetry & Real Stats
async function loadLiveStats() {
    try {
        const res = await fetch('/api/stats/live');
        const data = await res.json();

        document.getElementById('dashActiveUsers').innerText = data.activeUsers || 0;
        document.getElementById('dashTotalKeys').innerText = data.totalKeys || 0;
        document.getElementById('dashTotalDownloads').innerText = data.totalLauncherDownloads || 0;

        // Update Emulators Chart
        if (emulatorsChart && data.emulators) {
            const labels = Object.keys(data.emulators);
            const counts = Object.values(data.emulators);
            if (labels.length > 0) {
                emulatorsChart.data.labels = labels;
                emulatorsChart.data.datasets[0].data = counts;
            } else {
                emulatorsChart.data.labels = ['En Espera'];
                emulatorsChart.data.datasets[0].data = [1];
            }
            emulatorsChart.update();
        }

        // Update Live Sessions Table
        const tbody = document.getElementById('liveSessionsTable');
        if (data.sessions && data.sessions.length > 0) {
            tbody.innerHTML = data.sessions.map(s => `
                <tr>
                    <td><span class="badge-hwid">${(s.hwid || 'N/A').slice(0, 14)}...</span></td>
                    <td style="color: var(--primary); font-weight: 600;">${s.emulator}</td>
                    <td style="color: var(--text-muted);">${s.ip || '127.0.0.1'}</td>
                    <td style="color: var(--success); font-weight: 600;">Hace ${Math.floor((Date.now() - s.lastSeen) / 1000)}s</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim);">No hay launchers activos en este momento.</td></tr>`;
        }

        if (data.killSwitch) {
            updateKillSwitchUI(data.killSwitch);
        }
    } catch (e) {
        console.error('Telemetry error:', e);
    }
}

function startLiveTelemetryPolling() {
    // Live telemetry update every 2.5 seconds
    setInterval(loadLiveStats, 2500);
    // Real-time RAFA SAFE cloud sync check every 3 seconds
    setInterval(loadSafePanelData, 3000);
}

// Emergency Kill Switch Toggle
async function toggleKillSwitch() {
    const isCurrentlyActive = currentConfig && currentConfig.killSwitch && currentConfig.killSwitch.active;
    const newActive = !isCurrentlyActive;

    let reason = "Juego en mantenimiento o actualización. Inyección pausada por seguridad.";
    if (newActive) {
        const inputReason = prompt("Introduce el motivo de pausa para los usuarios:", reason);
        if (inputReason !== null && inputReason.trim()) reason = inputReason.trim();
    }

    try {
        const res = await fetch('/api/killswitch', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ active: newActive, reason })
        });
        const data = await res.json();
        if (data.success) {
            if (currentConfig) currentConfig.killSwitch = data.killSwitch;
            updateKillSwitchUI(data.killSwitch);
            showToast(newActive ? "🚨 Kill Switch ACTIVADO: Launchers pausados." : "✅ Kill Switch DESACTIVADO: Servicio reanudado.");
        }
    } catch (e) {
        showToast("Error al cambiar estado de Kill Switch", false);
    }
}

function updateKillSwitchUI(killSwitch) {
    const banner = document.getElementById('killSwitchBanner');
    const btn = document.getElementById('killSwitchBtn');
    const text = document.getElementById('killSwitchStatusText');
    const dashStatus = document.getElementById('dashSystemStatus');

    if (killSwitch && killSwitch.active) {
        banner.classList.add('active');
        btn.innerHTML = `<span>▶</span> REANUDAR SERVICIO`;
        btn.className = 'resume-btn';
        text.innerHTML = `<b style="color: #ef4444;">ESTADO ACTUAL: PAUSADO</b> • Motivo: ${killSwitch.reason}`;
        if (dashStatus) {
            dashStatus.innerText = 'PAUSADO';
            dashStatus.style.color = '#ef4444';
        }
    } else {
        banner.classList.remove('active');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg> PAUSAR TODOS LOS CHEATS`;
        btn.className = 'panic-btn';
        text.innerText = "El sistema está 100% operativo. Presiona el botón rojo si detectas una actualización del juego.";
        if (dashStatus) {
            dashStatus.innerText = 'ONLINE';
            dashStatus.style.color = 'var(--success)';
        }
    }
}

// Keys Management
async function loadKeysTable() {
    try {
        const res = await fetch('/api/keys/list', {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        allKeys = data.keys || [];
        renderKeysTable(allKeys, 'keysTableBody');
    } catch (e) {
        console.error('Error fetching keys:', e);
    }
}

async function loadSafeKeysTable() {
    try {
        const res = await fetch('/api/keys/list', {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        allKeys = data.keys || [];
        renderKeysTable(allKeys, 'keysSafeTableBody');
    } catch (e) {
        console.error('Error fetching safe keys:', e);
    }
}

function renderKeysTable(keys, tbodyId = 'keysTableBody') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 2rem;">No hay claves generadas aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = keys.map(k => {
        let statusBadge = `<span class="badge-active">ACTIVA</span>`;
        if (k.status === 'expired') statusBadge = `<span class="badge-expired">EXPIRADA</span>`;
        if (k.status === 'banned') statusBadge = `<span class="badge-expired">SUSPENDIDA</span>`;

        const hwidDisplay = k.hwid && k.hwid !== 'HWID-PENDING' 
            ? `<span class="badge-hwid" title="${k.hwid}">${k.hwid.slice(0, 12)}...</span>` 
            : `<span style="color: var(--text-dim); font-size: 0.8rem;">Sin Vincular</span>`;

        return `
            <tr>
                <td><code style="color: var(--primary); font-weight: 700; font-family: var(--font-mono); font-size: 0.95rem;">${k.key}</code></td>
                <td><b>${k.label || 'Cliente'}</b></td>
                <td><span style="color: var(--secondary); font-weight: 600;">${k.duration || '30 Días'}</span></td>
                <td style="color: var(--text-main); font-size: 0.85rem;">${k.remaining || 'Ilimitado'}</td>
                <td>${hwidDisplay}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right;">
                    ${k.hwid ? `<button onclick="resetHwid('${k.key}')" class="btn-action" style="color: var(--warning); border-color: rgba(251, 191, 36, 0.4); margin-right: 0.4rem;" title="Liberar HWID">🔄 Reset</button>` : ''}
                    <button onclick="renewKey('${k.key}')" class="btn-action" style="color: var(--success); border-color: rgba(0, 255, 170, 0.4); margin-right: 0.4rem;" title="Añadir 30 días">+30D</button>
                    <button onclick="deleteKey('${k.key}')" class="btn-action" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4);" title="Eliminar clave">🗑</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterKeysTable() {
    const q = document.getElementById('searchKeyInput').value.toLowerCase().trim();
    if (!q) return renderKeysTable(allKeys, 'keysTableBody');

    const filtered = allKeys.filter(k => 
        k.key.toLowerCase().includes(q) || 
        (k.label && k.label.toLowerCase().includes(q)) || 
        (k.hwid && k.hwid.toLowerCase().includes(q))
    );
    renderKeysTable(filtered, 'keysTableBody');
}

// Generate Key Modal
function openGenerateModal(defaultLabel = "Cliente VIP") {
    document.getElementById('keyLabelInput').value = defaultLabel;
    document.getElementById('generateKeyModal').classList.add('show');
}
function closeGenerateModal() {
    document.getElementById('generateKeyModal').classList.remove('show');
}
function toggleCustomDays(val) {
    document.getElementById('customDaysGroup').style.display = val === 'custom' ? 'block' : 'none';
}

async function submitGenerateKeys(e) {
    e.preventDefault();
    const label = document.getElementById('keyLabelInput').value;
    const duration = document.getElementById('keyDurationSelect').value;
    const customDays = document.getElementById('keyCustomDays').value;
    const count = document.getElementById('keyCountInput').value;

    try {
        const res = await fetch('/api/keys/generate', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ label, duration, customDays, count })
        });
        const data = await res.json();
        if (data.success) {
            closeGenerateModal();
            showToast(`¡Se han generado ${data.created.length} nueva(s) clave(s)!`);
            loadKeysTable();
            loadSafeKeysTable();
        } else {
            showToast("Error al generar claves", false);
        }
    } catch (err) {
        showToast("Error de conexión", false);
    }
}

async function resetHwid(key) {
    if (!confirm(`¿Deseas desvincular el HWID de la clave ${key}? El usuario podrá ingresar desde una nueva PC.`)) return;
    try {
        const res = await fetch('/api/keys/reset-hwid', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.success) {
            showToast("HWID reseteado con éxito");
            loadKeysTable();
            loadSafeKeysTable();
        }
    } catch (e) {
        showToast("Error al resetear HWID", false);
    }
}

async function deleteKey(key) {
    if (!confirm(`¿Seguro que deseas eliminar la clave ${key}? Esta acción no se puede deshacer.`)) return;
    try {
        const res = await fetch('/api/keys/delete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Clave eliminada");
            loadKeysTable();
            loadSafeKeysTable();
        }
    } catch (e) {
        showToast("Error al eliminar", false);
    }
}

async function renewKey(key) {
    try {
        const res = await fetch('/api/keys/renew', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ key, days: 30 })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Clave extendida +30 Días (${data.remaining})`);
            loadKeysTable();
            loadSafeKeysTable();
        }
    } catch (e) {
        showToast("Error al renovar", false);
    }
}

// --- RAFA SAFE APPLICATION CONTROLLER (ALL 42 REAL FEATURES) ---
let currentMockupFilter = 'ALL';
let cachedSafeFeatures = [];

function filterMockupByCategory(cat) {
    currentMockupFilter = cat;
    ['filterMockupAll', 'filterMockupCombat', 'filterMockupVisuals', 'filterMockupExploits'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.color = 'var(--text-muted)';
            el.style.borderColor = 'var(--border-color)';
            el.style.background = 'rgba(255,255,255,0.04)';
        }
    });

    const activeBtn = document.getElementById(
        cat === 'ALL' ? 'filterMockupAll' :
        cat === 'Combat' ? 'filterMockupCombat' :
        cat === 'Visuals' ? 'filterMockupVisuals' : 'filterMockupExploits'
    );
    if (activeBtn) {
        activeBtn.style.color = 'var(--primary)';
        activeBtn.style.borderColor = 'var(--primary)';
        activeBtn.style.background = 'rgba(0,229,255,0.15)';
    }

    applyMockupFilter();
}

function applyMockupFilter() {
    if (!cachedSafeFeatures || !cachedSafeFeatures.length) return;
    let list = cachedSafeFeatures;
    if (currentMockupFilter === 'Combat') {
        list = cachedSafeFeatures.filter(f => f.category === 'Combat');
    } else if (currentMockupFilter === 'Visuals') {
        list = cachedSafeFeatures.filter(f => f.category === 'Visuals');
    } else if (currentMockupFilter === 'Exploits') {
        list = cachedSafeFeatures.filter(f => ['Bypass', 'Movement', 'Exploits', 'Network'].includes(f.category));
    }
    renderSafeMockupList(list);
}

async function syncSafePanelNow() {
    showToast("⚡ Sincronizando módulos y alertas en tiempo real...");
    const alertCard = document.getElementById('safeInteractiveAlertCard');

    await loadSafePanelData();

    if (alertCard) {
        alertCard.style.transform = 'scale(0.98)';
        setTimeout(() => {
            alertCard.style.transform = '';
        }, 300);
    }
    showToast("✅ ¡Panel sincronizado en tiempo real exitosamente!");
}

async function loadSafePanelData() {
    try {
        const res = await fetch('/api/safe/config');
        const data = await res.json();
        if (data.success && data.rafaSafe) {
            const features = data.rafaSafe.features || [];
            cachedSafeFeatures = features;
            
            // Render in Mockup with current active filter
            applyMockupFilter();

            // Render categorized lists
            renderCategoryList('safeCombatList', features.filter(f => f.category === 'Combat'));
            renderCategoryList('safeVisualsList', features.filter(f => f.category === 'Visuals'));
            renderCategoryList('safeExploitsList', features.filter(f => ['Bypass', 'Movement', 'Exploits', 'Network'].includes(f.category)));

            renderSafeAlertState(data.rafaSafe.alert || {});
            
            const hiddenCount = data.rafaSafe.hiddenCount || 0;
            const badge = document.getElementById('safeMockupHiddenBadge');
            if (badge) badge.innerText = `${hiddenCount} Funciones Ocultas`;

            // Interactive real-time alert card display
            const alertCard = document.getElementById('safeInteractiveAlertCard');
            const alertTitle = document.getElementById('safeInteractiveAlertTitle');
            const alertMsg = document.getElementById('safeInteractiveAlertMsg');

            if (data.rafaSafe.alert && data.rafaSafe.alert.active && data.rafaSafe.alert.message) {
                if (alertCard) {
                    alertCard.style.display = 'flex';
                    if (alertTitle) alertTitle.innerText = `📢 ${data.rafaSafe.alert.title || 'ALERTA DE LA NUBE'}`;
                    if (alertMsg) alertMsg.innerText = `${data.rafaSafe.alert.message} • Haz clic aquí para sincronizar el panel.`;
                }
            } else if (hiddenCount > 0) {
                if (alertCard) {
                    alertCard.style.display = 'flex';
                    if (alertTitle) alertTitle.innerText = `🛡️ MÓDULOS EN MODO PROTEGIDO (${hiddenCount} OCULTOS)`;
                    if (alertMsg) alertMsg.innerText = 'Se han modificado funciones para evitar detecciones. Haz clic aquí para actualizar sin cerrar el panel.';
                }
            } else {
                if (alertCard) alertCard.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Error loading Safe Panel data:', e);
    }
}

function renderSafeMockupList(features) {
    const container = document.getElementById('safeFeaturesMockupList');
    if (!container) return;

    container.innerHTML = features.map(f => `
        <div class="panel-mockup-feature-item ${f.hidden ? 'hidden-feature' : ''}">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <input type="checkbox" ${f.hidden ? '' : 'checked'} disabled style="accent-color: var(--primary); width: 16px; height: 16px;">
                <div>
                    <b style="color: ${f.hidden ? 'var(--text-dim)' : 'var(--text-main)'}; font-size: 0.9rem;">${f.name}</b>
                    <div style="display: flex; gap: 0.4rem; margin-top: 0.2rem;">
                        <span style="font-size: 0.7rem; color: var(--secondary);">${f.category}</span>
                        ${f.hidden ? '<span style="font-size: 0.7rem; color: #ef4444; font-weight: 700;">[OCULTA EN EL PANEL]</span>' : '<span style="font-size: 0.7rem; color: var(--success); font-weight: 700;">[ACTIVA]</span>'}
                    </div>
                </div>
            </div>
            <div>
                ${f.hidden 
                    ? `<button onclick="toggleFeatureDirectly('${f.id}', false)" class="btn-show-feature">👁️ Mostrar</button>` 
                    : `<button onclick="promptHideFeature('${f.id}', '${f.name}')" class="btn-hide-feature">✖ Ocultar</button>`}
            </div>
        </div>
    `).join('');
}

function renderCategoryList(containerId, features) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = features.map(f => `
        <div class="panel-mockup-feature-item ${f.hidden ? 'hidden-feature' : ''}" style="background: rgba(255, 255, 255, 0.02); padding: 0.9rem 1.25rem;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                    <input type="checkbox" ${f.hidden ? '' : 'checked'} disabled style="accent-color: var(--primary); width: 17px; height: 17px;">
                    <span style="color: var(--text-main); font-weight: 700; font-size: 0.95rem;">${f.name}</span>
                    <span style="font-size: 0.75rem; color: var(--secondary); background: rgba(168, 85, 247, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px;">${f.category}</span>
                    ${f.hidden ? '<span style="font-size: 0.75rem; color: #ef4444; font-weight: 700; background: rgba(239, 68, 68, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px;">OCULTA EN JUEGO</span>' : '<span style="font-size: 0.75rem; color: var(--success); font-weight: 700; background: rgba(0, 255, 170, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px;">VISIBLE</span>'}
                </div>
                <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.35rem; margin-left: 1.75rem;">
                    ${f.desc || 'Función del cheat inyectada en el emulador.'}
                </p>
            </div>
            <div>
                ${f.hidden 
                    ? `<button onclick="toggleFeatureDirectly('${f.id}', false)" class="btn-show-feature" style="padding: 0.5rem 1rem;">👁️ Mostrar en Panel</button>` 
                    : `<button onclick="promptHideFeature('${f.id}', '${f.name}')" class="btn-hide-feature" style="padding: 0.5rem 1rem;">✖ Ocultar de Panel</button>`}
            </div>
        </div>
    `).join('');
}

function renderSafeAlertState(alert) {
    const alertBox = document.getElementById('safeMockupAlertBox');
    const alertTitle = document.getElementById('safeMockupAlertTitle');
    const alertMsg = document.getElementById('safeMockupAlertMsg');

    if (alertBox && alert && alert.active && alert.message) {
        alertBox.style.display = 'block';
        alertTitle.innerText = alert.title || 'ALERTA';
        alertMsg.innerText = alert.message;

        if (alert.type === 'maintenance') {
            alertBox.style.borderColor = '#ef4444';
            alertTitle.style.color = '#ef4444';
        } else if (alert.type === 'new_feature') {
            alertBox.style.borderColor = '#10b981';
            alertTitle.style.color = '#10b981';
        } else {
            alertBox.style.borderColor = 'var(--primary)';
            alertTitle.style.color = 'var(--primary)';
        }
    } else if (alertBox) {
        alertBox.style.display = 'none';
    }
}

// Hide Feature Confirmation Modal Handling
function promptHideFeature(featureId, featureName) {
    pendingFeatureToHide = featureId;
    document.getElementById('hideFeatureModalText').innerHTML = `¿Estás seguro que deseas ocultar <b>"${featureName}"</b> del panel?`;
    document.getElementById('hideFeatureModal').classList.add('show');
    
    document.getElementById('confirmHideFeatureBtn').onclick = () => {
        confirmHideFeatureAction(featureId);
    };
}

function closeHideFeatureModal() {
    document.getElementById('hideFeatureModal').classList.remove('show');
    pendingFeatureToHide = null;
}

async function confirmHideFeatureAction(featureId) {
    closeHideFeatureModal();
    await toggleFeatureDirectly(featureId, true);
}

async function toggleFeatureDirectly(featureId, hidden) {
    try {
        const res = await fetch('/api/safe/toggle-feature', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ featureId, hidden })
        });
        const data = await res.json();
        if (data.success) {
            showToast(hidden ? "Función ocultada del panel" : "Función visible en el panel");
            loadSafePanelData();
        } else {
            showToast("Error al modificar función", false);
        }
    } catch (e) {
        showToast("Error de conexión", false);
    }
}

async function broadcastSafeAlert(e) {
    e.preventDefault();
    const type = document.getElementById('safeAlertTypeSelect').value;
    const title = document.getElementById('safeAlertTitleInput').value.trim();
    const message = document.getElementById('safeAlertMsgInput').value.trim();
    const active = document.getElementById('safeAlertActiveToggle').checked;

    try {
        const res = await fetch('/api/safe/alert', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ type, title, message, active })
        });
        const data = await res.json();
        if (data.success) {
            showToast("¡Alerta transmitida en tiempo real a RAFA SAFE!");
            loadSafePanelData();
        } else {
            showToast("Error al transmitir alerta", false);
        }
    } catch (e) {
        showToast("Error de conexión", false);
    }
}

// Security & Access Control Save
async function saveSecurityConfig(e) {
    e.preventDefault();
    const allowFreeAccess = document.getElementById('allowFreeAccessToggle').checked;
    const accessKey = document.getElementById('masterAccessKeyInput').value.trim();
    const broadcastAlert = document.getElementById('broadcastAlertInput').value.trim();

    try {
        const res = await fetch('/api/config/update', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                security: { allowFreeAccess, accessKey },
                status: { broadcastAlert, showAlert: true }
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Configuración de Seguridad y Alerta Guardada");
        }
    } catch (e) {
        showToast("Error al guardar configuración", false);
    }
}

// DLLs Upload Rendering & Handler
function renderDllsTable(dlls) {
    const tbody = document.getElementById('adminDllsTableBody');
    if (!dlls || !tbody) return;

    tbody.innerHTML = dlls.map(dll => `
        <tr>
            <td><code>${dll.id}</code></td>
            <td><b>${dll.name}</b></td>
            <td><code>${dll.filename}</code></td>
            <td style="color: var(--primary); font-weight: 600;">${dll.size || '--'}</td>
            <td style="color: var(--text-muted); font-size: 0.85rem;">${new Date(dll.updatedAt || Date.now()).toLocaleString()}</td>
            <td>
                <input type="file" id="file-${dll.id}" style="display: none;" onchange="uploadSingleDll('${dll.id}')">
                <button onclick="document.getElementById('file-${dll.id}').click()" class="btn-action" style="color: var(--primary); border-color: var(--primary);">
                    ⬆ Subir Nueva DLL
                </button>
            </td>
        </tr>
    `).join('');
}

async function uploadSingleDll(dllId) {
    const fileInput = document.getElementById(`file-${dllId}`);
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('dllFile', file);

    showToast(`Subiendo ${file.name}...`);

    try {
        const res = await fetch(`/api/upload/dll/${dllId}`, {
            method: 'POST',
            headers: { 'X-Admin-Token': currentAdminToken },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast(`¡${file.name} actualizado y sincronizado en la nube!`);
            loadAllAdminData();
        } else {
            showToast(data.error || "Error al subir DLL", false);
        }
    } catch (e) {
        showToast("Error de conexión", false);
    }
}

// Launcher Upload Handler
async function handleLauncherUpload(e) {
    e.preventDefault();
    const fileInput = document.getElementById('launcherFileInput');
    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('launcherFile', file);

    showToast(`Subiendo ${file.name} a la nube...`);

    try {
        const res = await fetch('/api/upload/launcher', {
            method: 'POST',
            headers: { 'X-Admin-Token': currentAdminToken },
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            showToast("¡Launcher_RafaPanel.exe actualizado exitosamente!");
            loadAllAdminData();
        } else {
            showToast(data.error || "Error al subir", false);
        }
    } catch (e) {
        showToast("Error de conexión", false);
    }
}

// Render Launcher Logs & Updates Counter
function renderLauncherLogs(logs, launcherData) {
    const listEl = document.getElementById('launcherLogsList');
    const totalEl = document.getElementById('adminLauncherTotalUpdates');
    const buildEl = document.getElementById('launcherLastBuildLabel');
    if (!listEl) return;

    const count = (launcherData && launcherData.updateCount) || (logs ? logs.length : 0);
    if (totalEl) totalEl.innerText = count;
    if (buildEl) buildEl.innerText = `Build: #${count || 1} • Activo 24/7`;

    if (!logs || logs.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; color: var(--text-dim); padding: 2rem 1rem; font-size: 0.85rem;">
                No hay registros de actualizaciones aún.
            </div>
        `;
        return;
    }

    listEl.innerHTML = logs.map((log) => {
        const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : '--';
        const checksumShort = log.checksum ? log.checksum.substring(0, 10) + '...' : '--';
        return `
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 0.65rem 0.85rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0;">
                    <div style="width: 28px; height: 28px; border-radius: 6px; background: rgba(0, 229, 255, 0.15); color: var(--primary); display: grid; place-items: center; font-size: 0.85rem; flex-shrink: 0;">
                        🚀
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: #f1f5f9; display: flex; align-items: center; gap: 0.4rem;">
                            <span>${log.filename || 'Launcher_RafaPanel.exe'}</span>
                            <span style="font-size: 0.7rem; padding: 0.1rem 0.35rem; background: rgba(16, 185, 129, 0.2); color: var(--success); border-radius: 4px;">${log.size || '--'}</span>
                        </div>
                        <div style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); margin-top: 0.15rem;">
                            ${dateStr} • SHA: ${checksumShort}
                        </div>
                    </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                    <span style="font-size: 0.7rem; color: var(--success); font-weight: 700; background: rgba(0, 255, 170, 0.1); border: 1px solid rgba(0, 255, 170, 0.25); padding: 0.2rem 0.5rem; border-radius: 4px;">
                        ● ONLINE
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

// Clear Launcher Logs Handler
async function clearLauncherLogs() {
    if (!confirm('¿Estás seguro de que deseas limpiar el historial de logs del Launcher?')) return;
    try {
        const res = await fetch('/api/launcher/logs/clear', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            showToast('Historial de logs limpiado.');
            loadAllAdminData();
        } else {
            showToast(data.error || 'Error al limpiar', false);
        }
    } catch (e) {
        showToast('Error de conexión', false);
    }
}

// Discord Webhook Save & Test
async function saveDiscordConfig(e) {
    if (e && e.preventDefault) e.preventDefault();
    const enabled = document.getElementById('discordEnabledToggle').checked;
    const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
    const notifyOnDll = document.getElementById('discordNotifyDll').checked;
    const notifyOnKey = document.getElementById('discordNotifyKey').checked;
    const notifyOnKillSwitch = document.getElementById('discordNotifyKillSwitch').checked;

    try {
        const res = await fetch('/api/discord/save', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                enabled,
                webhookUrl,
                notifyOnDll,
                notifyOnKey,
                notifyOnKillSwitch
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Configuración de Discord Webhook Guardada con éxito");
        }
    } catch (e) {
        showToast("Error al guardar Discord", false);
    }
}

async function testDiscordWebhook() {
    const webhookUrl = document.getElementById('discordWebhookUrl').value.trim();
    if (!webhookUrl) {
        showToast("Por favor pega primero la URL de tu Webhook de Discord", false);
        return;
    }
    showToast("Enviando mensaje de prueba a Discord...");
    await saveDiscordConfig({ preventDefault: () => {} });
}

// Save External MediaFire / Cloud Download URL for Launcher
async function handleSaveLauncherUrl(e) {
    if (e && e.preventDefault) e.preventDefault();
    const externalUrl = (document.getElementById('adminLauncherExternalUrl').value || '').trim();
    const btn = document.getElementById('btnSaveLauncherUrl');
    if (btn) btn.disabled = true;
    showToast("Guardando enlace de descarga...");

    try {
        const res = await fetch('/api/config/launcher-url', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ externalUrl })
        });
        const data = await res.json();
        if (data.success) {
            showToast(data.message || "Enlace guardado con éxito");
            loadAllAdminData();
        } else {
            showToast(data.error || "Error al guardar", false);
        }
    } catch (err) {
        showToast("Error de conexión", false);
    } finally {
        if (btn) btn.disabled = false;
    }
}
