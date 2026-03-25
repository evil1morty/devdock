use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// ── Runtime state ──────────────────────────────────

#[derive(Default)]
pub struct ProcessState {
    pub pid: Option<u32>,
    pub running: bool,
    pub active_command: Option<String>,
    pub logs: Vec<LogLine>,
    pub detected_url: Option<String>,
}

pub struct AppState {
    pub processes: Arc<Mutex<HashMap<String, ProcessState>>>,
    pub config_path: Mutex<PathBuf>,
}

// ── Persisted config ───────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ProjectConfig {
    pub id: String,
    pub name: String,
    pub directory: String,
    pub framework: Option<String>,
    pub commands: Vec<CommandDef>,
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
