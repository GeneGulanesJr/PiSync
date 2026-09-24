import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logEvent, readLog } from "../src/log.js";
import type { OperationEvent } from "../src/types.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-log-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("log", () => {
  it("appends a JSONL line", async () => {
    const event: OperationEvent = {
      ts: new Date().toISOString(),
      op: "extract",
      status: "done",
      detail: { entries: 12 },
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
        op: "import",
        status: "done",
        detail: { restored: i },
      });
    }
    const events = await readLog(tmp);
    expect(events).toHaveLength(3);
    expect(events[0].detail).toEqual({ restored: 0 });
    expect(events[2].detail).toEqual({ restored: 2 });
  });

  it("readLog returns [] when file missing", async () => {
    expect(await readLog(tmp)).toEqual([]);
  });
});