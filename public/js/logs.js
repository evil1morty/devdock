import { state, getProject, getStatus } from './state.js';
import { api } from './api.js';
import { runCommand } from './dashboard.js';

const $logPanel = document.getElementById('log-panel');
const $logName  = document.getElementById('log-project-name');
const $logCmd   = document.getElementById('log-active-cmd');
const $logCmds  = document.getElementById('log-commands');
const $logOut   = document.getElementById('log-output');

const MAX_DOM_LINES = 2000;

// ── Open / Close ───────────────────────────────────

export async function openLogPanel(id) {
  state.activeLogId = id;
  const proj = getProject(id);
  if (!proj) return;

  $logPanel.classList.remove('hidden');
  updateLogHeader();
  updateLogCommands();

  document.querySelectorAll('.project-row').forEach(r => {
    r.classList.toggle('active', r.dataset.id === id);
  });

  $logOut.innerHTML = '';
  try {
    const logs = await api.getLogs(id);
    logs.forEach(l => appendLog(l.text, l.stream));
  } catch (_) {}
}

export function closeLogPanel() {
  $logPanel.classList.add('hidden');
  state.activeLogId = null;
  document.querySelectorAll('.project-row').forEach(r => r.classList.remove('active'));
}

// ── Log output ─────────────────────────────────────

export function appendLog(text, stream) {
  const div = document.createElement('div');
  div.className = 'log-line ' + (stream || 'stdout');
  div.textContent = text;
  $logOut.appendChild(div);

  const nearBottom = $logOut.scrollHeight - $logOut.scrollTop - $logOut.clientHeight < 80;
  if (nearBottom) $logOut.scrollTop = $logOut.scrollHeight;

  while ($logOut.children.length > MAX_DOM_LINES) {
    $logOut.removeChild($logOut.firstChild);
  }
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
    const btn = document.createElement('button');
    btn.className = 'log-cmd-btn';
    if (s.running && s.active_command === c.label) btn.classList.add('active');
    btn.textContent = c.label;
    btn.addEventListener('click', () => runCommand(proj.id, c.label, c.cmd, proj.directory));
    $logCmds.appendChild(btn);
  });

  if (s.running) {
    const stopBtn = document.createElement('button');
    stopBtn.className = 'log-cmd-btn stop-btn';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => api.stopProcess(state.activeLogId));
    $logCmds.appendChild(stopBtn);
  }
}

// ── Button handlers ────────────────────────────────

document.getElementById('log-clear').addEventListener('click', () => {
  $logOut.innerHTML = '';
});

document.getElementById('log-close').addEventListener('click', closeLogPanel);
