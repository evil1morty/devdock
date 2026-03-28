import { state, checkProjectPaths } from './state.js';
import { api } from './api.js';
import { $, el, btn, closeOnBackdrop } from './dom.js';
import { render } from './dashboard.js';

const $overlay  = $('dialog-overlay');
const $dlgTitle = $('dialog-title');
const $inpName  = $('inp-name');
const $inpDir   = $('inp-dir');
const $cmdList  = $('cmd-list');
const $envList  = $('env-list');
const $tagWrap  = $('tag-input-wrap');
const $inpTag   = $('inp-tag');

let dialogTags = [];  // tags for the current dialog session

// ── Open / Close ───────────────────────────────────

export function openDialog(id) {
  state.editingId = id;
  const proj = id ? state.projects.find(p => p.id === id) : null;

  $dlgTitle.textContent = proj ? 'Edit Project' : 'Add Project';
  $inpName.value = proj ? proj.name : '';
  $inpDir.value = proj ? proj.directory : '';

  dialogTags = proj && proj.tags ? [...proj.tags] : [];
  $inpTag.value = '';
  renderTagPills();

  $cmdList.innerHTML = '';
  if (proj) proj.commands.forEach(c => addCmdRow(c.label, c.cmd));

  $envList.innerHTML = '';
  if (proj && proj.env) proj.env.forEach(e => addEnvRow(e.key, e.value));

  $overlay.classList.remove('hidden');
  $inpDir.focus();
}

export function closeDialog() {
  $overlay.classList.add('hidden');
  state.editingId = null;
}

// ── Tag pills ─────────────────────────────────────

function renderTagPills() {
  // Remove existing pills directly from the flex wrapper
  $tagWrap.querySelectorAll('.tag-pill').forEach(p => p.remove());
  dialogTags.forEach(tag => {
    const pill = el('span', 'tag-pill');
    pill.appendChild(document.createTextNode(tag));
    const rm = el('span', 'tag-pill-rm', '\u00d7');
    rm.addEventListener('click', e => {
      e.stopPropagation();
      e.preventDefault();
      dialogTags = dialogTags.filter(t => t !== tag);
      renderTagPills();
    });
    pill.appendChild(rm);
    // Insert pill directly into flex wrapper, before the input
    $tagWrap.insertBefore(pill, $inpTag);
  });
}

/** Commit any text sitting in the tag input into dialogTags */
function commitPendingTag() {
  const tag = $inpTag.value.trim().toLowerCase();
  if (tag && !dialogTags.includes(tag)) {
    dialogTags.push(tag);
    renderTagPills();
  }
  $inpTag.value = '';
}

$inpTag.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); commitPendingTag(); }
  if (e.key === 'Backspace' && !$inpTag.value && dialogTags.length) {
    dialogTags.pop();
    renderTagPills();
  }
});
$inpTag.addEventListener('blur', commitPendingTag);

// ── Helpers ────────────────────────────────────────

function prettifyName(name) {
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function clearErrorOnInput(input) {
  input.addEventListener('input', () => input.classList.remove('input-error'));
}

// ── Scan directory ─────────────────────────────────

async function scanDirectory(dir) {
  if (!dir) return;
  $inpDir.value = dir;
  try {
    const result = await api.scanProject(dir);
    if (!$inpName.value.trim()) $inpName.value = prettifyName(result.name);
    $cmdList.innerHTML = '';
    result.commands.forEach(c => addCmdRow(c.label, c.cmd));
  } catch (_) {
    if (!$inpName.value.trim()) $inpName.value = prettifyName(dir.split(/[\\/]/).pop() || '');
    if ($cmdList.children.length === 0) {
      addCmdRow('dev', 'npm run dev');
      addCmdRow('build', 'npm run build');
    }
  }
}

// ── Command row builder ────────────────────────────

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

// ── Env var row builder ────────────────────────────

function addEnvRow(key, value) {
  const row = el('div', 'env-row');

  const inpKey = el('input');
  inpKey.type = 'text';
  inpKey.placeholder = 'KEY';
  inpKey.value = key || '';
  clearErrorOnInput(inpKey);

  const inpVal = el('input');
  inpVal.type = 'text';
  inpVal.placeholder = 'value';
  inpVal.value = value || '';
  clearErrorOnInput(inpVal);

  const rm = btn('rm-cmd', null, () => row.remove());
  rm.innerHTML = '&times;';

  row.append(inpKey, inpVal, rm);
  $envList.appendChild(row);
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

function collectEnvVars() {
  const env = [];
  let hasError = false;

  $envList.querySelectorAll('.env-row').forEach(row => {
    const [inpKey, inpVal] = row.querySelectorAll('input');
    const k = inpKey.value.trim();
    const v = inpVal.value;

    inpKey.classList.remove('input-error');

    if (k) {
      env.push({ key: k, value: v });
    } else if (!k && v.trim()) {
      inpKey.classList.add('input-error');
      hasError = true;
    }
  });

  return hasError ? null : env;
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
$('btn-add-env').addEventListener('click', () => addEnvRow('', ''));
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

  const env = collectEnvVars();
  if (!env) return;

  const duplicate = state.projects.find(p => p.directory === dir && p.id !== state.editingId);
  if (duplicate) {
    $inpDir.classList.add('input-error');
    return;
  }

  let framework = null;
  try {
    const scan = await api.scanProject(dir);
    framework = scan.framework;
  } catch (_) {}

  commitPendingTag();
  const tags = [...dialogTags];
  if (state.editingId) {
    const proj = state.projects.find(p => p.id === state.editingId);
    if (proj) Object.assign(proj, { name, directory: dir, commands, env, framework, tags });
  } else {
    state.projects.push({ id: crypto.randomUUID(), name, directory: dir, framework, commands, env, tags, pinned: false });
  }

  await api.saveConfig(state.projects);
  await checkProjectPaths();
  render();
  closeDialog();
});

$('btn-add').addEventListener('click', () => openDialog(null));
$('btn-add-empty').addEventListener('click', () => openDialog(null));
