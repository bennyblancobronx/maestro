# Maestro PR #97 - Status Server Race Condition Fix

## Summary

Fixed a launch crash in Maestro v0.1.0-7 caused by a race condition in the status server port binding.

## The Problem

Maestro v0.1.0-7 (Tauri/Rust rewrite) crashed ~4 seconds after launch with SIGABRT. The Swift version (v1.03) worked fine.

### Crash Report Key Details
```
Exception Type:  EXC_CRASH (SIGABRT)
Termination Reason: Namespace SIGNAL, Code 6, Abort trap: 6
Application Specific Information: abort() called

Thread 0 Crashed during applicationDidFinishLaunching
Thread 27 (tokio-runtime-worker) was in posix_spawnp
```

### Root Cause

Race condition in `src-tauri/src/core/status_server.rs`:

```rust
// BEFORE (buggy)
fn find_available_port(range_start: u16, range_end: u16) -> Option<u16> {
    for port in range_start..=range_end {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Some(port);  // Listener dropped here!
        }
    }
    None
}

// Later in start():
let port = Self::find_available_port(9900, 9999)?;
// ... time passes, another process grabs the port ...
let listener = tokio::net::TcpListener::bind(&addr).await  // FAILS!
```

The sequence:
1. `find_available_port()` binds std::net::TcpListener to check availability
2. Immediately drops the listener, returns port number
3. `StatusServer::start()` tries to bind tokio listener to that port
4. Another process (like v1.03 still running) grabs port in between
5. Bind fails, app panics (Cargo.toml has `panic = "abort"`)

## The Fix

Combined port discovery and binding into one atomic operation:

```rust
// AFTER (fixed)
async fn find_and_bind_port(range_start: u16, range_end: u16) -> Option<(u16, tokio::net::TcpListener)> {
    for port in range_start..=range_end {
        let addr = format!("127.0.0.1:{}", port);
        if let Ok(listener) = tokio::net::TcpListener::bind(&addr).await {
            return Some((port, listener));  // Return the bound listener!
        }
    }
    None
}

// In start():
let (port, listener) = Self::find_and_bind_port(9900, 9999).await?;
// Listener already bound, no race window
```

## Files Changed

- `src-tauri/src/core/status_server.rs` - 9 insertions, 14 deletions

## GitHub References

- Issue: https://github.com/its-maestro-baby/maestro/issues/96
- PR: https://github.com/its-maestro-baby/maestro/pull/97
- Fork: https://github.com/bennyblancobronx/maestro

## Testing

Tested on macOS 26.2 (25C56), Mac14,14 (Apple Silicon). App launches and runs correctly after fix.

## How to Build Fixed Version

```bash
cd /path/to/maestro

# Build MCP server first
cd maestro-mcp-server && cargo build --release && cd ..

# Build frontend
npm install
npm run build

# Build app bundle
npm run tauri build

# Install
cp -R target/release/bundle/macos/Maestro.app /Applications/
```

## Lessons Learned

1. `panic = "abort"` in Cargo.toml means any Rust panic triggers abort() - no stack unwinding
2. Port availability checks have a TOCTOU (time-of-check-to-time-of-use) race window
3. Always keep resources (sockets, file handles) open if you need them - don't check-then-open
4. Issue + PR workflow: issue reports bug, PR fixes it with "Fixes #N", merge auto-closes issue
