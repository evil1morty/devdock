// Thin wrappers around Tauri invoke calls
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

export { listen };

export const api = {
  loadConfig:      ()              => invoke('load_config'),
  saveConfig:      (projects)      => invoke('save_config', { projects }),
  getAllStatus:     ()              => invoke('get_all_status'),
  getLogs:         (id)            => invoke('get_logs', { id }),
  startProcess:    (id, command, label, cwd) => invoke('start_process', { id, command, label, cwd }),
  stopProcess:     (id)            => invoke('stop_process', { id }),
  pickFolder:      ()              => invoke('pick_folder'),
  scanProject:     (directory)     => invoke('scan_project', { directory }),
  openInExplorer:  (directory)     => invoke('open_in_explorer', { directory }),
  openInVscode:    (directory)     => invoke('open_in_vscode', { directory }),
  openInBrowser:   (url)           => invoke('open_in_browser', { url }),
};
