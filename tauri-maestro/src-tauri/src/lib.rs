mod commands;
mod core;
mod git;

use core::ProcessManager;
use core::session_manager::SessionManager;
use core::worktree_manager::WorktreeManager;

/// Entry point for the Tauri application.
///
/// Registers plugins (store, dialog), injects shared state (ProcessManager,
/// SessionManager, WorktreeManager), verifies git availability at startup
/// (non-fatal -- logs an error but does not abort), and mounts all IPC
/// command handlers for the terminal, git, and session subsystems.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(ProcessManager::new())
        .manage(SessionManager::new())
        .manage(WorktreeManager::new())
        .setup(|_app| {
            // Verify git is available at startup (non-blocking with timeout)
            tauri::async_runtime::spawn(async {
                match tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    verify_git_available(),
                )
                .await
                {
                    Ok(Ok(version)) => log::info!("Git available: {version}"),
                    Ok(Err(e)) => log::error!("Git not found: {e}. Git operations will fail."),
                    Err(_) => log::error!("Git version check timed out after 5s"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // PTY commands (existing)
            commands::terminal::spawn_shell,
            commands::terminal::write_stdin,
            commands::terminal::resize_pty,
            commands::terminal::kill_session,
            // Git commands (new)
            commands::git::git_branches,
            commands::git::git_current_branch,
            commands::git::git_uncommitted_count,
            commands::git::git_worktree_list,
            commands::git::git_worktree_add,
            commands::git::git_worktree_remove,
            commands::git::git_commit_log,
            // Session commands (new)
            commands::session::get_sessions,
            commands::session::create_session,
            commands::session::update_session_status,
            commands::session::assign_session_branch,
            commands::session::remove_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Maestro");
}

async fn verify_git_available() -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .arg("--version")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        Err("git --version returned non-zero".to_string())
    }
}
