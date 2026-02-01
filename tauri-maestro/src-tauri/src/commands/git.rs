use std::path::PathBuf;

use crate::git::{BranchInfo, CommitInfo, Git, GitError, WorktreeInfo};

/// Returns `Err(GitError::NotARepo)` if the given path string is empty.
fn validate_repo_path(repo_path: &str) -> Result<(), GitError> {
    if repo_path.is_empty() {
        return Err(GitError::NotARepo {
            path: PathBuf::from(""),
        });
    }
    Ok(())
}

/// Exposes `Git::list_branches` to the frontend.
/// Returns all local and remote branches (excluding HEAD pointer entries).
#[tauri::command]
pub async fn git_branches(repo_path: String) -> Result<Vec<BranchInfo>, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    git.list_branches().await
}

/// Exposes `Git::current_branch` to the frontend.
/// Returns the branch name, or a short commit hash if HEAD is detached.
#[tauri::command]
pub async fn git_current_branch(repo_path: String) -> Result<String, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    git.current_branch().await
}

/// Exposes `Git::uncommitted_count` to the frontend.
/// Returns the number of dirty files (staged + unstaged + untracked).
#[tauri::command]
pub async fn git_uncommitted_count(repo_path: String) -> Result<usize, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    git.uncommitted_count().await
}

/// Exposes `Git::worktree_list` to the frontend.
/// Returns all worktrees (including the main one) with path, HEAD, and branch info.
#[tauri::command]
pub async fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    git.worktree_list().await
}

/// Exposes `Git::worktree_add` to the frontend.
/// Creates a new worktree at `path`, optionally on a new branch from `checkout_ref`.
#[tauri::command]
pub async fn git_worktree_add(
    repo_path: String,
    path: String,
    new_branch: Option<String>,
    checkout_ref: Option<String>,
) -> Result<WorktreeInfo, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    let wt_path = PathBuf::from(&path);
    git.worktree_add(
        &wt_path,
        new_branch.as_deref(),
        checkout_ref.as_deref(),
    )
    .await
}

/// Exposes `Git::worktree_remove` to the frontend.
/// Removes a worktree directory; `force` bypasses uncommitted-changes checks.
#[tauri::command]
pub async fn git_worktree_remove(
    repo_path: String,
    path: String,
    force: bool,
) -> Result<(), GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    let wt_path = PathBuf::from(&path);
    git.worktree_remove(&wt_path, force).await
}

/// Exposes `Git::commit_log` to the frontend.
/// Returns up to `max_count` commits in topological order across all or current branch.
#[tauri::command]
pub async fn git_commit_log(
    repo_path: String,
    max_count: usize,
    all_branches: bool,
) -> Result<Vec<CommitInfo>, GitError> {
    validate_repo_path(&repo_path)?;
    let git = Git::new(&repo_path);
    git.commit_log(max_count, all_branches).await
}
