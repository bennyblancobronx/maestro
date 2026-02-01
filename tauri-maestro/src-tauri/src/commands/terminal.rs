use tauri::{AppHandle, State};

use crate::core::{ProcessManager, PtyError};

/// Exposes `ProcessManager::spawn_shell` to the frontend.
///
/// Validates that `cwd` (if provided) exists and is a directory before
/// forwarding to the process manager. Returns the new session ID.
/// The frontend should listen on `pty-output-{id}` for shell output events.
#[tauri::command]
pub async fn spawn_shell(
    app_handle: AppHandle,
    state: State<'_, ProcessManager>,
    cwd: Option<String>,
) -> Result<u32, PtyError> {
    // Validate cwd if provided: must exist and be a directory
    let canonical_cwd = if let Some(ref dir) = cwd {
        let path = std::path::Path::new(dir);
        let canonical = path
            .canonicalize()
            .map_err(|e| PtyError::spawn_failed(format!("Invalid cwd '{dir}': {e}")))?;
        if !canonical.is_dir() {
            return Err(PtyError::spawn_failed(format!(
                "cwd '{dir}' is not a directory"
            )));
        }
        Some(canonical.to_string_lossy().into_owned())
    } else {
        None
    };
    let pm = state.inner().clone();
    pm.spawn_shell(app_handle, canonical_cwd)
}

/// Exposes `ProcessManager::write_stdin` to the frontend.
/// Sends raw text (including control sequences like `\r`) to the PTY.
#[tauri::command]
pub async fn write_stdin(
    state: State<'_, ProcessManager>,
    session_id: u32,
    data: String,
) -> Result<(), PtyError> {
    let pm = state.inner().clone();
    pm.write_stdin(session_id, &data)
}

/// Exposes `ProcessManager::resize_pty` to the frontend.
/// Rejects dimensions that are zero or exceed 500 to prevent misuse.
#[tauri::command]
pub async fn resize_pty(
    state: State<'_, ProcessManager>,
    session_id: u32,
    rows: u16,
    cols: u16,
) -> Result<(), PtyError> {
    if rows == 0 || cols == 0 || rows > 500 || cols > 500 {
        return Err(PtyError::resize_failed("Invalid dimensions"));
    }
    let pm = state.inner().clone();
    pm.resize_pty(session_id, rows, cols)
}

/// Exposes `ProcessManager::kill_session` to the frontend.
/// Gracefully terminates the PTY session (SIGTERM, then SIGKILL after 3s).
#[tauri::command]
pub async fn kill_session(
    state: State<'_, ProcessManager>,
    session_id: u32,
) -> Result<(), PtyError> {
    let pm = state.inner().clone();
    pm.kill_session(session_id).await
}
