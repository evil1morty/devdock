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
  const div = el('div', 'log-line ' + (stream || 'stdout'), text);
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
