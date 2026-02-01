import { invoke } from "@tauri-apps/api/core";
import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface BranchInfo {
  name: string;
  is_remote: boolean;
  is_current: boolean;
}

interface BranchDropdownProps {
  repoPath: string;
  currentBranch: string;
  onSelect: (branch: string) => void;
  onClose: () => void;
}

export function BranchDropdown({
  repoPath,
  currentBranch,
  onSelect,
  onClose,
}: BranchDropdownProps) {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<BranchInfo[]>("git_branches", { repoPath });
      if (!mountedRef.current) return;
      setBranches(result);
      const currentIdx = result.findIndex((b) => b.is_current);
      setFocusIndex(currentIdx >= 0 ? currentIdx : 0);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch branches:", err);
      if (!mountedRef.current) return;
      setBranches([]);
      setError(err instanceof Error ? err.message : "Failed to load branches");
      setLoading(false);
    }
  }, [repoPath]);

  // Fetch branches on mount
  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusIndex((prev) => (prev < branches.length - 1 ? prev + 1 : prev));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (focusIndex >= 0 && focusIndex < branches.length) {
            onSelect(branches[focusIndex].name);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [focusIndex, branches, onSelect, onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Bail out if the dropdown is no longer in the DOM (e.g. modal overlay)
      if (!dropdownRef.current || !document.contains(dropdownRef.current)) return;
      const activeEl = document.activeElement;
      const isDropdownFocused = dropdownRef.current.contains(activeEl as Node);
      const isBodyFocused = activeEl === document.body;
      const hasModal = Boolean(
        document.querySelector('[role="dialog"], [data-modal-open="true"], .modal, .overlay'),
      );
      if (isDropdownFocused || (isBodyFocused && !hasModal)) {
        handleKeyDown(e);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleKeyDown]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-branch-item]");
      items[focusIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusIndex]);

  return (
    <div
      ref={dropdownRef}
      className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-maestro-border bg-maestro-card shadow-xl shadow-black/30"
    >
      {/* Current branch header */}
      <div className="border-b border-maestro-border px-4 py-3">
        <span className="text-sm text-maestro-muted">Current: </span>
        <span className="text-sm text-maestro-muted">{currentBranch}</span>
      </div>

      {/* Switch to Branch */}
      <div className="px-4 pb-1 pt-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-maestro-muted/70">
          Switch to Branch
        </span>
      </div>

      {/* Branch list */}
      <div ref={listRef} className="max-h-64 overflow-y-auto px-1 pb-2">
        {branches.map((branch, i) => {
          const isCurrent = branch.is_current;
          const isFocused = i === focusIndex;

          return (
            <button
              type="button"
              key={branch.name}
              data-branch-item
              onClick={() => onSelect(branch.name)}
              onMouseEnter={() => setFocusIndex(i)}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                isFocused ? "bg-maestro-accent/20" : "hover:bg-maestro-border/30"
              }`}
            >
              <span className="w-4 shrink-0">
                {isCurrent && <Check size={12} className="text-maestro-accent" />}
              </span>
              <span
                className={`truncate ${
                  isCurrent
                    ? "font-semibold text-maestro-accent"
                    : "font-semibold text-maestro-text"
                }`}
              >
                {branch.name}
              </span>
              {branch.is_remote && (
                <span className="ml-auto text-[9px] text-maestro-muted/60">remote</span>
              )}
            </button>
          );
        })}
        {loading && <div className="px-3 py-2 text-sm text-maestro-muted">Loading branches...</div>}
        {!loading && error && (
          <div className="px-3 py-2 text-sm text-maestro-red">
            <div>Failed to load branches</div>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => fetchBranches()}
                className="rounded border border-maestro-border px-2 py-1 text-[11px] text-maestro-text hover:bg-maestro-border/40"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        {!loading && !error && branches.length === 0 && (
          <div className="px-3 py-2 text-sm text-maestro-muted">No branches found</div>
        )}
      </div>
    </div>
  );
}
