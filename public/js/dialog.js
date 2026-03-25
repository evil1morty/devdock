import { state } from './state.js';
import { api } from './api.js';
import { render } from './dashboard.js';

const $overlay  = document.getElementById('dialog-overlay');
const $dlgTitle = document.getElementById('dialog-title');
const $inpName  = document.getElementById('inp-name');
const $inpDir   = document.getElementById('inp-dir');
const $cmdList  = document.getElementById('cmd-list');

// ── Open / Close ───────────────────────────────────

export function openDialog(id) {
  state.editingId = id;
  const proj = id ? state.projects.find(p => p.id === id) : null;

  $dlgTitle.textContent = proj ? 'Edit Project' : 'Add Project';
  $inpName.value = proj ? proj.name : '';
  $inpDir.value = proj ? proj.directory : '';

  $cmdList.innerHTML = '';
  if (proj) {
    proj.commands.forEach(c => addCmdRow(c.label, c.cmd));
  }

  $overlay.classList.remove('hidden');
  $inpDir.focus();
}

export function closeDialog() {
  $overlay.classList.add('hidden');
  state.editingId = null;
}

// ── Scan directory ─────────────────────────────────

async function scanDirectory(dir) {
  if (!dir) return;
  $inpDir.value = dir;
  try {
    const result = await api.scanPackageJson(dir);
    $inpName.value = result.name;
    $cmdList.innerHTML = '';
    result.commands.forEach(c => addCmdRow(c.label, c.cmd));
  } catch (_) {
    if (!$inpName.value) $inpName.value = dir.split(/[\\/]/).pop() || '';
    $cmdList.innerHTML = '';
    addCmdRow('dev', 'npm run dev');
    addCmdRow('build', 'npm run build');
  }
}

// ── Command row builder ────────────────────────────

function addCmdRow(label, cmd) {
  const row = document.createElement('div');
  row.className = 'cmd-row';

  const inpLabel = document.createElement('input');
  inpLabel.type = 'text';
  inpLabel.placeholder = 'Label';
  inpLabel.value = label || '';

  const inpCmd = document.createElement('input');
  inpCmd.type = 'text';
  inpCmd.placeholder = 'npm run dev';
  inpCmd.value = cmd || '';

  const rm = document.createElement('button');
  rm.className = 'rm-cmd';
  rm.innerHTML = '&times;';
  rm.addEventListener('click', () => row.remove());

  row.appendChild(inpLabel);
  row.appendChild(inpCmd);
  row.appendChild(rm);
  $cmdList.appendChild(row);
}

// ── Event handlers ─────────────────────────────────

// Scan button — opens folder picker
document.getElementById('btn-scan').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  if (folder) await scanDirectory(folder);
});

// Auto-scan on paste
let scanDebounce;
$inpDir.addEventListener('input', () => {
  $inpDir.classList.remove('input-error');
  clearTimeout(scanDebounce);
  scanDebounce = setTimeout(() => {
    const dir = $inpDir.value.trim();
    if (dir && (dir.includes('\\') || dir.includes('/'))) {
      scanDirectory(dir);
    }
  }, 800);
});

$inpName.addEventListener('input', () => $inpName.classList.remove('input-error'));

document.getElementById('btn-add-cmd').addEventListener('click', () => addCmdRow('', ''));
document.getElementById('btn-cancel').addEventListener('click', closeDialog);

$overlay.addEventListener('click', e => {
  if (e.target === $overlay) closeDialog();
});

// Save
document.getElementById('btn-save').addEventListener('click', async () => {
  const name = $inpName.value.trim();
  const dir = $inpDir.value.trim();
  $inpName.classList.toggle('input-error', !name);
  $inpDir.classList.toggle('input-error', !dir);
  if (!name || !dir) return;

  const commands = [];
  $cmdList.querySelectorAll('.cmd-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const l = inputs[0].value.trim();
    const c = inputs[1].value.trim();
    if (l && c) commands.push({ label: l, cmd: c });
  });

  // Detect framework
  let framework = null;
  try {
    const scan = await api.scanPackageJson(dir);
    framework = scan.framework;
  } catch (_) {}

  if (state.editingId) {
    const proj = state.projects.find(p => p.id === state.editingId);
    if (proj) {
      proj.name = name;
      proj.directory = dir;
      proj.commands = commands;
      proj.framework = framework;
    }
  } else {
    state.projects.push({
      id: crypto.randomUUID(),
      name,
      directory: dir,
      framework,
      commands,
    });
  }

  await api.saveConfig(state.projects);

  const $search = document.getElementById('search');
  if (state.projects.length >= 5) $search.classList.remove('hidden');

  render();
  closeDialog();
});

// Add-project buttons on header and empty state
document.getElementById('btn-add').addEventListener('click', () => openDialog(null));
document.getElementById('btn-add-empty').addEventListener('click', () => openDialog(null));
