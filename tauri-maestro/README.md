# Maestro Linux

**Orchestrate multiple AI coding assistants in parallel on Linux.**

A Tauri 2 desktop application that lets you run 1-12 AI coding sessions simultaneously, each in its own isolated git worktree. Linux port of [Maestro](https://github.com/its-maestro-baby/maestro) (macOS).

<!-- Screenshots will be added once the UI stabilizes -->

![Linux](https://img.shields.io/badge/Linux-x86__64-blue)
![Rust](https://img.shields.io/badge/Rust-2021-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)
![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Why Maestro?

AI coding assistants work on one task at a time. While Claude works on Feature A, you wait. Then you start Feature B. Then you wait again.

Maestro runs multiple AI sessions in parallel. Each session gets its own terminal, git worktree, assigned branch, and port allocation. No merge conflicts, no context switching, no bottleneck.

---

## Features

### Implemented

- **Multi-terminal session grid** - dynamic 1x1 to 3x4 layout with xterm.js, real-time PTY streaming via Tauri IPC
- **Session lifecycle** - create, close, batch assign, and stop-all with process group isolation (`setsid` + `SIGTERM` to PGID)
- **Git worktree isolation** - automatic worktree creation at `~/.local/share/maestro/worktrees/`, pruning on session close
- **Git operations** - branch listing, checkout, log, diff, worktree add/remove via async Rust CLI wrapper
- **Visual git graph** - GitKraken-style commit visualization with colored branch rails (TypeScript port of Swift layout engine)
- **Multi-project tabs** - open multiple repositories in tabs, each with independent session grid and git state
- **Persistent state** - workspace config, session state, and sidebar preferences survive restarts via Zustand + Tauri plugin-store
- **Native folder picker** - OS dialog for project selection
- **Config sidebar** - session count, mode selection, branch assignment, quick action pills, appearance toggle
- **Multi-AI mode support** - Claude Code, Gemini CLI, OpenAI Codex, Plain Terminal (mode selection per session)

### Coming Soon

- MCP server integration for agent status reporting
- Plugin marketplace (skills, commands, MCP servers)
- Template presets for saving session configurations
- Dev server detection and port allocation
- `.deb` package distribution

---

## Architecture

```text
+---------------------------------------------------------------+
|                   Maestro Linux (Tauri 2.x)                   |
|                                                               |
|  React 18 + TypeScript            Rust Backend                |
|  +------------------------+   +----------------------------+  |
|  | TerminalGrid           |   | ProcessManager             |  |
|  |   xterm.js sessions    |-->|   PTY spawn, resize, kill  |  |
|  | SessionPodGrid         |   | SessionManager             |  |
|  |   idle pod layout      |   |   lifecycle, batch assign  |  |
|  | GitGraphPanel          |   | WorktreeManager            |  |
|  |   commit visualization |   |   create, remove, prune    |  |
|  | Sidebar + TopBar       |   | Git runner + ops           |  |
|  |   config, branches     |   |   async CLI wrapper        |  |
|  +------------------------+   +----------------------------+  |
|              |                              |                 |
|       Zustand stores            Tauri IPC commands            |
|  (session, git, workspace)  (spawn, resize, write, kill,      |
|                              git_log, branches, checkout)     |
+---------------------------------------------------------------+
```

### Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Tauri 2.0 |
| Backend | Rust (2021 edition) |
| Frontend | React 18, TypeScript 5.5 |
| Terminal | xterm.js 6.0 |
| State | Zustand 5 + Tauri plugin-store |
| Styling | TailwindCSS 3.4 |
| PTY | portable-pty 0.9 |
| Bundling | Vite 5, `.deb` target |

---

## Build from Source

### Requirements

- Linux (x86_64), tested on Debian/Ubuntu
- Node.js >= 18
- Rust (stable) via [rustup](https://rustup.rs)
- System libraries:

  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libappindicator3-dev librsvg2-dev
  ```

### Steps

```bash
# Clone
git clone https://github.com/lliWcWill/maestro.git
cd maestro

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev

# Build release .deb
npm run tauri build
```

### Optional: Install AI CLIs

```bash
npm install -g @anthropic-ai/claude-code   # Claude Code
npm install -g @google/gemini-cli           # Gemini CLI
npm install -g @openai/codex                # OpenAI Codex
```

### Development Notes

- Biome ignores build output via `files.includes` negated globs in `biome.json`.
  If Biome changes ignore semantics in a future release, revisit that config.

---

## Project Structure

```text
maestro-linux/
├── src/                        # React frontend
│   ├── components/
│   │   ├── terminal/           # TerminalGrid, TerminalView, SessionPodGrid
│   │   ├── git/                # GitGraphPanel, CommitRow, BranchList
│   │   ├── sidebar/            # Sidebar, config panels
│   │   └── shared/             # TopBar, BottomBar, ProjectTabs
│   ├── stores/                 # Zustand (session, git, workspace, plugin)
│   ├── lib/                    # PTY client, git layout engine, hooks
│   └── styles/                 # TailwindCSS + terminal themes
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands/           # Tauri IPC handlers (terminal, session, git)
│   │   ├── core/               # ProcessManager, SessionManager, WorktreeManager
│   │   ├── git/                # Git CLI runner + operations wrapper
│   │   └── models/             # Serde data structures
│   ├── capabilities/           # Tauri permission definitions
│   └── tauri.conf.json         # App config, CSP, bundle targets
└── index.html                  # Entry point
```

---

## Acknowledgments

- [Maestro (macOS)](https://github.com/its-maestro-baby/maestro) - the original, built by Jack. This project is a Linux port.
- [Tauri](https://tauri.app) - lightweight desktop framework
- [xterm.js](https://xtermjs.org) - terminal emulator for the web
- [portable-pty](https://crates.io/crates/portable-pty) - cross-platform PTY interface

---

## License

MIT License - see [LICENSE](LICENSE) for details.
