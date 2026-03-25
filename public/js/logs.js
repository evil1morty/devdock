import { state, getProject, getStatus } from './state.js';
import { api } from './api.js';
import { $, btn, toggle, appendLogLine } from './dom.js';
import { runCommand } from './dashboard.js';

const $logPanel = $('log-panel');
const $logName  = $('log-project-name');
const $logCmd   = $('log-active-cmd');
const $logCmds  = $('log-commands');
const $logOut   = $('log-output');

// ── Open / Close ───────────────────────────────────

export async function openLogPanel(id) {
  state.activeLogId = id;
  const proj = getProject(id);
  if (!proj) return;

  toggle($logPanel, true);
  updateLogHeader();
  updateLogCommands();

  document.querySelectorAll('.project-row').forEach(r => {
    r.classList.toggle('active', r.dataset.id === id);
  });

  $logOut.innerHTML = '';
  try {
    const logs = await api.getLogs(id);
    logs.forEach(l => appendLogLine($logOut, l.text, l.stream));
  } catch (_) {}
}

export function closeLogPanel() {
  toggle($logPanel, false);
  state.activeLogId = null;
  document.querySelectorAll('.project-row').forEach(r => r.classList.remove('active'));
}

// ── Log output ─────────────────────────────────────

export function appendLog(text, stream) {
  appendLogLine($logOut, text, stream);
}

// ── Header & command bar ───────────────────────────

export function updateLogHeader() {
  const proj = getProject(state.activeLogId);
  const s = getStatus(state.activeLogId);
  $logName.textContent = proj?.name || '';
  $logCmd.textContent = s.active_command || '';
}

export function updateLogCommands() {
  $logCmds.innerHTML = '';
  const proj = getProject(state.activeLogId);
  if (!proj) return;

  const s = getStatus(state.activeLogId);

  proj.commands.forEach(c => {
    const b = btn(
      'log-cmd-btn' + (s.running && s.active_command === c.label ? ' active' : ''),
      c.label,
      () => runCommand(proj.id, c.label, c.cmd, proj.directory)
    );
    $logCmds.appendChild(b);
  });

  if (s.running) {
    $logCmds.appendChild(
      btn('log-cmd-btn stop-btn', 'Stop', () => api.stopProcess(state.activeLogId))
    );
  }
}

// ── Button handlers ────────────────────────────────

$('log-clear').addEventListener('click', () => { $logOut.innerHTML = ''; });
$('log-close').addEventListener('click', closeLogPanel);
