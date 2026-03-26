import { state } from './state.js';
import { api } from './api.js';
import { $, closeOnBackdrop } from './dom.js';

const $overlay = $('settings-overlay');
const $claude  = $('set-claude');
const $editor  = $('set-editor');
const $theme   = $('set-theme');
const $width   = $('set-width');
const $height  = $('set-height');

// ── Open / Close ───────────────────────────────────

export function openSettings() {
  $claude.value = state.settings.claude_command;
  $editor.value = state.settings.editor_command;
  $theme.value  = state.settings.theme;
  $width.value  = state.settings.width || 520;
  $height.value = state.settings.height || 680;
  $overlay.classList.remove('hidden');
}

function closeSettings() {
  $overlay.classList.add('hidden');
}

// ── Apply theme ────────────────────────────────────

export function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.body.setAttribute('data-theme', theme);
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
  api.openInBrowser('https://github.com/evil1morty/devdock');
});

$('btn-settings').addEventListener('click', openSettings);
$('settings-cancel').addEventListener('click', closeSettings);
closeOnBackdrop($overlay, closeSettings);

$('settings-reset').addEventListener('click', () => {
  $claude.value = 'claude';
  $editor.value = 'code';
  $theme.value  = 'system';
  $width.value  = 520;
  $height.value = 680;
});

$('settings-save').addEventListener('click', async () => {
  state.settings.claude_command = $claude.value.trim() || 'claude';
  state.settings.editor_command = $editor.value.trim() || 'code';
  state.settings.theme = $theme.value;
  state.settings.width = parseInt($width.value) || 520;
  state.settings.height = parseInt($height.value) || 680;

  await api.saveSettings(state.settings);
  applyTheme(state.settings.theme);
  await applySize(state.settings.width, state.settings.height);
  closeSettings();
});
