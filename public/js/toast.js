// ── Top alert bar ─────────────────────────────────
// Full-width alerts that slide down from top with × dismiss.

import { $ } from './dom.js';

const $bar = $('alert-bar');
let hideTimer = null;

/**
 * Show an alert at the top of the app.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warn'} type
 * @param {number} duration  ms before auto-dismiss (0 = manual only)
 */
export function toast(message, type = 'info', duration = 4000) {
  clearTimeout(hideTimer);

  $bar.textContent = '';
  $bar.className = 'alert-show alert-' + type;

  const text = document.createElement('span');
  text.textContent = message;

  const close = document.createElement('button');
  close.className = 'alert-close';
  close.innerHTML = '&times;';
  close.addEventListener('click', dismiss);

  $bar.append(text, close);

  if (duration > 0) {
    hideTimer = setTimeout(dismiss, duration);
  }
}

function dismiss() {
  clearTimeout(hideTimer);
  $bar.classList.replace('alert-show', 'alert-hide');
  setTimeout(() => { $bar.className = ''; }, 300);
}
