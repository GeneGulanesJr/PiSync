import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { sqliteAvailable, sqliteSnapshot } from "./sqlite-snapshot.js";
import type { BundleResult, InstallResult } from "./types.js";

const execFileP = promisify(execFile);

export const DEFAULT_BUNDLE = "pi-state.tar.gz";

// ponytail: paths computed per-call so tests can override HOME; constants
// captured at module load would freeze at import time and ignore env changes.
function piDir(): string { return join(homedir(), ".pi"); }
function agentDir(): string { return join(piDir(), "agent"); }
function memoryDir(): string { return join(piDir(), "memory"); }
function memoryDb(): string { return join(memoryDir(), "memory.db"); }
function stagingRoot(): string { return join(piDir(), "cache", "pi-bundle"); }

// ponytail: same exclude list as old sync; smaller change vs deleting entirely.
export const DEFAULT_EXCLUDES = [
  "auth.json",
  "*.bak",
  "*.db-wal",
  "*.db-shm",
  "node_modules",
];

export async function extract(outPath: string = DEFAULT_BUNDLE): Promise<BundleResult> {
  const staging = join(stagingRoot(), `extract-${Date.now()}`);
  await mkdir(staging, { recursive: true });

  // 1. agent tree
  const agentStaging = join(staging, "agent");
  await mkdir(agentStaging, { recursive: true });
  const excludeArgs = DEFAULT_EXCLUDES.flatMap((e) => ["--exclude", e]);
  await execFileP("rsync", ["-a", ...excludeArgs, `${agentDir()}/`, `${agentStaging}/`]);

  // 2. memory.db snapshot (consistent under live reads/writes)
  let hadMemoryDb = false;
  if (await sqliteAvailable()) {
    try {
      const memStaging = join(staging, "memory");
      await mkdir(memStaging, { recursive: true });
      await sqliteSnapshot(memoryDb(), join(memStaging, "memory.db"));
      hadMemoryDb = true;
    } catch {
      hadMemoryDb = false; // tolerate missing DB
    }
  }

  // 3. tar (staging is on same fs as outPath when outPath is under ~/.pi/cache/)
  await execFileP("tar", ["-czf", outPath, "-C", staging, "."]);
  await rm(staging, { recursive: true, force: true });

  const s = await stat(outPath);
  return { path: outPath, bytes: s.size, hadMemoryDb };
}

export async function install(bundlePath: string = DEFAULT_BUNDLE): Promise<InstallResult> {
  await assertExists(bundlePath, "bundle");

  const staging = join(stagingRoot(), `install-${Date.now()}`);
  await mkdir(staging, { recursive: true });
  await execFileP("tar", ["-xzf", bundlePath, "-C", staging]);

  const stamp = Date.now();
  const result: InstallResult = { restored: [] };

  // Backup existing agent dir before replacing
  if (await pathExists(agentDir())) {
    result.backedUpTo = `${agentDir()}.bak-${stamp}`;
    await rename(agentDir(), result.backedUpTo);
  }

  const stagedAgent = join(staging, "agent");
  if (await pathExists(stagedAgent)) {
    await mkdir(piDir(), { recursive: true });
    await rename(stagedAgent, agentDir());
    result.restored.push("agent");
  }

  const stagedMem = join(staging, "memory", "memory.db");
  if (await pathExists(stagedMem)) {
    await mkdir(memoryDir(), { recursive: true });
    if (await pathExists(memoryDb())) {
      await rename(memoryDb(), `${memoryDb()}.bak-${stamp}`);
    }
    await rename(stagedMem, memoryDb());
    result.restored.push("memory.db");
  }

  await rm(staging, { recursive: true, force: true });
  return result;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function assertExists(p: string, label: string): Promise<void> {
  if (!(await pathExists(p))) throw new Error(`${label} not found: ${p}`);
}
