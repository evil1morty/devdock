mod commands;
mod process;
mod types;
mod util;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

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
                force_close: Mutex::new(false),
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
            commands::force_close,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        if let Some(state) = window.try_state::<AppState>() {
                            if *state.force_close.lock().unwrap() {
                                return;
                            }
                            let has_running = state.processes.lock()
                                .map(|map| map.values().any(|ps| ps.running))
                                .unwrap_or(false);
                            if has_running {
                                api.prevent_close();
                                let _ = window.emit("confirm-close", ());
                            }
                        }
                    }
                }
                tauri::WindowEvent::Destroyed => {
                    if window.label() == "main" {
                        if let Some(state) = window.try_state::<AppState>() {
                            process::kill_all(&state.processes);
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
