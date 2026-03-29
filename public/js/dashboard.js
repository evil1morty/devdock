import { state, getStatus, getCmdStatus, checkProjectPaths } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, appendLogLine } from './dom.js';
import { openContextMenu } from './context-menu.js';
import { openLogPanel } from './logs.js';
import { openDialog } from './dialog.js';
import { toast } from './toast.js';

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
  state.projects.forEach(p => {
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
  if (s.running && !missing) cls += ' running';
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
    const tdRelocate = el('td');
    tdRelocate.colSpan = 3;
    tdRelocate.style.textAlign = 'right';
    const relocateBtn = btn('relocate-btn', 'Relocate', async e => {
      e.stopPropagation();
      const folder = await api.pickFolder();
      if (folder) {
        p.directory = folder;
        try {
          const scan = await api.scanProject(folder);
          if (scan.framework) p.framework = scan.framework;
        } catch (_) {}
        await api.saveConfig(state.projects);
        await checkProjectPaths();
        render();
      }
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
    toast(`Failed to start ${label}: ${err}`, 'error', 5000);
  }
}

// ── Sort helpers ──────────────────────────────────

/** Ensure pinned projects come first in the array (stable). */
export function ensurePinnedOrder() {
  const pinned = state.projects.filter(p => p.pinned);
  const normal = state.projects.filter(p => !p.pinned);
  state.projects = [...pinned, ...normal];
}

// ── Drag-and-drop reorder ─────────────────────────

const DRAG_THRESHOLD = 6; // px before drag activates
let _drag = null;

function onRowPointerDown(e) {
  // Ignore if clicking interactive elements
  if (e.target.closest('button, a, .play-btn, .dots-btn, .relocate-btn, .url-link')) return;
  if (e.button !== 0) return; // left button only

  const tr = e.target.closest('.project-row');
  if (!tr) return;

  const id = tr.dataset.id;
  const proj = state.projects.find(p => p.id === id);
  if (!proj) return;

  _drag = {
    id,
    el: tr,
    isPinned: !!proj.pinned,
    startY: e.clientY,
    startX: e.clientX,
    active: false,
    ghost: null,
    indicator: null,
    offsetY: 0,
    dropTarget: null,
  };

  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
}

function activateDrag() {
  _drag.active = true;
  _drag.el.classList.add('dragging');
  document.body.classList.add('is-dragging');

  // Create ghost (wrap cloned row in a table so it renders properly)
  const rect = _drag.el.getBoundingClientRect();
  const ghost = document.createElement('table');
  ghost.className = 'drag-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.left = rect.left + 'px';
  const tbody = document.createElement('tbody');
  const clonedRow = _drag.el.cloneNode(true);
  clonedRow.classList.remove('dragging');
  tbody.appendChild(clonedRow);
  ghost.appendChild(tbody);
  document.body.appendChild(ghost);
  _drag.ghost = ghost;
  _drag.offsetY = _drag.startY - rect.top;

  // Create drop indicator line
  const ind = document.createElement('div');
  ind.className = 'drop-indicator';
  document.body.appendChild(ind);
  _drag.indicator = ind;
}

function onDragMove(e) {
  if (!_drag) return;

  if (!_drag.active) {
    const dy = Math.abs(e.clientY - _drag.startY);
    const dx = Math.abs(e.clientX - _drag.startX);
    if (dy < DRAG_THRESHOLD) return;
    if (dx > dy * 2) { cleanupDrag(); return; } // horizontal move, abort
    activateDrag();
  }

  // Move ghost
  _drag.ghost.style.top = (e.clientY - _drag.offsetY) + 'px';

  // Find closest row in the same group (pinned/normal)
  const rows = [...$list.querySelectorAll('.project-row:not(.dragging)')];
  let best = null, bestDist = Infinity, before = true;

  for (const row of rows) {
    const rp = state.projects.find(p => p.id === row.dataset.id);
    if (!rp) continue;
    // Only allow drop within same group
    if (!!rp.pinned !== _drag.isPinned) continue;

    const rect = row.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const dist = Math.abs(e.clientY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = row;
      before = e.clientY < mid;
    }
  }

  if (best) {
    const rect = best.getBoundingClientRect();
    const tableRect = $list.closest('table').getBoundingClientRect();
    const y = before ? rect.top : rect.bottom;
    _drag.indicator.style.display = 'block';
    _drag.indicator.style.top = y + 'px';
    _drag.indicator.style.left = tableRect.left + 'px';
    _drag.indicator.style.width = tableRect.width + 'px';
    _drag.dropTarget = { id: best.dataset.id, before };
  } else {
    _drag.indicator.style.display = 'none';
    _drag.dropTarget = null;
  }
}

function onDragEnd() {
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  if (!_drag) return;

  if (_drag.active && _drag.dropTarget) {
    const { id: targetId, before } = _drag.dropTarget;
    const fromIdx = state.projects.findIndex(p => p.id === _drag.id);
    let toIdx = state.projects.findIndex(p => p.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
      const [moved] = state.projects.splice(fromIdx, 1);
      // Recalculate toIdx after removal
      toIdx = state.projects.findIndex(p => p.id === targetId);
      const insertIdx = before ? toIdx : toIdx + 1;
      state.projects.splice(insertIdx, 0, moved);
      api.saveConfig(state.projects);
      render();
    }
  }

  if (_drag.active) {
    // Suppress the click that would open logs
    const row = _drag.el;
    const suppress = e => { e.stopImmediatePropagation(); e.preventDefault(); };
    row.addEventListener('click', suppress, { capture: true, once: true });
    setTimeout(() => row.removeEventListener('click', suppress, { capture: true }), 50);
  }

  cleanupDrag();
}

function cleanupDrag() {
  if (!_drag) return;
  _drag.ghost?.remove();
  _drag.indicator?.remove();
  _drag.el?.classList.remove('dragging');
  document.body.classList.remove('is-dragging');
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  _drag = null;
}

$list.addEventListener('pointerdown', onRowPointerDown);

// ── Search ─────────────────────────────────────────

$search.addEventListener('input', render);
