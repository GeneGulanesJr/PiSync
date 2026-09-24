# pi-sync

Pack and restore your pi state (`~/.pi/agent/` + `~/.pi/memory/memory.db`) as a single tar.gz. Two commands, one file.

## Commands

```
/extract [path]    # pack ~/.pi/ into a tar.gz; cwd default, or <path>
/install [path]    # restore ~/.pi/ from a tar.gz; cwd default, or <path>
```

If you omit the path, `/extract` writes `./pi-state.tar.gz` in the current directory and `/install` reads it back from there.

## What's in the bundle

- `agent/` — skills, settings.json, AGENTS.md, extensions, trust.json, etc.
- `memory/memory.db` — SQLite snapshot (consistent under live reads/writes)

Always excluded:
- `auth.json`
- `*.bak`
- `*.db-wal`, `*.db-shm`
- `node_modules`

## Install

```bash
sudo pacman -S rsync sqlite    # rsync for staging, sqlite3 for memory.db snapshot

cd ~/Documents/GulanesKorp/PiSync
npm install

# Link the extension into pi:
ln -s "$(pwd)/src" ~/.pi/agent/extensions/pi-sync

# Or add to ~/.pi/agent/settings.json:
#   "extensions": ["/home/<you>/Documents/GulanesKorp/PiSync/src/index.ts"]
```

Restart pi or run `/reload` so the commands register.

## Use

```bash
# In pi, from any directory:
/extract                       # writes ./pi-state.tar.gz

# Copy the tar.gz to another machine (scp, USB, whatever), then:
/install /path/to/pi-state.tar.gz
```

`/install` backs up any existing `~/.pi/agent/` to `~/.pi/agent.bak-<timestamp>` and the existing `memory.db` to `memory.db.bak-<timestamp>` before restoring — no silent overwrites.

## Requirements

- `tar`, `rsync`, `sqlite3` on PATH
- No npm runtime deps (uses Node stdlib + system tools)

## Test

```bash
npm test
```
