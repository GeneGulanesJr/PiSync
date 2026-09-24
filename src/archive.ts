import { spawn } from "node:child_process";
import { mkdir, rename, rm } from "node:fs/promises";

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "ignore" });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

export function zstdAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("zstd", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve(false));
    proc.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * tar a stage dir into an archive. The compressor is passed EXPLICITLY
 * (--zstd / -z) — never inferred from the extension, because we write to
 * `<out>.part` first for atomicity, which breaks suffix detection.
 */
export async function packArchive(
  stageDir: string,
  rootName: string,
  outPath: string,
  compression: "zstd" | "gzip",
): Promise<void> {
  const partPath = `${outPath}.part`;
  try {
    await run("tar", [
      "-C", stageDir,
      compression === "zstd" ? "--zstd" : "-z",
      "-cf", partPath,
      rootName,
    ]);
    await rename(partPath, outPath);
  } catch (err) {
    await rm(partPath, { force: true }); // never leave a partial artifact
    throw err;
  }
}

export async function listArchive(archivePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn("tar", ["-tf", archivePath], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`tar -tf exited with code ${code}`));
      resolve(out.split("\n").filter((l) => l.trim()));
    });
  });
}

/** GNU tar auto-detects compression on extract. Extracts into destDir (created if missing). */
export async function unpackArchive(archivePath: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true }); // tar -C fails if the dir doesn't exist
  await run("tar", ["-xf", archivePath, "-C", destDir]);
}
