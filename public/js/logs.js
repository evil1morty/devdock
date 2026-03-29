import { state, getProject, getStatus, getCmdStatus } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, appendLogLine } from './dom.js';
import { runCommand } from './dashboard.js';

const $logPanel = $('log-panel');
const $dash     = $('dashboard');
const $logName  = $('log-project-name');
const $logTabs  = $('log-tabs');
const $logOut   = $('log-output');
const $arrowL   = $('tab-arrow-left');
const $arrowR   = $('tab-arrow-right');
const $tabAction = $('tab-action');

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
  $tabAction.innerHTML = '';
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

    // Scroll active tab into view without affecting parent scroll
    if (isActive) {
      requestAnimationFrame(() => {
        const left = tab.offsetLeft - $logTabs.offsetLeft;
        $logTabs.scrollLeft = Math.max(0, left - 20);
      });
    }
  });

  // Action button — outside scrollable area so it's always visible
  $tabAction.innerHTML = '';
  const cs = getCmdStatus(proj.id, state.activeLogTab);
  const cmd = proj.commands.find(c => c.label === state.activeLogTab);

  if (cs.running) {
    $tabAction.appendChild(
      btn('log-tab-action stop-action', '\u25A0', () => api.stopProcess(proj.id, state.activeLogTab))
    );
  } else if (cmd) {
    $tabAction.appendChild(
      btn('log-tab-action run-action', '\u25B6', () => runCommand(proj.id, cmd.label, cmd.cmd, proj.directory, proj.env))
    );
  }

  updateTabArrows();
}

// ── Tab scroll arrows ─────────────────────────────

function updateTabArrows() {
  const overflows = $logTabs.scrollWidth > $logTabs.clientWidth;
  toggle($arrowL, overflows && $logTabs.scrollLeft > 0);
  toggle($arrowR, overflows && $logTabs.scrollLeft + $logTabs.clientWidth < $logTabs.scrollWidth - 1);
}

$arrowL.addEventListener('click', () => {
  $logTabs.scrollBy({ left: -120, behavior: 'smooth' });
  setTimeout(updateTabArrows, 200);
});
$arrowR.addEventListener('click', () => {
  $logTabs.scrollBy({ left: 120, behavior: 'smooth' });
  setTimeout(updateTabArrows, 200);
});
$logTabs.addEventListener('scroll', updateTabArrows);
window.addEventListener('resize', updateTabArrows);

// ── Drag-to-scroll (touchpad / mouse) ────────────
let _dragX = 0, _dragScroll = 0, _dragging = false;

$logTabs.addEventListener('pointerdown', e => {
  if (e.target.closest('.log-tab')) return;
  _dragging = true;
  _dragX = e.clientX;
  _dragScroll = $logTabs.scrollLeft;
  $logTabs.setPointerCapture(e.pointerId);
  $logTabs.style.cursor = 'grabbing';
});
$logTabs.addEventListener('pointermove', e => {
  if (!_dragging) return;
  $logTabs.scrollLeft = _dragScroll - (e.clientX - _dragX);
});
$logTabs.addEventListener('pointerup', () => {
  if (!_dragging) return;
  _dragging = false;
  $logTabs.style.cursor = '';
  updateTabArrows();
});

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
