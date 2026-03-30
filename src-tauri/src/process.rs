use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::types::{EnvVar, LogLine, LogPayload, ProcessState, StatusPayload, process_key};
use crate::util::{UrlConfidence, detect_url, strip_ansi};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
pub const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;

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

        // JOBOBJECT_EXTENDED_LIMIT_INFORMATION: 144 bytes on 64-bit, 112 on 32-bit
        // LimitFlags offset is 16 bytes in, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
        let mut info = [0u8; 144];
        let info_len: u32 = if std::mem::size_of::<usize>() == 8 { 144 } else { 112 };
        let flags_ptr = info.as_mut_ptr().add(16) as *mut u32;
        *flags_ptr = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE

        // JobObjectExtendedLimitInformation = 9
        SetInformationJobObject(job, 9, info.as_ptr(), info_len);

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

// ── Per-process Job Objects ───────────────────────
// Each spawned process gets its own job object so TerminateJobObject
// reliably kills ALL descendants (vite, node, etc.), unlike taskkill /T
// which misses detached children.

#[cfg(windows)]
fn create_process_job() -> Option<usize> {
    extern "system" {
        fn CreateJobObjectW(attrs: *const u8, name: *const u16) -> *mut std::ffi::c_void;
        fn SetInformationJobObject(job: *mut std::ffi::c_void, class: u32, info: *const u8, len: u32) -> i32;
    }
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() { return None; }
        let mut info = [0u8; 144];
        let info_len: u32 = if std::mem::size_of::<usize>() == 8 { 144 } else { 112 };
        let flags_ptr = info.as_mut_ptr().add(16) as *mut u32;
        *flags_ptr = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        SetInformationJobObject(job, 9, info.as_ptr(), info_len);
        Some(job as usize)
    }
}

#[cfg(not(windows))]
fn create_process_job() -> Option<usize> { None }

#[cfg(windows)]
fn assign_pid_to_job(job_handle: usize, pid: u32) {
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn AssignProcessToJobObject(job: *mut std::ffi::c_void, proc: *mut std::ffi::c_void) -> i32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    unsafe {
        let proc = OpenProcess(0x001F0FFF, 0, pid);
        if !proc.is_null() {
            AssignProcessToJobObject(job_handle as *mut std::ffi::c_void, proc);
            CloseHandle(proc);
        }
    }
}

#[cfg(not(windows))]
fn assign_pid_to_job(_job_handle: usize, _pid: u32) {}

#[cfg(windows)]
fn terminate_job(job_handle: usize) {
    extern "system" {
        fn TerminateJobObject(job: *mut std::ffi::c_void, exit_code: u32) -> i32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    unsafe {
        TerminateJobObject(job_handle as *mut std::ffi::c_void, 1);
        CloseHandle(job_handle as *mut std::ffi::c_void);
    }
}

#[cfg(not(windows))]
fn terminate_job(_job_handle: usize) {}

const MAX_LOG_LINES: usize = 2000;

// ── Shell helpers ──────────────────────────────────

#[cfg(windows)]
pub fn spawn_shell(command: &str, cwd: &str, env: &[EnvVar]) -> Result<std::process::Child, String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", command])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW_FLAG)
        .env("FORCE_COLOR", "3");
    for e in env {
        cmd.env(&e.key, &e.value);
    }
    cmd.spawn().map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn spawn_shell(command: &str, cwd: &str, env: &[EnvVar]) -> Result<std::process::Child, String> {
    use std::os::unix::process::CommandExt;
    let mut cmd = Command::new("sh");
    cmd.args(["-c", command])
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("FORCE_COLOR", "3");
    for e in env {
        cmd.env(&e.key, &e.value);
    }
    unsafe {
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    cmd.spawn().map_err(|e| e.to_string())
}

#[cfg(windows)]
pub fn kill_tree(pid: u32) {
    let _ = Command::new("taskkill")
        .args(["/T", "/F", "/PID", &pid.to_string()])
        .creation_flags(CREATE_NO_WINDOW_FLAG)
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
    key: &str,
    text: String,
    stream: &str,
) {
    if let Ok(mut map) = procs.lock() {
        if let Some(ps) = map.get_mut(key) {
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
    key: String,
    id: String,
    label: String,
    app: AppHandle,
    procs: Arc<Mutex<HashMap<String, ProcessState>>>,
    detect_urls: bool,
) {
    thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().flatten() {
            let clean = strip_ansi(&line);

            if detect_urls {
                if let Some((url, confidence)) = detect_url(&clean) {
                    if let Ok(mut map) = procs.lock() {
                        if let Some(ps) = map.get_mut(&key) {
                            let dominated = ps.detected_url.is_some()
                                && confidence < ps.url_confidence;
                            let unchanged = ps.detected_url.as_ref() == Some(&url);
                            if !dominated && !unchanged {
                                ps.detected_url = Some(url.clone());
                                ps.url_confidence = confidence;
                                let _ = app.emit(
                                    "process-status",
                                    StatusPayload {
                                        id: id.clone(),
                                        label: label.clone(),
                                        running: true,
                                        url: Some(url),
                                    },
                                );
                            }
                        }
                    }
                }
            }

            push_log(&procs, &key, line.clone(), stream_name);
            let _ = app.emit(
                "process-log",
                LogPayload {
                    id: id.clone(),
                    label: label.clone(),
                    text: line,
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
    label: String,
    command: String,
    cwd: String,
    env: Vec<EnvVar>,
    app: AppHandle,
    processes: Arc<Mutex<HashMap<String, ProcessState>>>,
) -> Result<(), String> {
    let key = process_key(&id, &label);

    // Mark as running (only checks THIS command slot, not other commands)
    let epoch;
    {
        let mut map = processes.lock().map_err(|e| e.to_string())?;
        if let Some(ps) = map.get(&key) {
            if ps.running {
                return Err("Already running".into());
            }
        }
        let ps = map.entry(key.clone()).or_default();
        ps.logs.clear();
        ps.running = true;
        ps.detected_url = None;
        ps.url_confidence = UrlConfidence::Normal;
        ps.epoch += 1;
        epoch = ps.epoch;
    }

    // Spawn
    let mut child = match spawn_shell(&command, &cwd, &env) {
        Ok(c) => c,
        Err(e) => {
            let mut map = processes.lock().unwrap();
            if let Some(ps) = map.get_mut(&key) {
                ps.running = false;
            }
            let _ = app.emit(
                "process-status",
                StatusPayload {
                    id,
                    label,
                    running: false,
                    url: None,
                },
            );
            return Err(e);
        }
    };

    // Store PID and assign to job objects
    let pid = child.id();
    assign_to_job(pid);  // global job: auto-kill on app crash

    // Per-process job: reliable kill of ALL descendants on stop
    let proc_job = create_process_job();
    if let Some(jh) = proc_job {
        assign_pid_to_job(jh, pid);
    }

    {
        let mut map = processes.lock().unwrap();
        if let Some(ps) = map.get_mut(&key) {
            ps.pid = Some(pid);
            ps.job_handle = proc_job;
        }
    }

    let _ = app.emit(
        "process-status",
        StatusPayload {
            id: id.clone(),
            label: label.clone(),
            running: true,
            url: None,
        },
    );

    // Wire stdout
    if let Some(stdout) = child.stdout.take() {
        spawn_reader(
            stdout, "stdout",
            key.clone(), id.clone(), label.clone(),
            app.clone(), processes.clone(), true,
        );
    }

    // Wire stderr
    if let Some(stderr) = child.stderr.take() {
        spawn_reader(
            stderr, "stderr",
            key.clone(), id.clone(), label.clone(),
            app.clone(), processes.clone(), true,
        );
    }

    // Wait for exit
    let key_c = key;
    let id_c = id;
    let label_c = label;
    let app_c = app;
    let procs_c = processes;
    thread::spawn(move || {
        let _ = child.wait();
        {
            let mut map = procs_c.lock().unwrap();
            if let Some(ps) = map.get_mut(&key_c) {
                // Only clean up if this is still OUR process.
                // A newer start() would have bumped the epoch, meaning
                // this wait thread is stale and must not touch the state.
                if ps.epoch != epoch {
                    return; // stale — a newer process owns this slot
                }
                ps.running = false;
                ps.pid = None;
                ps.detected_url = None;
                // Kill any orphaned children and close the job handle
                if let Some(jh) = ps.job_handle.take() {
                    terminate_job(jh);
                }
            }
        }
        let _ = app_c.emit(
            "process-status",
            StatusPayload {
                id: id_c,
                label: label_c,
                running: false,
                url: None,
            },
        );
    });

    Ok(())
}

/// Stop a specific command by project id + label.
pub fn stop(
    id: &str,
    label: &str,
    processes: &Arc<Mutex<HashMap<String, ProcessState>>>,
    app: &AppHandle,
) -> Result<(), String> {
    let key = process_key(id, label);
    let mut map = processes.lock().map_err(|e| e.to_string())?;
    if let Some(ps) = map.get_mut(&key) {
        if !ps.running {
            return Err("Not running".into());
        }
        // Mark stopped immediately so the slot is available for a new start().
        // Bump epoch so the old wait thread won't corrupt state.
        ps.running = false;
        ps.detected_url = None;
        ps.epoch += 1;
        let pid = ps.pid.take();
        // Prefer job termination — kills ALL descendants reliably
        if let Some(jh) = ps.job_handle.take() {
            terminate_job(jh);
        } else if let Some(pid) = pid {
            // Fallback to PID-based tree kill
            kill_tree(pid);
        } else {
            return Err("Not running".into());
        }
        // Emit status immediately so frontend updates without waiting for wait thread
        let _ = app.emit(
            "process-status",
            StatusPayload {
                id: id.to_string(),
                label: label.to_string(),
                running: false,
                url: None,
            },
        );
        return Ok(());
    }
    Err("Not running".into())
}

/// Stop ALL running commands for a project.
pub fn stop_all(
    id: &str,
    processes: &Arc<Mutex<HashMap<String, ProcessState>>>,
    app: &AppHandle,
) -> Result<(), String> {
    let prefix = format!("{}::", id);
    let mut map = processes.lock().map_err(|e| e.to_string())?;
    let mut stopped_labels: Vec<String> = Vec::new();
    for (key, ps) in map.iter_mut() {
        if key.starts_with(&prefix) && ps.running {
            // Mark stopped immediately and bump epoch
            ps.running = false;
            ps.detected_url = None;
            ps.epoch += 1;
            let pid = ps.pid.take();
            if let Some(jh) = ps.job_handle.take() {
                terminate_job(jh);
            } else if let Some(pid) = pid {
                kill_tree(pid);
            }
            // Extract label from key ("id::label")
            if let Some(label) = key.strip_prefix(&prefix) {
                stopped_labels.push(label.to_string());
            }
        }
    }
    if stopped_labels.is_empty() {
        return Err("Nothing running".into());
    }
    // Emit status events outside the lock iteration
    for label in stopped_labels {
        let _ = app.emit(
            "process-status",
            StatusPayload {
                id: id.to_string(),
                label,
                running: false,
                url: None,
            },
        );
    }
    Ok(())
}

/// Kill all tracked processes (used on app shutdown).
pub fn kill_all(processes: &Arc<Mutex<HashMap<String, ProcessState>>>) {
    if let Ok(mut map) = processes.lock() {
        for ps in map.values_mut() {
            if let Some(jh) = ps.job_handle.take() {
                terminate_job(jh);
            } else if let Some(pid) = ps.pid {
                kill_tree(pid);
            }
        }
    }
}
