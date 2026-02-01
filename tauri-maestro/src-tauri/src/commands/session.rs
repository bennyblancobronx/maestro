use tauri::State;

use crate::core::session_manager::{AiMode, SessionConfig, SessionManager, SessionStatus};

/// Exposes `SessionManager::all_sessions` to the frontend.
/// Returns a snapshot of all active sessions in arbitrary order.
#[tauri::command]
pub async fn get_sessions(state: State<'_, SessionManager>) -> Result<Vec<SessionConfig>, String> {
    Ok(state.all_sessions())
}

/// Exposes `SessionManager::create_session` to the frontend.
/// Registers a new session with `Starting` status. Returns an error if the
/// session ID already exists.
#[tauri::command]
pub async fn create_session(
    state: State<'_, SessionManager>,
    id: u32,
    mode: AiMode,
) -> Result<SessionConfig, String> {
    state.create_session(id, mode)
        .map_err(|existing| format!("Session {} already exists", existing.id))
}

/// Exposes `SessionManager::update_status` to the frontend.
/// Returns `false` if the session does not exist (no error raised).
#[tauri::command]
pub async fn update_session_status(
    state: State<'_, SessionManager>,
    session_id: u32,
    status: SessionStatus,
) -> Result<bool, String> {
    Ok(state.update_status(session_id, status))
}

/// Exposes `SessionManager::assign_branch` to the frontend.
/// Links a session to a branch and optional worktree path. Returns an error
/// string if the session does not exist.
#[tauri::command]
pub async fn assign_session_branch(
    state: State<'_, SessionManager>,
    session_id: u32,
    branch: String,
    worktree_path: Option<String>,
) -> Result<SessionConfig, String> {
    state
        .assign_branch(session_id, branch, worktree_path)
        .ok_or_else(|| format!("Session {} not found", session_id))
}

/// Exposes `SessionManager::remove_session` to the frontend.
/// Returns the removed session config, or `None` if it was not found.
#[tauri::command]
pub async fn remove_session(
    state: State<'_, SessionManager>,
    session_id: u32,
) -> Result<Option<SessionConfig>, String> {
    Ok(state.remove_session(session_id))
}
