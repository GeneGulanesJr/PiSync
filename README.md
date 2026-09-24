# pi-sync

Synchronize pi state between two laptops on the same LAN.

See [SPEC.md](./SPEC.md) for the full design.

## Install (dev)

```bash
cd ~/Documents/GulanesKorp/PiSync
npm install
npm test
```

## Use

Once installed as a pi extension:

```
/sync-setup <remote-host>   # one-time
/sync                       # bidirectional sync
/sync-push <peer>           # one-way this → peer
/sync-pull <peer>           # one-way peer → this
/sync-peers                 # list discovered peers
/sync-status                # last sync info
```

## Requirements

- Linux (tested on CachyOS)
- `ssh`, `rsync`, `sqlite3`, `sshd` available on both laptops
- Both laptops on the same LAN broadcast domain (for mDNS)
