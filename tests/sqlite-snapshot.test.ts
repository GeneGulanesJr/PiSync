import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { sqliteAvailable, swapDatabase } from "../src/sqlite-snapshot.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-sql-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("sqlite-snapshot", () => {
  it("sqliteAvailable returns true when sqlite3 is on PATH", async () => {
    const probe = spawnSync("sqlite3", ["--version"]);
    if (probe.status === 0) {
      expect(await sqliteAvailable()).toBe(true);
    } else {
      expect(await sqliteAvailable()).toBe(false);
    }
  });

  it("sqliteAvailable returns a Promise<boolean>", async () => {
    const r = await sqliteAvailable();
    expect(typeof r).toBe("boolean");
  });
});

describe("swapDatabase", () => {
  it("replaces the destination and removes stale WAL/SHM sidecars", async () => {
    const dest = join(tmp, "memory.db");
    await writeFile(dest, "old");
    await writeFile(`${dest}-wal`, "stale-wal");
    await writeFile(`${dest}-shm`, "stale-shm");
    const staged = join(tmp, "import-1.db");
    await writeFile(staged, "new");
    await swapDatabase(staged, dest);
    expect(await readFile(dest, "utf8")).toBe("new");
    await expect(stat(`${dest}-wal`)).rejects.toThrow();
    await expect(stat(`${dest}-shm`)).rejects.toThrow();
  });

  it("works when no sidecars exist", async () => {
    const dest = join(tmp, "memory.db");
    await writeFile(dest, "old");
    const staged = join(tmp, "import-1.db");
    await writeFile(staged, "new");
    await swapDatabase(staged, dest);
    expect(await readFile(dest, "utf8")).toBe("new");
  });
});