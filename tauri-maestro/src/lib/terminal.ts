/**
 * Thin wrappers around Tauri `invoke` / `listen` for PTY session management.
 *
 * Each function maps 1:1 to a Rust `#[tauri::command]` handler. Errors are
 * propagated as rejected promises; callers are responsible for catch/logging.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Spawns a new PTY shell session on the backend.
 * @param cwd - Starting working directory; when omitted the backend uses its default.
 * @returns The numeric session ID assigned by the backend.
 */
export async function spawnShell(cwd?: string): Promise<number> {
  return invoke<number>("spawn_shell", { cwd: cwd ?? null });
}

/** Writes raw bytes to the PTY stdin of the given session. */
export async function writeStdin(sessionId: number, data: string): Promise<void> {
  return invoke("write_stdin", { sessionId, data });
}

/** Notifies the backend PTY of a terminal dimension change (rows x cols). */
export async function resizePty(sessionId: number, rows: number, cols: number): Promise<void> {
  return invoke("resize_pty", { sessionId, rows, cols });
}

/** Terminates the backend PTY process and cleans up the session. */
export async function killSession(sessionId: number): Promise<void> {
  return invoke("kill_session", { sessionId });
}

/**
 * Subscribes to the per-session `pty-output-{sessionId}` Tauri event.
 * Returns a promise that resolves to an unlisten function. The caller must
 * invoke the unlisten function on cleanup to avoid leaked event listeners.
 */
export function onPtyOutput(
  sessionId: number,
  callback: (data: string) => void,
): Promise<UnlistenFn> {
  return listen<string>(`pty-output-${sessionId}`, (event) => {
    callback(event.payload);
  });
}
