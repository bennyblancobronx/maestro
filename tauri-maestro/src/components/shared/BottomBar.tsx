import { FolderOpen, Play, Square } from "lucide-react";

interface BottomBarProps {
  sessionsActive: boolean;
  sessionCount: number;
  onSelectDirectory: () => void;
  onLaunchAll: () => void;
  onStopAll: () => void;
}

export function BottomBar({
  sessionsActive,
  sessionCount,
  onSelectDirectory,
  onLaunchAll,
  onStopAll,
}: BottomBarProps) {
  return (
    <div className="no-select flex h-11 items-center justify-center gap-3 px-4">
      <button
        type="button"
        onClick={sessionsActive ? undefined : onSelectDirectory}
        disabled={sessionsActive}
        className={`flex items-center gap-2 rounded-lg border border-maestro-border bg-maestro-card px-4 py-1.5 text-xs font-medium shadow-md shadow-black/20 transition-colors ${
          sessionsActive
            ? "cursor-not-allowed text-maestro-muted/50 opacity-50"
            : "text-maestro-text hover:bg-maestro-border/50"
        }`}
      >
        <FolderOpen size={13} />
        Select Directory
      </button>

      {sessionsActive ? (
        <button
          type="button"
          onClick={onStopAll}
          className="flex items-center gap-2 rounded-lg bg-maestro-red/90 px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-black/20 transition-colors hover:bg-maestro-red"
        >
          <Square size={11} />
          Stop All
        </button>
      ) : (
        <button
          type="button"
          onClick={sessionCount > 0 ? onLaunchAll : undefined}
          disabled={sessionCount === 0}
          className="flex items-center gap-2 rounded-lg bg-maestro-accent px-4 py-1.5 text-xs font-medium text-white shadow-md shadow-black/20 transition-colors hover:bg-maestro-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play size={11} fill="currentColor" />
          {sessionCount === 0
            ? "Launch Sessions"
            : `Launch All ${sessionCount} ${sessionCount === 1 ? "Session" : "Sessions"}`}
        </button>
      )}
    </div>
  );
}
