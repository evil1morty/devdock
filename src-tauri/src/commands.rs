use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::process::Stdio;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::process;
use crate::types::*;
use crate::util::detect_framework;
use tauri_plugin_autostart::ManagerExt;

#[cfg(windows)]
use crate::process::CREATE_NO_WINDOW_FLAG;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

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
pub fn scan_project(directory: String) -> Result<ScanResult, String> {
    let dir = PathBuf::from(&directory);

    // Try each project type in order
    if dir.join("package.json").exists() {
        return scan_node(&dir);
    }
    if dir.join("Cargo.toml").exists() {
        return scan_cargo(&dir);
    }
    if dir.join("pyproject.toml").exists() || dir.join("requirements.txt").exists() {
        return scan_python(&dir);
    }
    if dir.join("composer.json").exists() {
        return scan_php(&dir);
    }
    if dir.join("go.mod").exists() {
        return scan_go(&dir);
    }
    if dir.join("Makefile").exists() || dir.join("makefile").exists() {
        return scan_makefile(&dir);
    }
    if dir.join("docker-compose.yml").exists() || dir.join("docker-compose.yaml").exists() {
        return scan_docker_compose(&dir);
    }

    // Fallback: use folder name, no commands
    let name = dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(ScanResult { name, framework: None, commands: vec![] })
}

// ── Node.js / Bun ──────────────────────────────────

fn scan_node(dir: &Path) -> Result<ScanResult, String> {
    let data = fs::read_to_string(dir.join("package.json")).map_err(|e| e.to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    let name = pkg.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let framework = detect_framework(&pkg);

    // Detect package manager
    let runner = if dir.join("bun.lockb").exists() || dir.join("bun.lock").exists() {
        "bun run"
    } else if dir.join("pnpm-lock.yaml").exists() {
        "pnpm run"
    } else if dir.join("yarn.lock").exists() {
        "yarn"
    } else {
        "npm run"
    };

    let mut commands = Vec::new();
    if let Some(scripts) = pkg.get("scripts").and_then(|v| v.as_object()) {
        for (key, val) in scripts {
            if SKIP_SCRIPTS.contains(&key.as_str()) || is_lifecycle_hook(key) {
                continue;
            }
            if val.is_string() {
                commands.push(CommandDef {
                    label: key.clone(),
                    cmd: format!("{} {}", runner, key),
                });
            }
        }
    }

    commands.sort_by_key(|c| match c.label.as_str() {
        "dev" => 0, "start" => 1, "serve" => 2,
        "build" => 3, "test" => 4, "lint" => 5,
        _ => 10,
    });

    Ok(ScanResult { name, framework, commands })
}

// ── Rust / Cargo ───────────────────────────────────

fn scan_cargo(dir: &Path) -> Result<ScanResult, String> {
    let data = fs::read_to_string(dir.join("Cargo.toml")).map_err(|e| e.to_string())?;
    let name = data.lines()
        .find(|l| l.starts_with("name"))
        .and_then(|l| l.split('"').nth(1))
        .unwrap_or("")
        .to_string();

    Ok(ScanResult {
        name,
        framework: Some("Rust".into()),
        commands: vec![
            CommandDef { label: "run".into(), cmd: "cargo run".into() },
            CommandDef { label: "build".into(), cmd: "cargo build".into() },
            CommandDef { label: "test".into(), cmd: "cargo test".into() },
            CommandDef { label: "check".into(), cmd: "cargo check".into() },
        ],
    })
}

// ── Python ─────────────────────────────────────────

fn scan_python(dir: &Path) -> Result<ScanResult, String> {
    let name = dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut framework = None;
    let mut commands = Vec::new();

    // Check pyproject.toml for framework hints
    if let Ok(data) = fs::read_to_string(dir.join("pyproject.toml")) {
        if data.contains("django") {
            framework = Some("Django".into());
            commands.push(CommandDef { label: "dev".into(), cmd: "python manage.py runserver".into() });
            commands.push(CommandDef { label: "migrate".into(), cmd: "python manage.py migrate".into() });
        } else if data.contains("fastapi") || data.contains("uvicorn") {
            framework = Some("FastAPI".into());
            commands.push(CommandDef { label: "dev".into(), cmd: "uvicorn main:app --reload".into() });
        } else if data.contains("flask") {
            framework = Some("Flask".into());
            commands.push(CommandDef { label: "dev".into(), cmd: "flask run --reload".into() });
        }
    }

    // Check for manage.py (Django)
    if commands.is_empty() && dir.join("manage.py").exists() {
        framework = Some("Django".into());
        commands.push(CommandDef { label: "dev".into(), cmd: "python manage.py runserver".into() });
        commands.push(CommandDef { label: "migrate".into(), cmd: "python manage.py migrate".into() });
    }

    if commands.is_empty() {
        commands.push(CommandDef { label: "run".into(), cmd: "python main.py".into() });
    }

    Ok(ScanResult { name, framework, commands })
}

// ── Go ─────────────────────────────────────────────

fn scan_go(dir: &Path) -> Result<ScanResult, String> {
    let data = fs::read_to_string(dir.join("go.mod")).map_err(|e| e.to_string())?;
    let name = data.lines()
        .find(|l| l.starts_with("module"))
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|m| m.rsplit('/').next())
        .unwrap_or("")
        .to_string();

    Ok(ScanResult {
        name,
        framework: Some("Go".into()),
        commands: vec![
            CommandDef { label: "run".into(), cmd: "go run .".into() },
            CommandDef { label: "build".into(), cmd: "go build .".into() },
            CommandDef { label: "test".into(), cmd: "go test ./...".into() },
        ],
    })
}

// ── Makefile ───────────────────────────────────────

fn scan_makefile(dir: &Path) -> Result<ScanResult, String> {
    let name = dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let path = if dir.join("Makefile").exists() {
        dir.join("Makefile")
    } else {
        dir.join("makefile")
    };

    let mut commands = Vec::new();
    if let Ok(data) = fs::read_to_string(&path) {
        for line in data.lines() {
            // Match "target:" or "target: deps"
            if let Some(colon_pos) = line.find(':') {
                let target = line[..colon_pos].trim();
                if !target.is_empty()
                    && !target.starts_with('.')
                    && !target.starts_with('\t')
                    && !target.starts_with(' ')
                    && !target.contains('=')
                    && !target.contains('$')
                {
                    commands.push(CommandDef {
                        label: target.to_string(),
                        cmd: format!("make {}", target),
                    });
                }
            }
        }
    }

    Ok(ScanResult { name, framework: None, commands })
}

// ── PHP / Composer ─────────────────────────────────

fn scan_php(dir: &Path) -> Result<ScanResult, String> {
    let data = fs::read_to_string(dir.join("composer.json")).map_err(|e| e.to_string())?;
    let pkg: serde_json::Value = serde_json::from_str(&data).map_err(|e| e.to_string())?;

    let name = pkg.get("name")
        .and_then(|v| v.as_str())
        .and_then(|n| n.rsplit('/').next())
        .unwrap_or("")
        .to_string();

    let require = pkg.get("require").and_then(|v| v.as_object());
    let require_dev = pkg.get("require-dev").and_then(|v| v.as_object());
    let has = |dep: &str| -> bool {
        require.is_some_and(|d| d.contains_key(dep))
            || require_dev.is_some_and(|d| d.contains_key(dep))
    };

    let framework = if has("laravel/framework") {
        Some("Laravel".into())
    } else if has("symfony/framework-bundle") || has("symfony/console") {
        Some("Symfony".into())
    } else if has("wordpress/core") || dir.join("wp-config.php").exists() {
        Some("WordPress".into())
    } else {
        None
    };

    let mut commands = Vec::new();

    // Add composer scripts
    if let Some(scripts) = pkg.get("scripts").and_then(|v| v.as_object()) {
        for key in scripts.keys() {
            if !key.starts_with("pre-") && !key.starts_with("post-") {
                commands.push(CommandDef {
                    label: key.clone(),
                    cmd: format!("composer {}", key),
                });
            }
        }
    }

    // Add framework-specific commands
    if has("laravel/framework") {
        if !commands.iter().any(|c| c.label == "dev") {
            commands.insert(0, CommandDef { label: "dev".into(), cmd: "php artisan serve".into() });
        }
        commands.push(CommandDef { label: "migrate".into(), cmd: "php artisan migrate".into() });
        commands.push(CommandDef { label: "tinker".into(), cmd: "php artisan tinker".into() });
    } else if has("symfony/framework-bundle") {
        if !commands.iter().any(|c| c.label == "dev") {
            commands.insert(0, CommandDef { label: "dev".into(), cmd: "symfony serve".into() });
        }
    } else if commands.is_empty() {
        commands.push(CommandDef { label: "serve".into(), cmd: "php -S localhost:8000".into() });
    }

    Ok(ScanResult { name, framework, commands })
}

// ── Docker Compose ─────────────────────────────────

fn scan_docker_compose(dir: &Path) -> Result<ScanResult, String> {
    let name = dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(ScanResult {
        name,
        framework: Some("Docker".into()),
        commands: vec![
            CommandDef { label: "up".into(), cmd: "docker compose up".into() },
            CommandDef { label: "up -d".into(), cmd: "docker compose up -d".into() },
            CommandDef { label: "down".into(), cmd: "docker compose down".into() },
            CommandDef { label: "logs".into(), cmd: "docker compose logs -f".into() },
            CommandDef { label: "build".into(), cmd: "docker compose build".into() },
        ],
    })
}

// ── Helpers ────────────────────────────────────────

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
    env: Vec<EnvVar>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    process::start(id, label, command, cwd, env, app, state.processes.clone())
}

#[tauri::command]
pub fn stop_process(id: String, label: String, state: State<'_, AppState>) -> Result<(), String> {
    process::stop(&id, &label, &state.processes)
}

#[tauri::command]
pub fn stop_all_processes(id: String, state: State<'_, AppState>) -> Result<(), String> {
    process::stop_all(&id, &state.processes)
}

// ── Status queries ─────────────────────────────────

#[tauri::command]
pub fn get_logs(id: String, label: String, state: State<'_, AppState>) -> Vec<LogLine> {
    let key = process_key(&id, &label);
    state
        .processes
        .lock()
        .ok()
        .and_then(|map| map.get(&key).map(|ps| ps.logs.iter().cloned().collect()))
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_status(id: String, state: State<'_, AppState>) -> HashMap<String, CmdStatusPayload> {
    let prefix = format!("{}::", id);
    state
        .processes
        .lock()
        .ok()
        .map(|map| {
            map.iter()
                .filter(|(k, _)| k.starts_with(&prefix))
                .map(|(k, ps)| {
                    let (_, label) = parse_key(k);
                    (
                        label.to_string(),
                        CmdStatusPayload {
                            running: ps.running,
                            url: ps.detected_url.clone(),
                        },
                    )
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_all_status(state: State<'_, AppState>) -> HashMap<String, HashMap<String, CmdStatusPayload>> {
    state
        .processes
        .lock()
        .ok()
        .map(|map| {
            let mut result: HashMap<String, HashMap<String, CmdStatusPayload>> = HashMap::new();
            for (key, ps) in map.iter() {
                let (id, label) = parse_key(key);
                result.entry(id.to_string())
                    .or_default()
                    .insert(label.to_string(), CmdStatusPayload {
                        running: ps.running,
                        url: ps.detected_url.clone(),
                    });
            }
            result
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
            .creation_flags(CREATE_NO_WINDOW_FLAG)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&directory)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_editor(directory: String, editor: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", &editor, &directory])
            .creation_flags(CREATE_NO_WINDOW_FLAG)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new(&editor)
            .arg(&directory)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_claude(
    directory: String,
    claude_command: String,
    mode: String,
    project_name: String,
) -> Result<(), String> {
    let tab_title = format!("CLAUDE - {}", project_name);

    #[cfg(windows)]
    {
        if mode == "tab" {
            // Open as new tab in existing Windows Terminal
            // --suppressApplicationTitle prevents Claude from overriding the tab title
            Command::new("cmd")
                .args([
                    "/C", "wt", "-w", "0", "new-tab",
                    "--title", &tab_title,
                    "--suppressApplicationTitle",
                    "-d", &directory,
                    "cmd", "/K", &claude_command,
                ])
                .creation_flags(CREATE_NO_WINDOW_FLAG)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            // Open as new window
            let temp = std::env::temp_dir().join("onerun_claude.bat");
            fs::write(&temp, format!(
                "@echo off\ntitle {}\ncd /d \"{}\"\n{}\n",
                tab_title, directory, claude_command
            )).map_err(|e| e.to_string())?;
            Command::new("cmd")
                .args(["/C", "start", "cmd", "/K", &temp.to_string_lossy().to_string()])
                .creation_flags(CREATE_NO_WINDOW_FLAG)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        let script = if mode == "tab" {
            format!(
                "tell application \"Terminal\"\nactivate\ntell application \"System Events\" to keystroke \"t\" using command down\ndo script \"cd '{}' && {}\" in front window\nend tell",
                directory, claude_command
            )
        } else {
            format!(
                "tell application \"Terminal\" to do script \"cd '{}' && {}\"",
                directory, claude_command
            )
        };
        Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let cmd_str = format!("cd '{}' && {} ; exec bash", directory, claude_command);
        let terminals = [
            ("x-terminal-emulator", vec!["-e", "bash", "-c"]),
            ("gnome-terminal", vec!["--", "bash", "-c"]),
            ("xterm", vec!["-e", "bash", "-c"]),
        ];
        for (term, args) in &terminals {
            let mut c = Command::new(term);
            for a in args { c.arg(a); }
            if c.arg(&cmd_str).spawn().is_ok() {
                return Ok(());
            }
        }
        return Err("No terminal emulator found".into());
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_browser(url: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW_FLAG)
            .stdout(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Window control ─────────────────────────────────

#[tauri::command]
pub fn force_close(app: AppHandle, state: State<'_, AppState>) {
    *state.force_close.lock().unwrap() = true;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
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

#[tauri::command]
pub fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let path = state.settings_path.lock().map_err(|e| e.to_string())?;
    if path.exists() {
        let data = fs::read_to_string(&*path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    } else {
        Ok(Settings::default())
    }
}

#[tauri::command]
pub fn save_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    let path = state.settings_path.lock().map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&*path, json).map_err(|e| e.to_string())
}

// ── Autostart ─────────────────────────────────────

#[tauri::command]
pub fn get_autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}
