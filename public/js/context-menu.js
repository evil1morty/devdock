import { state, getProject, getStatus } from './state.js';
import { api } from './api.js';
import { render, runCommand } from './dashboard.js';
import { closeLogPanel } from './logs.js';
import { openDialog } from './dialog.js';

const $ctx     = document.getElementById('context-menu');
const $ctxCmds = document.getElementById('ctx-commands');

// ── Open ───────────────────────────────────────────

export function openContextMenu(id, e) {
  state.ctxProjectId = id;
  const proj = getProject(id);
  const s = getStatus(id);

  // Command buttons (hidden when running)
  $ctxCmds.innerHTML = '';
  const showCmds = proj && proj.commands.length > 0 && !s.running;
  if (showCmds) {
    proj.commands.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'ctx-cmd';
      btn.innerHTML = `<span class="ctx-icon">&#9654;</span> ${c.label}`;
      btn.addEventListener('click', () => {
        runCommand(id, c.label, c.cmd, proj.directory);
        closeContextMenu();
      });
      $ctxCmds.appendChild(btn);
    });
  }
  document.getElementById('div-cmds').classList.toggle('hidden', !showCmds);

  // Show/hide process controls
  const stopBtn = $ctx.querySelector('[data-action="stop"]');
  const restartBtn = $ctx.querySelector('[data-action="restart"]');
  const browserBtn = $ctx.querySelector('[data-action="browser"]');
  stopBtn.classList.toggle('hidden', !s.running);
  restartBtn.classList.toggle('hidden', !s.running);
  document.getElementById('div-process').classList.toggle('hidden', !s.running);
  browserBtn.disabled = !s.url;

  // Position
  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 300);
  $ctx.style.left = x + 'px';
  $ctx.style.top = y + 'px';
  $ctx.classList.remove('hidden');
}

export function closeContextMenu() {
  $ctx.classList.add('hidden');
  state.ctxProjectId = null;
}

// ── Actions ────────────────────────────────────────

document.addEventListener('click', closeContextMenu);

$ctx.querySelectorAll('.ctx-item').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const action = btn.dataset.action;
    if (!state.ctxProjectId) return;

    const id = state.ctxProjectId;
    const proj = getProject(id);
    const s = getStatus(id);
    closeContextMenu();

    switch (action) {
      case 'stop':
        api.stopProcess(id);
        break;
      case 'restart':
        if (s.active_command && proj) {
          const cmd = proj.commands.find(c => c.label === s.active_command);
          if (cmd) runCommand(id, cmd.label, cmd.cmd, proj.directory);
        }
        break;
      case 'browser':
        if (s.url) api.openInBrowser(s.url);
        break;
      case 'vscode':
        if (proj) api.openInVscode(proj.directory);
        break;
      case 'explorer':
        if (proj) api.openInExplorer(proj.directory);
        break;
      case 'edit':
        openDialog(id);
        break;
      case 'remove':
        showConfirm(`Remove "${proj?.name}"?`, async () => {
          if (s.running) {
            try { await api.stopProcess(id); } catch (_) {}
          }
          state.projects = state.projects.filter(p => p.id !== id);
          await api.saveConfig(state.projects);
          if (state.activeLogId === id) closeLogPanel();
          render();
        });
        break;
    }
  });
});

// ── Confirm dialog ─────────────────────────────────

const $confOver = document.getElementById('confirm-overlay');
const $confMsg  = document.getElementById('confirm-msg');
let confirmCb = null;

export function showConfirm(msg, cb) {
  $confMsg.textContent = msg;
  confirmCb = cb;
  $confOver.classList.remove('hidden');
}

document.getElementById('confirm-yes').addEventListener('click', () => {
  $confOver.classList.add('hidden');
  if (confirmCb) confirmCb();
  confirmCb = null;
});

document.getElementById('confirm-no').addEventListener('click', () => {
  $confOver.classList.add('hidden');
  confirmCb = null;
});

$confOver.addEventListener('click', e => {
  if (e.target === $confOver) {
    $confOver.classList.add('hidden');
    confirmCb = null;
  }
});

export function closeConfirm() {
  $confOver.classList.add('hidden');
  confirmCb = null;
}
