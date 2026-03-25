import { state } from './js/state.js';
import { api, listen } from './js/api.js';
import { render } from './js/dashboard.js';
import { appendLog, updateLogHeader, updateLogCommands, closeLogPanel } from './js/logs.js';
import { closeContextMenu, closeConfirm } from './js/context-menu.js';
import { closeDialog } from './js/dialog.js';

// ── Bootstrap ──────────────────────────────────────

async function init() {
  state.projects = await api.loadConfig();
  state.statuses = await api.getAllStatus();

  render();

  if (state.projects.length >= 5) {
    document.getElementById('search').classList.remove('hidden');
  }

  // Live log streaming
  await listen('process-log', e => {
    if (e.payload.id === state.activeLogId) {
      appendLog(e.payload.text, e.payload.stream);
    }
  });

  // Status changes
  await listen('process-status', e => {
    const { id, running, active_command, url } = e.payload;
    state.statuses[id] = { running, active_command, url };

    render();

    if (id === state.activeLogId) {
      updateLogHeader();
      updateLogCommands();
    }
  });
}

// ── Global keyboard shortcuts ──────────────────────

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;

  const $overlay  = document.getElementById('dialog-overlay');
  const $confOver = document.getElementById('confirm-overlay');
  const $logPanel = document.getElementById('log-panel');

  if (!$overlay.classList.contains('hidden'))  closeDialog();
  else if (!$confOver.classList.contains('hidden')) closeConfirm();
  else if (!$logPanel.classList.contains('hidden')) closeLogPanel();

  closeContextMenu();
});

init();
