import { api } from './api.js';

// Shared application state
export const state = {
  projects: [],
  statuses: {},        // id -> { [label]: { running, url } }
  activeLogId: null,   // which project's logs are shown
  activeLogTab: null,  // which command tab is selected
  ctxProjectId: null,  // context menu target
  editingId: null,     // dialog: null = add, string = edit
  activeTag: null,     // tag filter: null = show all
  missingPaths: new Set(),  // project IDs whose directory doesn't exist
  settings: {
    claude_command: 'claude',
    claude_mode: 'tab',
    editor_command: 'code',
    theme: 'system',
    width: 520,
    height: 680,
    autostart: false,
  },
};

export function getProject(id) {
  return state.projects.find(p => p.id === id);
}

/** Aggregate status for a project (any command running? best URL?) */
export function getStatus(id) {
  const cmds = state.statuses[id] || {};
  const entries = Object.entries(cmds);
  const running = entries.some(([_, s]) => s.running);
  const url = entries.find(([_, s]) => s.running && s.url)?.[1]?.url || null;
  return { running, url, commands: cmds };
}

/** Status for a specific command within a project */
export function getCmdStatus(id, label) {
  return state.statuses[id]?.[label] || { running: false, url: null };
}

/** Check which project directories exist and update missingPaths */
export async function checkProjectPaths() {
  const paths = state.projects.map(p => p.directory);
  if (paths.length === 0) { state.missingPaths = new Set(); return; }
  try {
    const result = await api.checkPathsExist(paths);
    state.missingPaths = new Set(
      state.projects.filter(p => result[p.directory] === false).map(p => p.id)
    );
  } catch (_) {
    state.missingPaths = new Set();
  }
}
