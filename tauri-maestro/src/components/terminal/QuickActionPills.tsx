import { AlertTriangle, Circle, Play, Wrench } from "lucide-react";

const ACTIONS = [
  { id: "run_app", label: "Run App", icon: Play, color: "text-maestro-green", fill: true },
  {
    id: "commit_push",
    label: "Commit & Push",
    icon: Circle,
    color: "text-maestro-accent",
    fill: true,
  },
  {
    id: "fix_errors",
    label: "Fix Errors",
    icon: AlertTriangle,
    color: "text-maestro-orange",
    fill: false,
  },
  {
    id: "lint_format",
    label: "Lint & Format",
    icon: Wrench,
    color: "text-maestro-purple",
    fill: false,
  },
] as const;

interface QuickActionPillsProps {
  onAction?: (id: string) => void;
}

export function QuickActionPills({ onAction }: QuickActionPillsProps) {
  return (
    <div className="no-select flex shrink-0 items-center gap-1 border-t border-maestro-border bg-maestro-surface px-2 py-1">
      {ACTIONS.map((a) => (
        <button
          type="button"
          key={a.id}
          disabled={!onAction}
          onClick={() => onAction?.(a.id)}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-maestro-muted transition-colors hover:bg-maestro-card hover:text-maestro-text${!onAction ? " opacity-50 cursor-not-allowed" : ""}`}
        >
          <a.icon size={9} className={a.color} {...(a.fill ? { fill: "currentColor" } : {})} />
          {a.label}
        </button>
      ))}
    </div>
  );
}
