import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";

/** AI provider variants supported by the backend orchestrator. */
export type AiMode = "Claude" | "Gemini" | "Codex" | "Plain";

/**
 * Backend-emitted session lifecycle states.
 * Must stay in sync with the Rust `SessionStatus` enum.
 */
export type BackendSessionStatus =
  | "Starting"
  | "Idle"
  | "Working"
  | "NeedsInput"
  | "Done"
  | "Error";

/**
 * Mirrors the Rust `SessionConfig` struct returned by `get_sessions`.
 *
 * @property id - Unique numeric session ID assigned by the backend.
 * @property branch - Git branch the session operates on, or null for the default branch.
 * @property worktree_path - Filesystem path to the git worktree, if one was created.
 */
export interface SessionConfig {
  id: number;
  mode: AiMode;
  branch: string | null;
  status: BackendSessionStatus;
  worktree_path: string | null;
}

/** Shape of the Tauri `session-status-changed` event payload. */
interface SessionStatusPayload {
  session_id: number;
  status: BackendSessionStatus;
}

/**
 * Zustand store slice for session metadata (not PTY I/O -- that lives in terminal.ts).
 *
 * @property sessions - Authoritative list of sessions fetched from the backend.
 * @property fetchSessions - Performs a one-shot IPC fetch to replace the session list.
 * @property initListeners - Subscribes to the global `session-status-changed` Tauri event.
 *   Returns an unlisten function; callers must invoke the cleanup to decrement
 *   a reference count and remove the listener when the last subscriber exits.
 */
interface SessionState {
  sessions: SessionConfig[];
  isLoading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  initListeners: () => Promise<UnlistenFn>;
}

/**
 * Global session store. Not persisted — sessions are ephemeral and
 * re-fetched from the backend on app launch via `fetchSessions`.
 */
let listenerCount = 0;
let pendingInit: Promise<void> | null = null;
let activeUnlisten: UnlistenFn | null = null;

export const useSessionStore = create<SessionState>()((set) => ({
  sessions: [],
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await invoke<SessionConfig[]>("get_sessions");
      set({ sessions, isLoading: false });
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
      set({ error: String(err), isLoading: false });
    }
  },

  initListeners: async () => {
    listenerCount += 1;
    try {
      if (!activeUnlisten) {
        if (!pendingInit) {
          pendingInit = listen<SessionStatusPayload>("session-status-changed", (event) => {
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.id === event.payload.session_id ? { ...s, status: event.payload.status } : s,
              ),
            }));
          })
            .then((unlisten) => {
              activeUnlisten = unlisten;
            })
            .finally(() => {
              pendingInit = null;
            });
        }
        await pendingInit;
      }
    } catch (err) {
      listenerCount = Math.max(0, listenerCount - 1);
      throw err;
    }

    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      if (listenerCount === 0 && activeUnlisten) {
        activeUnlisten();
        activeUnlisten = null;
      }
    };
  },
}));
