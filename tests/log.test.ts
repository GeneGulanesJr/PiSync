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