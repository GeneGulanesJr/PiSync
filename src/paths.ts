import { homedir } from "node:os";
import { join } from "node:path";
import type { BundleSpecEntry } from "./types.js";

export function expandTildeWith(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return join(home, p.slice(2));
  return p;
}

export const BUNDLE_EXCLUDES: string[] = [
  "**/*.bak",
  "**/*.db-wal",
  "**/*.db-shm",
  "**/node_modules/**",
  "**/claude-sessions/**",
  "**/sessions/**",
  "pistats.db",
  "pi-sync.json",
];

/** Single source of truth for what ships in a bundle. Paths are ~-form (portable). */
export function bundleSpec(): BundleSpecEntry[] {
  const agent = "~/.pi/agent";
  return [
    { source: `${agent}/skills`, bundlePath: "pi/agent/skills", dest: `${agent}/skills`, kind: "dir" },
    { source: `${agent}/extensions`, bundlePath: "pi/agent/extensions", dest: `${agent}/extensions`, kind: "dir" },
    { source: `${agent}/git`, bundlePath: "pi/agent/git", dest: `${agent}/git`, kind: "dir" },
    { source: `${agent}/bin`, bundlePath: "pi/agent/bin", dest: `${agent}/bin`, kind: "dir" },
    { source: `${agent}/settings.json`, bundlePath: "pi/agent/settings.json", dest: `${agent}/settings.json`, kind: "file" },
    { source: `${agent}/AGENTS.md`, bundlePath: "pi/agent/AGENTS.md", dest: `${agent}/AGENTS.md`, kind: "file" },
    { source: `${agent}/trust.json`, bundlePath: "pi/agent/trust.json", dest: `${agent}/trust.json`, kind: "file" },
    { source: `${agent}/auth.json`, bundlePath: "pi/agent/auth.json", dest: `${agent}/auth.json`, kind: "file", skipFlag: "no-auth" },
    { source: `${agent}/models.json`, bundlePath: "pi/agent/models.json", dest: `${agent}/models.json`, kind: "file" },
    { source: `${agent}/models-store.json`, bundlePath: "pi/agent/models-store.json", dest: `${agent}/models-store.json`, kind: "file" },
    { source: "~/.agents/skills", bundlePath: "agents/skills", dest: "~/.agents/skills", kind: "dir", skipFlag: "no-agents-skills" },
    { source: "~/.pi/memory/memory.db", bundlePath: "memory/memory.db", dest: "~/.pi/memory/memory.db", kind: "file", sqlite: true, skipFlag: "no-memory" },
  ];
}

export function resolveSpec(entry: BundleSpecEntry, home: string): {
  source: string; bundlePath: string; dest: string;
  kind: "dir" | "file"; sqlite?: boolean; skipFlag?: BundleSpecEntry["skipFlag"];
} {
  return {
    source: expandTildeWith(entry.source, home),
    bundlePath: entry.bundlePath,
    dest: expandTildeWith(entry.dest, home),
    kind: entry.kind,
    sqlite: entry.sqlite,
    skipFlag: entry.skipFlag,
  };
}

export function defaultHome(): string {
  return homedir();
}
