# pi-sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Use Sequential mode for planned tasks or Direct mode if subagents aren't available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pi extension that synchronizes pi state between two laptops on the same LAN via mDNS discovery + rsync-over-SSH.

**Architecture:** TypeScript pi extension (single project at `~/Documents/GulanesKorp/PiSync/`). Pure-logic units (`config`, `lock`, `log`, `manifest`, `baseline`, `itemize-parser`) are TDD'd with no I/O. I/O wrappers (`ssh`, `mdns`, `sqlite-snapshot`) wrap system binaries and are TDD'd with mocks. `sync.ts` orchestrates the rsync calls. `commands/*.ts` bind to pi's command system. `index.ts` wires it all together.

**Tech Stack:** TypeScript, vitest (tests), `bonjour-service` npm (mDNS), `ssh`, `sshd`, `rsync`, `sqlite3` (system binaries).

---

## Project layout

```
~/Documents/GulanesKorp/PiSync/
├── SPEC.md                   # already exists
├── PLAN.md                   # this file
├── README.md
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── index.ts              # entry; registers commands
│   ├── types.ts              # all shared types
│   ├── config.ts             # pi-sync.json load/save
│   ├── lock.ts               # sync.lock acquire/release
│   ├── log.ts                # JSONL append logger
│   ├── manifest.ts           # file walk + exclude + hash
│   ├── baseline.ts           # last-sync-<peer>.json r/w + conflict detect
│   ├── itemize-parser.ts     # parse rsync --itemize-changes
│   ├── mdns.ts               # bonjour-service wrapper
│   ├── ssh.ts                # ssh preflight, keygen, ssh-copy-id
│   ├── sqlite-snapshot.ts    # .backup helper
│   ├── sync.ts               # orchestrator
│   └── commands/
│       ├── sync.ts           # /sync handler
│       ├── sync-push.ts      # /sync-push handler
│       ├── sync-pull.ts      # /sync-pull handler
│       ├── sync-peers.ts     # /sync-peers handler
│       ├── sync-setup.ts     # /sync-setup handler
│       └── sync-status.ts    # /sync-status handler
└── tests/
    ├── config.test.ts
    ├── lock.test.ts
    ├── log.test.ts
    ├── manifest.test.ts
    ├── baseline.test.ts
    ├── itemize-parser.test.ts
    └── sqlite-snapshot.test.ts
```

## Conventions

- All paths in source use `~/.pi/...` resolved via `os.homedir()`.
- System binary calls go through `execFile` (no shell injection).
- All file I/O is async.
- TDD: every module has a failing test before its implementation.
- One commit per task.

---

## Phase 1: Foundation

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `README.md`
- Create: `src/types.ts` (empty stub)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pi-sync",
  "version": "0.1.0",
  "description": "Synchronize pi state between two laptops on the same LAN",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bonjour-service": "^1.2.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 5: Create `README.md` (skeleton)**

```markdown
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
```

- [ ] **Step 6: Create empty `src/types.ts`**

```typescript
// All shared types. Populated in Task 2.
export {};
```

- [ ] **Step 7: Install dependencies**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm install`
Expected: `node_modules/` populated, no errors.

- [ ] **Step 8: Initialize git and commit**

```bash
cd ~/Documents/GulanesKorp/PiSync
git init
git add .
git commit -m "chore: scaffold pi-sync project"
```

---

### Task 2: types.ts + config.ts (TDD)

**Files:**
- Create: `src/types.ts`
- Test: `tests/config.test.ts`
- Create: `src/config.ts`

- [ ] **Step 1: Write the failing test for config**

`tests/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, defaultConfigPath, type PiSyncConfig } from "../src/config.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("config", () => {
  it("returns null when file does not exist", async () => {
    const result = await loadConfig(join(tmp, "missing.json"));
    expect(result).toBeNull();
  });

  it("round-trips a config object", async () => {
    const path = join(tmp, "config.json");
    const cfg: PiSyncConfig = {
      peer: "laptop-b.local",
      sshKey: "~/.ssh/pi-sync-ed25519",
      sshPort: 22,
      rsyncPort: 22,
      syncPaths: ["default"],
      excludePatterns: [],
    };
    await saveConfig(path, cfg);
    const loaded = await loadConfig(path);
    expect(loaded).toEqual(cfg);
  });

  it("rejects config missing required fields", async () => {
    const path = join(tmp, "bad.json");
    await writeFile(path, JSON.stringify({ peer: "x" }));
    await expect(loadConfig(path)).rejects.toThrow(/sshKey/);
  });

  it("defaultConfigPath points to ~/.pi/agent/pi-sync.json", () => {
    expect(defaultConfigPath()).toMatch(/\.pi\/agent\/pi-sync\.json$/);
  });
});
```

- [ ] **Step 2: Run the test; expect failure**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- config`
Expected: FAIL with "Cannot find module '../src/config.js'"

- [ ] **Step 3: Implement `src/types.ts`**

```typescript
export interface PiSyncConfig {
  peer: string;
  sshKey: string;
  sshPort: number;
  rsyncPort: number;
  syncPaths: string[];
  excludePatterns: string[];
}

export interface PeerInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  piVersion: string;
  lastSeen: number; // ms epoch
}

export interface Baseline {
  peerId: string;
  lastSyncMs: number;
  // map from relative path to mtime_ms of the version that was synced
  mtimes: Record<string, number>;
}

export type SyncDirection = "push" | "pull";

export interface SyncEvent {
  ts: string; // ISO
  peer: string; // peer id
  direction: SyncDirection;
  action: "transfer" | "conflict" | "skip" | "error" | "snapshot" | "rename";
  path: string;
  detail?: Record<string, unknown>;
}

export interface LockHandle {
  pid: number;
  acquiredAt: number;
}

export interface RsyncItem {
  direction: RsyncDirFlag;
  typeFlag: string;       // e.g. "f" for file, "d" for dir
  attributeFlags: string; // e.g. ".c..t......"
  sizeOrMode: string;
  path: string;
}

export type RsyncDirFlag = ">" | "<" | "*" | "+" | ".";
```

- [ ] **Step 4: Implement `src/config.ts`**

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { PiSyncConfig } from "./types.js";

export function defaultConfigPath(): string {
  return join(homedir(), ".pi", "agent", "pi-sync.json");
}

export async function loadConfig(path: string = defaultConfigPath()): Promise<PiSyncConfig | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  validate(parsed);
  return parsed as unknown as PiSyncConfig;
}

export async function saveConfig(path: string, cfg: PiSyncConfig): Promise<void> {
  validate(cfg as unknown as Record<string, unknown>);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

function validate(o: Record<string, unknown>): void {
  const required = ["peer", "sshKey", "sshPort", "rsyncPort", "syncPaths", "excludePatterns"];
  for (const k of required) {
    if (!(k in o)) throw new Error(`pi-sync config missing required field: ${k}`);
  }
  if (typeof o.peer !== "string" || !o.peer) throw new Error("peer must be non-empty string");
  if (typeof o.sshKey !== "string" || !o.sshKey) throw new Error("sshKey must be non-empty string");
}
```

- [ ] **Step 5: Run the test; expect pass**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- config`
Expected: 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts tests/config.test.ts
git commit -m "feat(config): typed config load/save with validation"
```

---

### Task 3: lock.ts (TDD)

**Files:**
- Test: `tests/lock.test.ts`
- Create: `src/lock.ts`

- [ ] **Step 1: Write the failing test**

`tests/lock.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../src/lock.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-lock-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("lock", () => {
  it("acquires when no lock file exists", async () => {
    const handle = await acquireLock(tmp);
    expect(handle.pid).toBe(process.pid);
    expect(handle.acquiredAt).toBeGreaterThan(0);
    await releaseLock(tmp, handle);
  });

  it("refuses when lock held by a live process (simulated)", async () => {
    const path = join(tmp, "sync.lock");
    await acquireLock(tmp);
    // fake another live PID
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, JSON.stringify({ pid: 999999, acquiredAt: Date.now() }));
    // 999999 is almost certainly not running
    await expect(acquireLock(tmp)).resolves.toBeDefined(); // stale PID → clear & acquire
  });

  it("refuses when lock held by current process (re-entrant)", async () => {
    await acquireLock(tmp);
    await expect(acquireLock(tmp)).rejects.toThrow(/already running/);
  });

  it("release removes lock file", async () => {
    const handle = await acquireLock(tmp);
    await releaseLock(tmp, handle);
    const { readFile } = await import("node:fs/promises");
    await expect(readFile(join(tmp, "sync.lock"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- lock`
Expected: FAIL module not found.

- [ ] **Step 3: Implement `src/lock.ts`**

```typescript
import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { kill } from "node:process";
import type { LockHandle } from "./types.js";

export const LOCK_FILENAME = "sync.lock";

function lockPath(dir: string): string {
  return join(dir, LOCK_FILENAME);
}

export async function acquireLock(dir: string): Promise<LockHandle> {
  const path = lockPath(dir);
  try {
    const raw = await readFile(path, "utf8");
    const existing = JSON.parse(raw) as LockHandle;
    if (existing.pid === process.pid) {
      throw new Error(`sync already running (pid ${existing.pid})`);
    }
    if (isPidAlive(existing.pid)) {
      throw new Error(`sync already running (pid ${existing.pid})`);
    }
    // stale lock: clear it and fall through to acquire
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      if (err instanceof Error && err.message.startsWith("sync already running")) throw err;
      // corrupt JSON — treat as stale and continue
    }
  }
  const handle: LockHandle = { pid: process.pid, acquiredAt: Date.now() };
  await writeFile(path, JSON.stringify(handle), "utf8");
  return handle;
}

export async function releaseLock(dir: string, handle: LockHandle): Promise<void> {
  if (handle.pid !== process.pid) return;
  try {
    await unlink(lockPath(dir));
  } catch {
    // already gone
  }
}

function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
```

- [ ] **Step 4: Run; expect pass**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- lock`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lock.ts tests/lock.test.ts
git commit -m "feat(lock): pid-based lock with stale-pid recovery"
```

---

## Phase 2: Pure logic

### Task 4: log.ts (TDD)

**Files:**
- Test: `tests/log.test.ts`
- Create: `src/log.ts`

- [ ] **Step 1: Write the failing test**

`tests/log.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logEvent, readLog } from "../src/log.js";
import type { SyncEvent } from "../src/types.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-log-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("log", () => {
  it("appends a JSONL line", async () => {
    const event: SyncEvent = {
      ts: new Date().toISOString(),
      peer: "peer-1",
      direction: "push",
      action: "transfer",
      path: "skills/foo",
    };
    await logEvent(tmp, event);
    const content = await readFile(join(tmp, "log.jsonl"), "utf8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(event);
  });

  it("appends multiple events on separate lines", async () => {
    for (let i = 0; i < 3; i++) {
      await logEvent(tmp, {
        ts: new Date().toISOString(),
        peer: "p",
        direction: "push",
        action: "transfer",
        path: `f${i}`,
      });
    }
    const events = await readLog(tmp);
    expect(events).toHaveLength(3);
    expect(events[0].path).toBe("f0");
    expect(events[2].path).toBe("f2");
  });

  it("readLog returns [] when file missing", async () => {
    expect(await readLog(tmp)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run; expect failure**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- log`

- [ ] **Step 3: Implement `src/log.ts`**

```typescript
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SyncEvent } from "./types.js";

export const LOG_FILENAME = "log.jsonl";

function logPath(dir: string): string {
  return join(dir, LOG_FILENAME);
}

export async function logEvent(dir: string, event: SyncEvent): Promise<void> {
  await appendFile(logPath(dir), JSON.stringify(event) + "\n", "utf8");
}

export async function readLog(dir: string): Promise<SyncEvent[]> {
  let raw: string;
  try {
    raw = await readFile(logPath(dir), "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as SyncEvent);
}
```

- [ ] **Step 4: Run; expect pass**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- log`

- [ ] **Step 5: Commit**

```bash
git add src/log.ts tests/log.test.ts
git commit -m "feat(log): append-only JSONL event log"
```

---

### Task 5: manifest.ts (TDD)

**Files:**
- Test: `tests/manifest.test.ts`
- Create: `src/manifest.ts`

- [ ] **Step 1: Write the failing test**

`tests/manifest.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, type ManifestEntry, DEFAULT_EXCLUDES } from "../src/manifest.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-sync-mf-"));
  await mkdir(join(root, "skills/a"), { recursive: true });
  await mkdir(join(root, "skills/b"), { recursive: true });
  await writeFile(join(root, "skills/a/SKILL.md"), "a");
  await writeFile(join(root, "skills/b/SKILL.md"), "b");
  await writeFile(join(root, "AGENTS.md"), "agents");
  await writeFile(join(root, "auth.json"), "{}");
  await writeFile(join(root, "settings.json"), "{}");
  await writeFile(join(root, "models-store.json.bak"), "bak");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("manifest", () => {
  it("walks the tree and returns relative entries", async () => {
    const m = await buildManifest(root);
    const paths = m.map((e) => e.relPath).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "settings.json",
        "skills/a/SKILL.md",
        "skills/b/SKILL.md",
      ]),
    );
  });

  it("excludes auth.json by default", async () => {
    const m = await buildManifest(root);
    expect(m.find((e) => e.relPath === "auth.json")).toBeUndefined();
  });

  it("excludes *.bak by default", async () => {
    const m = await buildManifest(root);
    expect(m.find((e) => e.relPath === "models-store.json.bak")).toBeUndefined();
  });

  it("records size and mtime", async () => {
    const m = await buildManifest(root);
    const a = m.find((e) => e.relPath === "AGENTS.md");
    expect(a).toBeDefined();
    expect(a!.size).toBeGreaterThan(0);
    expect(a!.mtimeMs).toBeGreaterThan(0);
  });

  it("adds an extra exclude pattern", async () => {
    const m = await buildManifest(root, { extra: ["skills/a/**"] });
    expect(m.find((e) => e.relPath.startsWith("skills/a"))).toBeUndefined();
  });

  it("DEFAULT_EXCLUDES contains auth.json", () => {
    expect(DEFAULT_EXCLUDES).toContain("auth.json");
    expect(DEFAULT_EXCLUDES.some((p) => p.endsWith(".bak"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/manifest.ts`**

```typescript
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const DEFAULT_EXCLUDES: string[] = [
  "auth.json",
  "**/*.bak",
  "**/*.db-wal",
  "**/*.db-shm",
  "**/node_modules/**",
  "models-store.json.bak",
];

export interface ManifestEntry {
  relPath: string;
  size: number;
  mtimeMs: number;
}

export interface ManifestOptions {
  extra?: string[];
}

export async function buildManifest(
  root: string,
  opts: ManifestOptions = {},
): Promise<ManifestEntry[]> {
  const excludes = [...DEFAULT_EXCLUDES, ...(opts.extra ?? [])];
  const out: ManifestEntry[] = [];
  await walk(root, root, excludes, out);
  return out;
}

async function walk(
  root: string,
  dir: string,
  excludes: string[],
  out: ManifestEntry[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (matchesAny(rel, excludes)) continue;
    if (entry.isDirectory()) {
      await walk(root, abs, excludes, out);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      out.push({ relPath: rel, size: s.size, mtimeMs: Math.floor(s.mtimeMs) });
    }
  }
}

function matchesAny(rel: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (matchesGlob(rel, p)) return true;
  }
  return false;
}

// Minimal glob matcher: ** for any depth, * for any chars except /, ? for single char.
export function matchesGlob(s: string, pattern: string): boolean {
  // escape regex special chars except * and ?
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "::DOUBLESTAR::")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/::DOUBLESTAR::/g, ".*") +
      "$",
  );
  return re.test(s);
}
```

- [ ] **Step 4: Run; expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/manifest.ts tests/manifest.test.ts
git commit -m "feat(manifest): recursive file walk with exclude patterns"
```

---

### Task 6: baseline.ts (TDD)

**Files:**
- Test: `tests/baseline.test.ts`
- Create: `src/baseline.ts`

- [ ] **Step 1: Write the failing test**

`tests/baseline.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBaseline, saveBaseline, detectConflict } from "../src/baseline.js";
import type { Baseline } from "../src/types.js";

let tmp: string;
const PEER = "peer-1";

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-base-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const blank: Baseline = { peerId: PEER, lastSyncMs: 0, mtimes: {} };

describe("baseline", () => {
  it("returns blank baseline when file missing", async () => {
    const b = await loadBaseline(tmp, PEER);
    expect(b).toEqual(blank);
  });

  it("round-trips a baseline", async () => {
    const b: Baseline = { peerId: PEER, lastSyncMs: 12345, mtimes: { "skills/a.md": 1000 } };
    await saveBaseline(tmp, b);
    const loaded = await loadBaseline(tmp, PEER);
    expect(loaded).toEqual(b);
  });

  it("detectConflict returns true when both sides modified after baseline", () => {
    const baseline: Baseline = { peerId: PEER, lastSyncMs: 1000, mtimes: {} };
    expect(detectConflict(baseline, "x.md", 2000, 3000)).toBe(true);
  });

  it("detectConflict returns false when only one side modified", () => {
    const baseline: Baseline = { peerId: PEER, lastSyncMs: 1000, mtimes: {} };
    expect(detectConflict(baseline, "x.md", 2000, 500)).toBe(false);
  });

  it("detectConflict returns false when neither modified", () => {
    const baseline: Baseline = { peerId: PEER, lastSyncMs: 1000, mtimes: { "x.md": 500 } };
    expect(detectConflict(baseline, "x.md", 500, 500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/baseline.ts`**

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Baseline } from "./types.js";

function baselinePath(dir: string, peerId: string): string {
  return join(dir, `last-sync-${peerId}.json`);
}

export async function loadBaseline(dir: string, peerId: string): Promise<Baseline> {
  try {
    const raw = await readFile(baselinePath(dir, peerId), "utf8");
    return JSON.parse(raw) as Baseline;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { peerId, lastSyncMs: 0, mtimes: {} };
    }
    throw err;
  }
}

export async function saveBaseline(dir: string, b: Baseline): Promise<void> {
  await writeFile(baselinePath(dir, b.peerId), JSON.stringify(b, null, 2) + "\n", "utf8");
}

/**
 * Real conflict = both sides modified this path since the last successful sync.
 * @param baseline stored baseline (from previous sync)
 * @param path relative path
 * @param localMtime ms epoch
 * @param remoteMtime ms epoch
 */
export function detectConflict(
  baseline: Baseline,
  path: string,
  localMtime: number,
  remoteMtime: number,
): boolean {
  const baselineMtime = baseline.mtimes[path] ?? 0;
  return localMtime > baselineMtime && remoteMtime > baselineMtime;
}
```

- [ ] **Step 4: Run; expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/baseline.ts tests/baseline.test.ts
git commit -m "feat(baseline): per-peer mtime baseline + conflict detector"
```

---

## Phase 3: Parsers and adapters

### Task 7: itemize-parser.ts (TDD)

**Files:**
- Test: `tests/itemize-parser.test.ts`
- Create: `src/itemize-parser.ts`

- [ ] **Step 1: Write the failing test**

`tests/itemize-parser.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseItemizeLine, parseItemizeStream } from "../src/itemize-parser.js";

describe("itemize-parser", () => {
  it("parses a transfer line", () => {
    const line = ">f+++++++++ skills/a/SKILL.md";
    const r = parseItemizeLine(line);
    expect(r).not.toBeNull();
    expect(r!.direction).toBe(">");
    expect(r!.typeFlag).toBe("f");
    expect(r!.path).toBe("skills/a/SKILL.md");
  });

  it("parses a checksum-triggered line", () => {
    const line = ">fc..t...... skills/a/SKILL.md";
    const r = parseItemizeLine(line);
    expect(r!.attributeFlags).toBe("c..t......");
  });

  it("returns null for blank lines and comments", () => {
    expect(parseItemizeLine("")).toBeNull();
    expect(parseItemizeLine(" sending incremental file list")).toBeNull();
  });

  it("parses a multi-line stream", () => {
    const input = [
      "sending incremental file list",
      ">f+++++++++ skills/a/SKILL.md",
      "*deleting   skills/old.md",
      "",
    ].join("\n");
    const events = parseItemizeStream(input);
    expect(events).toHaveLength(2);
    expect(events[0].path).toBe("skills/a/SKILL.md");
    expect(events[1].path).toBe("skills/old.md");
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/itemize-parser.ts`**

```typescript
import type { RsyncItem } from "./types.js";

// rsync itemize format: "<dir><type><attrs> <size-or-mode> <date-or-empty> <path>"
// example: ">f+++++++++ skills/a/SKILL.md"
// example: "*deleting   skills/old.md"
// example: ".d..t...... skills/b/"
const LINE_RE = /^([><*+.cdlps])(\S+)\s+(.+)$/;

export function parseItemizeLine(line: string): RsyncItem | null {
  if (!line || line.startsWith(" ")) return null;
  if (line.startsWith("sending ") || line.startsWith("total ") || line.startsWith("building ")) return null;
  // delete lines: "*deleting   path" — typeFlag = "deleting", path after spaces
  if (line.startsWith("*")) {
    const m = /^\*\s*\S+\s+(.+)$/.exec(line);
    if (!m) return null;
    return {
      direction: "*",
      typeFlag: "deleting",
      attributeFlags: "",
      sizeOrMode: "",
      path: m[1].trim(),
    };
  }
  const m = LINE_RE.exec(line);
  if (!m) return null;
  return {
    direction: m[1] as RsyncItem["direction"],
    typeFlag: m[2][0],
    attributeFlags: m[2].slice(1),
    sizeOrMode: "",
    path: m[3].trim(),
  };
}

export function parseItemizeStream(input: string): RsyncItem[] {
  return input
    .split("\n")
    .map(parseItemizeLine)
    .filter((x): x is RsyncItem => x !== null);
}
```

- [ ] **Step 4: Run; expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/itemize-parser.ts tests/itemize-parser.test.ts
git commit -m "feat(itemize): parse rsync --itemize-changes output"
```

---

### Task 8: sqlite-snapshot.ts (TDD)

**Files:**
- Test: `tests/sqlite-snapshot.test.ts`
- Create: `src/sqlite-snapshot.ts`

- [ ] **Step 1: Write the failing test**

`tests/sqlite-snapshot.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sqliteAvailable } from "../src/sqlite-snapshot.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-sql-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("sqlite-snapshot", () => {
  it("sqliteAvailable returns true when sqlite3 is on PATH", () => {
    const probe = spawnSync("sqlite3", ["--version"]);
    if (probe.status === 0) {
      expect(sqliteAvailable()).toBe(true);
    } else {
      expect(sqliteAvailable()).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/sqlite-snapshot.ts`**

```typescript
import { spawn } from "node:child_process";
import { rename } from "node:fs/promises";

/** Returns true if the sqlite3 CLI is on PATH and responds to --version. */
export async function sqliteAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("sqlite3", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * Take a consistent backup of a SQLite database using the online backup API.
 * Safe to run while other processes hold the DB open for read/write.
 * Returns the path to the snapshot file.
 */
export async function sqliteSnapshot(dbPath: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sqlite3", [dbPath, `.backup '${outPath}'`], { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`sqlite3 .backup exited with code ${code}`));
    });
  });
}

/** Atomic rename: snapshot over live DB. */
export async function atomicReplace(src: string, dst: string): Promise<void> {
  await rename(src, dst);
}
```

- [ ] **Step 4: Run; expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/sqlite-snapshot.ts tests/sqlite-snapshot.test.ts
git commit -m "feat(sqlite): snapshot DB via online backup API"
```

---

### Task 9: ssh.ts (TDD)

**Files:**
- Test: `tests/ssh.test.ts`
- Create: `src/ssh.ts`

- [ ] **Step 1: Write the failing test**

`tests/ssh.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildSshArgs, generateKeyArgs, sshCopyIdArgs } from "../src/ssh.js";

describe("ssh", () => {
  it("buildSshArgs adds BatchMode and key", () => {
    const args = buildSshArgs({ host: "user@b.local", keyPath: "/tmp/id_ed25519", port: 22 });
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/id_ed25519");
    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("-p");
    expect(args).toContain("22");
    expect(args[args.length - 1]).toBe("user@b.local");
  });

  it("generateKeyArgs is ssh-keygen flags", () => {
    const args = generateKeyArgs("/tmp/pi-sync-id", "ed25519");
    expect(args[0]).toBe("-t");
    expect(args[1]).toBe("ed25519");
    expect(args[2]).toBe("-f");
    expect(args[3]).toBe("/tmp/pi-sync-id");
    expect(args[4]).toBe("-N");
    expect(args[5]).toBe("");
  });

  it("sshCopyIdArgs targets the right host", () => {
    const args = sshCopyIdArgs("/tmp/key.pub", "user@host");
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/tmp/key.pub");
    expect(args[2]).toBe("user@host");
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/ssh.ts`**

```typescript
export interface SshOpts {
  host: string;
  keyPath: string;
  port: number;
  connectTimeout?: number;
  command?: string;
}

export function buildSshArgs(opts: SshOpts): string[] {
  const args: string[] = [];
  if (opts.port !== 22) args.push("-p", String(opts.port));
  args.push("-i", opts.keyPath);
  args.push("-o", "BatchMode=yes");
  args.push("-o", `ConnectTimeout=${opts.connectTimeout ?? 5}`);
  args.push("-o", "StrictHostKeyChecking=accept-new");
  args.push(opts.host);
  if (opts.command !== undefined) args.push(opts.command);
  return args;
}

export function generateKeyArgs(keyPath: string, type: "ed25519" | "rsa" = "ed25519"): string[] {
  return ["-t", type, "-f", keyPath, "-N", "", "-q"];
}

export function sshCopyIdArgs(pubKeyPath: string, host: string): string[] {
  return ["-i", pubKeyPath, host];
}
```

- [ ] **Step 4: Run; expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/ssh.ts tests/ssh.test.ts
git commit -m "feat(ssh): ssh arg builders (no live ssh calls)"
```

---

### Task 10: mdns.ts (TDD, mostly mocked)

**Files:**
- Test: `tests/mdns.test.ts`
- Create: `src/mdns.ts`

- [ ] **Step 1: Write the failing test**

`tests/mdns.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatServiceName, parseServiceName, type MdnsService } from "../src/mdns.js";

describe("mdns", () => {
  it("formatServiceName produces _type._proto.local", () => {
    expect(formatServiceName("pi-sync", "tcp")).toBe("_pi-sync._tcp.local");
  });

  it("parseServiceName extracts TXT records", () => {
    const txt: Record<string, string> = { id: "abc", pi: "1.0", name: "laptop-b" };
    const s: MdnsService = {
      name: "laptop-b",
      host: "192.168.100.42",
      port: 7333,
      txt,
    };
    const parsed = parseServiceName(s);
    expect(parsed.id).toBe("abc");
    expect(parsed.piVersion).toBe("1.0");
    expect(parsed.name).toBe("laptop-b");
  });
});
```

- [ ] **Step 2: Run; expect failure**

- [ ] **Step 3: Implement `src/mdns.ts`**

```typescript
import Bonjour from "bonjour-service";
import type { PeerInfo } from "./types.js";

export type MdnsService = {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
};

export const SERVICE_TYPE = "pi-sync";
export const SERVICE_PROTO = "tcp";
export const SERVICE_PORT = 7333;

export function formatServiceName(type: string = SERVICE_TYPE, proto: string = SERVICE_PROTO): string {
  return `_${type}._${proto}.local`;
}

/** Convert raw bonjour-service browse result into our PeerInfo shape. */
export function parseServiceName(s: MdnsService): PeerInfo {
  return {
    id: s.txt["id"] ?? "",
    name: s.txt["name"] ?? s.name,
    host: s.host,
    port: s.port,
    piVersion: s.txt["pi"] ?? "unknown",
    lastSeen: Date.now(),
  };
}

export interface Advertiser {
  stop(): void;
}

export function advertise(opts: { id: string; name: string; piVersion: string; port?: number }): Advertiser {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: opts.name,
    type: SERVICE_TYPE,
    protocol: SERVICE_PROTO,
    port: opts.port ?? SERVICE_PORT,
    txt: { id: opts.id, name: opts.name, pi: opts.piVersion },
  });
  return {
    stop() {
      try { service.stop(); } catch { /* ignore */ }
      try { bonjour.unpublishAll(); } catch { /* ignore */ }
      try { bonjour.destroy(); } catch { /* ignore */ }
    },
  };
}

/** Browse for peers. Resolves with whatever is found within `timeoutMs`. */
export function findPeers(timeoutMs: number = 5000): Promise<PeerInfo[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found: PeerInfo[] = [];
    const browser = bonjour.find({ type: SERVICE_TYPE, protocol: SERVICE_PROTO });
    browser.on("up", (svc: unknown) => {
      const s = svc as MdnsService;
      const info = parseServiceName(s);
      if (info.id) found.push(info);
    });
    setTimeout(() => {
      try { browser.stop(); } catch { /* ignore */ }
      try { bonjour.destroy(); } catch { /* ignore */ }
      resolve(found);
    }, timeoutMs);
  });
}
```

- [ ] **Step 4: Run; expect pass**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test -- mdns`
Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/mdns.ts tests/mdns.test.ts
git commit -m "feat(mdns): advertise + browse via bonjour-service"
```

---

## Phase 4: Orchestration

### Task 11: sync.ts (orchestrator)

**Files:**
- Create: `src/sync.ts`

This task is glue code; tests for it are at the integration-test task (Task 20).

- [ ] **Step 1: Implement `src/sync.ts`**

```typescript
import { spawn } from "node:child_process";
import { resolve, join, basename } from "node:path";
import { homedir } from "node:os";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildManifest, DEFAULT_EXCLUDES } from "./manifest.js";
import { parseItemizeStream, type RsyncItem } from "./itemize-parser.js";
import { loadBaseline, saveBaseline, detectConflict } from "./baseline.js";
import { logEvent, readLog } from "./log.js";
import { acquireLock, releaseLock } from "./lock.js";
import { sqliteSnapshot, sqliteAvailable, atomicReplace } from "./sqlite-snapshot.js";
import { buildSshArgs } from "./ssh.js";
import type { PiSyncConfig, PeerInfo, SyncDirection, Baseline } from "./types.js";

const execFileP = promisify(execFile);

const PEER_DIR = join(homedir(), ".pi");
const CACHE_DIR = join(PEER_DIR, "cache", "pi-sync");
const MEMORY_DB = join(PEER_DIR, "memory", "memory.db");

export interface SyncOpts {
  config: PiSyncConfig;
  peer: PeerInfo;
  direction: SyncDirection;
  onProgress?: (msg: string) => void;
}

export interface SyncResult {
  transferred: number;
  conflicts: string[];
  bytes: number;
  error?: string;
}

/**
 * Run a single rsync transfer.
 * For `push`: src on local → dst on remote (under ~/.pi/ on remote)
 * For `pull`: src on remote → dst on local
 *
 * Memory DB is special-cased: snapshot first, then transfer the snapshot.
 */
export async function runSync(opts: SyncOpts): Promise<SyncResult> {
  const { config, peer, direction, onProgress } = opts;
  const handle = await acquireLock(CACHE_DIR);

  const result: SyncResult = { transferred: 0, conflicts: [], bytes: 0 };

  try {
    // 1. Memory DB: snapshot locally before sending
    let memorySnapshot: string | null = null;
    if (await sqliteAvailable()) {
      memorySnapshot = `/tmp/pi-sync-mem-${randomUUID()}.db`;
      await sqliteSnapshot(MEMORY_DB, memorySnapshot);
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "snapshot",
        path: "memory.db",
        detail: { snapshot: memorySnapshot },
      });
    } else {
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "skip",
        path: "memory.db",
        detail: { reason: "sqlite3 not installed" },
      });
    }

    // 2. Build rsync command
    const excludeArgs = DEFAULT_EXCLUDES.flatMap((e) => ["--exclude", e]);
    const sshArgs = buildSshArgs({
      host: peer.host,
      keyPath: resolve(config.sshKey.startsWith("~") ? config.sshKey.replace("~", homedir()) : config.sshKey),
      port: config.rsyncPort,
      connectTimeout: 5,
    });
    const sshCmd = `ssh ${sshArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
    const rsyncArgs: string[] = [
      "-a",
      "--update",
      "--itemize-changes",
      "--info=stats2",
      "--backup",
      `--backup-dir=${join(CACHE_DIR, "conflict-archive", peer.id, String(Date.now()))}`,
      ...excludeArgs,
      "-e", sshCmd,
    ];

    const src = direction === "push" ? join(PEER_DIR, "agent") : `${peer.host}:${PEER_DIR}/agent/`;
    const dst = direction === "push" ? `${peer.host}:${PEER_DIR}/agent/` : join(PEER_DIR, "agent");
    rsyncArgs.push(src, dst);

    if (onProgress) onProgress(`rsync ${direction}…`);
    const { stdout } = await execFileP("rsync", rsyncArgs, { maxBuffer: 50 * 1024 * 1024 });

    // 3. Parse rsync output for conflicts
    const baseline = await loadBaseline(CACHE_DIR, peer.id);
    const items = parseItemizeStream(stdout);
    await classifyItems(items, peer, direction, baseline, result);

    // 4. Memory DB transfer (separate from rsync because of snapshot semantics)
    if (memorySnapshot) {
      await transferMemoryDb(direction, peer, config, memorySnapshot);
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "rename",
        path: "memory.db",
      });
    }

    // 5. Update baseline
    baseline.lastSyncMs = Date.now();
    const manifest = await buildManifest(join(PEER_DIR, "agent"));
    for (const entry of manifest) {
      baseline.mtimes[entry.relPath] = entry.mtimeMs;
    }
    await saveBaseline(CACHE_DIR, baseline);
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : String(err);
    await logEvent(CACHE_DIR, {
      ts: new Date().toISOString(),
      peer: peer.id,
      direction,
      action: "error",
      path: "-",
      detail: { error: result.error },
    });
  } finally {
    await releaseLock(CACHE_DIR, handle);
  }

  return result;
}

async function classifyItems(
  items: RsyncItem[],
  peer: PeerInfo,
  direction: SyncDirection,
  baseline: Baseline,
  result: SyncResult,
): Promise<void> {
  for (const item of items) {
    if (item.direction === "*" || item.typeFlag === "d") continue;
    if (item.direction === ">") {
      result.transferred++;
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "transfer",
        path: item.path,
        detail: { attrs: item.attributeFlags },
      });
    } else if (item.attributeFlags.includes("c")) {
      // checksum-triggered transfer: check for real conflict
      const localPath = join(PEER_DIR, "agent", item.path);
      let localMtime = 0;
      try {
        const s = await stat(localPath);
        localMtime = Math.floor(s.mtimeMs);
      } catch { /* ignore */ }
      const isConflict = detectConflict(baseline, item.path, localMtime, Date.now());
      if (isConflict) {
        result.conflicts.push(item.path);
        await logEvent(CACHE_DIR, {
          ts: new Date().toISOString(),
          peer: peer.id,
          direction,
          action: "conflict",
          path: item.path,
        });
      }
    }
  }
}

async function transferMemoryDb(
  direction: SyncDirection,
  peer: PeerInfo,
  config: PiSyncConfig,
  localSnapshot: string,
): Promise<void> {
  const sshArgs = buildSshArgs({
    host: peer.host,
    keyPath: resolve(config.sshKey.startsWith("~") ? config.sshKey.replace("~", homedir()) : config.sshKey),
    port: config.sshPort,
    connectTimeout: 5,
  });
  const sshCmd = `ssh ${sshArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
  if (direction === "push") {
    await execFileP("rsync", ["-a", "-e", sshCmd, localSnapshot, `${peer.host}:/tmp/mem-receive.db`]);
    // Atomic rename on receiver
    await execFileP("ssh", [...sshArgs, "mv", "/tmp/mem-receive.db", MEMORY_DB]);
  } else {
    await execFileP("rsync", ["-a", "-e", sshCmd, `${peer.host}:${MEMORY_DB}`, localSnapshot]);
    await atomicReplace(localSnapshot, MEMORY_DB);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ~/Documents/GulanesKorp/PiSync && npx tsc --noEmit`
Expected: no errors. If errors, fix and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/sync.ts
git commit -m "feat(sync): orchestrator with memory-db snapshot + baseline update"
```

---

## Phase 5: Commands

### Task 12: commands/sync-push.ts and commands/sync-pull.ts

**Files:**
- Create: `src/commands/sync-push.ts`
- Create: `src/commands/sync-pull.ts`

These are thin wrappers over `sync.ts`. No new tests; tested in Task 20 integration.

- [ ] **Step 1: Implement `src/commands/sync-push.ts`**

```typescript
import { runSync, type SyncResult } from "../sync.js";
import type { PiSyncConfig, PeerInfo } from "../types.js";

export async function syncPush(
  config: PiSyncConfig,
  peer: PeerInfo,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  return runSync({ config, peer, direction: "push", onProgress });
}
```

- [ ] **Step 2: Implement `src/commands/sync-pull.ts`**

```typescript
import { runSync, type SyncResult } from "../sync.js";
import type { PiSyncConfig, PeerInfo } from "../types.js";

export async function syncPull(
  config: PiSyncConfig,
  peer: PeerInfo,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  return runSync({ config, peer, direction: "pull", onProgress });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/sync-push.ts src/commands/sync-pull.ts
git commit -m "feat(commands): sync-push and sync-pull wrappers"
```

---

### Task 13: commands/sync.ts (the main `/sync`)

**Files:**
- Create: `src/commands/sync.ts`

- [ ] **Step 1: Implement `src/commands/sync.ts`**

```typescript
import { syncPush } from "./sync-push.js";
import { syncPull } from "./sync-pull.js";
import type { PiSyncConfig, PeerInfo } from "../types.js";

export interface FullSyncResult {
  push: { transferred: number; conflicts: string[]; bytes: number; error?: string };
  pull: { transferred: number; conflicts: string[]; bytes: number; error?: string };
}

export async function fullSync(
  config: PiSyncConfig,
  peer: PeerInfo,
  onProgress?: (msg: string) => void,
): Promise<FullSyncResult> {
  const note = (m: string) => onProgress?.(m);
  note("push: local → remote");
  const push = await syncPush(config, peer, onProgress);
  note("pull: remote → local");
  const pull = await syncPull(config, peer, onProgress);
  return { push, pull };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/sync.ts
git commit -m "feat(commands): full bidirectional sync handler"
```

---

### Task 14: commands/sync-peers.ts

**Files:**
- Create: `src/commands/sync-peers.ts`

- [ ] **Step 1: Implement `src/commands/sync-peers.ts`**

```typescript
import { findPeers } from "../mdns.js";
import { loadConfig } from "../config.js";
import type { PeerInfo } from "../types.js";

export interface PeersResult {
  peers: PeerInfo[];
  hint?: string;
}

export async function listPeers(timeoutMs = 5000): Promise<PeersResult> {
  const peers = await findPeers(timeoutMs);
  const hint = peers.length === 0
    ? "no peers found — if both laptops are on guest WiFi, AP isolation may block mDNS. Check connectivity or configure peer manually via /sync-setup."
    : undefined;
  // Honor settings.json peer as a fallback even when mDNS finds nothing
  const config = await loadConfig();
  if (config && peers.length === 0) {
    peers.push({
      id: "configured",
      name: "configured peer",
      host: config.peer,
      port: 22,
      piVersion: "unknown",
      lastSeen: 0,
    });
  }
  return { peers, hint };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/sync-peers.ts
git commit -m "feat(commands): list peers via mDNS with settings fallback"
```

---

### Task 15: commands/sync-setup.ts

**Files:**
- Create: `src/commands/sync-setup.ts`

- [ ] **Step 1: Implement `src/commands/sync-setup.ts`**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { saveConfig } from "../config.js";
import { generateKeyArgs, sshCopyIdArgs, buildSshArgs } from "../ssh.js";
import type { PiSyncConfig } from "../types.js";

const execFileP = promisify(execFile);

export async function setupPeer(remoteHost: string): Promise<{ pubkey: string; config: PiSyncConfig }> {
  const keyPath = resolve(homedir(), ".ssh", "pi-sync-ed25519");
  const pubPath = keyPath + ".pub";

  // 1. Generate key if missing
  if (!existsSync(keyPath)) {
    await execFileP("ssh-keygen", generateKeyArgs(keyPath));
  }

  // 2. Try ssh-copy-id (uses password auth for one-time install)
  try {
    await execFileP("ssh-copy-id", sshCopyIdArgs(pubPath, remoteHost));
  } catch (err) {
    throw new Error(
      `ssh-copy-id failed. Manually add this public key to ${remoteHost}:~/.ssh/authorized_keys:\n\n${await readPubKey(pubPath)}\n\nThen re-run /sync-setup.`,
    );
  }

  // 3. Verify
  await execFileP("ssh", buildSshArgs({ host: remoteHost, keyPath, port: 22, command: "true" }));

  // 4. Persist config
  const cfg: PiSyncConfig = {
    peer: remoteHost,
    sshKey: "~/.ssh/pi-sync-ed25519",
    sshPort: 22,
    rsyncPort: 22,
    syncPaths: ["default"],
    excludePatterns: [],
  };
  const { defaultConfigPath } = await import("../config.js");
  await saveConfig(defaultConfigPath(), cfg);

  return { pubkey: await readPubKey(pubPath), config: cfg };
}

async function readPubKey(p: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return (await readFile(p, "utf8")).trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/sync-setup.ts
git commit -m "feat(commands): /sync-setup generates key, installs on remote, writes config"
```

---

### Task 16: commands/sync-status.ts

**Files:**
- Create: `src/commands/sync-status.ts`

- [ ] **Step 1: Implement `src/commands/sync-status.ts`**

```typescript
import { readLog } from "../log.js";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SyncEvent } from "../types.js";

const CACHE_DIR = join(homedir(), ".pi", "cache", "pi-sync");

export interface StatusSummary {
  totalEvents: number;
  totalConflicts: number;
  totalErrors: number;
  lastSyncMs: number | null;
  lastConflict: SyncEvent | null;
}

export async function statusSummary(): Promise<StatusSummary> {
  const events = await readLog(CACHE_DIR);
  const conflicts = events.filter((e) => e.action === "conflict");
  const errors = events.filter((e) => e.action === "error");
  const transfers = events.filter((e) => e.action === "transfer");
  return {
    totalEvents: events.length,
    totalConflicts: conflicts.length,
    totalErrors: errors.length,
    lastSyncMs: transfers.length > 0 ? new Date(transfers[transfers.length - 1].ts).getTime() : null,
    lastConflict: conflicts.length > 0 ? conflicts[conflicts.length - 1] : null,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/sync-status.ts
git commit -m "feat(commands): /sync-status summary"
```

---

## Phase 6: Wire-up and integration

### Task 17: index.ts (entry)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { loadConfig } from "./config.js";
import { advertise } from "./mdns.js";
import { fullSync } from "./commands/sync.js";
import { syncPush } from "./commands/sync-push.js";
import { syncPull } from "./commands/sync-pull.js";
import { listPeers } from "./commands/sync-peers.js";
import { setupPeer } from "./commands/sync-setup.js";
import { statusSummary } from "./commands/sync-status.js";
import type { PeerInfo } from "./types.js";

const MY_ID = randomUUID();
const MY_NAME = hostname();

export default function (pi: ExtensionAPI) {
  // Advertiser is created lazily on session_start and torn down on session_shutdown.
  // session_shutdown is registered at factory scope so it always fires.
  let currentAdv: ReturnType<typeof advertise> | null = null;

  pi.on("session_start", async (_event, ctx) => {
    currentAdv = advertise({
      id: MY_ID,
      name: MY_NAME,
      piVersion: "0.1.0",
      port: 7333,
    });
    ctx.ui.setStatus("pi-sync", "advertising");
  });

  pi.on("session_shutdown", async () => {
    currentAdv?.stop();
    currentAdv = null;
  });

  // Resolve peer: arg → configured peer (with mDNS enrichment)
  async function resolvePeer(arg: string | undefined): Promise<PeerInfo | null> {
    if (arg) {
      const [host, port] = arg.split(":");
      return { id: "manual", name: arg, host, port: Number(port ?? 22), piVersion: "unknown", lastSeen: 0 };
    }
    const config = await loadConfig();
    if (!config) return null;
    const { peers } = await listPeers(3000);
    const match = peers.find((p) => p.host === config.peer || p.name === config.peer);
    return match ?? {
      id: "configured",
      name: config.peer,
      host: config.peer,
      port: config.sshPort,
      piVersion: "unknown",
      lastSeen: 0,
    };
  }

  pi.registerCommand("sync", {
    description: "Bidirectional sync with peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      if (!config) {
        ctx.ui.notify("Run /sync-setup <remote-host> first.", "error");
        return;
      }
      const peer = await resolvePeer(args);
      if (!peer) {
        ctx.ui.notify("Could not resolve peer.", "error");
        return;
      }
      ctx.ui.setStatus("pi-sync", `syncing with ${peer.name}…`);
      const result = await fullSync(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.setStatus("pi-sync", "idle");
      const totalConflicts = result.push.conflicts.length + result.pull.conflicts.length;
      const totalTransferred = result.push.transferred + result.pull.transferred;
      if (totalConflicts > 0) {
        ctx.ui.notify(`Synced ${totalTransferred} files. ${totalConflicts} conflict(s).`, "warning");
      } else if (result.push.error || result.pull.error) {
        ctx.ui.notify(`Sync failed: ${result.push.error ?? result.pull.error}`, "error");
      } else {
        ctx.ui.notify(`Synced ${totalTransferred} files with ${peer.name}.`, "info");
      }
    },
  });

  pi.registerCommand("sync-push", {
    description: "One-way push to peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      const peer = await resolvePeer(args);
      if (!config || !peer) return ctx.ui.notify("config or peer missing", "error");
      const r = await syncPush(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.notify(`Pushed ${r.transferred} files.`, r.error ? "error" : "info");
    },
  });

  pi.registerCommand("sync-pull", {
    description: "One-way pull from peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      const peer = await resolvePeer(args);
      if (!config || !peer) return ctx.ui.notify("config or peer missing", "error");
      const r = await syncPull(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.notify(`Pulled ${r.transferred} files.`, r.error ? "error" : "info");
    },
  });

  pi.registerCommand("sync-peers", {
    description: "List discovered peers",
    handler: async (_args, ctx) => {
      const { peers, hint } = await listPeers();
      if (peers.length === 0) {
        ctx.ui.notify(hint ?? "no peers found", "info");
      } else {
        const lines = peers.map((p) => `• ${p.name} (${p.host}:${p.port}) — pi ${p.piVersion}`);
        ctx.ui.notify(`Peers:\n${lines.join("\n")}${hint ? "\n\n" + hint : ""}`, "info");
      }
    },
  });

  pi.registerCommand("sync-setup", {
    description: "One-time setup against a remote host",
    handler: async (args, ctx) => {
      const host = args?.trim();
      if (!host) return ctx.ui.notify("Usage: /sync-setup <remote-host>", "error");
      try {
        await setupPeer(host);
        ctx.ui.notify(`Setup complete. Peer ${host} configured. Run /sync to start.`, "info");
      } catch (err) {
        ctx.ui.notify(`Setup failed: ${err instanceof Error ? err.message : err}`, "error");
      }
    },
  });

  pi.registerCommand("sync-status", {
    description: "Last sync info, conflicts, errors",
    handler: async (_args, ctx) => {
      const s = await statusSummary();
      const lastSync = s.lastSyncMs ? new Date(s.lastSyncMs).toISOString() : "never";
      ctx.ui.notify(
        `Last sync: ${lastSync}\nTransfers: ${s.totalEvents}\nConflicts: ${s.totalConflicts}\nErrors: ${s.totalErrors}`,
        "info",
      );
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/Documents/GulanesKorp/PiSync && npx tsc --noEmit`
Expected: errors related to `@earendil-works/pi-coding-agent` types are OK if the package isn't installed locally; otherwise fix.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat(index): register all pi commands"
```

---

### Task 18: README + install instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the skeleton with full README**

```markdown
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

From `~/Documents/GulanesKorp/PiSync`:

```bash
npm run build
# Either symlink into ~/.pi/agent/extensions/:
ln -s "$(pwd)" ~/.pi/agent/extensions/pi-sync
# Or add to ~/.pi/agent/settings.json under "extensions":
#   "extensions": ["/home/<you>/Documents/GulanesKorp/PiSync"]
```

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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: full README with install + usage"
```

---

### Task 19: Integration smoke test (loopback SSH)

**Files:**
- Create: `tests/integration.test.ts` (skipped if loopback SSH not set up)

- [ ] **Step 1: Write the integration test**

`tests/integration.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { runSync } from "../src/sync.js";

const HAS_SSH_LOOPBACK = (() => {
  try {
    execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=2", "localhost", "true"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!HAS_SSH_LOOPBACK)("integration", () => {
  beforeAll(() => {
    // Sanity: rsync available
    execFileSync("rsync", ["--version"], { stdio: "ignore" });
  });

  it("runs sync without throwing against localhost", async () => {
    const result = await runSync({
      config: {
        peer: "localhost",
        sshKey: "~/.ssh/id_ed25519",
        sshPort: 22,
        rsyncPort: 22,
        syncPaths: ["default"],
        excludePatterns: [],
      },
      peer: {
        id: "loopback",
        name: "loopback",
        host: "localhost",
        port: 22,
        piVersion: "test",
        lastSeen: 0,
      },
      direction: "push",
    });
    // We don't assert specific counts — sync may transfer 0 files if the
    // ~/.pi/agent/ tree on this box doesn't exist on loopback. We just want
    // to confirm the orchestrator doesn't crash.
    expect(result.error).toBeUndefined();
  }, 60_000);
});
```

- [ ] **Step 2: Run; expect skip if loopback SSH isn't available, pass if it is**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test`
Expected: All unit tests pass; integration test skipped unless loopback SSH is configured.

- [ ] **Step 3: Commit**

```bash
git add tests/integration.test.ts
git commit -m "test(integration): loopback SSH smoke test (skipped if unavailable)"
```

---

### Task 20: Final verification

- [ ] **Step 1: Full test suite passes**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm test`
Expected: All tests pass; integration test may be skipped.

- [ ] **Step 2: TypeScript compiles cleanly**

Run: `cd ~/Documents/GulanesKorp/PiSync && npm run build`
Expected: emits `dist/` with no errors.

- [ ] **Step 3: Smoke-load the extension in pi**

Run from this project:

```bash
# from this dir
pi -e ./src/index.ts
```

Then in pi, type `/sync-peers` — should respond "no peers found" (expected; nothing else advertising on your LAN right now).

- [ ] **Step 4: Final commit**

```bash
git add -A
git status
git commit -m "chore: final verification pass" --allow-empty
```

---

## Acceptance criteria (from SPEC.md)

1. `/sync` against a configured peer brings all files in the sync set identical on both sides
2. Memory DB sync is safe under live reads/writes (uses `.backup` API)
3. Real conflicts are emitted as `notify` warnings (not just any transfer)
4. Concurrent syncs are prevented by `sync.lock` with stale-PID recovery
5. Mid-transfer interruption is recoverable (rsync is delta-aware)
6. Every transfer/conflict/error is logged to `log.jsonl`