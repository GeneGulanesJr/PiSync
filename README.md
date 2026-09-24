# pi-sync

Synchronize your pi state (skills, settings, AGENTS.md, memory DB, sessions) between two laptops on the same LAN.

## How it works

- Each laptop runs this extension as part of pi.
- Each advertises itself via mDNS as `_pi-sync._tcp.local` on port 7333.
- When you run `/sync`, the extension rsyncs the relevant paths to the peer over SSH (using a dedicated ed25519 keypair).
- The SQLite memory DB is snapshotted via `.backup` before transfer and atomic-renamed on the receiver — safe even while pi is running.
- Conflicts are detected against a per-peer baseline and reported via TUI notification.

## Install

### On both laptops

```bash
# Install dependencies
sudo pacman -S openssh rsync sqlite avahi nss-mdns   # Arch/CachyOS

# Make sure sshd is running (one-time)
sudo systemctl enable --now sshd

# Clone or copy this repo
git clone <repo-url> ~/Documents/GulanesKorp/PiSync
cd ~/Documents/GulanesKorp/PiSync
npm install
```

### Link the extension into pi

Pi auto-discovers extensions from `~/.pi/agent/extensions/`, looking for `*.ts` files or `*/index.ts`. The entry point is `src/index.ts`, so symlink the `src/` directory:

```bash
ln -s "$(pwd)/src" ~/.pi/agent/extensions/pi-sync
```

Or, if you prefer a settings.json entry:

```json
{
  "extensions": ["/home/<you>/Documents/GulanesKorp/PiSync/src/index.ts"]
}
```

No build step required — pi loads TypeScript directly via jiti. Restart pi or run `/reload` for the new command to register.

### One-time setup (run on EACH laptop pointing at the OTHER)

In pi:

```
/sync-setup <other-laptop>.local
```

You may be prompted for the remote's SSH password (one-time key install).

## Use

```
/sync                    # full bidirectional sync
/sync-push <peer>        # this → peer
/sync-pull <peer>        # peer → this
/sync-peers              # show discovered peers
/sync-status             # last sync info
```

## Run the tests

```bash
cd ~/Documents/GulanesKorp/PiSync
npm test
```

## Files

See [SPEC.md](./SPEC.md) for the design, [PLAN.md](./PLAN.md) for the implementation plan.
