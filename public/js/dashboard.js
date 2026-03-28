import { state, getStatus, getCmdStatus } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, appendLogLine } from './dom.js';
import { openContextMenu } from './context-menu.js';
import { openLogPanel } from './logs.js';
import { openDialog } from './dialog.js';

const $list   = $('project-list');
const $empty  = $('empty');
const $table  = $('project-table');
const $search = $('search');
const $tagBar = $('tag-bar');

// ── Render ─────────────────────────────────────────

export function render() {
  renderTagBar();

  if (state.projects.length === 0) {
    toggle($table, false);
    toggle($empty, true);
    return;
  }
  toggle($table, true);
  toggle($empty, false);
  $list.innerHTML = '';

  const filter = $search.value.toLowerCase().trim();
  const tag = state.activeTag;
  const sorted = [...state.projects].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  sorted.forEach(p => {
    if (filter && !p.name.toLowerCase().includes(filter) && !(p.framework || '').toLowerCase().includes(filter)
        && !(p.tags || []).some(t => t.toLowerCase().includes(filter))) return;
    if (tag && !(p.tags || []).includes(tag)) return;
    $list.appendChild(createRow(p));
  });
}

function renderTagBar() {
  const allTags = [...new Set(state.projects.flatMap(p => p.tags || []))].sort();
  if (state.activeTag && !allTags.includes(state.activeTag)) {
    state.activeTag = null;
  }
  if (allTags.length === 0) {
    toggle($tagBar, false);
    return;
  }
  toggle($tagBar, true);
  $tagBar.innerHTML = '';

  allTags.forEach(tag => {
    const chip = el('button', 'tag-chip' + (state.activeTag === tag ? ' active' : ''), tag);
    chip.addEventListener('click', () => {
      state.activeTag = state.activeTag === tag ? null : tag;
      render();
    });
    $tagBar.appendChild(chip);
  });

  if (state.activeTag) {
    const clear = el('button', 'tag-clear', '\u00d7 Clear');
    clear.addEventListener('click', () => {
      state.activeTag = null;
      render();
    });
    $tagBar.appendChild(clear);
  }
}

function createRow(p) {
  const s = getStatus(p.id);
  const missing = state.missingPaths.has(p.id);
  let cls = 'project-row';
  if (missing) cls += ' missing';
  else if (p.id === state.activeLogId) cls += ' active';
  if (p.pinned && !missing) cls += ' pinned';
  const tr = el('tr', cls);
  tr.dataset.id = p.id;

  // Status dot
  const tdStatus = el('td');
  tdStatus.appendChild(el('span', 'status-dot ' + (missing ? 'error' : s.running ? 'running' : 'stopped')));

  // Name + framework
  const tdName = el('td');
  const nameWrap = el('div', 'name-cell');
  nameWrap.appendChild(el('span', 'project-name', p.name));
  if (p.pinned && !missing) nameWrap.appendChild(el('span', 'pin-icon', '\u{1F4CC}'));
  if (p.framework) nameWrap.appendChild(el('span', 'framework-badge', p.framework));
  tdName.appendChild(nameWrap);

  if (missing) {
    // Missing path: show relocate button spanning URL + actions + dots columns
    const tdRelocate = el('td');
    tdRelocate.colSpan = 3;
    const relocateBtn = btn('relocate-btn', 'Relocate', e => {
      e.stopPropagation();
      openDialog(p.id);
    });
    tdRelocate.appendChild(relocateBtn);

    tr.append(tdStatus, tdName, tdRelocate);
    return tr;
  }

  // URL
  const tdUrl = el('td');
  if (s.url) {
    const link = el('span', 'url-link', s.url.replace('http://', ''));
    link.addEventListener('click', e => { e.stopPropagation(); api.openInBrowser(s.url); });
    tdUrl.appendChild(link);
  } else {
    tdUrl.appendChild(el('span', 'url-placeholder', s.running ? 'detecting...' : '\u2014'));
  }

  // Play / Stop
  const tdQuick = el('td');
  const playBtn = btn('play-btn' + (s.running ? ' running' : ''), null, e => {
    e.stopPropagation();
    if (s.running) {
      api.stopAll(p.id);
    } else {
      const devCmd = (p.commands || []).find(c =>
        ['dev', 'start', 'serve'].includes(c.label)
      ) || (p.commands || [])[0];
      if (devCmd) runCommand(p.id, devCmd.label, devCmd.cmd, p.directory, p.env);
    }
  });
  playBtn.innerHTML = s.running ? '&#9632;' : '&#9654;';
  playBtn.title = s.running ? 'Stop all' : 'Start dev';
  tdQuick.appendChild(playBtn);

  // 3-dot menu
  const tdDots = el('td');
  const dots = btn('dots-btn', null, e => { e.stopPropagation(); openContextMenu(p.id, e); });
  dots.innerHTML = '&#8942;';
  tdDots.appendChild(dots);

  tr.append(tdStatus, tdName, tdUrl, tdQuick, tdDots);
  tr.addEventListener('click', () => openLogPanel(p.id));
  return tr;
}

// ── Run command (shared) ───────────────────────────

export async function runCommand(id, label, cmd, cwd, env = []) {
  // Only stop if the SAME command is already running (restart)
  const cs = getCmdStatus(id, label);
  if (cs.running) {
    try { await api.stopProcess(id, label); } catch (_) {}
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (!getCmdStatus(id, label).running) break;
    }
  }

  const $logOut = $('log-output');
  if (id === state.activeLogId && label === state.activeLogTab) {
    $logOut.innerHTML = '';
    appendLogLine($logOut, `$ ${cmd}`, 'info');
  }

  try {
    await api.startProcess(id, cmd, label, cwd, env);
  } catch (err) {
    if (id === state.activeLogId && label === state.activeLogTab) {
      appendLogLine($logOut, `Error: ${err}`, 'stderr');
    }
  }
}

// ── Search ─────────────────────────────────────────

$search.addEventListener('input', render);
