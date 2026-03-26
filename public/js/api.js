// Thin wrappers around Tauri invoke calls
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

export { listen };

export const api = {
  loadConfig:      ()              => invoke('load_config'),
  saveConfig:      (projects)      => invoke('save_config', { projects }),
  loadSettings:    ()              => invoke('load_settings'),
  saveSettings:    (settings)      => invoke('save_settings', { settings }),
  getAllStatus:     ()              => invoke('get_all_status'),
  getLogs:         (id)            => invoke('get_logs', { id }),
  startProcess:    (id, command, label, cwd) => invoke('start_process', { id, command, label, cwd }),
  stopProcess:     (id)            => invoke('stop_process', { id }),
  pickFolder:      ()              => invoke('pick_folder'),
  scanProject:     (directory)     => invoke('scan_project', { directory }),
  openInExplorer:  (directory)     => invoke('open_in_explorer', { directory }),
  openInEditor:    (directory, editor) => invoke('open_in_editor', { directory, editor }),
  openInClaude:    (directory, claudeCommand) => invoke('open_in_claude', { directory, claudeCommand }),
  openInBrowser:   (url)           => invoke('open_in_browser', { url }),
};
