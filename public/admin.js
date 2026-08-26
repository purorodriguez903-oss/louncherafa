let currentUploadTarget = null;

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initTabs();
  initForms();
  initUploads();
});

// Authentication handling
function initAuth() {
  const isAuth = sessionStorage.getItem('rafa_admin_auth');
  const overlay = document.getElementById('loginOverlay');
  const loginForm = document.getElementById('loginForm');
  const logoutBtn = document.getElementById('logoutBtn');

  if (isAuth === 'true') {
    overlay.style.display = 'none';
    loadAdminData();
  } else {
    overlay.style.display = 'flex';
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('adminPassInput').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem('rafa_admin_auth', 'true');
        overlay.style.display = 'none';
        showToast('✅', 'Acceso Concedido');
        loadAdminData();
      } else {
        showToast('❌', data.error || 'Contraseña incorrecta');
      }
    } catch (err) {
      showToast('❌', 'Error de conexión con el servidor');
    }
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('rafa_admin_auth');
    window.location.reload();
  });
}

// Tabs handling
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      const content = document.getElementById(target);
      if (content) content.style.display = 'block';
    });
  });
}

// Load data into admin forms and table
async function loadAdminData() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.success) return;

    // 1. Render 7 DLLs
    renderAdminDllTable(data.dlls);

    // 2. Populate Security Form
    document.getElementById('allowFreeAccessToggle').checked = data.security.allowFreeAccess || false;
    // We get key from admin settings call or store
    document.getElementById('accessKeyInput').value = data.security.accessKey || 'RAFAPANEL';

    // 3. Populate Texts Form
    if (data.status) {
      document.getElementById('stateSelect').value = data.status.state || 'undetected';
      document.getElementById('versionInput').value = data.status.version || 'v3.2 VIP';
      document.getElementById('titleInput').value = data.status.title || 'RAFA PANEL - VIP 2026';
      document.getElementById('subtitleInput').value = data.status.subtitle || 'Sistema de Inyección Automática en la Nube';
      document.getElementById('broadcastInput').value = data.status.broadcastAlert || '';
      document.getElementById('showAlertToggle').checked = data.status.showAlert !== false;
    }

    // 4. Launcher info
    if (data.launcher) {
      document.getElementById('launcherFileName').textContent = data.launcher.filename;
      document.getElementById('launcherFileSize').textContent = `Tamaño: ${data.launcher.size}`;
    }

  } catch (err) {
    console.error('Error loading admin data:', err);
  }
}

// Render DLLs table in Admin with "Actualizar" buttons
function renderAdminDllTable(dlls) {
  const tbody = document.getElementById('adminDllTableBody');
  if (!tbody || !dlls) return;

  tbody.innerHTML = '';

  dlls.forEach(dll => {
    const tr = document.createElement('tr');
    const formattedDate = dll.updatedAt ? new Date(dll.updatedAt).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Actualizado';

    tr.innerHTML = `
      <td>
        <div class="dll-name-cell">
          <div class="dll-icon">📦</div>
          <div>
            <div style="font-weight: 700; color: #fff;">${dll.name}</div>
            <div style="font-size: 0.8rem; color: var(--primary); font-family: var(--font-mono);">${dll.filename}</div>
          </div>
        </div>
      </td>
      <td>
        <span style="color: var(--text-muted); font-size: 0.85rem;">${dll.description}</span>
      </td>
      <td style="font-family: var(--font-mono); color: var(--success); font-weight: 700;">
        ${dll.size || 'N/A'}
      </td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">
        ${formattedDate}
      </td>
      <td>
        <button type="button" class="btn-update-admin" onclick="triggerDllUpload('${dll.id}', '${dll.filename}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Actualizar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Trigger file input for a specific DLL
function triggerDllUpload(dllId, filename) {
  currentUploadTarget = dllId;
  const fileInput = document.getElementById('globalFileInput');
  fileInput.setAttribute('accept', '.dll');
  fileInput.value = '';
  fileInput.click();
}

// Initialize forms
function initForms() {
  // Security Form
  const securityForm = document.getElementById('securityForm');
  securityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const allowFree = document.getElementById('allowFreeAccessToggle').checked;
    const accessKey = document.getElementById('accessKeyInput').value.trim();
    const adminPass = document.getElementById('adminPasswordInput').value.trim();

    const payload = {
      security: {
        allowFreeAccess: allowFree,
        loginRequired: !allowFree,
        accessKey: accessKey
      }
    };
    if (adminPass) {
      payload.server = { adminPassword: adminPass };
    }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅', 'Seguridad y Claves actualizadas');
      } else {
        showToast('❌', data.error || 'Error al guardar');
      }
    } catch (err) {
      showToast('❌', 'Error al conectar con el servidor');
    }
  });

  // Texts & Live Status Form
  const textsForm = document.getElementById('textsForm');
  textsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const state = document.getElementById('stateSelect').value;
    const version = document.getElementById('versionInput').value.trim();
    const title = document.getElementById('titleInput').value.trim();
    const subtitle = document.getElementById('subtitleInput').value.trim();
    const broadcastAlert = document.getElementById('broadcastInput').value.trim();
    const showAlert = document.getElementById('showAlertToggle').checked;

    let stateLabel = 'INDETECTADO (SEGURO)';
    if (state === 'maintenance') stateLabel = 'EN MANTENIMIENTO';
    if (state === 'updating') stateLabel = 'ACTUALIZANDO / PARCHE';

    const payload = {
      status: {
        state,
        stateLabel,
        version,
        title,
        subtitle,
        broadcastAlert,
        showAlert
      }
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('📢', 'Textos y Estado publicados en vivo');
      } else {
        showToast('❌', data.error || 'Error al guardar');
      }
    } catch (err) {
      showToast('❌', 'Error al conectar con el servidor');
    }
  });
}

// File Upload Handler (DLLs & Launcher)
function initUploads() {
  const fileInput = document.getElementById('globalFileInput');

  fileInput.addEventListener('change', async () => {
    if (!fileInput.files.length || !currentUploadTarget) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('dllId', currentUploadTarget);
    formData.append('file', file);

    showToast('⏳', `Subiendo ${file.name}...`);

    try {
      const res = await fetch('/api/admin/upload-dll', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        showToast('🚀', data.message);
        loadAdminData();
      } else {
        showToast('❌', data.error || 'Error al subir');
      }
    } catch (err) {
      showToast('❌', 'Error en la subida del archivo');
    } finally {
      currentUploadTarget = null;
    }
  });

  // Upload Launcher Button
  const uploadLauncherBtn = document.getElementById('uploadLauncherBtn');
  uploadLauncherBtn.addEventListener('click', () => {
    currentUploadTarget = 'launcher';
    fileInput.setAttribute('accept', '.exe');
    fileInput.value = '';
    fileInput.click();
  });
}

// Toast notification helper
function showToast(icon, message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMsg').textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}
