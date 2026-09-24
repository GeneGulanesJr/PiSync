import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Baseline } from "./types.js";

function baselinePath(dir: string, peerId: string): string {
  return join(dir, `last-sync-${peerId}.json`);
}

export async function loadBaseline(dir: string, peerId: string): Promise<Baseline> {
  try {
    const raw = await readFile(baselinePath(dir, peerId), "utf8");
    return JSON.parse(raw) as Baseline;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { peerId, lastSyncMs: 0, mtimes: {} };
    }
    throw err;
  }
}

export async function saveBaseline(dir: string, b: Baseline): Promise<void> {
  await writeFile(baselinePath(dir, b.peerId), JSON.stringify(b, null, 2) + "\n", "utf8");
}

/**
 * Real conflict = both sides modified this path since the last successful sync.
 * @param baseline stored baseline (from previous sync)
 * @param path relative path
 * @param localMtime ms epoch
 * @param remoteMtime ms epoch
 */
export function detectConflict(
  baseline: Baseline,
  path: string,
  localMtime: number,
  remoteMtime: number,
): boolean {
  const baselineMtime = baseline.mtimes[path] ?? baseline.lastSyncMs;
  return localMtime > baselineMtime && remoteMtime > baselineMtime;
}
