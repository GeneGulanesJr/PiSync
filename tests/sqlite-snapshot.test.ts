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