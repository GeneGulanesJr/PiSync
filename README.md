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
pi install https://github.com/GeneGulanesJr/PiSync
pi reload   # or restart pi
```

Or, for development:

```bash
git clone https://github.com/GeneGulanesJr/PiSync ~/Documents/GulanesKorp/PiSync
cd ~/Documents/GulanesKorp/PiSync
npm install

# Symlink the source into pi's extensions dir:
ln -s "$(pwd)/src" ~/.pi/agent/extensions/pi-sync
pi reload
```

(or add the path to `src/index.ts` to `extensions` in `~/.pi/agent/settings.json`)

Requires: `tar` (any modern distro), `sqlite3` (memory DB), `zstd` (optional —
gzip fallback). Restart pi or run `/reload`.
=======
## Use
>>>>>>> a49e0f9 (feat: add pi package manifest for `pi install <url>`)

## Security

`auth.json` (API keys) ships by default — treat the archive like a credential
file. Use `--no-auth` to leave it out.

<<<<<<< HEAD
## Tests
=======
`/install` backs up any existing `~/.pi/agent/` to `~/.pi/agent.bak-<timestamp>` and the existing `memory.db` to `memory.db.bak-<timestamp>` before restoring — no silent overwrites.

## Requirements

- `tar`, `rsync`, `sqlite3` on PATH
- No runtime npm deps (uses Node stdlib + system tools)

## Test
>>>>>>> a49e0f9 (feat: add pi package manifest for `pi install <url>`)

```bash
npm test
```
