# Final Report: macOS Volume Permission Fix (High-Scale, SMB & Lazy Init)

## Problem Summary
Users with high-density setups (e.g., 5 projects with 6 agents each, totaling 30 active sessions) experienced a "barrage" of macOS permission prompts. 

### The "Swarm" Mechanisms
1.  **30-Agent Concurrency**: 30 agents hitting the disk at startup caused macOS to queue 30 separate system dialogs.
2.  **Background Heartbeat**: UI polling for branch updates continued even in background tabs or when the window was blurred.
3.  **Missing Intent**: Lack of `Info.plist` usage descriptions prevented macOS from storing "Always Allow" permissions.
4.  **Boot Barrage**: Even after deduplication within a project, multiple projects starting simultaneously still triggered one prompt per project (5x prompts on boot).

## Implementation Details

### 1. Unified IPC (Deduplication)
- **Logic**: Implemented a shared promise cache (`getDeduplicatedCurrentBranch`) in `src/lib/git.ts`.
- **Impact**: Reduces simultaneous I/O requests from **30 down to 1 per project**.

### 2. Lazy Initialization (The "Barrage" Killer)
- **Logic**: Gated the `useEffect` and `useSessionBranch` hooks with the `isActive` state.
- **Impact**: Background projects (tabs) are prohibited from touching the disk during the app boot phase. They only "wake up" and request permission when the user first visits the tab.
- **Result**: **5x boot prompts reduced to exactly 1 prompt**.

### 3. Focus & Activity Throttling
- **Window Focus**: Skips polling if `!document.hasFocus()`. 
- **Tab Activity**: Background tabs remain silent.
- **Background Work Integrity**: Only the **UI Label Refresh** is throttled. AI agents, compilers, and active terminal processes continue 100% in the background.

### 4. Protocol Support: USB & SMB
- **Keys**: Added `NSRemovableVolumesUsageDescription` and `NSNetworkVolumesUsageDescription` to `src-tauri/Info.plist`.
- **Result**: macOS can now provide the "Always Allow" option, as the app has declared its intent.

## Note on Development Builds vs. Production
During active development, macOS may re-prompt the user after a rebuild. This is because:
1.  The app's binary "fingerprint" (hash) changes with every build.
2.  macOS treats a new build as a "new app" that needs fresh authorization.
3.  **Production behavior**: Once signed with a Developer ID and installed, the authorization sticks across app updates because the developer identity remains constant.

## Verification for 30-Agent Setup
1.  **Launch**: Only the active project requests access (1 prompt).
2.  **Tab Switch**: Clicking a new tab triggers its first authorized hit; since the volume is already approved for the app, the load is silent.
3.  **Stability**: SMB network latency is significantly reduced due to the 30:1 reduction in polling frequency.
