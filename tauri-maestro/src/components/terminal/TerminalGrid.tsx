import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { killSession, spawnShell } from "@/lib/terminal";
import { TerminalView } from "./TerminalView";

/** Hard ceiling on concurrent PTY sessions per grid to bound resource usage. */
const MAX_SESSIONS = 6;

/**
 * Returns Tailwind grid-cols/grid-rows classes that produce a compact layout
 * for the given session count (1x1, 2x1, 3x1, 2x2, 3x2, etc.).
 */
function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) return "grid-cols-2 grid-rows-1";
  if (count === 3) return "grid-cols-3 grid-rows-1";
  if (count === 4) return "grid-cols-2 grid-rows-2";
  if (count <= 6) return "grid-cols-3 grid-rows-2";
  if (count <= 9) return "grid-cols-3 grid-rows-3";
  if (count <= 12) return "grid-cols-4 grid-rows-3";
  return "grid-cols-4";
}

/**
 * Imperative handle exposed via `useImperativeHandle` so parent components
 * (e.g. a toolbar button) can add sessions without lifting state up.
 */
export interface TerminalGridHandle {
  addSession: () => void;
}

/**
 * @property projectPath - Working directory passed to `spawnShell`; when absent the backend
 *   uses its own default cwd.
 * @property onSessionCountChange - Fires whenever the session array length changes,
 *   letting parents update badge counts or toolbar state.
 */
interface TerminalGridProps {
  projectPath?: string;
  onSessionCountChange?: (count: number) => void;
}

/**
 * Manages a dynamic grid of {@link TerminalView} cells backed by PTY sessions.
 *
 * Lifecycle:
 * - On mount, spawns a single shell and stores its ID. If the effect is
 *   cancelled before the spawn resolves (React Strict Mode double-mount),
 *   the session is killed immediately to avoid orphaned PTYs.
 * - `sessionsRef` is kept in sync with state so the unmount cleanup can
 *   kill all live sessions without stale closure issues.
 * - When all sessions are killed by the user (length drops to 0 after
 *   initial mount), an auto-respawn effect creates a fresh session so
 *   the user is never left with an empty grid.
 * - `addSession` double-checks MAX_SESSIONS inside the setState updater
 *   to guard against race conditions from rapid clicks.
 */
export const TerminalGrid = forwardRef<TerminalGridHandle, TerminalGridProps>(function TerminalGrid(
  { projectPath, onSessionCountChange },
  ref,
) {
  const [sessions, setSessions] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sessionsRef = useRef<number[]>([]);
  const mounted = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    sessionsRef.current = sessions;
    onSessionCountChange?.(sessions.length);
  }, [sessions, onSessionCountChange]);

  useEffect(() => {
    let cancelled = false;

    spawnShell(projectPath)
      .then((id) => {
        if (!cancelled) {
          setSessions([id]);
          mounted.current = true;
        } else {
          killSession(id).catch(console.error);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setError("Failed to start terminal session");
        }
      });

    return () => {
      cancelled = true;
      mounted.current = false;
      isMountedRef.current = false;
      for (const id of sessionsRef.current) {
        killSession(id).catch(console.error);
      }
    };
  }, [projectPath]);

  // Auto-respawn when all sessions close (not initial mount, not error)
  useEffect(() => {
    let cancelled = false;
    if (sessions.length === 0 && mounted.current && !error) {
      spawnShell(projectPath)
        .then((id) => {
          if (!cancelled) setSessions([id]);
          else killSession(id).catch(console.error);
        })
        .catch((err) => {
          console.error(err);
          if (!cancelled) setError("Failed to restart terminal session");
        });
    }
    return () => {
      cancelled = true;
    };
  }, [sessions.length, error, projectPath]);

  const handleKill = useCallback((sessionId: number) => {
    setSessions((prev) => prev.filter((id) => id !== sessionId));
  }, []);

  const addSession = useCallback(() => {
    if (sessionsRef.current.length >= MAX_SESSIONS) return;
    spawnShell(projectPath)
      .then((id) =>
        setSessions((prev) => {
          if (prev.length >= MAX_SESSIONS) {
            killSession(id).catch(console.error);
            return prev;
          }
          return [...prev, id];
        }),
      )
      .catch(console.error);
  }, [projectPath]);

  useImperativeHandle(ref, () => ({ addSession }), [addSession]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-maestro-muted">
        <span className="text-sm text-maestro-red">{error}</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            spawnShell(projectPath)
              .then((id) => {
                if (!isMountedRef.current) {
                  killSession(id).catch(console.error);
                  return;
                }
                mounted.current = true;
                setSessions([id]);
              })
              .catch((err) => {
                console.error(err);
                if (isMountedRef.current) {
                  setError("Failed to start terminal session");
                }
              });
          }}
          className="rounded bg-maestro-border px-3 py-1.5 text-xs text-maestro-text hover:bg-maestro-muted/20"
        >
          Retry
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-maestro-muted text-sm">
        Starting terminal...
      </div>
    );
  }

  return (
    <div className={`grid h-full ${gridClass(sessions.length)} gap-2 bg-maestro-bg p-2`}>
      {sessions.map((id) => (
        <TerminalView key={id} sessionId={id} onKill={handleKill} />
      ))}
    </div>
  );
});
