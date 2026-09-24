import { spawn } from "node:child_process";
import { rename, unlink } from "node:fs/promises";

/** Returns true if the sqlite3 CLI is on PATH and responds to --version. */
export async function sqliteAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("sqlite3", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * Take a consistent backup of a SQLite database using the online backup API.
 * Safe to run while other processes hold the DB open for read/write.
 * Returns the path to the snapshot file.
 */
export async function sqliteSnapshot(dbPath: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sqlite3", [dbPath, `.backup '${outPath}'`], { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`sqlite3 .backup exited with code ${code}`));
    });
  });
}

/** Atomic rename: snapshot over live DB. */
export async function atomicReplace(src: string, dst: string): Promise<void> {
  await rename(src, dst);
}

/**
 * Atomically replace destDb with stagedDb (which must live on the same
 * filesystem). Deletes stale WAL/SHM sidecars first — replaying a stale WAL
 * against an imported DB corrupts it. SQLite recreates both on next open.
 */
export async function swapDatabase(stagedDb: string, destDb: string): Promise<void> {
  await unlink(`${destDb}-wal`).catch(() => {});
  await unlink(`${destDb}-shm`).catch(() => {});
  await rename(stagedDb, destDb);
}