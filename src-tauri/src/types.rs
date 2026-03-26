use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// ── Runtime state ──────────────────────────────────

#[derive(Default)]
pub struct ProcessState {
    pub pid: Option<u32>,
    pub running: bool,
    pub active_command: Option<String>,
    pub logs: VecDeque<LogLine>,
    pub detected_url: Option<String>,
}

pub struct AppState {
    pub processes: Arc<Mutex<HashMap<String, ProcessState>>>,
    pub config_path: Mutex<PathBuf>,
    pub settings_path: Mutex<PathBuf>,
    pub force_close: Mutex<bool>,
}

// ── Settings ───────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    pub claude_command: String,
    #[serde(default = "default_claude_mode")]
    pub claude_mode: String, // "window" or "tab"
    pub editor_command: String,
    pub theme: String,
    #[serde(default = "default_width")]
    pub width: u32,
    #[serde(default = "default_height")]
    pub height: u32,
    #[serde(default)]
    pub autostart: bool,
}

fn default_claude_mode() -> String { "tab".into() }
fn default_width() -> u32 { 520 }
fn default_height() -> u32 { 680 }

impl Default for Settings {
    fn default() -> Self {
        Self {
            claude_command: "claude".into(),
            claude_mode: "tab".into(),
            editor_command: "code".into(),
            theme: "system".into(),
            width: 520,
            height: 680,
            autostart: false,
        }
    }
}

// ── Persisted config ───────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub framework: Option<String>,
    pub commands: Vec<CommandDef>,
    #[serde(default)]
    pub env: Vec<EnvVar>,
    #[serde(default)]
    pub pinned: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CommandDef {
    pub label: String,
    pub cmd: String,
}

// ── Event payloads ─────────────────────────────────

#[derive(Serialize, Clone)]
pub struct LogPayload {
    pub id: String,
    pub text: String,
    pub stream: String,
}

#[derive(Serialize, Clone)]
pub struct StatusPayload {
    pub id: String,
    pub running: bool,
    pub active_command: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct LogLine {
    pub text: String,
    pub stream: String,
}

// ── Scan result ────────────────────────────────────

#[derive(Serialize)]
pub struct ScanResult {
    pub name: String,
    pub framework: Option<String>,
    pub commands: Vec<CommandDef>,
}
