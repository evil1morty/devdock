import { state } from './js/state.js';
import { api, listen } from './js/api.js';
import { $ } from './js/dom.js';
import { render } from './js/dashboard.js';
import { appendLog, updateLogHeader, updateLogTabs, closeLogPanel } from './js/logs.js';
import { closeContextMenu, closeConfirm, showConfirm } from './js/context-menu.js';
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
    const { id, label, text, stream } = e.payload;
    if (id === state.activeLogId && label === state.activeLogTab) {
      appendLog(text, stream);
    }
  });

  await listen('process-status', e => {
    const { id, label, running, url } = e.payload;
    if (!state.statuses[id]) state.statuses[id] = {};
    state.statuses[id][label] = { running, url };
    render();
    if (id === state.activeLogId) { updateLogHeader(); updateLogTabs(); }
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
  if (e.key !== 'Escape') return;
  if (!$('dialog-overlay').classList.contains('hidden')) { closeDialog(); return; }
  if (!$('confirm-overlay').classList.contains('hidden')) { closeConfirm(); return; }
  if (!$('settings-overlay').classList.contains('hidden')) { $('settings-overlay').classList.add('hidden'); return; }
  if (!$('log-panel').classList.contains('hidden')) closeLogPanel();
  closeContextMenu();
});

init();
