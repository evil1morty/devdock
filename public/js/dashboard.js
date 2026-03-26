import { state, getStatus } from './state.js';
import { api } from './api.js';
import { $, el, btn, toggle, appendLogLine } from './dom.js';
import { openContextMenu } from './context-menu.js';
import { openLogPanel } from './logs.js';

const $list   = $('project-list');
const $empty  = $('empty');
const $table  = $('project-table');
const $search = $('search');

// ── Render ─────────────────────────────────────────

export function render() {
  if (state.projects.length === 0) {
    toggle($table, false);
    toggle($empty, true);
    return;
  }
  toggle($table, true);
  toggle($empty, false);
  $list.innerHTML = '';

  const filter = $search.value.toLowerCase().trim();
  const sorted = [...state.projects].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  sorted.forEach(p => {
    if (filter && !p.name.toLowerCase().includes(filter) && !(p.framework || '').toLowerCase().includes(filter)) return;
    $list.appendChild(createRow(p));
  });
}

function createRow(p) {
  const s = getStatus(p.id);
  let cls = 'project-row';
  if (p.id === state.activeLogId) cls += ' active';
  if (p.pinned) cls += ' pinned';
  const tr = el('tr', cls);
  tr.dataset.id = p.id;

  // Status dot
  const tdStatus = el('td');
  tdStatus.appendChild(el('span', 'status-dot ' + (s.running ? 'running' : 'stopped')));

  // Name + framework
  const tdName = el('td');
  const nameWrap = el('div', 'name-cell');
  nameWrap.appendChild(el('span', 'project-name', p.name));
  if (p.pinned) nameWrap.appendChild(el('span', 'pin-icon', '\u{1F4CC}'));
  if (p.framework) nameWrap.appendChild(el('span', 'framework-badge', p.framework));
  tdName.appendChild(nameWrap);

  // URL
  const tdUrl = el('td');
  if (s.url) {
    const link = el('span', 'url-link', s.url.replace('http://', ''));
    link.addEventListener('click', e => { e.stopPropagation(); api.openInBrowser(s.url); });
    tdUrl.appendChild(link);
  } else {
    tdUrl.appendChild(el('span', 'url-placeholder', s.running ? 'detecting...' : '—'));
  }

  // Play / Stop
  const tdQuick = el('td');
  const playBtn = btn('play-btn' + (s.running ? ' running' : ''), null, e => {
    e.stopPropagation();
    if (s.running) {
      api.stopProcess(p.id);
    } else {
      const devCmd = (p.commands || []).find(c =>
        ['dev', 'start', 'serve'].includes(c.label)
      ) || (p.commands || [])[0];
      if (devCmd) runCommand(p.id, devCmd.label, devCmd.cmd, p.directory, p.env);
    }
  });
  playBtn.innerHTML = s.running ? '&#9632;' : '&#9654;';
  playBtn.title = s.running ? 'Stop' : 'Start dev';
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
  const s = getStatus(id);
  if (s.running) {
    try { await api.stopProcess(id); } catch (_) {}
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (!getStatus(id).running) break;
    }
  }

  const $logOut = $('log-output');
  if (id === state.activeLogId) {
    $logOut.innerHTML = '';
    appendLogLine($logOut, `$ ${cmd}`, 'info');
  }

  try {
    await api.startProcess(id, cmd, label, cwd, env);
  } catch (err) {
    if (id === state.activeLogId) appendLogLine($logOut, `Error: ${err}`, 'stderr');
  }
}

// ── Search ─────────────────────────────────────────

$search.addEventListener('input', render);
