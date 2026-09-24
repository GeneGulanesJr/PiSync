# pi-sync v2

Extract your pi state — settings, skills (all locations), extensions, the git
package store, and the LaPis memory DB — into **one portable archive**, and
import it on another PC. You move the file yourself (USB, scp, cloud folder).

## What ships

| Source | In bundle |
|---|---|
| `~/.pi/agent/{skills,extensions,git,bin}` | `pi/agent/…` |
| `~/.pi/agent/{settings.json,AGENTS.md,trust.json,auth.json,models.json,models-store.json}` | `pi/agent/…` |
| `~/.agents/skills` | `agents/skills` |
| `~/.pi/memory/memory.db` (LaPis) | `memory/memory.db` (consistent SQLite snapshot) |

Never ships: sessions, claude-sessions, `*.bak`, `*.db-wal/shm`, `node_modules`,
`pistats.db`.

## Use

```
/pisync extract [dir] [--no-memory] [--no-auth] [--no-agents-skills]
/pisync import <archive>
/pisync
```

Extract writes `~/Downloads/pisync-<date>.tar.zst` (`.tar.gz` if zstd is
missing). Import backs up current state to
`~/.pi/cache/pi-sync/pre-import-<ts>/`, restores the bundle, and atomically
swaps the memory DB (stale WAL/SHM removed). Restart pi afterwards.

## On a PC without pi-sync

The bundle is self-describing — `RESTORE.md` inside has plain-shell restore
steps (tar + cp + sqlite3).

## Install

```bash
git clone <repo-url> ~/Documents/GulanesKorp/PiSync
cd ~/Documents/GulanesKorp/PiSync && npm install
ln -s "$(pwd)/src" ~/.pi/agent/extensions/pi-sync
```

(or add the path to `src/index.ts` to `extensions` in `~/.pi/agent/settings.json`)

Requires: `tar` (any modern distro), `sqlite3` (memory DB), `zstd` (optional —
gzip fallback). Restart pi or run `/reload`.

## Security

`auth.json` (API keys) ships by default — treat the archive like a credential
file. Use `--no-auth` to leave it out.

## Tests

```bash
npm test
```
