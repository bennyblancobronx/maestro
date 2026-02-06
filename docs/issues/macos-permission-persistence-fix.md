# Fix: macOS permission requests loop for external/network drives

## Status: IMPLEMENTED

PR #103 was closed. This document describes the simpler, production-ready approach that was implemented.

---

## What was wrong

The original PR #103 implemented security-scoped bookmarks, but the reviewer correctly identified that:
1. Security-scoped bookmarks require the app sandbox
2. Sandboxing breaks Maestro's core functionality (PTY spawning, Git execution, MCP servers)
3. The implementation had bugs (CFURL memory leak, bookmarks never activated)

## Why the fix works

External drives and network mounts are NOT TCC-protected - they work fine for unsandboxed apps. The only locations that need Full Disk Access are TCC-protected folders in the user's home directory (Desktop, Documents, Downloads).

The fix:
1. Stays unsandboxed (no entitlements changes)
2. Detects TCC-protected paths using proper pattern matching
3. Checks FDA status via `tauri-plugin-macos-permissions`
4. Shows a dialog with retry capability when FDA is needed
5. External drives and network mounts bypass all checks

---

## PR #103 Comment (Posted)

```
Thanks for the thorough review. You identified the fundamental issue I missed: security-scoped bookmarks require the app sandbox, but sandboxing breaks Maestro's core functionality (PTY spawning, Git execution, MCP server management).

After digging into this, I found that the permission prompts users were experiencing come from the sandbox itself, not from macOS TCC. External drives and network mounts are not TCC-protected locations. An unsandboxed app can access them directly without special handling.

The correct fix is much simpler:
1. Stay unsandboxed (no entitlements.plist changes needed for sandbox)
2. Use `tauri-plugin-macos-permissions` to check/request Full Disk Access for TCC-protected locations (Desktop, Documents, Downloads)
3. Store user-selected project paths in preferences (just the paths, not bookmarks)
4. Show a helpful re-authorization dialog if access fails after system changes

This eliminates ~800 lines of bookmark FFI code in favor of ~50 lines using an existing plugin.

Closing this PR. Will open a new one with the simpler approach.

References:
- [Apple: Accessing files from the macOS App Sandbox](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox) - bookmarks only work in sandboxed apps
- [Mother's Ruin: URL Bookmarks and Security-scoping](https://www.mothersruin.com/software/Archaeology/reverse/bookmarks.html) - deep dive on ScopedBookmarkAgent internals
- [tauri-plugin-macos-permissions](https://github.com/ayangweb/tauri-plugin-macos-permissions) - the simpler solution
```

---

## New PR: Implementation Details

### Title
`fix(macos): request Full Disk Access for TCC-protected locations`

### Description
```
Fixes repeated permission prompts when opening projects in TCC-protected locations.

## What was wrong
The original approach (PR #103) used security-scoped bookmarks, which require sandboxing.
Sandboxing breaks Maestro's core functionality (PTY, Git, MCP).

## Why the fix works
External drives and network mounts are NOT TCC-protected. Only ~/Desktop, ~/Documents,
~/Downloads need Full Disk Access. This PR detects those paths and prompts for FDA only
when needed.

## Solution
- Add `tauri-plugin-macos-permissions` (Rust + JS) to check/request FDA
- Proper path detection: `/Volumes/*` always bypasses, `/Users/*/Desktop|Documents|Downloads` triggers FDA
- Dialog shows the specific path that needs access
- "I've Granted Access" button re-checks FDA without dismissing
- "Don't ask again" stores preference in localStorage
- No sandbox, no bookmarks, no FFI, no memory management

## Testing
- [ ] Open project in ~/Documents - prompts for FDA if not granted
- [ ] Open project on external USB - works without prompts
- [ ] Open project on network mount (SMB/NFS) - works without prompts
- [ ] Grant FDA, click "I've Granted Access" - opens project
- [ ] Grant FDA, restart app - no re-prompts
```

---

## Files Changed

### Rust (src-tauri/)

**Cargo.toml** - Added macOS-only dependency:
```toml
[target.'cfg(target_os = "macos")'.dependencies]
tauri-plugin-macos-permissions = "2.1"
```

**src/lib.rs** - Register plugin conditionally:
```rust
let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_dialog::init());

#[cfg(target_os = "macos")]
{
    builder = builder.plugin(tauri_plugin_macos_permissions::init());
}

builder
    .manage(...)
    // ...
```

### TypeScript (src/)

**package.json** - Added npm dependency:
```json
"tauri-plugin-macos-permissions-api": "^2.0.0"
```

**src/lib/permissions.ts** - Core permission logic:
- `initPermissions()` - Dynamically imports plugin on macOS
- `checkFullDiskAccess()` - Returns true on non-macOS or if FDA granted
- `requestFullDiskAccess()` - Opens System Settings
- `pathRequiresFDA(path)` - Returns false for `/Volumes/*`, true for `/Users/*/Desktop|Documents|Downloads`
- `ensurePathAccess(path)` - Combines above into single check

**src/lib/useOpenProject.ts** - Hook with FDA handling:
- Checks FDA before opening project
- Shows dialog if FDA needed and not granted
- Stores "don't ask again" preference
- Provides retry callback for "I've Granted Access" button

**src/components/shared/FDADialog.tsx** - Modal dialog:
- Shows path that triggered FDA requirement
- "Open System Settings" button
- "I've Granted Access" button (re-checks FDA)
- "Don't ask again" button

**src/App.tsx** - Integration:
- Calls `initPermissions()` on mount
- Renders `FDADialog` when needed
- Passes all callbacks from `useOpenProject` hook

---

## Key Implementation Details

### Path Detection (Fixed from original plan)

The original plan had buggy path matching. Fixed version:

```typescript
export function pathRequiresFDA(path: string): boolean {
  // /Volumes/* is ALWAYS external or network - no FDA needed
  if (path.startsWith("/Volumes/")) {
    return false;
  }

  // Check for TCC-protected subdirectories in user home
  const userHomeMatch = path.match(/^\/Users\/[^/]+\//);
  if (!userHomeMatch) {
    return false; // Not in user home - no FDA
  }

  const homeDir = userHomeMatch[0]; // e.g., "/Users/john/"
  const tccProtectedDirs = [
    `${homeDir}Desktop`,
    `${homeDir}Documents`,
    `${homeDir}Downloads`,
  ];

  return tccProtectedDirs.some(
    (dir) => path === dir || path.startsWith(`${dir}/`)
  );
}
```

### Race Condition Fix

The original plan had a race condition where `checkFullDiskAccess()` could be called before initialization. Fixed:

```typescript
let initPromise: Promise<void> | null = null;

export function initPermissions(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // ... initialization
  })();
  return initPromise;
}

export async function checkFullDiskAccess(): Promise<boolean> {
  await initPermissions(); // Ensures init completes first
  // ...
}
```

### Retry After Granting FDA

Dialog includes "I've Granted Access" button that re-checks FDA:

```typescript
const retryAfterFDAGrant = useCallback(async () => {
  if (!pendingPath) return;
  const hasAccess = await checkFullDiskAccess();
  if (hasAccess) {
    openProjectToWorkspace(pendingPath);
    setShowFDADialog(false);
    setPendingPath(null);
  }
  // If still no access, keep dialog open
}, [pendingPath, openProjectToWorkspace]);
```

---

## Comparison

| Aspect | PR #103 (Bookmarks) | This PR (FDA) |
|--------|--------------------|--------------------|
| Lines of code | ~800 | ~220 |
| Dependencies | base64, Core Foundation FFI | tauri-plugin-macos-permissions |
| Sandbox required | Yes (breaks app) | No |
| Memory management | Manual CFURLRef lifecycle | None |
| External drives | Complex bookmark handling | Just works |
| Network mounts | Complex bookmark handling | Just works |
| TCC folders | Still needs FDA anyway | FDA only |
| Notarization | Risky temp exception entitlement | Clean |
| Retry after grant | Not supported | Supported |
| Shows problem path | No | Yes |

---

## Checklist

- [x] Post comment on PR #103
- [x] Close PR #103
- [x] Create new branch: `fix/macos-fda-permissions`
- [x] Add `tauri-plugin-macos-permissions` to Cargo.toml (macOS-only)
- [x] Register plugin in lib.rs with `#[cfg(target_os = "macos")]`
- [x] Create `src/lib/permissions.ts` with proper path detection
- [x] Create `src/components/shared/FDADialog.tsx` with retry button
- [x] Update `src/lib/useOpenProject.ts` with FDA handling
- [x] Update `src/App.tsx` to integrate dialog
- [x] Run `npm install tauri-plugin-macos-permissions-api`
- [x] TypeScript compiles
- [x] Rust compiles
- [ ] Test: project in ~/Documents (should prompt for FDA)
- [ ] Test: project on external drive (should work without prompt)
- [ ] Test: project on network mount (should work without prompt)
- [ ] Open new PR
