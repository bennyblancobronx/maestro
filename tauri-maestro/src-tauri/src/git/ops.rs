use serde::Serialize;
use std::path::Path;

use super::error::GitError;
use super::runner::Git;

/// A local or remote branch returned by `list_branches`.
///
/// Remote branches have `is_remote = true` and names like `origin/main`.
/// Synthetic `HEAD` pointer entries (e.g. `origin/HEAD`) are filtered out
/// during parsing and will never appear in results.
#[derive(Debug, Clone, Serialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_remote: bool,
    pub is_current: bool,
}

/// Metadata for a single git worktree, parsed from `git worktree list --porcelain`.
///
/// `branch` is `None` for detached HEAD states or bare repositories.
/// `head` contains the full commit SHA the worktree currently points to.
#[derive(Debug, Clone, Serialize)]
pub struct WorktreeInfo {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_bare: bool,
}

/// A single commit entry parsed from `git log` output.
///
/// `parent_hashes` is empty for root commits and contains multiple entries
/// for merge commits. `timestamp` is a Unix epoch value from `%at`.
/// `summary` is the first line of the commit message (`%s`).
#[derive(Debug, Clone, Serialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub parent_hashes: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub timestamp: i64,
    pub summary: String,
}

impl Git {
    /// Lists all local and remote branches, excluding `HEAD` pointer entries.
    ///
    /// Parses `git branch -a` with a custom format using `|` delimiters.
    /// Any branch name containing "HEAD" (e.g. `origin/HEAD`) is skipped to
    /// avoid exposing symbolic refs that confuse branch selectors in the UI.
    pub async fn list_branches(&self) -> Result<Vec<BranchInfo>, GitError> {
        let output = self
            .run(&[
                "branch",
                "-a",
                "--no-color",
                "--format=%(HEAD)|%(refname:short)|%(refname:rstrip=-2)",
            ])
            .await?;

        let mut branches = Vec::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.splitn(3, '|').collect();
            if parts.len() < 2 {
                continue;
            }
            let is_current = parts[0].trim() == "*";
            let name = parts[1].trim().to_string();

            // Skip HEAD pointer entries like "origin/HEAD"
            if name == "HEAD" || name.ends_with("/HEAD") {
                continue;
            }

            let is_remote = parts
                .get(2)
                .map(|r| r.trim() == "remotes")
                .unwrap_or(false);

            branches.push(BranchInfo {
                name,
                is_remote,
                is_current,
            });
        }
        Ok(branches)
    }

    /// Returns the name of the currently checked-out branch.
    ///
    /// Uses `symbolic-ref` first; if that fails (detached HEAD), falls back to
    /// `rev-parse --short HEAD` so the caller always gets a usable label.
    pub async fn current_branch(&self) -> Result<String, GitError> {
        match self.run(&["symbolic-ref", "--short", "HEAD"]).await {
            Ok(output) => Ok(output.trimmed().to_string()),
            Err(GitError::CommandFailed { code, stderr, .. }) => {
                // Git returns: "fatal: ref HEAD is not a symbolic ref"
                if stderr.contains("not a symbolic ref") {
                    // Detached HEAD — fall back to short hash
                    let output = self.run(&["rev-parse", "--short", "HEAD"]).await?;
                    Ok(output.trimmed().to_string())
                } else {
                    // Real error — propagate
                    Err(GitError::CommandFailed {
                        code,
                        stderr,
                        command: "git symbolic-ref --short HEAD".to_string(),
                    })
                }
            }
            Err(e) => Err(e), // Other errors (GitNotFound, SpawnError, etc.)
        }
    }

    /// Returns the number of uncommitted changes (staged + unstaged + untracked).
    ///
    /// Counts non-empty lines from `git status --porcelain`. Each line represents
    /// one changed file, so the count reflects individual file changes.
    pub async fn uncommitted_count(&self) -> Result<usize, GitError> {
        let output = self.run(&["status", "--porcelain"]).await?;
        Ok(output.lines().len())
    }

    /// Lists all worktrees by parsing `git worktree list --porcelain`.
    ///
    /// Porcelain format uses blank-line-separated stanzas with `worktree`, `HEAD`,
    /// `branch`, and `bare` fields. Detached worktrees will have `branch: None`.
    pub async fn worktree_list(&self) -> Result<Vec<WorktreeInfo>, GitError> {
        let output = self.run(&["worktree", "list", "--porcelain"]).await?;

        let mut worktrees = Vec::new();
        let mut current_path = String::new();
        let mut current_head = String::new();
        let mut current_branch: Option<String> = None;
        let mut current_bare = false;

        for line in output.lines() {
            if let Some(path) = line.strip_prefix("worktree ") {
                // Save previous entry if we have one
                if !current_path.is_empty() {
                    worktrees.push(WorktreeInfo {
                        path: current_path,
                        head: current_head,
                        branch: current_branch,
                        is_bare: current_bare,
                    });
                }
                current_path = path.to_string();
                current_head = String::new();
                current_branch = None;
                current_bare = false;
            } else if let Some(head) = line.strip_prefix("HEAD ") {
                current_head = head.to_string();
            } else if let Some(branch) = line.strip_prefix("branch refs/heads/") {
                current_branch = Some(branch.to_string());
            } else if line == "bare" {
                current_bare = true;
            }
        }

        // Push last entry
        if !current_path.is_empty() {
            worktrees.push(WorktreeInfo {
                path: current_path,
                head: current_head,
                branch: current_branch,
                is_bare: current_bare,
            });
        }

        Ok(worktrees)
    }

    /// Creates a new worktree at the given path, optionally on a new branch.
    ///
    /// If `new_branch` is provided, passes `-b <branch>` to create it.
    /// If `checkout_ref` is provided, the new worktree checks out that ref.
    /// After creation, reads back the HEAD and branch from the new worktree
    /// directory to return accurate metadata.
    pub async fn worktree_add(
        &self,
        path: &Path,
        new_branch: Option<&str>,
        checkout_ref: Option<&str>,
    ) -> Result<WorktreeInfo, GitError> {
        let path_str = path.to_string_lossy();
        let mut args = vec!["worktree", "add"];

        // Collect owned strings to extend their lifetime
        let branch_flag;
        if let Some(branch) = new_branch {
            branch_flag = branch.to_string();
            args.push("-b");
            args.push(&branch_flag);
        }

        args.push(&path_str);

        let checkout_ref_owned;
        if let Some(cr) = checkout_ref {
            checkout_ref_owned = cr.to_string();
            args.push(&checkout_ref_owned);
        }

        self.run(&args).await?;

        // Read back the created worktree info
        let head_output = self.run_in(path, &["rev-parse", "HEAD"]).await?;
        let branch_output = self.run_in(path, &["symbolic-ref", "--short", "HEAD"]).await;

        let branch = match branch_output {
            Ok(o) => Some(o.trimmed().to_string()),
            Err(GitError::CommandFailed { ref stderr, .. })
                if stderr.contains("not a symbolic reference") =>
            {
                None // Detached HEAD
            }
            Err(e) => {
                log::warn!("symbolic-ref in worktree {:?} failed unexpectedly: {e}", path);
                None
            }
        };

        Ok(WorktreeInfo {
            path: path.to_string_lossy().to_string(),
            head: head_output.trimmed().to_string(),
            branch,
            is_bare: false,
        })
    }

    /// Removes a worktree at the given path. Pass `force: true` to remove
    /// even if the worktree has uncommitted changes.
    pub async fn worktree_remove(&self, path: &Path, force: bool) -> Result<(), GitError> {
        let path_str = path.to_string_lossy().to_string();
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(&path_str);
        self.run(&args).await?;
        Ok(())
    }

    /// Prunes stale worktree references whose directories no longer exist on disk.
    pub async fn worktree_prune(&self) -> Result<(), GitError> {
        self.run(&["worktree", "prune"]).await?;
        Ok(())
    }

    /// Returns up to `max_count` commits in topological order.
    ///
    /// Parses a pipe-delimited `git log` format with 7 fields. Lines with fewer
    /// than 7 fields are silently skipped (e.g., malformed or empty repos).
    /// When `all_branches` is true, includes commits from all refs (`--all`).
    pub async fn commit_log(
        &self,
        max_count: usize,
        all_branches: bool,
    ) -> Result<Vec<CommitInfo>, GitError> {
        let count_str = format!("-{}", max_count);
        let mut args = vec![
            "log",
            "--format=%H|%h|%P|%an|%ae|%at|%s",
            &count_str,
            "--topo-order",
        ];
        if all_branches {
            args.push("--all");
        }

        let output = self.run(&args).await?;

        let mut commits = Vec::new();
        for line in output.lines() {
            let parts: Vec<&str> = line.splitn(7, '|').collect();
            if parts.len() < 7 {
                continue;
            }

            let timestamp = parts[5].parse::<i64>().unwrap_or(0);
            let parent_hashes: Vec<String> = if parts[2].is_empty() {
                Vec::new()
            } else {
                parts[2].split(' ').map(|s| s.to_string()).collect()
            };

            commits.push(CommitInfo {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                parent_hashes,
                author_name: parts[3].to_string(),
                author_email: parts[4].to_string(),
                timestamp,
                summary: parts[6].to_string(),
            });
        }

        Ok(commits)
    }
}
