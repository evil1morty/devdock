use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::process;
use crate::types::*;
use crate::util::detect_framework;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Dialog ─────────────────────────────────────────

#[tauri::command]
pub fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog()
        .file()
        .set_title("Select project folder")
        .pick_folder(move |folder| {
            let path_str =
                folder.and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string()));
            let _ = tx.send(path_str);
        });
    rx.recv().map_err(|e| e.to_string())
}

// ── Package scanning ───────────────────────────────

const SKIP_SCRIPTS: &[&str] = &["prepare", "prepublishOnly", "postinstall", "preinstall"];

#[tauri::command]
pub fn scan_package_json(directory: String) -> Result<ScanResult, String> {
    let pkg_path = PathBuf::from(&directory).join("package.json");
    if !pkg_path.exists() {
        return Err("No package.json found".into());
    }

    let data = fs::read_to_string(&pkg_path).map_err(|e| e.to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    let name = pkg
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let framework = detect_framework(&pkg);
    let mut commands = Vec::new();

    if let Some(scripts) = pkg.get("scripts").and_then(|v| v.as_object()) {
        for (key, val) in scripts {
            if SKIP_SCRIPTS.contains(&key.as_str()) {
                continue;
            }
            // Skip pre/post lifecycle hooks (e.g. preBuild, postTest)
            if is_lifecycle_hook(key) {
                continue;
            }
            if val.is_string() {
                commands.push(CommandDef {
                    label: key.clone(),
                    cmd: format!("npm run {}", key),
                });
            }
        }
    }

    // Sort: dev-related first, then build/test, then rest
    commands.sort_by_key(|c| match c.label.as_str() {
        "dev" => 0,
        "start" => 1,
        "serve" => 2,
        "build" => 3,
        "test" => 4,
        "lint" => 5,
        _ => 10,
    });

    Ok(ScanResult {
        name,
        framework,
        commands,
    })
}

fn is_lifecycle_hook(key: &str) -> bool {
    for prefix in &["pre", "post"] {
        if let Some(rest) = key.strip_prefix(prefix) {
            if rest.starts_with(|c: char| c.is_uppercase()) {
                return true;
            }
        }
    }
    false
}

// ── Process commands ───────────────────────────────

#[tauri::command]
pub fn start_process(
    id: String,
    command: String,
    label: String,
    cwd: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    process::start(id, command, label, cwd, app, state.processes.clone())
}

#[tauri::command]
pub fn stop_process(id: String, state: State<'_, AppState>) -> Result<(), String> {
    process::stop(&id, &state.processes)
}

// ── Status queries ─────────────────────────────────

#[tauri::command]
pub fn get_logs(id: String, state: State<'_, AppState>) -> Vec<LogLine> {
    state
        .processes
        .lock()
        .ok()
        .and_then(|map| map.get(&id).map(|ps| ps.logs.clone()))
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_status(id: String, state: State<'_, AppState>) -> StatusPayload {
    state
        .processes
        .lock()
        .ok()
        .and_then(|map| {
            map.get(&id).map(|ps| StatusPayload {
                id: id.clone(),
                running: ps.running,
                active_command: ps.active_command.clone(),
                url: ps.detected_url.clone(),
            })
        })
        .unwrap_or(StatusPayload {
            id,
            running: false,
            active_command: None,
            url: None,
        })
}

#[tauri::command]
pub fn get_all_status(state: State<'_, AppState>) -> HashMap<String, StatusPayload> {
    state
        .processes
        .lock()
        .ok()
        .map(|map| {
            map.iter()
                .map(|(id, ps)| {
                    (
                        id.clone(),
                        StatusPayload {
                            id: id.clone(),
                            running: ps.running,
                            active_command: ps.active_command.clone(),
                            url: ps.detected_url.clone(),
                        },
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

// ── OS actions ─────────────────────────────────────

#[tauri::command]
pub fn open_in_explorer(directory: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(&directory)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_vscode(directory: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", "code", &directory])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new("code")
            .arg(&directory)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", "start", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Config persistence ─────────────────────────────

#[tauri::command]
pub fn load_config(state: State<'_, AppState>) -> Result<Vec<ProjectConfig>, String> {
    let path = state.config_path.lock().map_err(|e| e.to_string())?;
    if path.exists() {
        let data = fs::read_to_string(&*path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub fn save_config(projects: Vec<ProjectConfig>, state: State<'_, AppState>) -> Result<(), String> {
    let path = state.config_path.lock().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(&*path, json).map_err(|e| e.to_string())
}
