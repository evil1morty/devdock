import { state, getProject, getStatus } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, closeOnBackdrop } from './dom.js';
import { render, runCommand } from './dashboard.js';
import { closeLogPanel } from './logs.js';
import { openDialog } from './dialog.js';

const $ctx     = $('context-menu');
const $ctxCmds = $('ctx-commands');

// ── Open / Close ───────────────────────────────────

export function openContextMenu(id, e) {
  state.ctxProjectId = id;
  const proj = getProject(id);
  const s = getStatus(id);

  // Command buttons (hidden when running)
  $ctxCmds.innerHTML = '';
  const showCmds = proj && proj.commands.length > 0 && !s.running;
  if (showCmds) {
    proj.commands.forEach(c => {
      const b = el('button', 'ctx-cmd');
      b.innerHTML = `<span class="ctx-icon">&#9654;</span> ${c.label}`;
      b.addEventListener('click', () => {
        runCommand(id, c.label, c.cmd, proj.directory);
        closeContextMenu();
      });
      $ctxCmds.appendChild(b);
    });
  }

  toggle($('div-cmds'), showCmds);
  toggle($ctx.querySelector('[data-action="stop"]'), s.running);
  toggle($ctx.querySelector('[data-action="restart"]'), s.running);
  toggle($('div-process'), s.running);
  $ctx.querySelector('[data-action="browser"]').disabled = !s.url;

  // Position
  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 300);
  $ctx.style.left = x + 'px';
  $ctx.style.top = y + 'px';
  toggle($ctx, true);
}

export function closeContextMenu() {
  toggle($ctx, false);
  state.ctxProjectId = null;
}

// ── Actions ────────────────────────────────────────

document.addEventListener('click', closeContextMenu);

$ctx.querySelectorAll('.ctx-item').forEach(b => {
  b.addEventListener('click', e => {
    e.stopPropagation();
    const action = b.dataset.action;
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

const $confOver = $('confirm-overlay');
const $confMsg  = $('confirm-msg');
let confirmCb = null;

export function showConfirm(msg, cb) {
  $confMsg.textContent = msg;
  confirmCb = cb;
  toggle($confOver, true);
}

export function closeConfirm() {
  toggle($confOver, false);
  confirmCb = null;
}

$('confirm-yes').addEventListener('click', () => { closeConfirm(); if (confirmCb) confirmCb(); });
$('confirm-no').addEventListener('click', closeConfirm);
closeOnBackdrop($confOver, closeConfirm);
