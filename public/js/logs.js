import { state, getProject, getStatus, getCmdStatus } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, appendLogLine } from './dom.js';
import { runCommand } from './dashboard.js';

const $logPanel = $('log-panel');
const $dash     = $('dashboard');
const $logName  = $('log-project-name');
const $logTabs  = $('log-tabs');
const $logOut   = $('log-output');

// ── Open / Close ───────────────────────────────────

export async function openLogPanel(id) {
  state.activeLogId = id;
  const proj = getProject(id);
  if (!proj) return;

  // Pick default tab: first running command, or first command
  const cmds = state.statuses[id] || {};
  const runningLabel = proj.commands.find(c => cmds[c.label]?.running)?.label;
  state.activeLogTab = runningLabel || proj.commands[0]?.label || null;

  toggle($logPanel, true);
  $dash.classList.add('blurred');
  updateLogHeader();
  updateLogTabs();

  document.querySelectorAll('.project-row').forEach(r => {
    r.classList.toggle('active', r.dataset.id === id);
  });

  await loadTabLogs();
}

export function closeLogPanel() {
  toggle($logPanel, false);
  $dash.classList.remove('blurred');
  state.activeLogId = null;
  state.activeLogTab = null;
  document.querySelectorAll('.project-row').forEach(r => r.classList.remove('active'));
}

// ── Tab switching ──────────────────────────────────

export async function switchTab(label) {
  if (label === state.activeLogTab) return;
  state.activeLogTab = label;
  updateLogTabs();
  await loadTabLogs();
}

async function loadTabLogs() {
  $logOut.innerHTML = '';
  if (!state.activeLogId || !state.activeLogTab) {
    showEmptyLog();
    return;
  }
  try {
    const logs = await api.getLogs(state.activeLogId, state.activeLogTab);
    if (logs.length === 0) {
      showEmptyLog();
    } else {
      logs.forEach(l => appendLogLine($logOut, l.text, l.stream));
    }
  } catch (_) {
    showEmptyLog();
  }
}

// ── Log output ─────────────────────────────────────

function showEmptyLog() {
  $logOut.innerHTML = '';
  $logOut.appendChild(el('div', 'log-empty', 'Logs will appear here when you run a command'));
}

export function appendLog(text, stream) {
  // Remove empty state if present
  const empty = $logOut.querySelector('.log-empty');
  if (empty) empty.remove();
  appendLogLine($logOut, text, stream);
}

// ── Header & tab bar ───────────────────────────────

export function updateLogHeader() {
  const proj = getProject(state.activeLogId);
  $logName.textContent = proj?.name || '';
}

export function updateLogTabs() {
  $logTabs.innerHTML = '';
  const proj = getProject(state.activeLogId);
  if (!proj) return;

  proj.commands.forEach(c => {
    const cs = getCmdStatus(proj.id, c.label);
    const isActive = c.label === state.activeLogTab;

    let cls = 'log-tab';
    if (isActive) cls += ' active';
    if (cs.running) cls += ' running';

    const tab = el('button', cls);

    // Green dot for running commands
    if (cs.running) {
      tab.appendChild(el('span', 'tab-dot'));
    }

    tab.appendChild(document.createTextNode(c.label));
    tab.addEventListener('click', () => switchTab(c.label));
    $logTabs.appendChild(tab);
  });

  // Action buttons for current tab
  const cs = getCmdStatus(proj.id, state.activeLogTab);
  const cmd = proj.commands.find(c => c.label === state.activeLogTab);

  if (cs.running) {
    $logTabs.appendChild(
      btn('log-tab-action stop-action', '\u25A0', () => api.stopProcess(proj.id, state.activeLogTab))
    );
  } else if (cmd) {
    $logTabs.appendChild(
      btn('log-tab-action run-action', '\u25B6', () => runCommand(proj.id, cmd.label, cmd.cmd, proj.directory, proj.env))
    );
  }
}

// ── Button handlers ────────────────────────────────

$dash.addEventListener('click', (e) => {
  if (!$dash.classList.contains('blurred')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  closeLogPanel();
}, true);
$('log-copy').addEventListener('click', () => {
  const lines = $logOut.querySelectorAll('.log-line');
  const text = Array.from(lines).map(l => l.textContent).join('\n');
  navigator.clipboard.writeText(text);
  const copyBtn = $('log-copy');
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('copied');
  }, 1500);
});
$('log-clear').addEventListener('click', () => { $logOut.innerHTML = ''; });
$('log-close').addEventListener('click', closeLogPanel);
