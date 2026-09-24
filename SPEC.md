# pi-sync — Design Spec

**Status:** approved (v2 — pivot from LAN sync to portable extract/import)
**Date:** 2026-09-24
**Supersedes:** LAN-sync design (rsync + mDNS + SSH between two laptops)

## Problem

Porting pi to another PC today means hand-picking paths and hoping nothing is missed: settings, skills (in two locations), extensions, AGENTS.md, trust, and the 941 MB LaPis memory DB. pi-sync reduces this to two commands:

- On the source PC: `/pisync extract` → one portable archive in `~/Downloads`
- On the target PC: `/pisync import <archive>` → state restored

Transport is manual (USB stick, scp, cloud folder — user's choice). pi-sync does not move bytes over the network.

## Goals

- One command to produce a single self-describing archive
- Import restorable **without pi-sync installed** (plain `tar` + `sqlite3` via RESTORE.md) — no chicken-and-egg
- Safe while pi is running (SQLite online backup API for the memory DB)
- Atomic artifacts: never leave a partial archive or a half-swapped DB
- Zero runtime npm dependencies (system `tar` does compression)
- Linux only (both PCs are CachyOS)

## Non-goals

- Network transfer of any kind (no SSH, no rsync, no mDNS)
- Continuous or scheduled sync; conflict detection/merging
- Path rewriting in `settings.json` (v2 if ever needed — flagged in RESTORE.md)
- Windows/macOS

## Commands

Single registered command with subcommand dispatch:

```
/pisync extract [dir] [--no-memory] [--no-agents-skills]
/pisync import <archive>
/pisync                       # help + last-operation status
```

- `extract` default output: `~/Downloads/pisync-YYYYMMDD-HHMMSS.tar.zst`
- `.tar.gz` fallback when `zstd` is unavailable (probed via `tar --zstd` support)
- Flags: `--no-memory` (skip DB), `--no-agents-skills`, `--no-auth` (skip API keys)
- TUI notify on completion: path, compressed size, duration

## Bundle contents

| Include (source) | Bundle path | Import destination |
|---|---|---|
| `~/.pi/agent/skills/` (~140 MB) | `pi/agent/skills/` | `~/.pi/agent/skills/` |
| `~/.pi/agent/extensions/` (~42 MB) | `pi/agent/extensions/` | `~/.pi/agent/extensions/` |
| `~/.pi/agent/settings.json` | `pi/agent/settings.json` | `~/.pi/agent/settings.json` |
| `~/.pi/agent/AGENTS.md` | `pi/agent/AGENTS.md` | `~/.pi/agent/AGENTS.md` |
| `~/.pi/agent/trust.json` | `pi/agent/trust.json` | `~/.pi/agent/trust.json` |
| `~/.agents/skills/` (~16 MB) | `agents/skills/` | `~/.agents/skills/` |
| `~/.pi/agent/git/` (~735 MB) | `pi/agent/git/` | `~/.pi/agent/git/` |
| `~/.pi/agent/auth.json` | `pi/agent/auth.json` | `~/.pi/agent/auth.json` |
| `~/.pi/agent/models.json` + `models-store.json` | `pi/agent/…` | `~/.pi/agent/…` |
| `~/.pi/agent/bin/` | `pi/agent/bin/` | `~/.pi/agent/bin/` |
| `~/.pi/memory/memory.db` (~941 MB) | `memory/memory.db` | `~/.pi/memory/memory.db` |

`git/` is **not** per-machine metadata — it is pi's installed skill/extension package store (`git:github.com/...` entries in settings.json resolve here; memory-layer lives here). It must ship. `.git/` dirs inside are kept so pi's package manager can still update repos on the target. `auth.json` holds API keys — included by default (transfer is manual USB/scp), opt out with `--no-auth`; sensitivity flagged in RESTORE.md.

**Always excluded** (even inside included trees): `node_modules/`, `*.bak`, `*.db-wal`, `*.db-shm`, `memory.db.bak.*`, `claude-sessions/`.

**Excluded entirely:** sessions (`~/.pi/agent/sessions/`, user decision — biggest, least valuable), `~/.pi/memory/claude-sessions/`, `pistats.db` (per-machine usage stats), `pi-sync.json` (obsolete v1 peer config).

**Symlinks are dereferenced** (copied as real files) so symlinked extensions like pi-sync itself land as real content on the target.

Expected size: ~1.87 GB raw → ~500–800 MB compressed. Under the 4 GB FAT32 single-file limit.

## Bundle layout & manifest

```
pisync-2026-02-14-101530/
  manifest.json
  RESTORE.md
  pi/agent/{skills,extensions,git,bin,settings.json,AGENTS.md,trust.json,auth.json,models.json,models-store.json}
  agents/skills/
  memory/memory.db
```

`manifest.json` (schema v1):

```json
{
  "schema": 1,
  "createdAt": "2026-02-14T10:15:30Z",
  "hostname": "laptop-a",
  "piVersion": "…",
  "pisyncVersion": "0.2.0",
  "compression": "zstd",
  "entries": [
    { "bundlePath": "pi/agent/skills", "dest": "~/.pi/agent/skills", "kind": "dir",
      "files": 1234, "bytes": 146800640 }
  ],
  "totals": { "files": 2000, "bytes": 1200000000 }
}
```

`dest` values are stored with `~/` prefix and expanded against `$HOME` at import. `memory/memory.db` entry is `kind: "file"` and flagged `"sqlite": true`.

`RESTORE.md` ships inside the bundle: manual `tar --zstd -xf …`, `cp -a` mapping table, and the SQLite atomic-swap commands (`sqlite3 … ".backup"` / `mv`). Caveats it must state: (1) `settings.json` may reference absolute paths **outside** `~/.pi` (e.g. extension entries pointing at `~/Documents/...` repos) — auto-discovered extensions work after restore, explicit absolute-path entries need manual cleanup on the target; (2) `auth.json` holds API keys — treat the bundle like a credential file; (3) run import before starting pi, or restart pi afterwards.

## Extract flow

1. **Pre-flight:** resolve target dir (arg or `~/Downloads`, created if missing); check free space ≥ estimated input size + 20%; probe zstd.
2. **Snapshot DB:** `sqlite3 ~/.pi/memory/memory.db ".backup <stage>/memory/memory.db"` — consistent copy while pi runs (existing `sqlite-snapshot.ts`). Skipped with `--no-memory`.
3. **Stage:** build the tree under `~/.pi/cache/pi-sync/stage-<ts>/` with `fs.cp` + exclude filter + symlink deref; write `manifest.json` and `RESTORE.md`.
4. **Pack:** compressor selected explicitly (`--zstd` or `-z`) — **not** inferred from the file extension, because the output is written as `<out>.part` first, which breaks tar's suffix detection → fsync → atomic rename to final name.
5. **Cleanup:** delete stage dir on success *and* failure; delete `.part` on failure. Notify path + size + duration.

## Import flow

1. **Validate:** archive exists; tar lists exactly one root dir `pisync-*`; `manifest.json` parses; `schema` ≤ supported; compression matches extension.
2. **Pre-import safety:** copy existing `settings.json`, `trust.json`, `AGENTS.md`, `auth.json`, and existing `memory.db` (if any) → `~/.pi/cache/pi-sync/pre-import-<ts>/`. Skills dirs are merged/overlaid, not backed up (size).
3. **Restore:** copy `pi/agent/*` → `~/.pi/agent/*`, `agents/skills` → `~/.agents/skills` (merge), then memory DB: stage to `<dest>.import-<ts>` → atomic `rename` over `~/.pi/memory/memory.db` → **delete stale `memory.db-wal` / `memory.db-shm` on the target** (a stale WAL replayed against the imported DB corrupts it; SQLite recreates both on next open).
4. **Report:** restored paths, safety-backup location, "restart pi to load everything."

## Error handling

| Condition | Behavior |
|---|---|
| `sqlite3` CLI missing | Extract fails with install hint; still usable with `--no-memory` |
| Insufficient disk space | Fail before staging begins |
| tar failure mid-write | `.part` deleted; stage cleaned; error notify |
| Import: no/invalid manifest | Refuse: "not a pi-sync bundle" |
| Import: newer schema | Refuse with upgrade hint |

## Code disposition

- **Keep/adapt:** `sqlite-snapshot.ts`, `log.ts`, `manifest.ts` → bundle manifest builder/validator
- **New:** `bundle.ts` (stage + pack), `restore.ts` (import), `commands/pisync.ts` (subcommand dispatch)
- **Delete:** `mdns.ts`, `ssh.ts`, `lock.ts`, `sync.ts`, `itemize-parser.ts`, `baseline.ts`, `commands/sync*.ts` (all six), peers cache, conflict archive; `bonjour-service` dependency
- **Docs:** rewrite `README.md`; delete stale `PLAN.md`

## Testing

Vitest (existing suite style), no network/DB-size dependencies:

- Manifest: build → JSON round-trip → validate (schema check, `~/` dest expansion)
- Copy filter: excludes (`node_modules`, `*.bak`, `*.db-wal/shm`, `claude-sessions`), symlink dereference, nested dirs
- Tar command builder: zstd vs gzip selection, `.part` naming, `-C` staging dir
- Import mapping: bundle path → home path table; validation refusals (no manifest, schema too new)
- Extract/import happy path against a tiny fixture SQLite DB in a temp HOME sandbox
