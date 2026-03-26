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
      const icon = el('span', 'ctx-icon', '\u25B6');
      b.appendChild(icon);
      b.appendChild(document.createTextNode(' ' + c.label));
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

  // Update editor icon + label based on settings
  const editorCmd = state.settings.editor_command || 'code';
  const editorIcon = $('editor-icon');
  const editorLabel = $('editor-label');
  if (editorCmd.includes('code')) {
    editorIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" style="vertical-align:-2px"><path fill="#2196f3" d="M11.5 11.19V4.8L7.3 7.99M1.17 6.07a.6.6 0 0 1-.01-.81L2 4.48c.14-.13.48-.18.73 0l2.39 1.83l5.55-5.09c.22-.22.61-.32 1.05-.08l2.8 1.34c.25.15.49.38.49.81v9.49c0 .28-.2.58-.42.7l-3.08 1.48c-.22.09-.64 0-.79-.14L5.11 9.69l-2.38 1.83c-.27.18-.6.13-.74 0l-.84-.77c-.22-.23-.2-.61.04-.84l2.1-1.9"/></svg>';
    editorLabel.textContent = 'Open in VS Code';
  } else if (editorCmd.includes('cursor')) {
    editorIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 32 32" style="vertical-align:-2px"><path fill="currentColor" fill-rule="evenodd" d="m16 30l12-20v14zM4 10l12-8l12 8zm0 0l12 6v14L4 24z"/></svg>';
    editorLabel.textContent = 'Open in Cursor';
  } else {
    editorIcon.innerHTML = '&#9998;';
    editorLabel.textContent = 'Open in ' + editorCmd;
  }

  // Update pin label
  const pinBtn = $ctx.querySelector('[data-action="pin"]');
  pinBtn.innerHTML = proj?.pinned
    ? '<span class="ctx-icon">&#128204;</span> Unpin'
    : '<span class="ctx-icon">&#128204;</span> Pin to Top';

  // Position with padding from edges
  const x = Math.min(e.clientX, window.innerWidth - 210);
  const y = Math.min(e.clientY, window.innerHeight - 350);
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
      case 'claude':
        if (proj) api.openInClaude(proj.directory, state.settings.claude_command, state.settings.claude_mode, proj.name);
        break;
      case 'editor':
        if (proj) api.openInEditor(proj.directory, state.settings.editor_command);
        break;
      case 'pin':
        if (proj) {
          proj.pinned = !proj.pinned;
          api.saveConfig(state.projects);
          render();
        }
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

$('confirm-yes').addEventListener('click', () => { const cb = confirmCb; closeConfirm(); if (cb) cb(); });
$('confirm-no').addEventListener('click', closeConfirm);
closeOnBackdrop($confOver, closeConfirm);
