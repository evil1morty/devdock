// Shared application state
export const state = {
  projects: [],
  statuses: {},        // id -> { running, active_command, url }
  activeLogId: null,   // which project's logs are shown
  ctxProjectId: null,  // context menu target
  editingId: null,     // dialog: null = add, string = edit
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

export function getStatus(id) {
  return state.statuses[id] || { running: false, active_command: null, url: null };
}
