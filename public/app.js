document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  // Auto refresh data every 10 seconds
  setInterval(loadStatus, 10000);
});

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (!data.success) return;

    // Update Banner Alert
    const alertBanner = document.getElementById('alertBanner');
    const alertText = document.getElementById('alertText');
    if (data.status.showAlert && data.status.broadcastAlert) {
      alertBanner.style.display = 'flex';
      alertText.textContent = data.status.broadcastAlert;
    } else {
      alertBanner.style.display = 'none';
    }

    // Update Titles
    if (data.status.title) {
      document.getElementById('navTitle').textContent = data.status.title;
      document.getElementById('heroTitle').textContent = data.status.title;
    }
    if (data.status.subtitle) {
      document.getElementById('navSubtitle').textContent = data.status.subtitle;
      document.getElementById('heroSubtitle').textContent = data.status.subtitle;
    }

    // Update Status Badge
    const badge = document.getElementById('heroBadge');
    const stateLabel = document.getElementById('statusStateLabel');
    if (data.status.state === 'undetected') {
      badge.style.background = 'rgba(0, 255, 170, 0.1)';
      badge.style.borderColor = 'rgba(0, 255, 170, 0.3)';
      badge.style.color = '#00ffaa';
      stateLabel.textContent = data.status.stateLabel || 'INDETECTADO (SEGURO)';
    } else if (data.status.state === 'maintenance') {
      badge.style.background = 'rgba(251, 191, 36, 0.1)';
      badge.style.borderColor = 'rgba(251, 191, 36, 0.3)';
      badge.style.color = '#fbbf24';
      stateLabel.textContent = data.status.stateLabel || 'EN MANTENIMIENTO';
    } else {
      badge.style.background = 'rgba(239, 68, 68, 0.1)';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      badge.style.color = '#ef4444';
      stateLabel.textContent = data.status.stateLabel || 'ACTUALIZANDO';
    }

    // Update Metrics
    if (data.stats) {
      document.getElementById('statDllDownloads').textContent = (data.stats.dllDownloads || 348) + '+';
      document.getElementById('statLauncherDownloads').textContent = (data.stats.launcherDownloads || 192) + '+';
    }
    if (data.status.version) {
      document.getElementById('statVersion').textContent = data.status.version;
    }

    // Render 7 DLLs Table
    renderDllsTable(data.dlls);

  } catch (err) {
    console.error('Error fetching server status:', err);
  }
}

function renderDllsTable(dlls) {
  const tbody = document.getElementById('dllTableBody');
  if (!tbody || !dlls || !dlls.length) return;

  tbody.innerHTML = '';

  dlls.forEach(dll => {
    const tr = document.createElement('tr');
    
    const formattedDate = dll.updatedAt ? new Date(dll.updatedAt).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }) : 'Actualizado';

    tr.innerHTML = `
      <td>
        <div class="dll-name-cell">
          <div class="dll-icon">📄</div>
          <div>
            <div style="font-weight: 700; color: #fff;">${dll.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-dim); font-family: var(--font-mono);">${dll.filename}</div>
          </div>
        </div>
      </td>
      <td>
        <span class="dll-badge">${dll.category || 'Módulo'}</span>
      </td>
      <td style="font-family: var(--font-mono); color: var(--primary); font-weight: 600;">
        ${dll.size || 'N/A'}
      </td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">
        ${formattedDate}
      </td>
      <td>
        <a href="/api/download/${dll.id}" class="btn-download">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Descargar
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}
