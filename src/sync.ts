import { spawn } from "node:child_process";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildManifest, DEFAULT_EXCLUDES } from "./manifest.js";
import { parseItemizeStream, type RsyncItem } from "./itemize-parser.js";
import { loadBaseline, saveBaseline, detectConflict } from "./baseline.js";
import { logEvent } from "./log.js";
import { acquireLock, releaseLock } from "./lock.js";
import { sqliteSnapshot, sqliteAvailable, atomicReplace } from "./sqlite-snapshot.js";
import { buildSshArgs } from "./ssh.js";
import type { PiSyncConfig, PeerInfo, SyncDirection, Baseline } from "./types.js";

const execFileP = promisify(execFile);

const PEER_DIR = join(homedir(), ".pi");
const CACHE_DIR = join(PEER_DIR, "cache", "pi-sync");
const MEMORY_DB = join(PEER_DIR, "memory", "memory.db");

export interface SyncOpts {
  config: PiSyncConfig;
  peer: PeerInfo;
  direction: SyncDirection;
  onProgress?: (msg: string) => void;
}

export interface SyncResult {
  transferred: number;
  conflicts: string[];
  bytes: number;
  error?: string;
}

/**
 * Run a single rsync transfer.
 * For `push`: src on local → dst on remote (under ~/.pi/ on remote)
 * For `pull`: src on remote → dst on local
 *
 * Memory DB is special-cased: snapshot first, then transfer the snapshot.
 */
export async function runSync(opts: SyncOpts): Promise<SyncResult> {
  const { config, peer, direction, onProgress } = opts;
  const handle = await acquireLock(CACHE_DIR);

  const result: SyncResult = { transferred: 0, conflicts: [], bytes: 0 };

  try {
    // 1. Memory DB: snapshot locally before sending
    let memorySnapshot: string | null = null;
    if (await sqliteAvailable()) {
      memorySnapshot = `/tmp/pi-sync-mem-${randomUUID()}.db`;
      await sqliteSnapshot(MEMORY_DB, memorySnapshot);
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "snapshot",
        path: "memory.db",
        detail: { snapshot: memorySnapshot },
      });
    } else {
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "skip",
        path: "memory.db",
        detail: { reason: "sqlite3 not installed" },
      });
    }

    // 2. Build rsync command
    const excludeArgs = DEFAULT_EXCLUDES.flatMap((e) => ["--exclude", e]);
    const sshArgs = buildSshArgs({
      host: peer.host,
      keyPath: resolve(config.sshKey.startsWith("~") ? config.sshKey.replace("~", homedir()) : config.sshKey),
      port: config.rsyncPort,
      connectTimeout: 5,
      skipHost: true, // rsync appends the host itself from src/dst
    });
    const sshCmd = `ssh ${sshArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
    const rsyncArgs: string[] = [
      "-a",
      "--update",
      "--itemize-changes",
      "--info=stats2",
      "--backup",
      `--backup-dir=${join(CACHE_DIR, "conflict-archive", peer.id, String(Date.now()))}`,
      ...excludeArgs,
      "-e", sshCmd,
    ];

    const src = direction === "push" ? join(PEER_DIR, "agent") : `${peer.host}:${PEER_DIR}/agent/`;
    const dst = direction === "push" ? `${peer.host}:${PEER_DIR}/agent/` : join(PEER_DIR, "agent");
    rsyncArgs.push(src, dst);

    if (onProgress) onProgress(`rsync ${direction}…`);
    const { stdout } = await execFileP("rsync", rsyncArgs, { maxBuffer: 50 * 1024 * 1024 });

    // 3. Parse rsync output for conflicts
    const baseline = await loadBaseline(CACHE_DIR, peer.id);
    const items = parseItemizeStream(stdout);
    await classifyItems(items, peer, direction, baseline, result);

    // 4. Memory DB transfer (separate from rsync because of snapshot semantics)
    if (memorySnapshot) {
      await transferMemoryDb(direction, peer, config, memorySnapshot);
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "rename",
        path: "memory.db",
      });
    }

    // 5. Update baseline
    baseline.lastSyncMs = Date.now();
    const manifest = await buildManifest(join(PEER_DIR, "agent"));
    for (const entry of manifest) {
      baseline.mtimes[entry.relPath] = entry.mtimeMs;
    }
    await saveBaseline(CACHE_DIR, baseline);
  } catch (err: unknown) {
    result.error = err instanceof Error ? err.message : String(err);
    await logEvent(CACHE_DIR, {
      ts: new Date().toISOString(),
      peer: peer.id,
      direction,
      action: "error",
      path: "-",
      detail: { error: result.error },
    });
  } finally {
    await releaseLock(CACHE_DIR, handle);
  }

  return result;
}

async function classifyItems(
  items: RsyncItem[],
  peer: PeerInfo,
  direction: SyncDirection,
  baseline: Baseline,
  result: SyncResult,
): Promise<void> {
  for (const item of items) {
    if (item.direction === "*" || item.typeFlag === "d") continue;
    if (item.direction === ">") {
      result.transferred++;
      await logEvent(CACHE_DIR, {
        ts: new Date().toISOString(),
        peer: peer.id,
        direction,
        action: "transfer",
        path: item.path,
        detail: { attrs: item.attributeFlags },
      });
    } else if (item.attributeFlags.includes("c")) {
      // checksum-triggered transfer: check for real conflict
      const localPath = join(PEER_DIR, "agent", item.path);
      let localMtime = 0;
      try {
        const s = await stat(localPath);
        localMtime = Math.floor(s.mtimeMs);
      } catch { /* ignore */ }
      const isConflict = detectConflict(baseline, item.path, localMtime, Date.now());
      if (isConflict) {
        result.conflicts.push(item.path);
        await logEvent(CACHE_DIR, {
          ts: new Date().toISOString(),
          peer: peer.id,
          direction,
          action: "conflict",
          path: item.path,
        });
      }
    }
  }
}

async function transferMemoryDb(
  direction: SyncDirection,
  peer: PeerInfo,
  config: PiSyncConfig,
  localSnapshot: string,
): Promise<void> {
  const resolvedKey = resolve(config.sshKey.startsWith("~") ? config.sshKey.replace("~", homedir()) : config.sshKey);
  // rsync transport: skip host (rsync appends it from src/dst)
  const rsyncSshArgs = buildSshArgs({
    host: peer.host,
    keyPath: resolvedKey,
    port: config.sshPort,
    connectTimeout: 5,
    skipHost: true,
  });
  const rsyncSshCmd = `ssh ${rsyncSshArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
  // direct ssh: include host (no rsync to add it)
  const sshArgs = buildSshArgs({
    host: peer.host,
    keyPath: resolvedKey,
    port: config.sshPort,
    connectTimeout: 5,
  });
  if (direction === "push") {
    await execFileP("rsync", ["-a", "-e", rsyncSshCmd, localSnapshot, `${peer.host}:/tmp/mem-receive.db`]);
    // Atomic rename on receiver
    await execFileP("ssh", [...sshArgs, "mv", "/tmp/mem-receive.db", MEMORY_DB]);
  } else {
    await execFileP("rsync", ["-a", "-e", rsyncSshCmd, `${peer.host}:${MEMORY_DB}`, localSnapshot]);
    await atomicReplace(localSnapshot, MEMORY_DB);
  }
}
