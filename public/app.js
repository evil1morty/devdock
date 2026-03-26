import { state } from './js/state.js';
import { api, listen } from './js/api.js';
import { $ } from './js/dom.js';
import { render } from './js/dashboard.js';
import { appendLog, updateLogHeader, updateLogCommands, closeLogPanel } from './js/logs.js';
import { closeContextMenu, closeConfirm } from './js/context-menu.js';
import { closeDialog } from './js/dialog.js';
import { applyTheme } from './js/settings.js';

// ── Bootstrap ──────────────────────────────────────

async function init() {
  state.settings = await api.loadSettings();
  state.projects = await api.loadConfig();
  state.statuses = await api.getAllStatus();

  applyTheme(state.settings.theme);

  // Apply saved window size
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.setSize(new window.__TAURI__.window.LogicalSize(state.settings.width || 520, state.settings.height || 680));
  } catch (_) {}

  render();

  await listen('process-log', e => {
    if (e.payload.id === state.activeLogId) appendLog(e.payload.text, e.payload.stream);
  });

  await listen('process-status', e => {
    const { id, running, active_command, url } = e.payload;
    state.statuses[id] = { running, active_command, url };
    render();
    if (id === state.activeLogId) { updateLogHeader(); updateLogCommands(); }
  });
}

// ── Global keyboard shortcuts ──────────────────────

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('dialog-overlay').classList.contains('hidden')) { closeDialog(); return; }
  if (!$('confirm-overlay').classList.contains('hidden')) { closeConfirm(); return; }
  if (!$('settings-overlay').classList.contains('hidden')) { $('settings-overlay').classList.add('hidden'); return; }
  if (!$('log-panel').classList.contains('hidden')) closeLogPanel();
  closeContextMenu();
});

init();
