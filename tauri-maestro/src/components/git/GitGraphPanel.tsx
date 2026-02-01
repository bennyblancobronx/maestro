import { GitFork, X } from "lucide-react";

interface GitGraphPanelProps {
  open: boolean;
  onClose: () => void;
  commitCount?: number;
}

export function GitGraphPanel({ open, onClose, commitCount = 0 }: GitGraphPanelProps) {
  return (
    <aside
      aria-hidden={!open}
      tabIndex={open ? undefined : -1}
      {...(!open ? ({ inert: "" } as { inert: "" }) : {})}
      className={`relative z-30 flex flex-col border-l border-maestro-border bg-maestro-surface transition-all duration-200 overflow-hidden ${
        open ? "w-72" : "w-0 border-l-0"
      }`}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-maestro-border px-3">
        <div className="flex items-center gap-2">
          <GitFork size={14} className="text-maestro-muted" />
          <span className="text-sm font-medium text-maestro-text">Commits</span>
          <span className="rounded-full bg-maestro-accent/15 px-1.5 py-px text-[10px] font-medium text-maestro-accent">
            {commitCount}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          tabIndex={open ? 0 : -1}
          className="rounded p-1 text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text"
          aria-label="Close git panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <div className="flex flex-col items-center gap-3">
          <GitFork size={32} className="animate-breathe text-maestro-muted/30" strokeWidth={1} />
          <p className="text-xs text-maestro-muted/60">Open a git repository to view commits</p>
        </div>
      </div>
    </aside>
  );
}
