import { state } from './state.js';
import { api } from './api.js';
import { $, el, btn, closeOnBackdrop } from './dom.js';
import { render } from './dashboard.js';

const $overlay  = $('dialog-overlay');
const $dlgTitle = $('dialog-title');
const $inpName  = $('inp-name');
const $inpDir   = $('inp-dir');
const $cmdList  = $('cmd-list');

// ── Open / Close ───────────────────────────────────

export function openDialog(id) {
  state.editingId = id;
  const proj = id ? state.projects.find(p => p.id === id) : null;

  $dlgTitle.textContent = proj ? 'Edit Project' : 'Add Project';
  $inpName.value = proj ? proj.name : '';
  $inpDir.value = proj ? proj.directory : '';

  $cmdList.innerHTML = '';
  if (proj) proj.commands.forEach(c => addCmdRow(c.label, c.cmd));

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
    const result = await api.scanProject(dir);
    if (!$inpName.value.trim()) $inpName.value = result.name;
    $cmdList.innerHTML = '';
    result.commands.forEach(c => addCmdRow(c.label, c.cmd));
  } catch (_) {
    if (!$inpName.value.trim()) $inpName.value = dir.split(/[\\/]/).pop() || '';
    if ($cmdList.children.length === 0) {
      addCmdRow('dev', 'npm run dev');
      addCmdRow('build', 'npm run build');
    }
  }
}

// ── Command row builder ────────────────────────────

function clearErrorOnInput(input) {
  input.addEventListener('input', () => input.classList.remove('input-error'));
}

function addCmdRow(label, cmd) {
  const row = el('div', 'cmd-row');

  const inpLabel = el('input');
  inpLabel.type = 'text';
  inpLabel.placeholder = 'Label';
  inpLabel.value = label || '';
  clearErrorOnInput(inpLabel);

  const inpCmd = el('input');
  inpCmd.type = 'text';
  inpCmd.placeholder = 'npm run dev';
  inpCmd.value = cmd || '';
  clearErrorOnInput(inpCmd);

  const rm = btn('rm-cmd', null, () => row.remove());
  rm.innerHTML = '&times;';

  row.append(inpLabel, inpCmd, rm);
  $cmdList.appendChild(row);
}

// ── Validation ─────────────────────────────────────

function validateCommands() {
  const commands = [];
  let hasError = false;

  $cmdList.querySelectorAll('.cmd-row').forEach(row => {
    const [inpLabel, inpCmd] = row.querySelectorAll('input');
    const l = inpLabel.value.trim();
    const c = inpCmd.value.trim();

    inpLabel.classList.remove('input-error');
    inpCmd.classList.remove('input-error');

    if (l && c) {
      commands.push({ label: l, cmd: c });
    } else if (l && !c) {
      inpCmd.classList.add('input-error');
      hasError = true;
    } else if (!l && c) {
      inpLabel.classList.add('input-error');
      hasError = true;
    }
  });

  return hasError ? null : commands;
}

// ── Event handlers ─────────────────────────────────

$('btn-scan').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  if (folder) await scanDirectory(folder);
});

let scanDebounce;
$inpDir.addEventListener('input', () => {
  $inpDir.classList.remove('input-error');
  clearTimeout(scanDebounce);
  scanDebounce = setTimeout(() => {
    const dir = $inpDir.value.trim();
    if (dir && (dir.includes('\\') || dir.includes('/'))) scanDirectory(dir);
  }, 800);
});

clearErrorOnInput($inpName);

$('btn-add-cmd').addEventListener('click', () => addCmdRow('', ''));
$('btn-cancel').addEventListener('click', closeDialog);
closeOnBackdrop($overlay, closeDialog);

// Save
$('btn-save').addEventListener('click', async () => {
  const name = $inpName.value.trim();
  const dir = $inpDir.value.trim();
  $inpName.classList.toggle('input-error', !name);
  $inpDir.classList.toggle('input-error', !dir);
  if (!name || !dir) return;

  const commands = validateCommands();
  if (!commands) return;

  let framework = null;
  try {
    const scan = await api.scanProject(dir);
    framework = scan.framework;
  } catch (_) {}

  if (state.editingId) {
    const proj = state.projects.find(p => p.id === state.editingId);
    if (proj) Object.assign(proj, { name, directory: dir, commands, framework });
  } else {
    state.projects.push({ id: crypto.randomUUID(), name, directory: dir, framework, commands });
  }

  await api.saveConfig(state.projects);
  render();
  closeDialog();
});

$('btn-add').addEventListener('click', () => openDialog(null));
$('btn-add-empty').addEventListener('click', () => openDialog(null));
