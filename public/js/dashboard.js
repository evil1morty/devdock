import { state, getProject, getStatus } from './state.js';
import { api } from './api.js';
import { openContextMenu } from './context-menu.js';
import { openLogPanel } from './logs.js';

const $list  = document.getElementById('project-list');
const $empty = document.getElementById('empty');
const $table = document.getElementById('project-table');
const $search = document.getElementById('search');

// ── Render ─────────────────────────────────────────

export function render() {
  if (state.projects.length === 0) {
    $table.classList.add('hidden');
    $empty.classList.remove('hidden');
    return;
  }
  $table.classList.remove('hidden');
  $empty.classList.add('hidden');
  $list.innerHTML = '';

  const filter = $search.value.toLowerCase().trim();

  state.projects.forEach(p => {
    if (filter && !p.name.toLowerCase().includes(filter)) return;
    $list.appendChild(createRow(p));
  });
}

function createRow(project) {
  const s = getStatus(project.id);
  const tr = document.createElement('tr');
  tr.className = 'project-row' + (project.id === state.activeLogId ? ' active' : '');
  tr.dataset.id = project.id;

  // Status dot
  const tdStatus = document.createElement('td');
  const dot = document.createElement('span');
  dot.className = 'status-dot ' + (s.running ? 'running' : 'stopped');
  tdStatus.appendChild(dot);

  // Name + framework badge
  const tdName = document.createElement('td');
  const nameWrap = document.createElement('div');
  nameWrap.className = 'name-cell';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'project-name';
  nameSpan.textContent = project.name;
  nameWrap.appendChild(nameSpan);

  if (project.framework) {
    const badge = document.createElement('span');
    badge.className = 'framework-badge';
    badge.textContent = project.framework;
    nameWrap.appendChild(badge);
  }
  tdName.appendChild(nameWrap);

  // URL
  const tdUrl = document.createElement('td');
  if (s.url) {
    const link = document.createElement('span');
    link.className = 'url-link';
    link.textContent = s.url.replace('http://', '');
    link.addEventListener('click', e => {
      e.stopPropagation();
      api.openInBrowser(s.url);
    });
    tdUrl.appendChild(link);
  } else {
    const ph = document.createElement('span');
    ph.className = 'url-placeholder';
    ph.textContent = s.running ? 'detecting...' : '—';
    tdUrl.appendChild(ph);
  }

  // Play / Stop toggle
  const tdQuick = document.createElement('td');
  const playBtn = document.createElement('button');
  playBtn.className = 'play-btn' + (s.running ? ' running' : '');
  playBtn.innerHTML = s.running ? '&#9632;' : '&#9654;';
  playBtn.title = s.running ? 'Stop' : 'Start dev';
  playBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (s.running) {
      api.stopProcess(project.id);
    } else {
      const devCmd = (project.commands || []).find(c =>
        ['dev', 'start', 'serve'].includes(c.label)
      ) || (project.commands || [])[0];
      if (devCmd) runCommand(project.id, devCmd.label, devCmd.cmd, project.directory);
    }
  });
  tdQuick.appendChild(playBtn);

  // 3-dot menu
  const tdDots = document.createElement('td');
  const dotsBtn = document.createElement('button');
  dotsBtn.className = 'dots-btn';
  dotsBtn.innerHTML = '&#8942;';
  dotsBtn.addEventListener('click', e => {
    e.stopPropagation();
    openContextMenu(project.id, e);
  });
  tdDots.appendChild(dotsBtn);

  tr.appendChild(tdStatus);
  tr.appendChild(tdName);
  tr.appendChild(tdUrl);
  tr.appendChild(tdQuick);
  tr.appendChild(tdDots);

  tr.addEventListener('click', () => openLogPanel(project.id));

  return tr;
}

// ── Run command (shared) ───────────────────────────

export async function runCommand(id, label, cmd, cwd) {
  const s = getStatus(id);
  if (s.running) {
    try { await api.stopProcess(id); } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }

  // Clear logs if viewing this project
  const $logOut = document.getElementById('log-output');
  if (id === state.activeLogId) {
    $logOut.innerHTML = '';
    appendLogLine($logOut, `$ ${cmd}`, 'info');
  }

  try {
    await api.startProcess(id, cmd, label, cwd);
  } catch (err) {
    if (id === state.activeLogId) {
      appendLogLine($logOut, `Error: ${err}`, 'stderr');
    }
  }
}

function appendLogLine(container, text, stream) {
  const div = document.createElement('div');
  div.className = 'log-line ' + (stream || 'stdout');
  div.textContent = text;
  container.appendChild(div);
}

// ── Search ─────────────────────────────────────────

$search.addEventListener('input', render);
