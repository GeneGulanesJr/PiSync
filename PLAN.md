# PiSync v2 — Extract/Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Use Sequential mode for planned tasks or Direct mode if subagents aren't available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LAN-sync extension with `/pisync extract` (single portable `tar.zst` of pi state → `~/Downloads`) and `/pisync import <archive>` (validated restore with safety backup and atomic DB swap).

**Architecture:** One registered pi command (`pisync`) dispatching to two pure orchestrators (`runExtract`, `runImport`). A single `bundleSpec()` table owns what ships. Transfer is manual; the archive is self-describing (`manifest.json` + `RESTORE.md`), restorable without pi-sync installed. No runtime npm deps — system `tar` + `sqlite3` do the heavy lifting.

**Tech Stack:** TypeScript (ES2022, strict, ESM), Node `fs.cp`/`statfs`/`child_process`, system `tar` + `sqlite3`, vitest. Spec: `SPEC.md` (v2, reviewed).

**Repo state:** branch `main`, clean tree except modified `SPEC.md`. Test suite: `npm test` (vitest run). Build: `npm run build` (tsc).

---

### Task 0: Branch and commit the spec

**Files:**
- Commit: `SPEC.md` (already rewritten)

- [x] **Step 1: Create feature branch and commit the spec**

```bash
cd ~/Documents/GulanesKorp/PiSync
git checkout -b feat/v2-extract-import
git add SPEC.md PLAN.md
git commit -m "docs: v2 spec + implementation plan — pivot from LAN sync to extract/import"
```

- [x] **Step 2: Verify green baseline**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all existing tests pass, build succeeds (old code still intact).

---

### Task 1: Rip out the sync machinery

**Files:**
- Delete: `src/mdns.ts`, `src/ssh.ts`, `src/lock.ts`, `src/sync.ts`, `src/itemize-parser.ts`, `src/baseline.ts`, `src/config.ts`
- Delete: `src/commands/sync.ts`, `src/commands/sync-push.ts`, `src/commands/sync-pull.ts`, `src/commands/sync-peers.ts`, `src/commands/sync-setup.ts`, `src/commands/sync-status.ts`
- Delete: `tests/mdns.test.ts`, `tests/ssh.test.ts`, `tests/lock.test.ts`, `tests/itemize-parser.test.ts`, `tests/baseline.test.ts`, `tests/config.test.ts`, `tests/integration.test.ts`, and any `tests/sync*.test.ts`
- Modify: `package.json` (drop `bonjour-service`, bump 0.2.0, new description)
- Modify: `src/index.ts` (temporary minimal stub — replaced in Task 8)

- [x] **Step 1: Delete sync-era source and tests**

```bash
cd ~/Documents/GulanesKorp/PiSync
git rm src/mdns.ts src/ssh.ts src/lock.ts src/sync.ts src/itemize-parser.ts src/baseline.ts src/config.ts
git rm src/commands/sync.ts src/commands/sync-push.ts src/commands/sync-pull.ts src/commands/sync-peers.ts src/commands/sync-setup.ts src/commands/sync-status.ts
git rm tests/mdns.test.ts tests/ssh.test.ts tests/lock.test.ts tests/itemize-parser.test.ts tests/baseline.test.ts tests/config.test.ts tests/integration.test.ts
git rm -r src/commands tests 2>/dev/null || true
```

(If `git rm tests/...` errors on a file that doesn't exist, skip that file. The final `git rm -r` cleans the now-empty `src/commands/` and any remaining stale tests.)

- [x] **Step 2: Replace `src/index.ts` with a minimal stub**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pisync", {
    description: "Extract pi state to a portable archive / import on another PC",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-sync v2: not wired up yet.", "info");
    },
  });
}
```

- [x] **Step 3: Update `package.json`**

```json
{
  "name": "pi-sync",
  "version": "0.2.0",
  "description": "Extract pi state (settings, skills, memory) to a portable archive and import it on another PC",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@earendil-works/pi-coding-agent": "^0.87.1",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

Then: `rm -rf node_modules package-lock.json && npm install` (drops `bonjour-service` from the tree).

- [x] **Step 4: Verify green with zero sync code**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: no tests (or only `tests/log.test.ts`, `tests/manifest.test.ts`, `tests/sqlite-snapshot.test.ts` if kept — log/manifest tests stay for now), build passes.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat!: remove LAN sync machinery (mDNS/SSH/rsync/lock) — v2 extract/import"
```

---

### Task 2: Types + bundle spec table (`src/types.ts`, `src/paths.ts`)

**Files:**
- Modify: `src/types.ts` (full rewrite)
- Create: `src/paths.ts`
- Create: `tests/paths.test.ts`

- [x] **Step 1: Rewrite `src/types.ts`**

```typescript
export interface BundleSpecEntry {
  source: string;      // ~-form source path on this machine
  bundlePath: string;  // path inside the bundle root
  dest: string;        // ~-form destination on the target machine
  kind: "dir" | "file";
  sqlite?: boolean;    // memory DB: snapshot on extract, atomic swap on import
  skipFlag?: "no-memory" | "no-auth" | "no-agents-skills"; // extract flag that omits this entry
}

export interface BundleManifestEntry {
  bundlePath: string;
  dest: string;
  kind: "dir" | "file";
  files: number;
  bytes: number;
  sqlite?: boolean;
}

export interface BundleManifest {
  schema: 1;
  createdAt: string; // ISO
  hostname: string;
  piVersion: string;
  pisyncVersion: string;
  compression: "zstd" | "gzip";
  entries: BundleManifestEntry[];
  totals: { files: number; bytes: number };
}

export interface ExtractOptions {
  outDir?: string;  // default ~/Downloads; ~-form ok
  noMemory?: boolean;
  noAuth?: boolean;
  noAgentsSkills?: boolean;
}

export interface ExtractResult {
  archivePath: string;
  compression: "zstd" | "gzip";
  bytes: number;        // compressed archive size
  durationMs: number;
  entries: BundleManifestEntry[];
}

export interface ImportResult {
  restored: string[];   // absolute dest paths written
  skipped: string[];    // bundle entries absent from the archive
  backupDir: string | null;
  durationMs: number;
}

export interface OperationEvent {
  ts: string;                          // ISO
  op: "extract" | "import";
  status: "start" | "done" | "error";
  detail?: Record<string, unknown>;
}
```

- [x] **Step 2: Write the failing test `tests/paths.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { BUNDLE_EXCLUDES, bundleSpec, expandTildeWith, resolveSpec } from "../src/paths.js";

const HOME = "/home/tester";

describe("expandTildeWith", () => {
  it("expands ~ and ~/ prefixes", () => {
    expect(expandTildeWith("~", HOME)).toBe(HOME);
    expect(expandTildeWith("~/.pi/agent/skills", HOME)).toBe(join(HOME, ".pi/agent/skills"));
  });
  it("leaves absolute paths alone", () => {
    expect(expandTildeWith("/tmp/x", HOME)).toBe("/tmp/x");
  });
});

describe("bundleSpec", () => {
  it("covers both skill stores, the git package store, and the memory DB", () => {
    const spec = bundleSpec();
    const paths = spec.map((e) => e.bundlePath);
    expect(paths).toContain("pi/agent/skills");
    expect(paths).toContain("agents/skills");
    expect(paths).toContain("pi/agent/git");
    expect(paths).toContain("memory/memory.db");
    expect(paths).toContain("pi/agent/auth.json");
  });
  it("memory DB entry is flagged sqlite", () => {
    const db = bundleSpec().find((e) => e.bundlePath === "memory/memory.db")!;
    expect(db.sqlite).toBe(true);
    expect(db.skipFlag).toBe("no-memory");
  });
});

describe("resolveSpec", () => {
  it("maps ~-form source and dest to absolute paths under home", () => {
    const spec = bundleSpec().find((e) => e.bundlePath === "pi/agent/skills")!;
    const r = resolveSpec(spec, HOME);
    expect(r.source).toBe(join(HOME, ".pi/agent/skills"));
    expect(r.dest).toBe(join(HOME, ".pi/agent/skills"));
    expect(r.bundlePath).toBe("pi/agent/skills");
  });
});

describe("BUNDLE_EXCLUDES", () => {
  it("never ships sessions, bak files, or node_modules", () => {
    expect(BUNDLE_EXCLUDES).toContain("**/node_modules/**");
    expect(BUNDLE_EXCLUDES).toContain("**/*.bak");
    expect(BUNDLE_EXCLUDES).toContain("**/claude-sessions/**");
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/paths.test.ts`
Expected: FAIL — `Cannot find module '../src/paths.js'`.

- [x] **Step 4: Create `src/paths.ts`**

```typescript
import { homedir } from "node:os";
import { join } from "node:path";
import type { BundleSpecEntry } from "./types.js";

export function expandTildeWith(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

export const BUNDLE_EXCLUDES: string[] = [
  "**/*.bak",
  "**/*.db-wal",
  "**/*.db-shm",
  "**/node_modules/**",
  "**/claude-sessions/**",
  "**/sessions/**",
  "pistats.db",
  "pi-sync.json",
];

/** Single source of truth for what ships in a bundle. Paths are ~-form (portable). */
export function bundleSpec(): BundleSpecEntry[] {
  const agent = "~/.pi/agent";
  return [
    { source: `${agent}/skills`, bundlePath: "pi/agent/skills", dest: `${agent}/skills`, kind: "dir" },
    { source: `${agent}/extensions`, bundlePath: "pi/agent/extensions", dest: `${agent}/extensions`, kind: "dir" },
    { source: `${agent}/git`, bundlePath: "pi/agent/git", dest: `${agent}/git`, kind: "dir" },
    { source: `${agent}/bin`, bundlePath: "pi/agent/bin", dest: `${agent}/bin`, kind: "dir" },
    { source: `${agent}/settings.json`, bundlePath: "pi/agent/settings.json", dest: `${agent}/settings.json`, kind: "file" },
    { source: `${agent}/AGENTS.md`, bundlePath: "pi/agent/AGENTS.md", dest: `${agent}/AGENTS.md`, kind: "file" },
    { source: `${agent}/trust.json`, bundlePath: "pi/agent/trust.json", dest: `${agent}/trust.json`, kind: "file" },
    { source: `${agent}/auth.json`, bundlePath: "pi/agent/auth.json", dest: `${agent}/auth.json`, kind: "file", skipFlag: "no-auth" },
    { source: `${agent}/models.json`, bundlePath: "pi/agent/models.json", dest: `${agent}/models.json`, kind: "file" },
    { source: `${agent}/models-store.json`, bundlePath: "pi/agent/models-store.json", dest: `${agent}/models-store.json`, kind: "file" },
    { source: "~/.agents/skills", bundlePath: "agents/skills", dest: "~/.agents/skills", kind: "dir", skipFlag: "no-agents-skills" },
    { source: "~/.pi/memory/memory.db", bundlePath: "memory/memory.db", dest: "~/.pi/memory/memory.db", kind: "file", sqlite: true, skipFlag: "no-memory" },
  ];
}

export function resolveSpec(entry: BundleSpecEntry, home: string): {
  source: string; bundlePath: string; dest: string;
  kind: "dir" | "file"; sqlite?: boolean; skipFlag?: BundleSpecEntry["skipFlag"];
} {
  return {
    source: expandTildeWith(entry.source, home),
    bundlePath: entry.bundlePath,
    dest: expandTildeWith(entry.dest, home),
    kind: entry.kind,
    sqlite: entry.sqlite,
    skipFlag: entry.skipFlag,
  };
}

export function defaultHome(): string {
  return homedir();
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/paths.test.ts`
Expected: PASS (all).

- [x] **Step 6: Commit**

```bash
git add src/types.ts src/paths.ts tests/paths.test.ts
git commit -m "feat(paths): bundle spec table — single source of truth for what ships"
```

---

### Task 3: Filtered copy engine (adapt `src/manifest.ts`)

**Files:**
- Modify: `src/manifest.ts` (replace `buildManifest` walker with `copyFiltered`; keep `matchesGlob`)
- Modify: `tests/manifest.test.ts` (keep glob tests, replace walker tests)

- [x] **Step 1: Write the failing tests (replace walker tests in `tests/manifest.test.ts`, keep the existing `matchesGlob` describe block)**

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyFiltered } from "../src/manifest.js";

let root: string;
let srcDir: string;
let destDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pisync-copy-"));
  srcDir = join(root, "src");
  destDir = join(root, "dest");
  await mkdir(srcDir, { recursive: true });
  await mkdir(destDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("copyFiltered", () => {
  it("copies plain trees recursively", async () => {
    await mkdir(join(srcDir, "a/b"), { recursive: true });
    await writeFile(join(srcDir, "a/one.txt"), "one");
    await writeFile(join(srcDir, "a/b/two.txt"), "two");
    const stats = await copyFiltered(srcDir, join(destDir, "out"), []);
    expect(stats.files).toBe(2);
    expect(await readFile(join(destDir, "out/a/b/two.txt"), "utf8")).toBe("two");
  });

  it("skips excluded files and directories", async () => {
    await mkdir(join(srcDir, "node_modules/pkg"), { recursive: true });
    await mkdir(join(srcDir, "claude-sessions"), { recursive: true });
    await writeFile(join(srcDir, "keep.txt"), "k");
    await writeFile(join(srcDir, "old.bak"), "b");
    await writeFile(join(srcDir, "node_modules/pkg/index.js"), "n");
    await writeFile(join(srcDir, "claude-sessions/s.json"), "c");
    await copyFiltered(srcDir, join(destDir, "out"), ["**/node_modules/**", "**/*.bak", "**/claude-sessions/**"]);
    expect(await readFile(join(destDir, "out/keep.txt"), "utf8")).toBe("k");
    await expect(readFile(join(destDir, "out/old.bak"), "utf8")).rejects.toThrow();
    await expect(readFile(join(destDir, "out/node_modules/pkg/index.js"), "utf8")).rejects.toThrow();
    await expect(readFile(join(destDir, "out/claude-sessions/s.json"), "utf8")).rejects.toThrow();
  });

  it("dereferences symlinks into real files", async () => {
    await writeFile(join(root, "target.txt"), "real");
    await symlink(join(root, "target.txt"), join(srcDir, "link.txt"));
    await copyFiltered(srcDir, join(destDir, "out"), []);
    const copied = await readFile(join(destDir, "out/link.txt"), "utf8");
    expect(copied).toBe("real");
  });

  it("returns zero stats for a missing source", async () => {
    const stats = await copyFiltered(join(srcDir, "does-not-exist"), join(destDir, "out"), []);
    expect(stats).toEqual({ files: 0, bytes: 0 });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manifest.test.ts`
Expected: FAIL — `copyFiltered` is not exported.

- [x] **Step 3: Rewrite `src/manifest.ts` (keep `matchesGlob` exactly as-is at the bottom)**

```typescript
import { cp, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface CopyStats {
  files: number;
  bytes: number;
}

/**
 * Copy a file or directory tree, skipping any relative path matching an exclude
 * glob. Symlinks are dereferenced (copied as real content). Missing sources are
 * a no-op returning zero stats (optional entries like auth.json may not exist).
 */
export async function copyFiltered(
  src: string,
  dest: string,
  excludes: string[],
): Promise<CopyStats> {
  try {
    await stat(src);
  } catch {
    return { files: 0, bytes: 0 };
  }
  await cp(src, dest, {
    recursive: true,
    dereference: true,
    filter: (srcPath) => {
      const rel = relative(src, srcPath).split(sep).join("/");
      if (rel === "") return true; // the root itself
      return !matchesAny(rel, excludes);
    },
  });
  return await measure(dest, excludes);
}

/** Walk a staged tree and count non-excluded files/bytes. */
export async function measure(dir: string, excludes: string[]): Promise<CopyStats> {
  const out: CopyStats = { files: 0, bytes: 0 };
  try {
    await walk(dir, dir, excludes, out);
  } catch {
    return { files: 0, bytes: 0 };
  }
  return out;
}

async function walk(root: string, dir: string, excludes: string[], out: CopyStats): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (matchesAny(rel, excludes)) continue;
    if (entry.isDirectory()) {
      await walk(root, abs, excludes, out);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      out.files += 1;
      out.bytes += s.size;
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
// **/ matches zero or more path segments (so "**/*.bak" matches both "x.bak" and "a/b/x.bak").
export function matchesGlob(s: string, pattern: string): boolean {
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "::DOUBLESTAR_SLASH::")
        .replace(/\*\*/g, "::DOUBLESTAR::")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/::DOUBLESTAR_SLASH::/g, "(?:.*/)?")
        .replace(/::DOUBLESTAR::/g, ".*") +
      "$",
  );
  return re.test(s);
}
```

Note: the old `buildManifest`/`ManifestEntry`/`ManifestOptions` exports are gone — `src/log.ts` imports only `SyncEvent` from types (fixed in Task 2's types rewrite; update its import in Task 8). If `tests/manifest.test.ts` references `buildManifest`, delete those tests in Step 1 (they were replaced above).

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manifest.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/manifest.ts tests/manifest.test.ts
git commit -m "feat(manifest): copyFiltered staging engine — excludes + symlink deref"
```

---

### Task 4: Bundle manifest build + validate (`src/bundle-manifest.ts`)

**Files:**
- Create: `src/bundle-manifest.ts`
- Create: `tests/bundle-manifest.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { buildBundleManifest, validateManifest } from "../src/bundle-manifest.js";
import type { BundleManifest } from "../src/types.js";

const entries = [
  { bundlePath: "pi/agent/settings.json", dest: "~/.pi/agent/settings.json", kind: "file" as const },
  { bundlePath: "memory/memory.db", dest: "~/.pi/memory/memory.db", kind: "file" as const, sqlite: true },
];

describe("buildBundleManifest", () => {
  it("produces a schema-1 manifest with totals", () => {
    const m = buildBundleManifest(entries, { piVersion: "0.87.1", compression: "zstd" });
    expect(m.schema).toBe(1);
    expect(m.compression).toBe("zstd");
    expect(m.totals.files).toBe(0); // caller fills sizes via measure(); zeros ok at build time
    expect(m.entries[1].sqlite).toBe(true);
    expect(m.createdAt).toBeTruthy();
  });
});

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const m = buildBundleManifest(entries, { piVersion: "0.87.1", compression: "gzip" });
    const v = validateManifest(m);
    expect(v.ok).toBe(true);
    expect(v.manifest?.compression).toBe("gzip");
  });
  it("rejects non-objects and wrong schema", () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest("nope").ok).toBe(false);
    expect(validateManifest({ ...validManifest(), schema: 99 }).ok).toBe(false);
    expect(validateManifest({ ...validManifest(), entries: "x" }).ok).toBe(false);
  });
  it("rejects missing required fields", () => {
    const m = validManifest();
    delete (m as Partial<BundleManifest>).compression;
    expect(validateManifest(m).ok).toBe(false);
  });
});

function validManifest(): BundleManifest {
  return buildBundleManifest(entries, { piVersion: "0.87.1", compression: "zstd" });
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/bundle-manifest.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Create `src/bundle-manifest.ts`**

```typescript
import { hostname } from "node:os";
import type { BundleManifest, BundleManifestEntry } from "./types.js";

export const SUPPORTED_SCHEMA = 1;
export const PISYNC_VERSION = "0.2.0";

export function buildBundleManifest(
  entries: Omit<BundleManifestEntry, "files" | "bytes">[],
  meta: { piVersion: string; compression: "zstd" | "gzip" },
): BundleManifest {
  const withSizes: BundleManifestEntry[] = entries.map((e) => ({ ...e, files: 0, bytes: 0 }));
  return {
    schema: SUPPORTED_SCHEMA,
    createdAt: new Date().toISOString(),
    hostname: hostname(),
    piVersion: meta.piVersion,
    pisyncVersion: PISYNC_VERSION,
    compression: meta.compression,
    entries: withSizes,
    totals: { files: 0, bytes: 0 },
  };
}

export function validateManifest(raw: unknown): {
  ok: boolean;
  errors: string[];
  manifest?: BundleManifest;
} {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object") {
    return { ok: false, errors: ["manifest is not an object"] };
  }
  const m = raw as Record<string, unknown>;
  if (m.schema !== SUPPORTED_SCHEMA) errors.push(`unsupported schema: ${String(m.schema)}`);
  if (m.compression !== "zstd" && m.compression !== "gzip") errors.push("missing/invalid compression");
  if (!Array.isArray(m.entries)) errors.push("missing entries array");
  else if (m.entries.some((e) => typeof (e as BundleManifestEntry)?.bundlePath !== "string")) {
    errors.push("malformed entry in entries");
  }
  if (typeof m.createdAt !== "string") errors.push("missing createdAt");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], manifest: m as unknown as BundleManifest };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/bundle-manifest.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/bundle-manifest.ts tests/bundle-manifest.test.ts
git commit -m "feat(manifest): schema-1 bundle manifest builder + validator"
```

---

### Task 5: Tar helpers (`src/archive.ts`)

**Files:**
- Create: `src/archive.ts`
- Create: `tests/archive.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listArchive, packArchive, unpackArchive } from "../src/archive.js";

let root: string;
let stage: string;
let outDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pisync-arch-"));
  stage = join(root, "stage");
  outDir = join(root, "out");
  await mkdir(join(stage, "pisync-test/inner"), { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(stage, "pisync-test/a.txt"), "a");
  await writeFile(join(stage, "pisync-test/inner/b.txt"), "b");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe.each(["zstd", "gzip"] as const)("packArchive (%s)", (compression) => {
  it("writes a .part file, renames atomically, lists and unpacks", async () => {
    const out = join(outDir, `pisync-test.tar.${compression === "zstd" ? "zst" : "gz"}`);
    await packArchive(stage, "pisync-test", out, compression);
    const listing = await readdir(outDir);
    expect(listing).toEqual([`pisync-test.tar.${compression === "zstd" ? "zst" : "gz"}`]); // no .part left
    const names = await listArchive(out);
    expect(names).toContain("pisync-test/a.txt");
    const dest = join(root, "unpacked");
    await unpackArchive(out, dest);
    const entries = await readdir(join(dest, "pisync-test"));
    expect(entries).toContain("a.txt");
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/archive.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Create `src/archive.ts`**

```typescript
import { spawn } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

export function zstdAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("zstd", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * tar a stage dir into an archive. The compressor is passed EXPLICITLY
 * (--zstd / -z) — never inferred from the extension, because we write to
 * `<out>.part` first for atomicity, which breaks suffix detection.
 */
export async function packArchive(
  stageDir: string,
  rootName: string,
  outPath: string,
  compression: "zstd" | "gzip",
): Promise<void> {
  const partPath = `${outPath}.part`;
  try {
    await run("tar", [
      "-C", stageDir,
      compression === "zstd" ? "--zstd" : "-z",
      "-cf", partPath,
      rootName,
    ]);
    await rename(partPath, outPath);
  } catch (err) {
    await rm(partPath, { force: true }); // never leave a partial artifact
    throw err;
  }
}

export async function listArchive(archivePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("tar", ["-tf", archivePath], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`tar -tf exited with code ${code}`));
      resolve(out.split("\n").filter((l) => l.trim()));
    });
  });
}

/** GNU tar auto-detects compression on extract. Extracts into destDir. */
export async function unpackArchive(archivePath: string, destDir: string): Promise<void> {
  await run("tar", ["-xf", archivePath, "-C", destDir]);
  void dirname; // (keep import graph simple; unused)
}
```

Remove the `void dirname;` line and the `dirname` import if your linter complains — it is not needed; included only to make the file's intent explicit. Prefer deleting both.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/archive.test.ts`
Expected: PASS (both compressions; skips cleanly only if `tar` is missing — it isn't on CachyOS).

- [x] **Step 5: Commit**

```bash
git add src/archive.ts tests/archive.test.ts
git commit -m "feat(archive): tar pack/list/unpack with explicit compressor + atomic .part rename"
```

---

### Task 6: DB swap with stale-WAL removal (`src/sqlite-snapshot.ts`)

**Files:**
- Modify: `src/sqlite-snapshot.ts` (add `swapDatabase`, keep existing functions)
- Modify: `tests/sqlite-snapshot.test.ts` (add swap tests)

- [x] **Step 1: Add failing tests to `tests/sqlite-snapshot.test.ts`**

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { swapDatabase } from "../src/sqlite-snapshot.js";

let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "pisync-db-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("swapDatabase", () => {
  it("replaces the destination and removes stale WAL/SHM sidecars", async () => {
    const dest = join(root, "memory.db");
    await writeFile(dest, "old");
    await writeFile(`${dest}-wal`, "stale-wal");
    await writeFile(`${dest}-shm`, "stale-shm");
    const staged = join(root, "import-1.db");
    await writeFile(staged, "new");
    await swapDatabase(staged, dest);
    expect(await readFile(dest, "utf8")).toBe("new");
    await expect(stat(`${dest}-wal`)).rejects.toThrow();
    await expect(stat(`${dest}-shm`)).rejects.toThrow();
  });

  it("works when no sidecars exist", async () => {
    const dest = join(root, "memory.db");
    await writeFile(dest, "old");
    const staged = join(root, "import-1.db");
    await writeFile(staged, "new");
    await swapDatabase(staged, dest);
    expect(await readFile(dest, "utf8")).toBe("new");
  });
});
```

(If the existing test file already declares `root`/hooks, merge these describe blocks into it instead of duplicating variables.)

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sqlite-snapshot.test.ts`
Expected: FAIL — `swapDatabase` is not exported.

- [x] **Step 3: Add to `src/sqlite-snapshot.ts`**

```typescript
import { unlink } from "node:fs/promises";

/**
 * Atomically replace destDb with stagedDb (which must live on the same
 * filesystem). Deletes stale WAL/SHM sidecars first — replaying a stale WAL
 * against an imported DB corrupts it. SQLite recreates both on next open.
 */
export async function swapDatabase(stagedDb: string, destDb: string): Promise<void> {
  await unlink(`${destDb}-wal`).catch(() => {});
  await unlink(`${destDb}-shm`).catch(() => {});
  await rename(stagedDb, destDb);
}
```

(`rename` is already imported at the top of the file.)

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sqlite-snapshot.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/sqlite-snapshot.ts tests/sqlite-snapshot.test.ts
git commit -m "feat(db): swapDatabase — atomic rename + stale WAL/SHM removal"
```

---

### Task 7: `runExtract` orchestrator + RESTORE.md (`src/bundle.ts`)

**Files:**
- Create: `src/bundle.ts`
- Create: `tests/bundle.test.ts`
- Modify: `src/log.ts` (event type swap: `SyncEvent` → `OperationEvent`)

- [x] **Step 1: Update `src/log.ts` to the new event type (one-line change each)**

```typescript
import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { OperationEvent } from "./types.js";

export const LOG_FILENAME = "log.jsonl";

function logPath(dir: string): string {
  return join(dir, LOG_FILENAME);
}

export async function logEvent(dir: string, event: OperationEvent): Promise<void> {
  await mkdir(dir, { recursive: true });
  await appendFile(logPath(dir), JSON.stringify(event) + "\n", "utf8");
}

export async function readLog(dir: string): Promise<OperationEvent[]> {
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
    .map((l) => JSON.parse(l) as OperationEvent);
}
```

(Delete `tests/log.test.ts` sync-shaped cases or update them to `OperationEvent` — prefer updating: same assertions with `{ ts, op: "extract", status: "done" }` events.)

- [x] **Step 2: Write the failing integration test `tests/bundle.test.ts`**

Uses a fake `$HOME` sandbox and a tiny fixture SQLite DB. Skips if the `sqlite3` CLI is absent.

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, readFile, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExtract } from "../src/bundle.js";
import { runImport } from "../src/restore.js"; // wired in Task 8; test extended there

const execFile = promisify(execFileCb);

let home: string;
let outDir: string;
let dbReady = true;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pisync-home-"));
  outDir = await mkdtemp(join(tmpdir(), "pisync-out-"));
  await mkdir(join(home, ".pi/agent/skills/my-skill"), { recursive: true });
  await mkdir(join(home, ".agents/skills/other"), { recursive: true });
  await mkdir(join(home, ".pi/memory"), { recursive: true });
  await writeFile(join(home, ".pi/agent/settings.json"), '{"defaultModel":"x"}');
  await writeFile(join(home, ".pi/agent/AGENTS.md"), "# rules");
  await writeFile(join(home, ".pi/agent/trust.json"), "{}");
  await writeFile(join(home, ".pi/agent/auth.json"), '{"key":"secret"}');
  await writeFile(join(home, ".pi/agent/models.json"), "{}");
  await writeFile(join(home, ".pi/agent/models-store.json"), "{}");
  await writeFile(join(home, ".pi/agent/skills/my-skill/SKILL.md"), "# skill");
  await writeFile(join(home, ".agents/skills/other/SKILL.md"), "# other");
  try {
    await execFile("sqlite3", [join(home, ".pi/memory/memory.db"),
      "CREATE TABLE t(x); INSERT INTO t VALUES (42);"]);
  } catch {
    dbReady = false;
  }
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
});

describe("runExtract", () => {
  it("produces an archive with manifest and RESTORE.md", async () => {
    const result = await runExtract({ outDir, home });
    expect(result.entries.map((e) => e.bundlePath)).toContain("memory/memory.db");
    const s = await stat(result.archivePath);
    expect(s.size).toBeGreaterThan(0);
    expect(result.archivePath.endsWith(".tar.zst") || result.archivePath.endsWith(".tar.gz")).toBe(true);
  });

  it("--noMemory and --noAuth drop their entries", async () => {
    const result = await runExtract({ outDir, home, noMemory: true, noAuth: true });
    const paths = result.entries.map((e) => e.bundlePath);
    expect(paths).not.toContain("memory/memory.db");
    expect(paths).not.toContain("pi/agent/auth.json");
    expect(paths).toContain("pi/agent/skills");
  });

  it("import round-trips state into a fresh home", async () => {
    const extract = await runExtract({ outDir, home });
    const home2 = await mkdtemp(join(tmpdir(), "pisync-target-"));
    try {
      const imported = await runImport(extract.archivePath, { home: home2 });
      expect(imported.restored).toContain(join(home2, ".pi/agent/settings.json"));
      expect(await readFile(join(home2, ".pi/agent/settings.json"), "utf8")).toContain("defaultModel");
      expect(await readFile(join(home2, ".agents/skills/other/SKILL.md"), "utf8")).toBe("# other");
      if (dbReady) {
        const { stdout } = await execFile("sqlite3", [join(home2, ".pi/memory/memory.db"), "SELECT x FROM t;"]);
        expect(stdout.trim()).toBe("42");
      }
    } finally {
      await rm(home2, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/bundle.test.ts`
Expected: FAIL — `runExtract` (and `runImport`) not found.

- [x] **Step 4: Create `src/bundle.ts`**

```typescript
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUNDLE_EXCLUDES, bundleSpec, defaultHome, expandTildeWith, resolveSpec } from "./paths.js";
import { copyFiltered, measure } from "./manifest.js";
import { buildBundleManifest, PISYNC_VERSION } from "./bundle-manifest.js";
import { packArchive, zstdAvailable } from "./archive.js";
import { sqliteAvailable, sqliteSnapshot } from "./sqlite-snapshot.js";
import type { BundleManifest, BundleManifestEntry, ExtractOptions, ExtractResult } from "./types.js";
import { logEvent } from "./log.js";

const execFileAsync = promisify(execFile);

export function cacheDir(home: string): string {
  return join(expandTildeWith("~/.pi/cache/pi-sync", home));
}

function timestampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `pisync-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function piVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pi", ["--version"], { timeout: 3000 });
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function pathBytes(p: string, kind: "dir" | "file"): Promise<number> {
  if (kind === "file") {
    try { return (await stat(p)).size; } catch { return 0; }
  }
  return (await measure(p, BUNDLE_EXCLUDES)).bytes;
}

async function assertDiskSpace(outDir: string, estimateBytes: number): Promise<void> {
  const s = await statfs(outDir);
  const free = s.bavail * s.bsize;
  if (free < estimateBytes * 1.2) {
    throw new Error(`Insufficient disk space in ${outDir}: need ~${Math.ceil(estimateBytes * 1.2 / 1e6)} MB, free ${Math.floor(free / 1e6)} MB`);
  }
}

function restoreMd(rootName: string, compression: string, manifest: BundleManifest): string {
  const flag = compression === "zstd" ? "--zstd" : "";
  const lines = manifest.entries
    .map((e) => `mkdir -p ~/$(dirname \`${e.dest.replace(/^~\\//, ".pi/")}\`)  # ${e.bundlePath}`)
    .join("\n");
  return `# pi-sync bundle — ${rootName}

Extracted from \${hostname} on \${createdAt}. Restore with plain shell — no pi-sync needed.

## 1. Unpack

\`\`\`bash
tar ${flag} -xf ${rootName}.tar.${compression === "zstd" ? "zst" : "gz"} -C /tmp
\`\`\`

## 2. Copy state into \$HOME

\`\`\`bash
cp -a /tmp/${rootName}/pi/agent/. ~/.pi/agent/
cp -a /tmp/${rootName}/agents/skills/. ~/.agents/skills/   # if present
\`\`\`

## 3. Swap the memory DB (LaPis)

\`\`\`bash
rm -f ~/.pi/memory/memory.db-wal ~/.pi/memory/memory.db-shm
mv /tmp/${rootName}/memory/memory.db ~/.pi/memory/memory.db
\`\`\`

## Caveats

- settings.json may reference absolute paths OUTSIDE ~/.pi (e.g. extension entries
  pointing at ~/Documents/... repos). Fix or remove those entries on this machine.
- auth.json contains API keys — treat this bundle like a credential file.
- Run this restore BEFORE starting pi, or restart pi afterwards.
- Per-entry map (bundlePath -> dest):
${lines}
`;
}

export async function runExtract(opts: ExtractOptions = {}, logDirHome?: string): Promise<ExtractResult> {
  const started = Date.now();
  const home = opts.home ?? defaultHome();
  const logDir = logDirHome ? cacheDir(logDirHome) : cacheDir(home);
  const spec = bundleSpec().filter((e) => {
    if (e.skipFlag === "no-memory" && opts.noMemory) return false;
    if (e.skipFlag === "no-auth" && opts.noAuth) return false;
    if (e.skipFlag === "no-agents-skills" && opts.noAgentsSkills) return false;
    return true;
  });

  const outDir = expandTildeWith(opts.outDir ?? "~/Downloads", home);
  const compression = (await zstdAvailable()) ? "zstd" : "gzip";
  const rootName = timestampName();
  const archivePath = join(outDir, `${rootName}.tar.${compression === "zstd" ? "zst" : "gz"}`);

  await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "start", detail: { outDir, compression } });
  try {
    if (!(await sqliteAvailable())) {
      throw new Error("sqlite3 CLI not found — install it (e.g. `sudo pacman -S sqlite`) to bundle the memory DB, or re-run with --no-memory.");
    }
    await mkdir(outDir, { recursive: true });

    // Pre-flight: estimate raw input size (+20%) and check target disk space.
    let estimate = 0;
    for (const e of spec) {
      const r = resolveSpec(e, home);
      estimate += await pathBytes(r.source, e.kind);
    }
    await assertDiskSpace(outDir, estimate);

    // Stage.
    const stageBase = await mkdtemp(join(cacheDir(home), "stage-"));
    const stage = join(stageBase, rootName);
    await mkdir(stage, { recursive: true });
    try {
      const entries: BundleManifestEntry[] = [];
      for (const e of spec) {
        const r = resolveSpec(e, home);
        const destInStage = join(stage, e.bundlePath);
        await mkdir(dirname_(destInStage), { recursive: true });
        if (e.sqlite) {
          await sqliteSnapshot(r.source, destInStage); // consistent copy while pi runs
        } else {
          await copyFiltered(r.source, destInStage, BUNDLE_EXCLUDES);
        }
        const m = e.kind === "dir"
          ? await measure(destInStage, BUNDLE_EXCLUDES)
          : await measure(destInStage, []);
        entries.push({
          bundlePath: e.bundlePath, dest: e.dest, kind: e.kind,
          files: m.files, bytes: m.bytes, sqlite: e.sqlite,
        });
      }

      const manifest = buildBundleManifest(
        entries.map(({ files: _f, bytes: _b, ...rest }) => rest),
        { piVersion: await piVersion(), compression },
      );
      manifest.entries = entries;
      manifest.totals = {
        files: entries.reduce((a, e) => a + e.files, 0),
        bytes: entries.reduce((a, e) => a + e.bytes, 0),
      };
      await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
      await writeFile(join(stage, "RESTORE.md"), restoreMd(rootName, compression, manifest));

      // Pack atomically: <archive>.part -> rename.
      await packArchive(stageBase, rootName, archivePath, compression);
    } finally {
      await rm(stageBase, { recursive: true, force: true });
    }

    const bytes = (await stat(archivePath)).size;
    const result: ExtractResult = {
      archivePath, compression, bytes,
      durationMs: Date.now() - started, entries: manifest.entries,
    };
    await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "done", detail: { archivePath, bytes } });
    return result;
  } catch (err) {
    await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "error", detail: { error: String(err) } });
    throw err;
  }
}

// tiny dirname helper so we don't import path twice under different names
import { dirname as dirname_ } from "node:path";
void readdir;
```

Notes for the implementer:
- Add `home?: string` to `ExtractOptions` in `src/types.ts` (test sandbox support): `export interface ExtractOptions { outDir?: string; home?: string; noMemory?: boolean; noAuth?: boolean; noAgentsSkills?: boolean; }`
- The `entries.map(({ files: _f, bytes: _b, ...rest }) => rest)` destructure satisfies `buildBundleManifest`'s input type; sizes are then re-attached via `manifest.entries = entries`.
- Move the `dirname as dirname_` import up with the other `node:path` import (`join, dirname as dirname_`); drop the `void readdir;` and the unused `readdir` import if unused.

- [x] **Step 5: Run extract-only tests**

Run: `npx vitest run tests/bundle.test.ts -t "runExtract"`
Expected: the two `runExtract` tests PASS; the round-trip test FAILS (no `runImport` yet — Task 8).

- [x] **Step 6: Commit (extract, without import)**

```bash
git add src/bundle.ts src/log.ts tests/bundle.test.ts src/types.ts
git commit -m "feat(bundle): runExtract — stage, snapshot DB, manifest, RESTORE.md, atomic pack"
```

---

### Task 8: `runImport` + command wiring (`src/restore.ts`, `src/index.ts`)

**Files:**
- Create: `src/restore.ts`
- Modify: `src/types.ts` (add `home?: string` to `ImportOptions`)
- Rewrite: `src/index.ts`

- [x] **Step 1: Add `ImportOptions` to `src/types.ts`**

```typescript
export interface ImportOptions {
  home?: string; // defaults to os.homedir(); test sandbox support
}
```

- [x] **Step 2: Write `src/restore.ts`**

```typescript
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUNDLE_EXCLUDES, defaultHome, expandTildeWith } from "./paths.js";
import { copyFiltered } from "./manifest.js";
import { validateManifest } from "./bundle-manifest.js";
import { listArchive, unpackArchive } from "./archive.js";
import { swapDatabase } from "./sqlite-snapshot.js";
import type { BundleManifest, ImportOptions, ImportResult } from "./types.js";
import { cacheDir } from "./bundle.js";
import { logEvent } from "./log.js";

export async function runImport(archivePath: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const started = Date.now();
  const home = opts.home ?? defaultHome();
  const logDir = cacheDir(home);
  await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "start", detail: { archivePath } });
  try {
    await stat(archivePath); // throws with ENOENT if missing — fine to surface

    // 1. Validate: single pisync-* root + parseable schema-1 manifest.
    const names = await listArchive(archivePath);
    const roots = new Set(names.map((n) => n.split("/")[0]).filter((n) => n.startsWith("pisync-")));
    if (roots.size !== 1) {
      throw new Error("Not a pi-sync bundle: expected exactly one pisync-* root directory in the archive.");
    }
    const rootName = [...roots][0];
    const work = await mkdtemp(join(tmpdir(), "pisync-import-"));
    try {
      await unpackArchive(archivePath, work);
      const bundleRoot = join(work, rootName);
      const raw = JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8"));
      const v = validateManifest(raw);
      if (!v.ok) throw new Error(`Invalid bundle manifest: ${v.errors.join("; ")}`);
      const manifest = v.manifest as BundleManifest;

      // 2. Pre-import safety: back up files we are about to overwrite.
      const backupDir = join(cacheDir(home), `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      await mkdir(backupDir, { recursive: true });
      for (const e of manifest.entries) {
        if (e.kind !== "file") continue; // dirs merge; not backed up
        const dest = expandTildeWith(e.dest, home);
        try {
          await stat(dest);
          await cp(dest, join(backupDir, e.bundlePath.split("/").join("__")), { recursive: true, dereference: true });
        } catch { /* didn't exist — nothing to back up */ }
      }

      // 3. Restore.
      const restored: string[] = [];
      const skipped: string[] = [];
      for (const e of manifest.entries) {
        const inBundle = join(bundleRoot, e.bundlePath);
        const dest = expandTildeWith(e.dest, home);
        try {
          await stat(inBundle);
        } catch {
          skipped.push(e.bundlePath);
          continue;
        }
        if (e.sqlite) {
          await swapDatabase(inBundle, dest);
        } else if (e.kind === "dir") {
          await mkdir(dest, { recursive: true });
          await copyFiltered(inBundle, dest, BUNDLE_EXCLUDES); // merge/overlay
        } else {
          await mkdir(join(dest, ".."), { recursive: true });
          await copyFiltered(inBundle, dest, []);
        }
        restored.push(dest);
      }

      const result: ImportResult = { restored, skipped, backupDir, durationMs: Date.now() - started };
      await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "done", detail: { restored: restored.length, skipped: skipped.length } });
      return result;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  } catch (err) {
    await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "error", detail: { error: String(err) } });
    throw err;
  }
}

void readdir; // remove if unused
```

(Delete the `void readdir;` line and unused import — prefer clean imports.)

- [x] **Step 4: Run the full bundle test file**

Run: `npx vitest run tests/bundle.test.ts`
Expected: PASS including the round-trip test (`defaultModel` content lands in home2; SQLite `SELECT` returns 42 when sqlite3 present).

- [x] **Step 5: Rewrite `src/index.ts` — command dispatch**

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expandTildeWith, defaultHome } from "./paths.js";
import { runExtract } from "./bundle.js";
import { runImport } from "./restore.js";
import { cacheDir } from "./bundle.js";
import { readLog } from "./log.js";

const HELP = `pi-sync v2 — portable pi state
/pisync extract [dir] [--no-memory] [--no-auth] [--no-agents-skills]
    Bundle settings, skills, extensions, git package store and LaPis memory DB
    into ~/Downloads/pisync-<date>.tar.zst (or .tar.gz if zstd missing).
/pisync import <archive>
    Restore a bundle on this machine (backs up current state first).
/pisync
    This help + last operation.`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pisync", {
    description: "Extract pi state to a portable archive / import on another PC",
    handler: async (args, ctx) => {
      const [sub, ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);

      if (!sub || sub === "help") {
        const events = await readLog(cacheDir(defaultHome()));
        const last = events.at(-1);
        const lastLine = last
          ? `Last operation: ${last.op} ${last.status} at ${last.ts}`
          : "No operations yet.";
        ctx.ui.notify(`${HELP}\n\n${lastLine}`, "info");
        return;
      }

      if (sub === "extract") {
        const flags = rest.filter((a) => a.startsWith("--"));
        const positional = rest.filter((a) => !a.startsWith("--"));
        const outDir = positional[0];
        ctx.ui.setStatus("pi-sync", "extracting…");
        try {
          const r = await runExtract({
            outDir,
            noMemory: flags.includes("--no-memory"),
            noAuth: flags.includes("--no-auth"),
            noAgentsSkills: flags.includes("--no-agents-skills"),
          });
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(
            `Bundle ready: ${r.archivePath}\n${(r.bytes / 1e6).toFixed(0)} MB in ${(r.durationMs / 1000).toFixed(1)}s (${r.compression}, ${r.entries.length} entries). Copy it to the other PC, then run /pisync import there.`,
            "info",
          );
        } catch (err) {
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(`Extract failed: ${err instanceof Error ? err.message : err}`, "error");
        }
        return;
      }

      if (sub === "import") {
        const archive = rest[0];
        if (!archive) {
          ctx.ui.notify("Usage: /pisync import <path-to-archive>", "error");
          return;
        }
        ctx.ui.setStatus("pi-sync", "importing…");
        try {
          const r = await runImport(expandTildeWith(archive, defaultHome()));
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(
            `Imported ${r.restored.length} entries (skipped ${r.skipped.length}).\nPre-import backup: ${r.backupDir}\nRestart pi to load everything.`,
            "info",
          );
        } catch (err) {
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(`Import failed: ${err instanceof Error ? err.message : err}`, "error");
        }
        return;
      }

      ctx.ui.notify(`Unknown subcommand "${sub}".\n\n${HELP}`, "error");
    },
  });
}
```

- [x] **Step 6: Full suite + build**

Run: `npm test 2>&1 | tail -6 && npm run build 2>&1 | tail -3`
Expected: all tests PASS, build clean.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: runImport + /pisync command dispatch (extract|import|help)"
```

---

### Task 9: README rewrite + live smoke test

**Files:**
- Rewrite: `README.md`

- [x] **Step 1: Rewrite `README.md`**

````markdown
# pi-sync v2

Extract your pi state — settings, skills (all three locations), extensions, git
package store, and the LaPis memory DB — into **one portable archive**, and
import it on another PC. You move the file yourself (USB, scp, cloud).

## What ships

| Source | In bundle |
|---|---|
| `~/.pi/agent/{skills,extensions,git,bin}` | `pi/agent/…` |
| `~/.pi/agent/{settings.json,AGENTS.md,trust.json,auth.json,models.json,models-store.json}` | `pi/agent/…` |
| `~/.agents/skills` | `agents/skills` |
| `~/.pi/memory/memory.db` (LaPis) | `memory/memory.db` (consistent snapshot) |

Never ships: sessions, claude-sessions, `*.bak`, `*.db-wal/shm`, `node_modules`,
`pistats.db`.

## Use

```
/pisync extract [dir] [--no-memory] [--no-auth] [--no-agents-skills]
/pisync import <archive>
/pisync
```

Extract writes `~/Downloads/pisync-<date>.tar.zst` (`.tar.gz` if zstd missing).
Import backs up current state to `~/.pi/cache/pi-sync/pre-import-<ts>/`, restores
the bundle, and atomically swaps the memory DB. Restart pi afterwards.

## On a PC without pi-sync

The bundle is self-describing — `RESTORE.md` inside has plain-shell restore
steps (tar + cp + sqlite3).

## Install

```bash
git clone <repo-url> ~/Documents/GulanesKorp/PiSync
cd ~/Documents/GulanesKorp/PiSync && npm install
ln -s "$(pwd)/src" ~/.pi/agent/extensions/pi-sync   # or add src/index.ts to extensions in settings.json
```

Requires: `tar` (any modern distro), `sqlite3` (for the memory DB), `zstd`
(optional — gzip fallback). Restart pi or `/reload`.

## Security

`auth.json` (API keys) ships by default. Treat the archive like a credential
file; use `--no-auth` to leave it out.

## Tests

```bash
npm test
```
````

- [x] **Step 2: Live smoke test (real HOME, real DB — this is the acceptance run)**

Run in pi: `/pisync extract`
Expected: notify shows `~/Downloads/pisync-<today>.tar.zst`, ~500–800 MB, entries count ≥ 8.

```bash
tar -tf ~/Downloads/pisync-*.tar.zst | grep -E "manifest.json|RESTORE.md|memory/memory.db|pi/agent/git/" | head
```
Expected: all four paths present. Then import into a throwaway HOME:

```bash
TMP_home=$(mktemp -d)
npx vitest run tests/bundle.test.ts  # sandboxed round-trip already covers import
rm -rf "$TMP_home"
```

(Do NOT run `/pisync import` against the real HOME during the smoke test — the sandboxed round-trip test in `tests/bundle.test.ts` is the import verification.)

- [x] **Step 3: Final commit**

```bash
git add README.md
git commit -m "docs: v2 README — extract/import usage"
```

---

## Self-Review (done during planning)

1. **Spec coverage:** bundle contents table → `paths.ts` (Task 2); excludes → `BUNDLE_EXCLUDES` (Task 2); symlink deref + copy filter → Task 3; manifest schema/validate → Task 4; explicit-compressor + `.part` atomicity → Task 5; DB snapshot (existing) + stale-WAL swap → Task 6; pre-flight disk space + zstd probe + RESTORE.md → Task 7; import validation/backup/restore/report → Task 8; commands + help + status → Task 8; docs → Task 9. `--no-memory/--no-auth/--no-agents-skills` flags → Tasks 7/8.
2. **Placeholder scan:** no TBDs; every code step has full code.
3. **Type consistency:** `copyFiltered(src,dest,excludes)→{files,bytes}` used in Tasks 7/8; `swapDatabase(staged,dest)` Task 6→8; `BundleManifestEntry.files/bytes` Task 2→4→7; `runExtract(opts)`/`runImport(archive,opts)` signatures consistent between tests and impl; `OperationEvent` Task 2→7.
