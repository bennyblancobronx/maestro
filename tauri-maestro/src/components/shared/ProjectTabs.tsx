import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, PanelLeft, Plus, Square, X } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

export type ProjectTab = {
  id: string;
  name: string;
  active: boolean;
};

interface ProjectTabsProps {
  tabs: ProjectTab[];
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

/** Derive a status-dot color class from tab state. */
function statusDotColor(tab: ProjectTab): string {
  // TODO: derive from real tab status once WorkspaceTab carries a status field
  return tab.active ? "bg-maestro-green" : "bg-maestro-muted";
}

export function ProjectTabs({
  tabs,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onToggleSidebar,
  sidebarOpen,
}: ProjectTabsProps) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const setTabRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      tabRefs.current.set(id, el);
    } else {
      tabRefs.current.delete(id);
    }
  }, []);

  return (
    <div
      data-tauri-drag-region
      className="theme-transition no-select flex h-9 items-center border-b border-maestro-border bg-maestro-surface"
    >
      {/* Left: sidebar toggle + tabs */}
      <div className="flex items-center gap-0.5 px-1.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={`rounded p-1.5 transition-colors ${
            sidebarOpen
              ? "text-maestro-accent hover:bg-maestro-accent/10"
              : "text-maestro-muted hover:bg-maestro-border hover:text-maestro-text"
          }`}
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={14} />
        </button>

        <div className="mx-1 h-4 w-px bg-maestro-border" />

        <div role="tablist" aria-label="Open projects" className="flex items-center gap-0.5">
          {tabs.length === 0 ? (
            <span className="px-2 text-xs text-maestro-muted">No projects</span>
          ) : (
            tabs.map((tab) => (
              <div
                key={tab.id}
                ref={(el) => setTabRef(tab.id, el)}
                role="tab"
                aria-selected={tab.active}
                tabIndex={tab.active ? 0 : -1}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    const idx = tabs.findIndex((t) => t.id === tab.id);
                    const next = tabs[(idx + 1) % tabs.length];
                    if (next) {
                      onSelectTab(next.id);
                      tabRefs.current.get(next.id)?.focus();
                    }
                  } else if (e.key === "ArrowLeft") {
                    const idx = tabs.findIndex((t) => t.id === tab.id);
                    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
                    if (prev) {
                      onSelectTab(prev.id);
                      tabRefs.current.get(prev.id)?.focus();
                    }
                  } else if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTab(tab.id);
                  }
                }}
                className={`flex items-center gap-1.5 rounded-t px-2 py-1.5 text-xs font-medium cursor-pointer ${
                  tab.active
                    ? "bg-maestro-bg text-maestro-text"
                    : "text-maestro-muted hover:text-maestro-text"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${statusDotColor(tab)}`} />
                  <span>{tab.name}</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="ml-1 rounded p-0.5 hover:bg-maestro-border"
                  aria-label={`Close ${tab.name}`}
                >
                  <X size={10} />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={onNewTab}
          className="rounded p-1 text-maestro-muted hover:bg-maestro-border hover:text-maestro-text"
          aria-label="Open new project"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Center: drag region fills remaining space */}
      <div data-tauri-drag-region className="flex-1" />

      {/* Right: window controls */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => appWindow.minimize()}
          className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-muted/10 hover:text-maestro-text"
          aria-label="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={() => appWindow.toggleMaximize()}
          className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-muted/10 hover:text-maestro-text"
          aria-label="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          type="button"
          onClick={() => appWindow.close()}
          className="flex h-9 w-11 items-center justify-center text-maestro-muted transition-colors hover:bg-maestro-red/80 hover:text-white"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
