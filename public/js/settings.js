import { state } from './state.js';
import { api } from './api.js';
import { $, closeOnBackdrop } from './dom.js';

const $overlay    = $('settings-overlay');
const $claude     = $('set-claude');
const $claudeMode = $('set-claude-mode');
const $editor     = $('set-editor');
const $theme      = $('set-theme');
const $width      = $('set-width');
const $height     = $('set-height');
const $autostart  = $('set-autostart');

// ── Open / Close ───────────────────────────────────

export async function openSettings() {
  $claude.value     = state.settings.claude_command;
  $claudeMode.value = state.settings.claude_mode || 'window';
  $editor.value     = state.settings.editor_command;
  $theme.value      = state.settings.theme;
  $width.value  = state.settings.width || 520;
  $height.value = state.settings.height || 680;
  try { $autostart.checked = await api.getAutostart(); } catch (_) { $autostart.checked = false; }
  $overlay.classList.remove('hidden');
}

function closeSettings() {
  $overlay.classList.add('hidden');
}

// ── Apply theme ────────────────────────────────────

export function applyTheme(theme) {
  let effective;
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effective = theme;
  }
  document.body.setAttribute('data-theme', effective);
  // Toggle icon: show sun while in light mode (click → dark), moon in dark mode.
  const sun  = $('theme-icon-sun');
  const moon = $('theme-icon-moon');
  if (sun && moon) {
    sun.classList.toggle('hidden', effective === 'dark');
    moon.classList.toggle('hidden', effective !== 'dark');
  }
}

// ── Apply window size ──────────────────────────────

async function applySize(w, h) {
  try {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.setSize(new window.__TAURI__.window.LogicalSize(w, h));
  } catch (_) {}
}

// ── Events ─────────────────────────────────────────

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.settings.theme === 'system') applyTheme('system');
});

// +/- buttons for number inputs
document.querySelectorAll('.num-btn').forEach(b => {
  b.addEventListener('click', () => {
    const input = $(b.dataset.target);
    const step = parseInt(input.step) || 10;
    const dir = parseInt(b.dataset.dir);
    const min = parseInt(input.min) || 0;
    const max = parseInt(input.max) || 9999;
    input.value = Math.min(max, Math.max(min, (parseInt(input.value) || 0) + step * dir));
  });
});

$('about-github').addEventListener('click', (e) => {
  e.preventDefault();
  api.openInBrowser('https://github.com/evil1morty/onerun');
});

$('btn-settings').addEventListener('click', openSettings);

$('btn-theme').addEventListener('click', async () => {
  // Resolve current effective theme (handles "system"), then flip it.
  const cur = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  state.settings.theme = next;
  applyTheme(next);
  try { await api.saveSettings(state.settings); } catch (_) {}
});
$('settings-cancel').addEventListener('click', closeSettings);
closeOnBackdrop($overlay, closeSettings);

$('settings-reset').addEventListener('click', () => {
  $claude.value     = 'claude';
  $claudeMode.value = 'tab';
  $editor.value     = 'code';
  $theme.value      = 'system';
  $width.value  = 520;
  $height.value = 680;
  $autostart.checked = false;
});

$('settings-save').addEventListener('click', async () => {
  state.settings.claude_command = $claude.value.trim() || 'claude';
  state.settings.claude_mode = $claudeMode.value;
  state.settings.editor_command = $editor.value.trim() || 'code';
  state.settings.theme = $theme.value;
  state.settings.width = parseInt($width.value) || 520;
  state.settings.height = parseInt($height.value) || 680;
  state.settings.autostart = $autostart.checked;

  await api.saveSettings(state.settings);
  try { await api.setAutostart($autostart.checked); } catch (_) {}
  applyTheme(state.settings.theme);
  await applySize(state.settings.width, state.settings.height);
  closeSettings();
});
