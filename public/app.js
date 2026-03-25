import { state } from './js/state.js';
import { api, listen } from './js/api.js';
import { $ } from './js/dom.js';
import { render } from './js/dashboard.js';
import { appendLog, updateLogHeader, updateLogCommands, closeLogPanel } from './js/logs.js';
import { closeContextMenu, closeConfirm } from './js/context-menu.js';
import { closeDialog } from './js/dialog.js';

// ── Bootstrap ──────────────────────────────────────

async function init() {
  state.projects = await api.loadConfig();
  state.statuses = await api.getAllStatus();
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
  const overlay = $('dialog-overlay');
  const confirm = $('confirm-overlay');
  const logPanel = $('log-panel');

  if (!overlay.classList.contains('hidden')) closeDialog();
  else if (!confirm.classList.contains('hidden')) closeConfirm();
  else if (!logPanel.classList.contains('hidden')) closeLogPanel();
  closeContextMenu();
});

init();
