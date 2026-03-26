use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::types::*;
use crate::util::{detect_url, strip_ansi};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Windows Job Object ─────────────────────────────
// Ensures all child processes die when OneRun exits, even on crash/force-kill.

#[cfg(windows)]
static JOB_HANDLE: std::sync::OnceLock<usize> = std::sync::OnceLock::new();

#[cfg(windows)]
pub fn init_job_object() {
    extern "system" {
        fn CreateJobObjectW(attrs: *const u8, name: *const u16) -> *mut std::ffi::c_void;
        fn SetInformationJobObject(job: *mut std::ffi::c_void, class: u32, info: *const u8, len: u32) -> i32;
    }

    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() { return; }

        // JOBOBJECT_BASIC_LIMIT_INFORMATION + IO_COUNTERS = extended info
        // LimitFlags offset is 16 bytes in, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        let mut info = [0u8; 112]; // JOBOBJECT_EXTENDED_LIMIT_INFORMATION size
        let flags_ptr = info.as_mut_ptr().add(16) as *mut u32;
        *flags_ptr = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

        // JobObjectExtendedLimitInformation = 9
        SetInformationJobObject(job, 9, info.as_ptr(), info.len() as u32);

        let _ = JOB_HANDLE.set(job as usize);
    }
}

#[cfg(windows)]
fn assign_to_job(pid: u32) {
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn AssignProcessToJobObject(job: *mut std::ffi::c_void, proc: *mut std::ffi::c_void) -> i32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }

    if let Some(&job) = JOB_HANDLE.get() {
        unsafe {
            let proc = OpenProcess(0x001F0FFF, 0, pid);
            if !proc.is_null() {
                AssignProcessToJobObject(job as *mut std::ffi::c_void, proc);
                CloseHandle(proc);
            }
        }
    }
}

#[cfg(not(windows))]
pub fn init_job_object() {}

#[cfg(not(windows))]
fn assign_to_job(_pid: u32) {}

const MAX_LOG_LINES: usize = 2000;

// ── Shell helpers ──────────────────────────────────

#[cfg(windows)]
pub fn spawn_shell(command: &str, cwd: &str) -> Result<std::process::Child, String> {
    Command::new("cmd")
        .args(["/C", command])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn spawn_shell(command: &str, cwd: &str) -> Result<std::process::Child, String> {
    use std::os::unix::process::CommandExt;
    unsafe {
        Command::new("sh")
            .args(["-c", command])
            .current_dir(cwd)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .pre_exec(|| {
                libc::setsid();
                Ok(())
            })
            .spawn()
            .map_err(|e| e.to_string())
    }
}

#[cfg(windows)]
pub fn kill_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .and_then(|mut c| c.wait());
}

#[cfg(not(windows))]
pub fn kill_tree(pid: u32) {
    // Kill entire process group (negative PID) thanks to setsid in spawn
    let _ = Command::new("kill")
        .args(["-TERM", &format!("-{}", pid)])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .and_then(|mut c| c.wait());
    // Force kill after a brief wait
    std::thread::sleep(std::time::Duration::from_secs(2));
    let _ = Command::new("kill")
        .args(["-9", &format!("-{}", pid)])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .and_then(|mut c| c.wait());
}

// ── Log buffer ─────────────────────────────────────

fn push_log(
    procs: &Arc<Mutex<HashMap<String, ProcessState>>>,
    id: &str,
    text: String,
    stream: &str,
) {
    if let Ok(mut map) = procs.lock() {
        if let Some(ps) = map.get_mut(id) {
            ps.logs.push_back(LogLine {
                text,
                stream: stream.into(),
            });
            if ps.logs.len() > MAX_LOG_LINES {
                ps.logs.pop_front();
            }
        }
    }
}

// ── Stream reader ──────────────────────────────────

/// Spawns a thread that reads lines from a stream, stores them in the
/// process log buffer, and emits them as Tauri events.
fn spawn_reader(
    stream: impl std::io::Read + Send + 'static,
    stream_name: &'static str,
    id: String,
    app: AppHandle,
    procs: Arc<Mutex<HashMap<String, ProcessState>>>,
    detect_urls: bool,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().flatten() {
            let clean = strip_ansi(&line);

            if detect_urls {
                if let Some(url) = detect_url(&clean) {
                    if let Ok(mut map) = procs.lock() {
                        if let Some(ps) = map.get_mut(&id) {
                            if ps.detected_url.is_none() {
                                ps.detected_url = Some(url.clone());
                                let _ = app.emit(
                                    "process-status",
                                    StatusPayload {
                                        id: id.clone(),
                                        running: true,
                                        active_command: ps.active_command.clone(),
                                        url: Some(url),
                                    },
                                );
                            }
                        }
                    }
                }
            }

            push_log(&procs, &id, clean.clone(), stream_name);
            let _ = app.emit(
                "process-log",
                LogPayload {
                    id: id.clone(),
                    text: clean,
                    stream: stream_name.into(),
                },
            );
        }
    });
}

// ── Process lifecycle ──────────────────────────────

/// Start a shell process, wire up log streaming, and track it in state.
pub fn start(
    id: String,
    command: String,
    label: String,
    cwd: String,
    app: AppHandle,
    processes: Arc<Mutex<HashMap<String, ProcessState>>>,
) -> Result<(), String> {
    // Mark as running
    {
        let mut map = processes.lock().map_err(|e| e.to_string())?;
        if let Some(ps) = map.get(&id) {
            if ps.running {
                return Err("Already running".into());
            }
        }
        let ps = map.entry(id.clone()).or_default();
        ps.logs.clear();
        ps.running = true;
        ps.active_command = Some(label.clone());
        ps.detected_url = None;
    }

    // Spawn
    let mut child = match spawn_shell(&command, &cwd) {
        Ok(c) => c,
        Err(e) => {
            let mut map = processes.lock().unwrap();
            if let Some(ps) = map.get_mut(&id) {
                ps.running = false;
                ps.active_command = None;
            }
            let _ = app.emit(
                "process-status",
                StatusPayload {
                    id,
                    running: false,
                    active_command: None,
                    url: None,
                },
            );
            return Err(e);
        }
    };

    // Store PID and assign to job object (auto-kill on app crash)
    let pid = child.id();
    assign_to_job(pid);
    {
        let mut map = processes.lock().unwrap();
        if let Some(ps) = map.get_mut(&id) {
            ps.pid = Some(pid);
        }
    }

    let _ = app.emit(
        "process-status",
        StatusPayload {
            id: id.clone(),
            running: true,
            active_command: Some(label),
            url: None,
        },
    );

    // Wire stdout
    if let Some(stdout) = child.stdout.take() {
        spawn_reader(stdout, "stdout", id.clone(), app.clone(), processes.clone(), true);
    }

    // Wire stderr
    if let Some(stderr) = child.stderr.take() {
        spawn_reader(stderr, "stderr", id.clone(), app.clone(), processes.clone(), true);
    }

    // Wait for exit
    let id_c = id;
    let app_c = app;
    let procs_c = processes;
    thread::spawn(move || {
        let _ = child.wait();
        let url;
        {
            let mut map = procs_c.lock().unwrap();
            if let Some(ps) = map.get_mut(&id_c) {
                ps.running = false;
                ps.pid = None;
                url = ps.detected_url.clone();
                ps.active_command = None;
            } else {
                url = None;
            }
        }
        let _ = app_c.emit(
            "process-status",
            StatusPayload {
                id: id_c,
                running: false,
                active_command: None,
                url,
            },
        );
    });

    Ok(())
}

/// Stop a running process by killing its tree.
pub fn stop(
    id: &str,
    processes: &Arc<Mutex<HashMap<String, ProcessState>>>,
) -> Result<(), String> {
    let map = processes.lock().map_err(|e| e.to_string())?;
    if let Some(ps) = map.get(id) {
        if let Some(pid) = ps.pid {
            kill_tree(pid);
            return Ok(());
        }
    }
    Err("Not running".into())
}

/// Kill all tracked processes (used on app shutdown).
pub fn kill_all(processes: &Arc<Mutex<HashMap<String, ProcessState>>>) {
    if let Ok(map) = processes.lock() {
        for ps in map.values() {
            if let Some(pid) = ps.pid {
                kill_tree(pid);
            }
        }
    }
}
