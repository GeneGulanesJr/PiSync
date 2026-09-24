import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { kill } from "node:process";
import type { LockHandle } from "./types.js";

export const LOCK_FILENAME = "sync.lock";

function lockPath(dir: string): string {
  return join(dir, LOCK_FILENAME);
}

export async function acquireLock(dir: string): Promise<LockHandle> {
  const path = lockPath(dir);
  // Ensure cache dir exists before any file I/O (first-run safety)
  await mkdir(dir, { recursive: true });
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
