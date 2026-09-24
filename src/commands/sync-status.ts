import { readLog } from "../log.js";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SyncEvent } from "../types.js";

const CACHE_DIR = join(homedir(), ".pi", "cache", "pi-sync");

export interface StatusSummary {
  totalEvents: number;
  totalConflicts: number;
  totalErrors: number;
  lastSyncMs: number | null;
  lastConflict: SyncEvent | null;
}

export async function statusSummary(): Promise<StatusSummary> {
  const events = await readLog(CACHE_DIR);
  const conflicts = events.filter((e) => e.action === "conflict");
  const errors = events.filter((e) => e.action === "error");
  const transfers = events.filter((e) => e.action === "transfer");
  return {
    totalEvents: events.length,
    totalConflicts: conflicts.length,
    totalErrors: errors.length,
    lastSyncMs: transfers.length > 0 ? new Date(transfers[transfers.length - 1].ts).getTime() : null,
    lastConflict: conflicts.length > 0 ? conflicts[conflicts.length - 1] : null,
  };
}