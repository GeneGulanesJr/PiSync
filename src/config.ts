import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { PiSyncConfig } from "./types.js";

export function defaultConfigPath(): string {
  return join(homedir(), ".pi", "agent", "pi-sync.json");
}

export async function loadConfig(path: string = defaultConfigPath()): Promise<PiSyncConfig | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  validate(parsed);
  return parsed as unknown as PiSyncConfig;
}

export async function saveConfig(path: string, cfg: PiSyncConfig): Promise<void> {
  validate(cfg as unknown as Record<string, unknown>);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

function validate(o: Record<string, unknown>): void {
  const required = ["peer", "sshKey", "sshPort", "rsyncPort", "syncPaths", "excludePatterns"];
  for (const k of required) {
    if (!(k in o)) throw new Error(`pi-sync config missing required field: ${k}`);
  }
  if (typeof o.peer !== "string" || !o.peer) throw new Error("peer must be non-empty string");
  if (typeof o.sshKey !== "string" || !o.sshKey) throw new Error("sshKey must be non-empty string");
}