import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, statfs, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { BUNDLE_EXCLUDES, bundleSpec, defaultHome, expandTildeWith, resolveSpec } from "./paths.js";
import { copyFiltered, measure, type CopyStats } from "./manifest.js";
import { buildBundleManifest, PISYNC_VERSION } from "./bundle-manifest.js";
import { packArchive, zstdAvailable } from "./archive.js";
import { sqliteAvailable, sqliteSnapshot } from "./sqlite-snapshot.js";
import type { BundleManifest, BundleManifestEntry, ExtractOptions, ExtractResult } from "./types.js";
import { logEvent } from "./log.js";

const execFileAsync = promisify(execFile);

export function cacheDir(home: string): string {
  return expandTildeWith("~/.pi/cache/pi-sync", home);
}

function timestampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `pisync-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function piVersion(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("pi", ["--version"], { timeout: 3000 });
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

async function treeBytes(p: string): Promise<number> {
  try {
    const s = await stat(p);
    if (!s.isDirectory()) return s.size;
    return (await measure(p, BUNDLE_EXCLUDES)).bytes;
  } catch {
    return 0;
  }
}

async function assertDiskSpace(outDir: string, estimateBytes: number): Promise<void> {
  const s = await statfs(outDir);
  const free = Number(s.bavail) * Number(s.bsize);
  if (free < estimateBytes * 1.2) {
    throw new Error(
      `Insufficient disk space in ${outDir}: need ~${Math.ceil((estimateBytes * 1.2) / 1e6)} MB, free ${Math.floor(free / 1e6)} MB`,
    );
  }
}

function restoreMd(rootName: string, compression: "zstd" | "gzip", manifest: BundleManifest): string {
  const flag = compression === "zstd" ? "--zstd" : "";
  const ext = compression === "zstd" ? "zst" : "gz";
  const mapping = manifest.entries.map((e) => `- ${e.bundlePath} -> ${e.dest}`).join("\n");
  return `# pi-sync bundle — ${rootName}

Restore with plain shell — no pi-sync needed.

## 1. Unpack

\`\`\`bash
tar ${flag} -xf ${rootName}.tar.${ext} -C /tmp
\`\`\`

## 2. Copy state into $HOME

\`\`\`bash
cp -a /tmp/${rootName}/pi/agent/. ~/.pi/agent/
cp -a /tmp/${rootName}/agents/skills/. ~/.agents/skills/   # if present
\`\`\`

## 3. Swap the memory DB (LaPis) — if memory/memory.db exists in this bundle

\`\`\`bash
rm -f ~/.pi/memory/memory.db-wal ~/.pi/memory/memory-db-shm ~/.pi/memory/memory.db-shm
mv /tmp/${rootName}/memory/memory.db ~/.pi/memory/memory.db
\`\`\`

## Caveats

- settings.json may reference absolute paths OUTSIDE ~/.pi (e.g. extension entries
  pointing at ~/Documents/... repos). Fix or remove those entries on this machine.
- auth.json contains API keys — treat this bundle like a credential file.
- Run this restore BEFORE starting pi, or restart pi afterwards.

## Entry map

${mapping}
`;
}

export async function runExtract(opts: ExtractOptions = {}): Promise<ExtractResult> {
  const started = Date.now();
  const home = opts.home ?? defaultHome();
  const logDir = cacheDir(home);
  const spec = bundleSpec().filter((e) => {
    if (e.skipFlag === "no-memory" && opts.noMemory) return false;
    if (e.skipFlag === "no-auth" && opts.noAuth) return false;
    if (e.skipFlag === "no-agents-skills" && opts.noAgentsSkills) return false;
    return true;
  });

  const outDir = expandTildeWith(opts.outDir ?? "~/Downloads", home);
  const compression = (await zstdAvailable()) ? "zstd" : "gzip";
  const rootName = timestampName();
  const archivePath = join(outDir, `${rootName}.tar.${compression === "zstd" ? "zst" : "gz"}`);

  await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "start", detail: { outDir, compression } });
  try {
    const useMemory = spec.some((e) => e.sqlite);
    if (useMemory && !(await sqliteAvailable())) {
      throw new Error(
        "sqlite3 CLI not found — install it (e.g. `sudo pacman -S sqlite`) to bundle the memory DB, or re-run with --no-memory.",
      );
    }
    await mkdir(outDir, { recursive: true });

    // Pre-flight: estimate raw input size (+20%) and check target disk space.
    let estimate = 0;
    const present: typeof spec = [];
    for (const e of spec) {
      const r = resolveSpec(e, home);
      const bytes = await treeBytes(r.source);
      if (bytes === 0 && e.kind === "file") continue; // missing optional file
      if (bytes === 0 && e.kind === "dir") {
        try { await stat(r.source); } catch { continue; } // missing optional dir
      }
      estimate += bytes;
      present.push(e);
    }
    await assertDiskSpace(outDir, estimate);

    // Stage.
    await mkdir(cacheDir(home), { recursive: true });
    const stageBase = await mkdtemp(join(cacheDir(home), "stage-"));
    const stage = join(stageBase, rootName);
    await mkdir(stage, { recursive: true });
    let entries: BundleManifestEntry[] = [];
    try {
      entries = [];
      for (const e of present) {
        const r = resolveSpec(e, home);
        const destInStage = join(stage, e.bundlePath);
        await mkdir(dirname(destInStage), { recursive: true });
        if (e.sqlite) {
          await sqliteSnapshot(r.source, destInStage); // consistent copy while pi runs
        } else {
          await copyFiltered(r.source, destInStage, BUNDLE_EXCLUDES);
        }
        let stats: CopyStats;
        if (e.kind === "file") {
          const s = await stat(destInStage);
          stats = { files: 1, bytes: s.size };
        } else {
          stats = await measure(destInStage, BUNDLE_EXCLUDES);
        }
        entries.push({
          bundlePath: e.bundlePath, dest: e.dest, kind: e.kind,
          files: stats.files, bytes: stats.bytes, sqlite: e.sqlite,
        });
      }

      const manifest: BundleManifest = {
        ...buildBundleManifest(
          entries.map(({ files: _f, bytes: _b, ...rest }) => rest),
          { piVersion: await piVersion(), compression },
        ),
        entries,
        totals: {
          files: entries.reduce((a, e) => a + e.files, 0),
          bytes: entries.reduce((a, e) => a + e.bytes, 0),
        },
      };
      await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
      await writeFile(join(stage, "RESTORE.md"), restoreMd(rootName, compression, manifest));

      // Pack atomically: <archive>.part -> rename.
      await packArchive(stageBase, rootName, archivePath, compression);
    } finally {
      await rm(stageBase, { recursive: true, force: true });
    }

    const bytes = (await stat(archivePath)).size;
    const result: ExtractResult = {
      archivePath, compression, bytes,
      durationMs: Date.now() - started, entries,
    };
    await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "done", detail: { archivePath, bytes } });
    return result;
  } catch (err) {
    await logEvent(logDir, { ts: new Date().toISOString(), op: "extract", status: "error", detail: { error: String(err) } });
    throw err;
  }
}
