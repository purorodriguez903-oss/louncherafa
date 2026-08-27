// RAFA AUTH CONTROL CENTER Controller 2026 (Exact Screenshot Replica & Cloud Persistence)
let currentAuthToken = localStorage.getItem('rafaAuthToken') || sessionStorage.getItem('rafaAuthToken') || '';
let currentUserRole = localStorage.getItem('rafaAuthRole') || sessionStorage.getItem('rafaAuthRole') || 'OWNER';
let currentUsername = localStorage.getItem('rafaAuthUser') || sessionStorage.getItem('rafaAuthUser') || 'Rafa Admin';
let allAuthUsers = [];
let allAuthKeys = [];
let allSellers = [];
let currentAuthData = null;
let currentTierFilter = 'ALL';
let currentPage = 1;
const pageSize = 5;
let activeMenuUser = null;

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
    toast.style.borderColor = isSuccess ? '#7c3aed' : '#ef4444';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function copyText(text, label = 'Texto') {
    if (!text || text === 'Sin Vincular') return;
    navigator.clipboard.writeText(text).then(() => {
        showAuthToast(`¡${label} copiado al portapapeles!`);
    }).catch(() => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        showAuthToast(`¡${label} copiado!`);
    });
}

function toggleRoleHint(role) {
    const userInp = document.getElementById('authUsernameInput');
    if (role === 'OWNER') {
        if (!userInp.value || userInp.value === 'seller_demo') userInp.value = 'Rafa Admin';
    } else {
        if (userInp.value === 'Rafa Admin') userInp.value = '';
    }
}

// Auto-Login Verification on Load
window.addEventListener('DOMContentLoaded', async () => {
    // Hide action dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('rowActionMenu');
        if (menu && !e.target.closest('.rf-action-dots-btn') && !e.target.closest('#rowActionMenu')) {
            menu.classList.remove('show');
        }
    });

    // Row action buttons handlers
    setupRowActionHandlers();

    if (currentAuthToken) {
        const ok = await verifyAuthToken(currentAuthToken);
        if (ok) return;
    }
    document.getElementById('authLoginModal').style.display = 'flex';
    document.getElementById('authMainApp').style.display = 'none';
});

async function verifyAuthToken(token) {
    try {
        const res = await fetch('/api/admin/verify-session', {
            headers: { 'X-Admin-Token': token }
        });
        const data = await res.json();
        if (res.ok && data.authenticated) {
            currentAuthToken = token;
            currentUserRole = data.role || 'OWNER';
            currentUsername = data.username || 'Rafa Admin';
            
            setupRoleInterface();
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

// Login Handler
async function handleAuthLogin(e) {
    e.preventDefault();
    const username = document.getElementById('authUsernameInput').value.trim();
    const password = document.getElementById('authPasswordInput').value;
    const role = document.getElementById('authRoleSelect').value;
    const rememberMe = document.getElementById('authRememberMe').checked;
    const errEl = document.getElementById('authLoginError');
    errEl.style.display = 'none';

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role, rememberMe })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            currentAuthToken = data.token;
            currentUserRole = data.role || role;
            currentUsername = data.username || username || 'Rafa Admin';

            if (rememberMe) {
                localStorage.setItem('rafaAuthToken', data.token);
                localStorage.setItem('rafaAuthRole', currentUserRole);
                localStorage.setItem('rafaAuthUser', currentUsername);
            } else {
                sessionStorage.setItem('rafaAuthToken', data.token);
                sessionStorage.setItem('rafaAuthRole', currentUserRole);
                sessionStorage.setItem('rafaAuthUser', currentUsername);
            }

            setupRoleInterface();
            document.getElementById('authLoginModal').style.display = 'none';
            document.getElementById('authMainApp').style.display = 'flex';

            await loadAuthData();
            startLiveAuthPolling();
            showAuthToast(`¡Bienvenido ${currentUsername}!`);
        } else {
            errEl.innerText = data.message || "Credenciales incorrectas.";
            errEl.style.display = 'block';
        }
    } catch (err) {
        errEl.innerText = "Error de conexión con el servidor.";
        errEl.style.display = 'block';
    }
}

function setupRoleInterface() {
    const navUser = document.getElementById('navUserName');
    const navRole = document.getElementById('navUserRole');
    const ownerNav = document.getElementById('ownerOnlyNavSection');

    if (navUser) navUser.innerText = currentUsername;

    if (currentUserRole === 'OWNER') {
        if (navRole) navRole.innerText = 'Administrador';
        if (ownerNav) ownerNav.style.display = 'block';
    } else {
        if (navRole) navRole.innerText = 'Revendedor';
        if (ownerNav) ownerNav.style.display = 'none';
    }
}

function logoutAuthAdmin() {
    localStorage.removeItem('rafaAuthToken');
    sessionStorage.removeItem('rafaAuthToken');
    localStorage.removeItem('rafaAuthRole');
    sessionStorage.removeItem('rafaAuthRole');
    location.reload();
}

// Switch Tabs
function switchAuthTab(tabId) {
    document.querySelectorAll('.rf-nav-btn').forEach(btn => {
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

// Load All Data from Cloud API
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
        allSellers = data.sellers || [];

        // Update Dashboard Metrics (Exact Top Screenshot)
        const totalUsers = allAuthUsers.length;
        const supremeUsers = allAuthUsers.filter(u => u.subscription === 'Supreme').length;
        const basicUsers = allAuthUsers.filter(u => u.subscription === 'Basico').length;
        const liveUsers = data.activeSessions ? data.activeSessions.length : 0;

        document.getElementById('dashTotalUsers').innerText = totalUsers;
        document.getElementById('dashSupremeUsers').innerText = supremeUsers;
        document.getElementById('dashBasicUsers').innerText = basicUsers;
        document.getElementById('dashLiveUsers').innerText = liveUsers;

        const supPct = totalUsers > 0 ? ((supremeUsers / totalUsers) * 100).toFixed(1) : "0.0";
        const basPct = totalUsers > 0 ? ((basicUsers / totalUsers) * 100).toFixed(1) : "0.0";
        document.getElementById('dashSupremePct').innerText = `${supPct}% del total`;
        document.getElementById('dashBasicPct').innerText = `${basPct}% del total`;

        const subSup = document.getElementById('subCountSupreme');
        const subBas = document.getElementById('subCountBasic');
        if (subSup) subSup.innerText = `${supremeUsers}`;
        if (subBas) subBas.innerText = `${basicUsers}`;

        // Render Tables
        renderUsersTable(allAuthUsers);
        renderAuthKeysTable(allAuthKeys);
        renderSellersTable(allSellers);
        renderLiveTelemetryTable(data.activeSessions || []);

        // Free Mode State
        if (data.freeMode) {
            const freeToggle = document.getElementById('freeModeMasterToggle');
            const freeTier = document.getElementById('freeModeTierSelect');
            if (freeToggle) freeToggle.checked = !!data.freeMode.active;
            if (freeTier) freeTier.value = data.freeMode.defaultTier || 'Basico';
        }

        // Broadcast State
        if (data.broadcast) {
            const bTitle = document.getElementById('broadcastTitleInput');
            const bMsg = document.getElementById('broadcastMsgInput');
            const bActive = document.getElementById('broadcastActiveToggle');
            if (bTitle) bTitle.value = data.broadcast.title || 'AVISO VIP';
            if (bMsg) bMsg.value = data.broadcast.message || '';
            if (bActive) bActive.checked = !!data.broadcast.active;
        }

    } catch (e) {
        console.error('Error loading auth data:', e);
    }
}

function startLiveAuthPolling() {
    setInterval(loadAuthData, 3000);
}

// ========================================================
// USERS TABLE (EXACT BOTTOM SCREENSHOT REPLICA)
// ========================================================
function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;

    let filtered = users;
    if (currentTierFilter === 'Supreme') {
        filtered = users.filter(u => u.subscription === 'Supreme');
    } else if (currentTierFilter === 'Basico') {
        filtered = users.filter(u => u.subscription === 'Basico');
    } else if (currentTierFilter === 'Gratis') {
        filtered = users.filter(u => u.subscription === 'Gratis' || u.label === 'Gratis');
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    // Update Pagination Info
    const pagText = document.getElementById('usersPaginationText');
    if (pagText) {
        const endIdx = Math.min(startIdx + pageSize, total);
        pagText.innerText = total > 0 ? `Mostrando ${startIdx + 1} a ${endIdx} de ${total} usuarios` : `Mostrando 0 de 0 usuarios`;
    }
    renderPaginationButtons(totalPages);

    if (!pageItems || pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 2rem;">No se encontraron usuarios en esta categoría.</td></tr>`;
        return;
    }

    tbody.innerHTML = pageItems.map(u => {
        let planBadge = `<span class="badge-rf-supreme">👑 Supreme</span>`;
        if (u.subscription === 'Basico') planBadge = `<span class="badge-rf-basic">⭐ Básico</span>`;
        else if (u.subscription === 'Gratis' || u.label === 'Gratis') planBadge = `<span class="badge-rf-free">💬 Gratis</span>`;

        let remainingText = u.remaining || '29 días restantes';
        if (!remainingText.includes('restantes') && !remainingText.includes('Permanente') && !remainingText.includes('Gratuito')) {
            remainingText += ' restantes';
        }

        const hwidDisplay = u.hwid && u.hwid !== 'HWID-PENDING'
            ? `<span class="rf-hwid-text" onclick="copyText('${u.hwid}', 'HWID')" title="Click para copiar">${u.hwid.slice(0, 14)}...</span>`
            : `<span style="color: #475569; font-size: 0.74rem;">Sin Vincular</span>`;

        let statusBadge = `<span class="badge-rf-active">Activo</span>`;
        if (u.status === 'expired') statusBadge = `<span class="badge-rf-expired">Expirado</span>`;

        return `
            <tr>
                <td><b style="color: #fff; font-size: 0.84rem;">${u.username}</b></td>
                <td>${planBadge}</td>
                <td style="color: #cbd5e1; font-size: 0.8rem;">${remainingText}</td>
                <td>${hwidDisplay}</td>
                <td>${statusBadge}</td>
                <td style="text-align: right; position: relative;">
                    <button class="rf-action-dots-btn" onclick="openRowActionMenu(event, '${u.username}', '${u.subscription}')" title="Acciones">⋮</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaginationButtons(totalPages) {
    const container = document.getElementById('usersPaginationButtons');
    if (!container) return;

    let html = `<button class="rf-pag-btn" onclick="goToUsersPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled style="opacity:0.4;"' : ''}>&lt;</button>`;

    for (let i = 1; i <= Math.min(totalPages, 5); i++) {
        html += `<button class="rf-pag-btn ${i === currentPage ? 'active' : ''}" onclick="goToUsersPage(${i})">${i}</button>`;
    }
    if (totalPages > 5) {
        html += `<span style="color: #64748b; padding: 0 2px;">...</span>`;
        html += `<button class="rf-pag-btn ${totalPages === currentPage ? 'active' : ''}" onclick="goToUsersPage(${totalPages})">${totalPages}</button>`;
    }

    html += `<button class="rf-pag-btn" onclick="goToUsersPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled style="opacity:0.4;"' : ''}>&gt;</button>`;
    container.innerHTML = html;
}

function goToUsersPage(p) {
    currentPage = p;
    renderUsersTable(allAuthUsers);
}

function filterUserTier(tier) {
    currentTierFilter = tier;
    currentPage = 1;
    ['filterTierAll', 'filterTierSupreme', 'filterTierBasic', 'filterTierGratis'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    const activeBtn = document.getElementById(
        tier === 'ALL' ? 'filterTierAll' :
        tier === 'Supreme' ? 'filterTierSupreme' :
        tier === 'Basico' ? 'filterTierBasic' : 'filterTierGratis'
    );
    if (activeBtn) activeBtn.classList.add('active');

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

// ========================================================
// ROW ACTION MENU (⋮ BUTTON)
// ========================================================
function openRowActionMenu(event, username, currentTier) {
    event.stopPropagation();
    const menu = document.getElementById('rowActionMenu');
    if (!menu) return;

    activeMenuUser = { username, currentTier };

    // Position menu near the clicked button
    const rect = event.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.style.left = `${rect.right + window.scrollX - 140}px`;
    menu.classList.add('show');
}

function setupRowActionHandlers() {
    const btnPlan = document.getElementById('menuBtnPlan');
    const btnHwid = document.getElementById('menuBtnHwid');
    const btnRenew = document.getElementById('menuBtnRenew');
    const btnDelete = document.getElementById('menuBtnDelete');

    if (btnPlan) btnPlan.onclick = () => {
        if (!activeMenuUser) return;
        toggleUserTierChange(activeMenuUser.username, activeMenuUser.currentTier);
        document.getElementById('rowActionMenu').classList.remove('show');
    };

    if (btnHwid) btnHwid.onclick = () => {
        if (!activeMenuUser) return;
        resetUserHwid(activeMenuUser.username);
        document.getElementById('rowActionMenu').classList.remove('show');
    };

    if (btnRenew) btnRenew.onclick = () => {
        if (!activeMenuUser) return;
        renewUserAccount(activeMenuUser.username);
        document.getElementById('rowActionMenu').classList.remove('show');
    };

    if (btnDelete) btnDelete.onclick = () => {
        if (!activeMenuUser) return;
        deleteUserAccount(activeMenuUser.username);
        document.getElementById('rowActionMenu').classList.remove('show');
    };
}

// User Action Modals & Requests
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
            showAuthToast(`¡Usuario '${username}' (${subscription}) creado y guardado!`);
            loadAuthData();
        } else {
            showAuthToast(data.error || "Error al crear usuario", false);
        }
    } catch (e) {
        showAuthToast("Error al crear usuario", false);
    }
}

async function deleteUserAccount(username) {
    if (!confirm(`¿Eliminar usuario '${username}'?`)) return;
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
    if (!confirm(`¿Desvincular HWID de '${username}'?`)) return;
    try {
        const res = await fetch('/api/auth/user/reset-hwid', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`HWID de '${username}' liberado`);
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
            showAuthToast(`'${username}' +30 Días (${data.remaining})`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al renovar", false);
    }
}

async function toggleUserTierChange(username, currentTier) {
    const newTier = currentTier === 'Supreme' ? 'Basico' : 'Supreme';
    if (!confirm(`¿Cambiar suscripción de '${username}' a ${newTier}?`)) return;

    try {
        const res = await fetch('/api/auth/user/change-tier', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, subscription: newTier })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`Plan cambiado a ${newTier}`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al cambiar plan", false);
    }
}

// ========================================================
// LICENSES TABLE (KEYS)
// ========================================================
function renderAuthKeysTable(keys) {
    const tbody = document.getElementById('authKeysTableBody');
    if (!tbody) return;

    if (!keys || keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 1.5rem;">No hay licencias generadas aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = keys.map(k => {
        let planBadge = `<span class="badge-rf-supreme">👑 Supreme</span>`;
        if (k.subscription === 'Basico') planBadge = `<span class="badge-rf-basic">⭐ Básico</span>`;

        const hwidDisplay = k.hwid && k.hwid !== 'HWID-PENDING'
            ? `<span class="rf-hwid-text" onclick="copyText('${k.hwid}', 'HWID')" title="Click para copiar">${k.hwid.slice(0, 14)}...</span>`
            : `<span style="color: #64748b; font-size: 0.74rem;">Sin Vincular</span>`;

        return `
            <tr>
                <td>
                    <span class="code-pass" style="color: #38bdf8; font-weight: 700;" onclick="copyText('${k.key}', 'Clave')" title="Click para copiar">${k.key} 📋</span>
                </td>
                <td>${planBadge}</td>
                <td><span style="font-size: 0.78rem; color: #e2e8f0;">${k.label || 'Licencia'}</span></td>
                <td style="font-size: 0.78rem; color: #cbd5e1;">${k.remaining || k.duration || '30 Días'}</td>
                <td>${hwidDisplay}</td>
                <td><span class="badge-rf-active">Activa</span></td>
                <td style="text-align: right; white-space: nowrap;">
                    ${k.hwid ? `<button onclick="resetAuthKeyHwid('${k.key}')" class="btn-micro btn-micro-cyan" title="Reset HWID">🔄 HWID</button>` : ''}
                    <button onclick="renewAuthKey('${k.key}')" class="btn-micro btn-micro-green" title="Añadir 30 Días">+30D</button>
                    <button onclick="deleteAuthKey('${k.key}')" class="btn-micro btn-micro-red" title="Eliminar">🗑</button>
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
            showAuthToast(`¡${data.created.length} clave(s) ${subscription} generadas y guardadas!`);
            loadAuthData();
        } else {
            showAuthToast(data.error || "Error al generar claves", false);
        }
    } catch (e) {
        showAuthToast("Error al generar claves", false);
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
            showAuthToast(`Clave extendida +30D (${data.remaining})`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al renovar clave", false);
    }
}

// ========================================================
// SELLERS MANAGEMENT (OWNER ONLY)
// ========================================================
function renderSellersTable(sellers) {
    const tbody = document.getElementById('sellersTableBody');
    if (!tbody) return;

    if (!sellers || sellers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">No hay revendedores registrados. Usa '+ Crear Revendedor'.</td></tr>`;
        return;
    }

    tbody.innerHTML = sellers.map(s => {
        return `
            <tr>
                <td><b style="color: #fff; font-size: 0.84rem;">${s.username}</b></td>
                <td><span class="code-pass" onclick="copyText('${s.password}', 'Contraseña')" title="Click para copiar">${s.password} 📋</span></td>
                <td><span style="color: #c084fc; font-weight: 600; font-size: 0.78rem;">${s.label || 'Revendedor'}</span></td>
                <td style="font-size: 0.78rem; color: #94a3b8;">${new Date(s.createdAt).toLocaleDateString()}</td>
                <td><span class="badge-rf-active">Activo</span></td>
                <td style="text-align: right;">
                    <button onclick="deleteSellerAccount('${s.username}')" class="btn-micro btn-micro-red" title="Eliminar Revendedor">🗑 Eliminar</button>
                </td>
            </tr>
        `;
    }).join('');
}

function openCreateSellerModal() {
    document.getElementById('createSellerModal').classList.add('show');
}
function closeCreateSellerModal() {
    document.getElementById('createSellerModal').classList.remove('show');
}

async function submitCreateSeller(e) {
    e.preventDefault();
    const username = document.getElementById('sellerUsernameInput').value.trim();
    const password = document.getElementById('sellerPasswordInput').value.trim();
    const label = document.getElementById('sellerLabelInput').value.trim();

    try {
        const res = await fetch('/api/auth/seller/create', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username, password, label })
        });
        const data = await res.json();
        if (data.success) {
            closeCreateSellerModal();
            showAuthToast(`¡Revendedor '${username}' creado con éxito!`);
            loadAuthData();
        } else {
            showAuthToast(data.error || "Error al crear revendedor", false);
        }
    } catch (e) {
        showAuthToast("Error al conectar", false);
    }
}

async function deleteSellerAccount(username) {
    if (!confirm(`¿Eliminar al revendedor '${username}'? Ya no podrá acceder.`)) return;
    try {
        const res = await fetch('/api/auth/seller/delete', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(`Revendedor '${username}' eliminado`);
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al eliminar", false);
    }
}

// ========================================================
// DATABASE BACKUP & RESTORE (PERSISTENCE)
// ========================================================
function exportDatabaseBackup() {
    window.location.href = '/api/auth/backup/export?t=' + Date.now();
    showAuthToast("Descargando archivo de respaldo JSON...");
}

async function handleImportBackupFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            const res = await fetch('/api/auth/backup/import', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ backup: parsed })
            });
            const data = await res.json();
            if (data.success) {
                showAuthToast("¡Base de datos restaurada correctamente!");
                loadAuthData();
            } else {
                showAuthToast(data.error || "Error al restaurar", false);
            }
        } catch (err) {
            showAuthToast("El archivo JSON no es válido", false);
        }
    };
    reader.readAsText(file);
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

    try {
        const res = await fetch('/api/auth/freemode/toggle', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ active, defaultTier, universalUser: 'FREE', universalPass: 'FREE' })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast(active ? "🔓 Modo Gratis ACTIVADO" : "🔒 Modo Gratis DESACTIVADO");
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
    const title = document.getElementById('broadcastTitleInput').value.trim();
    const message = document.getElementById('broadcastMsgInput').value.trim();
    const active = document.getElementById('broadcastActiveToggle').checked;

    try {
        const res = await fetch('/api/auth/broadcast/send', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ type: 'notice', title, message, active })
        });
        const data = await res.json();
        if (data.success) {
            showAuthToast("¡Mensaje transmitido al panel!");
            loadAuthData();
        }
    } catch (e) {
        showAuthToast("Error al transmitir mensaje", false);
    }
}

// ========================================================
// TELEMETRY LIVE SESSIONS
// ========================================================
function renderLiveTelemetryTable(sessions) {
    const tbody = document.getElementById('authLiveSessionsTable');
    if (!tbody) return;

    if (!sessions || sessions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">No hay clientes conectados en este momento.</td></tr>`;
        return;
    }

    tbody.innerHTML = sessions.map(s => {
        const subBadge = s.subscription === 'Supreme'
            ? `<span class="badge-rf-supreme">👑 Supreme</span>`
            : `<span class="badge-rf-basic">⭐ Básico</span>`;

        return `
            <tr>
                <td><b style="color: #fff; font-size: 0.82rem;">${s.username || (s.hwid ? s.hwid.slice(0, 14) + '...' : 'Cliente')}</b></td>
                <td>${subBadge}</td>
                <td style="color: #94a3b8; font-size: 0.78rem;">${s.emulator || 'PC / Emulador'}</td>
                <td style="color: #64748b; font-size: 0.76rem; font-family: var(--font-mono);">${s.ip || '127.0.0.1'}</td>
                <td style="color: #34d399; font-weight: 600; font-size: 0.76rem;">Hace ${Math.floor((Date.now() - (s.lastSeen || Date.now())) / 1000)}s</td>
                <td><span class="badge-rf-active">En Vivo</span></td>
            </tr>
        `;
    }).join('');
}
