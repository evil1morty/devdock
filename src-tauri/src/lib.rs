mod commands;
mod process;
mod types;
mod util;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

use types::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            process::init_job_object();
            let config_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));

            app.manage(AppState {
                processes: Arc::new(Mutex::new(HashMap::new())),
                config_path: Mutex::new(config_dir.join("projects.json")),
                settings_path: Mutex::new(config_dir.join("settings.json")),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::pick_folder,
            commands::scan_project,
            commands::start_process,
            commands::stop_process,
            commands::get_logs,
            commands::get_status,
            commands::get_all_status,
            commands::open_in_explorer,
            commands::open_in_editor,
            commands::open_in_claude,
            commands::open_in_browser,
            commands::load_config,
            commands::save_config,
            commands::load_settings,
            commands::save_settings,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    if let Some(state) = window.try_state::<AppState>() {
                        process::kill_all(&state.processes);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
