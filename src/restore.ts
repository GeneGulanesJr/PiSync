import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { BUNDLE_EXCLUDES, defaultHome, expandTildeWith } from "./paths.js";
import { copyFiltered } from "./manifest.js";
import { validateManifest } from "./bundle-manifest.js";
import { listArchive, unpackArchive } from "./archive.js";
import { swapDatabase } from "./sqlite-snapshot.js";
import type { BundleManifest, ImportOptions, ImportResult } from "./types.js";
import { cacheDir } from "./bundle.js";
import { logEvent } from "./log.js";

export async function runImport(archivePath: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const started = Date.now();
  const home = opts.home ?? defaultHome();
  const logDir = cacheDir(home);
  await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "start", detail: { archivePath } });
  try {
    await stat(archivePath); // ENOENT surfaces naturally if missing

    // 1. Validate: exactly one pisync-* root + parseable schema-1 manifest.
    const names = await listArchive(archivePath);
    const roots = [...new Set(names.map((n) => n.split("/")[0]).filter((n) => n.startsWith("pisync-")))];
    if (roots.length !== 1) {
      throw new Error("Not a pi-sync bundle: expected exactly one pisync-* root directory in the archive.");
    }
    const rootName = roots[0];
    const work = await mkdtemp(join(tmpdir(), "pisync-import-"));
    try {
      await unpackArchive(archivePath, work);
      const bundleRoot = join(work, rootName);
      const raw: unknown = JSON.parse(await readFile(join(bundleRoot, "manifest.json"), "utf8"));
      const v = validateManifest(raw);
      if (!v.ok) throw new Error(`Invalid bundle manifest: ${v.errors.join("; ")}`);
      const manifest = v.manifest as BundleManifest;

      // 2. Pre-import safety: back up existing files we are about to overwrite.
      const backupDir = join(cacheDir(home), `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      await mkdir(backupDir, { recursive: true });
      for (const e of manifest.entries) {
        if (e.kind !== "file") continue; // dirs merge; not backed up
        const dest = expandTildeWith(e.dest, home);
        try {
          await stat(dest);
          await cp(dest, join(backupDir, e.bundlePath.split("/").join("__")), { recursive: true, dereference: true });
        } catch {
          // didn't exist — nothing to back up
        }
      }

      // 3. Restore entries.
      const restored: string[] = [];
      const skipped: string[] = [];
      for (const e of manifest.entries) {
        const inBundle = join(bundleRoot, e.bundlePath);
        const dest = expandTildeWith(e.dest, home);
        try {
          await stat(inBundle);
        } catch {
          skipped.push(e.bundlePath);
          continue;
        }
        if (e.sqlite) {
          await mkdir(dirname(dest), { recursive: true }); // fresh home: parent may not exist yet
          await swapDatabase(inBundle, dest); // atomic rename + stale WAL/SHM removal
        } else if (e.kind === "dir") {
          await mkdir(dest, { recursive: true });
          await copyFiltered(inBundle, dest, BUNDLE_EXCLUDES); // merge/overlay
        } else {
          await mkdir(dirname(dest), { recursive: true });
          await copyFiltered(inBundle, dest, []);
        }
        restored.push(dest);
      }

      const result: ImportResult = { restored, skipped, backupDir, durationMs: Date.now() - started };
      await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "done", detail: { restored: restored.length, skipped: skipped.length } });
      return result;
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  } catch (err) {
    await logEvent(logDir, { ts: new Date().toISOString(), op: "import", status: "error", detail: { error: String(err) } });
    throw err;
  }
}
