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
