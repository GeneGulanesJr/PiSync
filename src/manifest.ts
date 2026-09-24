import { cp, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export interface CopyStats {
  files: number;
  bytes: number;
}

/**
 * Copy a file or directory tree, skipping any relative path matching an exclude
 * glob. Symlinks are dereferenced (copied as real content). Missing sources are
 * a no-op returning zero stats (optional entries like auth.json may not exist).
 */
export async function copyFiltered(
  src: string,
  dest: string,
  excludes: string[],
): Promise<CopyStats> {
  try {
    await stat(src);
  } catch {
    return { files: 0, bytes: 0 };
  }
  await cp(src, dest, {
    recursive: true,
    dereference: true,
    filter: (srcPath) => {
      const rel = relative(src, srcPath).split(sep).join("/");
      if (rel === "") return true; // the root itself
      return !matchesAny(rel, excludes);
    },
  });
  return await measure(dest, excludes);
}

/** Walk a staged tree and count non-excluded files/bytes. */
export async function measure(dir: string, excludes: string[]): Promise<CopyStats> {
  const out: CopyStats = { files: 0, bytes: 0 };
  try {
    await walk(dir, dir, excludes, out);
  } catch {
    return { files: 0, bytes: 0 };
  }
  return out;
}

async function walk(root: string, dir: string, excludes: string[], out: CopyStats): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (matchesAny(rel, excludes)) continue;
    if (entry.isDirectory()) {
      await walk(root, abs, excludes, out);
    } else if (entry.isFile()) {
      const s = await stat(abs);
      out.files += 1;
      out.bytes += s.size;
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
