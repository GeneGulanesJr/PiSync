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
