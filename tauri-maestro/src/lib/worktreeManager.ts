import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";

/** Worktree info from the backend. */
export interface WorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  is_bare: boolean;
}

/**
 * Generates a hash from a string for creating unique worktree paths.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}

/**
 * Sanitizes a branch name for use in filesystem paths.
 */
function sanitizeBranch(branch: string): string {
  return branch.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Gets the base directory for worktrees.
 * Uses ~/.claude-maestro/worktrees/
 */
async function getWorktreeBaseDir(): Promise<string> {
  const home = await homeDir();
  return `${home}.claude-maestro/worktrees`;
}

/**
 * Calculates the worktree path for a given repo and branch.
 *
 * Path format: ~/.claude-maestro/worktrees/{repoHash}/{sanitizedBranch}/
 *
 * @param repoPath - The path to the main repository
 * @param branch - The branch name
 * @returns The worktree path
 */
export async function getWorktreePath(repoPath: string, branch: string): Promise<string> {
  const baseDir = await getWorktreeBaseDir();
  const repoHash = hashString(repoPath);
  const sanitizedBranch = sanitizeBranch(branch);
  return `${baseDir}/${repoHash}/${sanitizedBranch}`;
}

/**
 * Creates a worktree for a session on a specific branch.
 *
 * If the worktree already exists for this branch, returns its path.
 * If a new branch is needed, creates it from the current HEAD.
 *
 * @param repoPath - The path to the main repository
 * @param sessionId - The session ID (for logging)
 * @param branch - The branch to checkout in the worktree
 * @param createBranch - Whether to create a new branch (default: false)
 * @returns The worktree path
 */
export async function createSessionWorktree(
  repoPath: string,
  sessionId: number,
  branch: string,
  createBranch = false
): Promise<string> {
  const worktreePath = await getWorktreePath(repoPath, branch);

  try {
    // Check if worktree already exists
    const existingWorktrees = await invoke<WorktreeInfo[]>("git_worktree_list", {
      repoPath,
    });

    const existing = existingWorktrees.find((wt) => wt.path === worktreePath);
    if (existing) {
      console.log(`[Session ${sessionId}] Worktree already exists at ${worktreePath}`);
      return worktreePath;
    }

    // Create the worktree
    const result = await invoke<WorktreeInfo>("git_worktree_add", {
      repoPath,
      path: worktreePath,
      newBranch: createBranch ? branch : null,
      checkoutRef: createBranch ? null : branch,
    });

    console.log(`[Session ${sessionId}] Created worktree at ${result.path} on branch ${result.branch}`);
    return result.path;
  } catch (err) {
    console.error(`[Session ${sessionId}] Failed to create worktree:`, err);
    throw err;
  }
}

/**
 * Removes a worktree associated with a session.
 *
 * @param repoPath - The path to the main repository
 * @param worktreePath - The worktree path to remove
 * @param force - Whether to force removal even with uncommitted changes
 */
export async function removeSessionWorktree(
  repoPath: string,
  worktreePath: string,
  force = false
): Promise<void> {
  try {
    await invoke("git_worktree_remove", {
      repoPath,
      path: worktreePath,
      force,
    });
    console.log(`Removed worktree at ${worktreePath}`);
  } catch (err) {
    console.error(`Failed to remove worktree at ${worktreePath}:`, err);
    throw err;
  }
}

/**
 * Lists all worktrees for a repository.
 *
 * @param repoPath - The path to the main repository
 * @returns List of worktree info
 */
export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>("git_worktree_list", { repoPath });
}

/**
 * Checks if a worktree exists for a given branch.
 *
 * @param repoPath - The path to the main repository
 * @param branch - The branch name to check
 * @returns True if a worktree exists for this branch
 */
export async function worktreeExistsForBranch(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.some((wt) => wt.branch === branch);
}

/**
 * Gets the worktree info for a specific branch if it exists.
 *
 * @param repoPath - The path to the main repository
 * @param branch - The branch name
 * @returns Worktree info or null if not found
 */
export async function getWorktreeForBranch(
  repoPath: string,
  branch: string
): Promise<WorktreeInfo | null> {
  const worktrees = await listWorktrees(repoPath);
  return worktrees.find((wt) => wt.branch === branch) ?? null;
}
