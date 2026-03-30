import { state, checkProjectPaths, getProject } from './js/state.js';
import { api, listen } from './js/api.js';
import { $ } from './js/dom.js';
import { render, ensurePinnedOrder } from './js/dashboard.js';
import { appendLog, updateLogHeader, updateLogTabs, closeLogPanel } from './js/logs.js';
import { closeContextMenu, closeConfirm, showConfirm } from './js/context-menu.js';
import { openDialog, closeDialog } from './js/dialog.js';
import { applyTheme } from './js/settings.js';
import { toast } from './js/toast.js';

// ── Bootstrap ──────────────────────────────────────

async function init() {
  state.settings = await api.loadSettings();
  state.projects = await api.loadConfig();
  ensurePinnedOrder();
  state.statuses = await api.getAllStatus();

  applyTheme(state.settings.theme);

  // Check which project directories exist
  await checkProjectPaths();

  // Show version in settings
  try {
    const ver = await window.__TAURI__.app.getVersion();
    const el = document.getElementById('app-version');
    if (el) el.textContent = `OneRun v${ver}`;
  } catch (_) {}

  // Apply saved window size
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.setSize(new window.__TAURI__.window.LogicalSize(state.settings.width || 520, state.settings.height || 680));
  } catch (_) {}

  render();

  await listen('process-log', e => {
    const { id, label, text, stream } = e.payload;
    if (id === state.activeLogId && label === state.activeLogTab) {
      appendLog(text, stream);
    }
  });

  await listen('process-status', e => {
    const { id, label, running, url } = e.payload;
    const wasRunning = state.statuses[id]?.[label]?.running;
    if (!state.statuses[id]) state.statuses[id] = {};
    state.statuses[id][label] = { running, url };
    render();
    if (id === state.activeLogId) { updateLogHeader(); updateLogTabs(); }

    // Toast on state change
    const proj = getProject(id);
    const name = proj?.name || id;
    if (running && !wasRunning) {
      toast(`${name} → ${label} started`, 'success', 3000);
    } else if (!running && wasRunning) {
      toast(`${name} → ${label} stopped`, 'warn', 3000);
    }
  });

  await listen('confirm-close', () => {
    let count = 0;
    for (const cmds of Object.values(state.statuses)) {
      for (const s of Object.values(cmds)) {
        if (s.running) count++;
      }
    }
    showConfirm(
      `${count} process${count !== 1 ? 'es' : ''} still running. Quit anyway?`,
      () => api.forceClose(),
      'Quit'
    );
  });
}

// ── Global keyboard shortcuts ──────────────────────

document.addEventListener('keydown', e => {
  // Zoom: Ctrl+Plus / Ctrl+Minus / Ctrl+0
  if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); setZoom(zoomLevel + ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); setZoom(zoomLevel - ZOOM_STEP); return; }
  if (e.ctrlKey && e.key === '0') { e.preventDefault(); setZoom(1.0); return; }

  if (e.key !== 'Escape') return;
  if (!$('dialog-overlay').classList.contains('hidden')) { closeDialog(); return; }
  if (!$('confirm-overlay').classList.contains('hidden')) { closeConfirm(); return; }
  if (!$('settings-overlay').classList.contains('hidden')) { $('settings-overlay').classList.add('hidden'); return; }
  if (!$('log-panel').classList.contains('hidden')) closeLogPanel();
  closeContextMenu();
});

// ── Right-click: edit on row, block elsewhere ─────

document.addEventListener('contextmenu', e => {
  e.preventDefault();
  const row = e.target.closest('.project-row');
  if (row && row.dataset.id) {
    openDialog(row.dataset.id);
  }
});

// ── Zoom (trackpad pinch + Ctrl+scroll) ───────────

let zoomLevel = 1.0;
const ZOOM_STEP = 0.1;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.0;

function setZoom(level) {
  zoomLevel = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level)) * 10) / 10;
  document.documentElement.style.zoom = zoomLevel;
}

document.addEventListener('wheel', e => {
  if (e.ctrlKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(zoomLevel + delta);
  }
}, { passive: false });

init();
