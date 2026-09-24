import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const DEFAULT_EXCLUDES: string[] = [
  "auth.json",
  "**/*.bak",
  "**/*.db-wal",
  "**/*.db-shm",
  "**/node_modules/**",
  "models-store.json.bak",
];

export interface ManifestEntry {
  relPath: string;
  size: number;
  mtimeMs: number;
}

export interface ManifestOptions {
  extra?: string[];
}

export async function buildManifest(
  root: string,
  opts: ManifestOptions = {},
): Promise<ManifestEntry[]> {
  const excludes = [...DEFAULT_EXCLUDES, ...(opts.extra ?? [])];
  const out: ManifestEntry[] = [];
  await walk(root, root, excludes, out);
  return out;
}

async function walk(
  root: string,
  dir: string,
  excludes: string[],
  out: ManifestEntry[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (matchesAny(rel, excludes)) continue;
    if (entry.isDirectory()) {
      await walk(root, abs, excludes, out);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      out.push({ relPath: rel, size: s.size, mtimeMs: Math.floor(s.mtimeMs) });
    }
  }
}

function matchesAny(rel: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (matchesGlob(rel, p)) return true;
  }
  return false;
}

// Minimal glob matcher: ** for any depth, * for any chars except /, ? for single char.
// **/ matches zero or more path segments (so "**/*.bak" matches both "x.bak" and "a/b/x.bak").
export function matchesGlob(s: string, pattern: string): boolean {
  // escape regex special chars except * and ?
  const re = new RegExp(
    "^" +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*\//g, "::DOUBLESTAR_SLASH::")
        .replace(/\*\*/g, "::DOUBLESTAR::")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/::DOUBLESTAR_SLASH::/g, "(?:.*/)?")
        .replace(/::DOUBLESTAR::/g, ".*") +
      "$",
  );
  return re.test(s);
}