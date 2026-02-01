import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { killSession } from "@/lib/terminal";
import { useOpenProject } from "@/lib/useOpenProject";
import { useSessionStore } from "@/stores/useSessionStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { GitGraphPanel } from "./components/git/GitGraphPanel";
import { BottomBar } from "./components/shared/BottomBar";
import { FloatingAddButton } from "./components/shared/FloatingAddButton";
import { IdleLandingView } from "./components/shared/IdleLandingView";
import { TopBar } from "./components/shared/TopBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { SessionPodGrid } from "./components/terminal/SessionPodGrid";
import { TerminalGrid, type TerminalGridHandle } from "./components/terminal/TerminalGrid";

const DEFAULT_SESSION_COUNT = 6;

type Theme = "dark" | "light";
type AppState = "no-project" | "project-idle" | "sessions-active";

function isValidTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

function App() {
  const tabs = useWorkspaceStore((s) => s.tabs);
  const fetchSessions = useSessionStore((s) => s.fetchSessions);
  const initListeners = useSessionStore((s) => s.initListeners);
  const handleOpenProject = useOpenProject();
  const termGridRef = useRef<TerminalGridHandle>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [sessionsLaunched, setSessionsLaunched] = useState(false);
  const [liveSessionCount, setLiveSessionCount] = useState(0);
  const [currentBranch, setCurrentBranch] = useState<string | undefined>(undefined);
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("maestro-theme");
    return isValidTheme(stored) ? stored : "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("maestro-theme", theme);
  }, [theme]);

  // Initialize session store: fetch initial state and subscribe to events
  useEffect(() => {
    fetchSessions().catch((err) => {
      console.error("Failed to fetch sessions:", err);
    });

    const unlistenPromise = initListeners().catch((err) => {
      console.error("Failed to initialize listeners:", err);
      return () => {}; // no-op cleanup
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [fetchSessions, initListeners]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  const activeTab = tabs.find((tab) => tab.active) ?? null;
  const activeProjectPath = activeTab?.projectPath;

  useEffect(() => {
    let cancelled = false;
    if (!activeProjectPath) {
      setCurrentBranch(undefined);
      return () => {};
    }
    invoke<string>("git_current_branch", { repoPath: activeProjectPath })
      .then((branch) => {
        if (!cancelled) setCurrentBranch(branch);
      })
      .catch((err) => {
        console.error("Failed to load current branch:", err);
        if (!cancelled) setCurrentBranch(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectPath]);

  // Derive app state
  const appState: AppState = !activeTab
    ? "no-project"
    : !sessionsLaunched
      ? "project-idle"
      : "sessions-active";

  // Handler to launch a session (transitions project-idle → sessions-active)
  const handleAddSession = () => {
    setSessionsLaunched(true);
  };

  const handleSessionCountChange = useCallback((count: number) => {
    setLiveSessionCount(count);
  }, []);

  // Reset sessions-launched when switching away from a project
  useEffect(() => {
    if (!activeTab) {
      setSessionsLaunched(false);
      setLiveSessionCount(0);
    }
  }, [activeTab]);

  return (
    <div className="flex h-screen w-screen bg-maestro-bg">
      {/* Sidebar — full height, left edge */}
      <Sidebar
        collapsed={!sidebarOpen}
        onCollapse={() => setSidebarOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Right column: top bar + content + bottom bar */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          branchName={currentBranch}
          repoPath={activeTab ? activeTab.projectPath : undefined}
          onToggleGitPanel={() => setGitPanelOpen((prev) => !prev)}
          gitPanelOpen={gitPanelOpen}
        />

        {/* Content area (main + optional git panel) */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <main className="relative flex-1 overflow-hidden bg-maestro-bg">
            {appState === "no-project" && <SessionPodGrid sessionCount={DEFAULT_SESSION_COUNT} />}
            {appState === "project-idle" && <IdleLandingView onAdd={handleAddSession} />}
            {appState === "sessions-active" && activeTab && (
              <TerminalGrid
                ref={termGridRef}
                key={activeTab.id}
                projectPath={activeTab.projectPath}
                onSessionCountChange={handleSessionCountChange}
              />
            )}
          </main>

          {/* Git graph panel (optional right side) */}
          <GitGraphPanel open={gitPanelOpen} onClose={() => setGitPanelOpen(false)} />
        </div>

        {/* Bottom action bar */}
        <div className="bg-maestro-bg">
          <BottomBar
            sessionsActive={sessionsLaunched}
            sessionCount={liveSessionCount}
            onSelectDirectory={handleOpenProject}
            onLaunchAll={handleAddSession}
            onStopAll={async () => {
              // Kill all running sessions via the session store
              const sessions = useSessionStore.getState().sessions;
              const results = await Promise.allSettled(sessions.map((s) => killSession(s.id)));
              for (const result of results) {
                if (result.status === "rejected") {
                  console.error("Failed to stop session:", result.reason);
                }
              }
              setSessionsLaunched(false);
              setLiveSessionCount(0);
            }}
          />
        </div>
      </div>

      {/* Floating add session button (only when sessions active and below max) */}
      {appState === "sessions-active" && liveSessionCount < DEFAULT_SESSION_COUNT && (
        <FloatingAddButton onClick={() => termGridRef.current?.addSession()} />
      )}
    </div>
  );
}

export default App;
