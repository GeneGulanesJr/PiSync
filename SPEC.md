# pi-sync — Design Spec

**Status:** draft for review
**Date:** 2026-09-24
**Author:** pi (brainstorming session)

## Problem

You run `@earendil-works/pi-coding-agent` on two laptops on the same LAN. Today, porting your pi state between them is manual: copy a tarball, restore it, hope you didn't forget anything. The state is large (~1.7 GB total: 140 MB skills, 42 MB extensions, 941 MB memory DB, 565 MB sessions) and changes daily as you record memories, install skills, tweak settings.

You want a small extension that, when you run `/sync`, brings both laptops back into agreement — bidirectional, mtime-wins, on demand.

## Goals

- One extension, installed on both laptops, symmetric role
- `/sync <peer>` brings both sides into agreement in one call
- mDNS auto-discovery on LAN with a settings.json fallback
- Safe to run while `pi` is active on both sides
- ~400–500 lines of TypeScript; delegates byte transfer to `rsync` over SSH

## Non-goals

- Multi-peer (3+) sync
- Sync over the public internet (no relay server)
- End-to-end encryption beyond SSH
- Real-time push (no filesystem watcher)
- Cross-platform (Linux only — both laptops are CachyOS)
- Conflict-free merge of arbitrary file contents (mtime-wins, not three-way merge)

## Architecture

```
Laptop A                              Laptop B
┌────────────────────────┐           ┌────────────────────────┐
│ pi process             │           │ pi process             │
│  └─ pi-sync extension  │           │  └─ pi-sync extension  │
│      ├─ mDNS advertise │           │      ├─ mDNS advertise │
│      ├─ mDNS browse    │           │      ├─ mDNS browse    │
│      ├─ SSH peer cfg   │           │      ├─ SSH peer cfg   │
│      ├─ /sync handler  │           │      ├─ /sync handler  │
│      └─ /sync-setup    │           │      └─ /sync-setup    │
│                        │           │                        │
│ ~/.pi/                 │ ◄─rsync─► │ ~/.pi/                 │
│   agent/{skills,…}     │   /SSH    │   agent/{skills,…}     │
│   memory/memory.db     │           │   memory/memory.db     │
└────────────────────────┘           └────────────────────────┘
```

Symmetric roles. One laptop initiates `/sync`; the other accepts incoming rsync over SSH. Both advertise via mDNS and both browse for peers.

## Components

### 1. Entry point — `~/.pi/agent/extensions/pi-sync/index.ts`

Default factory exports a function receiving `ExtensionAPI`. Registers:
- Command `/sync`
- Command `/sync-push`, `/sync-pull`
- Command `/sync-peers`
- Command `/sync-setup`
- Command `/sync-status`
- Reads config from `~/.pi/agent/pi-sync.json` (created by `/sync-setup`)
- Caches peers at `~/.pi/cache/pi-sync/peers.json`

### 2. mDNS — `bonjour-service` npm package

Pure-JS mDNS (no system Avahi dependency). Service type `_pi-sync._tcp.local`, port from config (default 7333). TXT records:
- `id=<uuid v4>` — stable per-laptop identifier
- `pi=<earendil-works/pi-coding-agent version>`
- `name=<hostname>`

### 3. Sync orchestrator

`/sync` handler logic:
1. Acquire `~/.pi/cache/pi-sync/sync.lock` (PID + timestamp). Refuse if held by a live PID.
2. Resolve peer: arg → `peers.json` cache → mDNS browse (5s timeout) → fail with hint.
3. SSH pre-flight: `ssh -o BatchMode=yes -o ConnectTimeout=5 peer true`.
4. Load baseline `~/.pi/cache/pi-sync/last-sync-<peer-id>.json` (mtime per path, from previous sync).
5. Snapshot memory DB on the sender side via SQLite `.backup` to a temp file.
6. Run rsync direction 1: sender → receiver, with `--update`, `--itemize-changes`, `--info=stats2`.
7. Run rsync direction 2: receiver → sender, same flags. (Using `ssh` to drive rsync in server mode on the other side.)
8. Parse itemize-changes output line by line:
   - Real conflict: file is newer than baseline on *both* sides, and was transferred → log + `notify`
   - Normal transfer: update baseline
9. Atomic-rename the memory DB snapshot on the receiver.
10. Update `last-sync-<peer-id>.json` with the new baseline.
11. Release lock.
12. Emit summary to TUI: files transferred, conflicts, bytes moved.

### 4. Conflict resolution

Baseline stored per peer. For each file:
- If only one side modified since baseline → normal sync
- If both sides modified since baseline → real conflict; transfer the newer-mtime file (rsync `--update` already does this); emit `notify("conflict: <path> — newer from <side> won. Previous version saved to <peer>/conflict-archive/<timestamp>/<path>")`

The previous-loser file is preserved on the losing side by adding `rsync --backup --backup-dir=...` to the command. Archive path: `~/.pi/cache/pi-sync/conflict-archive/<peer-id>/<iso-timestamp>/<relative-path>`.

### 5. SQLite memory DB handling

Memory DB cannot be rsynced while the memory-layer extension holds it open. The sender must take a consistent snapshot first.

- Sender: `sqlite3 ~/.pi/memory/memory.db ".backup /tmp/pi-sync-mem-<pid>.db"` (uses SQLite Online Backup API, safe under concurrent readers/writers).
- Sync the snapshot path instead of the live DB.
- Receiver: after rsync, atomically rename snapshot over `~/.pi/memory/memory.db`.
- WAL/SHM files are NOT synced — SQLite will recreate them on next open. (`*.db-wal` and `*.db-shm` in the exclude list.)

If `sqlite3` CLI is not installed on the sender (rare — it ships with most distros), `/sync` fails with a clear message: "install sqlite3 to sync memory DB".

### 6. SSH setup flow

`/sync-setup <remote-host>`:
1. Confirm peer is reachable: `ssh -o BatchMode=yes -o ConnectTimeout=5 <host> true` (if fails with "permission denied", peer is reachable, just no key yet).
2. Generate keypair if missing: `ssh-keygen -t ed25519 -f ~/.ssh/pi-sync-ed25519 -N '' -q`.
3. Install pubkey on remote via `ssh-copy-id -i ~/.ssh/pi-sync-ed25519.pub <host>` (uses password auth for one-time install — only if password auth is enabled).
4. Fallback: print pubkey to terminal, prompt user to paste into remote's `~/.ssh/authorized_keys`.
5. Verify: `ssh -i ~/.ssh/pi-sync-ed25519 -o BatchMode=yes <host> true` should succeed silently.
6. Write config entry to `~/.pi/agent/pi-sync.json`:
   ```json
   {
     "peer": "<remote-host-or-ip>",
     "sshKey": "~/.ssh/pi-sync-ed25519",
     "sshPort": 22,
     "rsyncPort": 22,
     "syncPaths": ["default"],
     "excludePatterns": []
   }
   ```
7. Pin the remote's host key: append to `~/.ssh/known_hosts` after first successful key-only auth.

`/sync-setup` is one-time per peer. Each laptop runs it pointing at the other.

## Sync paths

Default sync set (configurable via `pi-sync.json` `syncPaths`):

| Path | Size on this box | Notes |
|---|---|---|
| `~/.pi/agent/skills/` | 140 MB | 55 skills |
| `~/.pi/agent/extensions/` | 42 MB | |
| `~/.pi/agent/AGENTS.md` | 5.6 KB | |
| `~/.pi/agent/settings.json` | <1 KB | |
| `~/.pi/agent/trust.json` | <1 KB | |
| `~/.pi/agent/git/` | small | per-machine git refs |
| `~/.pi/agent/sessions/` | 565 MB | |
| `~/.pi/memory/memory.db` | 941 MB | SQLite snapshot, atomic rename |
| `~/.pi/memory/claude-sessions/` | varies | optional, large |

### Exclude patterns

Always excluded:
- `*.bak`
- `*.db-wal`
- `*.db-shm`
- `**/node_modules/**`
- `auth.json` (machine-bound credentials)
- `models-store.json.bak`
- The cache dir itself: `~/.pi/cache/pi-sync/`

## Commands

| Command | Description |
|---|---|
| `/sync [peer]` | Full bidirectional sync against peer (or picker if no arg) |
| `/sync-push <peer>` | One-way: this → peer |
| `/sync-pull <peer>` | One-way: peer → this |
| `/sync-peers` | List discovered + cached peers; refresh mDNS |
| `/sync-setup <remote-host>` | Generate SSH key, install on remote, write config |
| `/sync-status` | Last sync time per peer, total conflicts, byte counts |

## State files

| Path | Purpose |
|---|---|
| `~/.pi/agent/pi-sync.json` | Per-laptop config (peer hosts, SSH key path, exclusions) |
| `~/.pi/cache/pi-sync/peers.json` | Cached peer list with last-seen timestamps |
| `~/.pi/cache/pi-sync/sync.lock` | PID-based mutex for sync runs |
| `~/.pi/cache/pi-sync/last-sync-<peer-id>.json` | Baseline mtimes per path |
| `~/.pi/cache/pi-sync/log.jsonl` | Append-only JSONL log of every sync event |
| `~/.pi/cache/pi-sync/conflict-archive/<peer-id>/<ts>/...` | Previous-loser copies of conflicting files |

Log entry schema:
```json
{"ts":"2026-09-24T19:30:00Z","peer":"<id>","direction":"push|pull","action":"transfer|conflict|skip|error","path":"<relative>","detail":{...}}
```

## Security

- Dedicated SSH keypair `~/.ssh/pi-sync-ed25519`, separate from any user key
- `BatchMode=yes` always — no interactive password prompt
- `StrictHostKeyChecking=yes` after first pin (saved to `known_hosts`)
- No separate rsync daemon port; rsync travels over SSH
- `auth.json` is excluded from sync (machine-bound)
- Permission bits preserved by rsync defaults (`-p` implied); 600/644 unaffected
- The extension refuses to start `/sync` if `auth.json` differs in shape from peer's (defensive — won't happen since it's excluded)

## Failure modes

| Failure | Behavior |
|---|---|
| Peer unreachable (no mDNS, no SSH) | `/sync` shows error; suggests `/sync-peers` |
| SSH key not installed on remote | Suggests `/sync-setup <host>` |
| mDNS finds no peers in 5s | Warn: "no peers found — if both laptops are on guest WiFi, AP isolation may block mDNS; check or use settings.json peer override" |
| `sqlite3` CLI missing | Hard fail with apt-install hint |
| rsync interrupted mid-transfer | Re-run resumes (rsync is delta-aware) |
| Real conflict (both modified) | mtime wins; loser archived; `notify` warning |
| Lock held by live PID | Refuse with "sync already running (pid <N>)"; if PID is dead (process gone), auto-clear the lock and proceed |
| Disk full on receiver | rsync exits non-zero; stderr surfaced |
| Clock skew > 1 min between laptops | Conflict detection degrades; spec suggests NTP on both |
| Concurrent rsync from two /sync calls | Lock prevents; second call refuses |

## Testing

### Unit

- `manifest.ts` — file walking, exclude pattern matching, hash computation
- `diff.ts` — baseline comparison, conflict detection logic
- `itemize-parser.ts` — parses rsync `--itemize-changes` output, returns structured events
- `lock.ts` — acquire/release, stale PID detection

### Integration (docker-compose)

Two minimal containers (Debian bookworm-slim) with `sshd`, `rsync`, `sqlite3`, fake `~/.pi/` trees. Test scenarios:
1. Cold start: A has 5 files, B has 3 — sync brings both to 5
2. One-way edit: A modifies a file — B receives it on sync
3. Real conflict: both modify — newer mtime wins, loser archived, log entry emitted
4. Memory DB sync: pre-populate SQLite, run sync on both sides concurrently — receiver DB integrity check passes
5. Lock: spawn two `/sync` in parallel — second refuses
6. mDNS: both containers on same compose network — peers visible

### Manual (documented)

1. Install on laptop A and laptop B
2. Run `/sync-setup B` on A, `/sync-setup A` on B
3. Run `/sync-peers` on A — should see B
4. Modify a file on B, run `/sync A` on B — file appears on A
5. Modify same file on A and B before next sync — conflict warning fires

## Dependencies

- `bonjour-service` (npm, pure JS mDNS)
- `typebox` (already available; for tool schemas if any)
- System: `ssh`, `sshd`, `rsync`, `sqlite3`, `ssh-keygen`, `ssh-copy-id`

## Open questions for implementation phase

- Should `/sync` have a `--dry-run` flag? (Useful for sanity; cheap to add.)
- Should conflict-loser archive be capped in total size? (Could grow unbounded.)
- Should `/sync-peers` also try to ping each candidate peer's SSH before listing as available?

## Out of scope for v1

- File-content merging (we never do three-way merge; mtime-wins only)
- Per-file type rules (always treat all paths the same)
- Sync scheduling (manual only)
- Web UI for sync status (TUI notifications only)

## Acceptance criteria

`/sync` against a configured peer:
1. Completes with all files in the sync set identical on both sides
2. Correctly handles the memory DB without corruption
3. Emits a notification for every real conflict (not just any transfer)
4. Refuses to run if another sync is in progress
5. Recovers cleanly from mid-transfer interruption
6. Logs every transfer/conflict/error to `log.jsonl`