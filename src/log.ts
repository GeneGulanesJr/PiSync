import { appendFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SyncEvent } from "./types.js";

export const LOG_FILENAME = "log.jsonl";

function logPath(dir: string): string {
  return join(dir, LOG_FILENAME);
}

export async function logEvent(dir: string, event: SyncEvent): Promise<void> {
  // Ensure cache dir exists before any file I/O (first-run safety)
  await mkdir(dir, { recursive: true });
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