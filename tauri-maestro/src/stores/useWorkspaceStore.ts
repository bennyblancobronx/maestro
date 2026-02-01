import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// --- Types ---

/**
 * Represents a single open project tab in the workspace sidebar.
 *
 * @property id - Random UUID generated on creation; stable across persisted sessions.
 * @property projectPath - Absolute filesystem path; used as the dedup key in `openProject`.
 * @property active - Exactly one tab should be active at a time; enforced by store actions.
 */
export type WorkspaceTab = {
  id: string;
  name: string;
  projectPath: string;
  active: boolean;
};

/** Read-only slice of the workspace store; persisted to disk via Zustand `persist`. */
type WorkspaceState = {
  tabs: WorkspaceTab[];
};

/**
 * Mutating actions for workspace tab management.
 * All actions are synchronous and trigger a Zustand persist write-through
 * to the Tauri LazyStore (async, fire-and-forget).
 */
type WorkspaceActions = {
  openProject: (path: string) => void;
  selectTab: (id: string) => void;
  closeTab: (id: string) => void;
};

// --- Tauri LazyStore-backed StateStorage adapter ---

/**
 * Singleton LazyStore instance pointing to `store.json` in the Tauri app-data dir.
 * LazyStore lazily initialises the underlying file on first read/write.
 */
const lazyStore = new LazyStore("store.json");

/**
 * Zustand-compatible {@link StateStorage} adapter backed by the Tauri plugin-store.
 *
 * Each `setItem`/`removeItem` call issues an explicit `save()` to flush to disk,
 * because LazyStore only writes on shutdown by default and data would be lost
 * if the app is force-quit.
 */
const tauriStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await lazyStore.get<string>(name);
      return value ?? null;
    } catch (err) {
      console.error(`tauriStorage.getItem("${name}") failed:`, err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await lazyStore.set(name, value);
      await lazyStore.save();
    } catch (err) {
      console.error(`tauriStorage.setItem("${name}") failed:`, err);
      throw err; // Let Zustand persist middleware handle it
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await lazyStore.delete(name);
      await lazyStore.save();
    } catch (err) {
      console.error(`tauriStorage.removeItem("${name}") failed:`, err);
      throw err; // Re-throw for consistency with setItem
    }
  },
};

// --- Helpers ---

/** Extracts the last path segment to use as a human-readable tab label. */
function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

// --- Store ---

/**
 * Global workspace store managing open project tabs.
 *
 * Uses Zustand `persist` middleware with a custom Tauri LazyStore-backed storage
 * adapter so tabs survive app restarts. Only the `tabs` array is persisted
 * (via `partialize`); actions are excluded.
 *
 * Key behaviors:
 * - `openProject` deduplicates by `projectPath` -- opening the same path twice
 *   simply activates the existing tab.
 * - `closeTab` auto-activates the first remaining tab when the closed tab was active.
 */
export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  persist(
    (set, get) => ({
      tabs: [],

      openProject: (path: string) => {
        const { tabs } = get();

        // Deduplicate: if path already open, just activate that tab
        const existing = tabs.find((t) => t.projectPath === path);
        if (existing) {
          set({
            tabs: tabs.map((t) => ({ ...t, active: t.id === existing.id })),
          });
          return;
        }

        const id = crypto.randomUUID();
        const name = basename(path);

        set({
          tabs: [
            ...tabs.map((t) => ({ ...t, active: false })),
            { id, name, projectPath: path, active: true },
          ],
        });
      },

      selectTab: (id: string) => {
        const { tabs } = get();
        if (!tabs.some((t) => t.id === id)) return;
        set({
          tabs: tabs.map((t) => ({ ...t, active: t.id === id })),
        });
      },

      closeTab: (id: string) => {
        const remaining = get().tabs.filter((t) => t.id !== id);

        if (remaining.length === 0) {
          set({ tabs: [] });
          return;
        }

        // If the closed tab was active, activate the first remaining tab
        const needsActivation = !remaining.some((t) => t.active);
        set({
          tabs: needsActivation
            ? remaining.map((t, i) => (i === 0 ? { ...t, active: true } : t))
            : remaining,
        });
      },
    }),
    {
      name: "maestro-workspace",
      storage: createJSONStorage(() => tauriStorage),
      partialize: (state) => ({ tabs: state.tabs }),
      version: 1,
    },
  ),
);
