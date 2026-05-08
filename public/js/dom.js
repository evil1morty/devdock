import { ansiToHtml } from './ansi.js';

// ── DOM helpers ────────────────────────────────────

/** Shorthand for getElementById */
export const $ = (id) => document.getElementById(id);

/** Create an element with optional class and text */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Create a button with class, label, and click handler */
export function btn(className, label, onClick) {
  const b = el('button', className, label);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Toggle the 'hidden' class */
export function toggle(node, visible) {
  node.classList.toggle('hidden', !visible);
}

/** Append a log line div to a container */
export function appendLogLine(container, text, stream) {
  const div = document.createElement('div');
  div.className = 'log-line ' + (stream || 'stdout');
  if (text.includes('\x1b')) {
    div.innerHTML = ansiToHtml(text);
  } else {
    div.textContent = text;
  }
  container.appendChild(div);

  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  if (nearBottom) container.scrollTop = container.scrollHeight;

  while (container.children.length > 2000) {
    container.removeChild(container.firstChild);
  }
}

/** Close an overlay when clicking the backdrop */
export function closeOnBackdrop(overlay, closeFn) {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeFn();
  });
}

// Curated, high-contrast palette (readable on both dark and light themes).
const TAG_PALETTE = [
  '#58a6ff', // blue
  '#3fb950', // green
  '#f78166', // orange
  '#bc8cff', // purple
  '#ec6cb9', // pink
  '#39c5cf', // teal
  '#e3b341', // yellow
  '#ff7b72', // red
  '#a371f7', // violet
  '#56d364', // light green
  '#ffa657', // amber
  '#79c0ff', // sky
];

/** Deterministic color for a tag string from the curated palette */
export function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return TAG_PALETTE[h % TAG_PALETTE.length];
}
