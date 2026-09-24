import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExtract } from "../src/bundle.js";
import { runImport } from "../src/restore.js";

const execFile = promisify(execFileCb);

let home: string;
let outDir: string;
let dbReady = true;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "pisync-home-"));
  outDir = await mkdtemp(join(tmpdir(), "pisync-out-"));
  await mkdir(join(home, ".pi/agent/skills/my-skill"), { recursive: true });
  await mkdir(join(home, ".agents/skills/other"), { recursive: true });
  await mkdir(join(home, ".pi/memory"), { recursive: true });
  await writeFile(join(home, ".pi/agent/settings.json"), '{"defaultModel":"x"}');
  await writeFile(join(home, ".pi/agent/AGENTS.md"), "# rules");
  await writeFile(join(home, ".pi/agent/trust.json"), "{}");
  await writeFile(join(home, ".pi/agent/auth.json"), '{"key":"secret"}');
  await writeFile(join(home, ".pi/agent/models.json"), "{}");
  await writeFile(join(home, ".pi/agent/models-store.json"), "{}");
  await writeFile(join(home, ".pi/agent/skills/my-skill/SKILL.md"), "# skill");
  await writeFile(join(home, ".agents/skills/other/SKILL.md"), "# other");
  try {
    await execFile("sqlite3", [
      join(home, ".pi/memory/memory.db"),
      "CREATE TABLE t(x); INSERT INTO t VALUES (42);",
    ]);
  } catch {
    dbReady = false;
  }
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
});

describe("runExtract", () => {
  it("produces an archive with manifest and RESTORE.md entries", async () => {
    // Without the sqlite3 CLI the memory entry can't be snapshotted; drop it
    // so runExtract doesn't demand the binary just to bundle the rest.
    const result = await runExtract({
      outDir,
      home,
      ...(dbReady ? {} : { noMemory: true }),
    });
    const paths = result.entries.map((e) => e.bundlePath);
    expect(paths).toContain("pi/agent/skills");
    expect(paths).not.toContain("pi/agent/git"); // git/ absent in sandbox; entry skipped as missing
    if (dbReady) expect(paths).toContain("memory/memory.db");
    const s = await stat(result.archivePath);
    expect(s.size).toBeGreaterThan(0);
    expect(result.archivePath.endsWith(".tar.zst") || result.archivePath.endsWith(".tar.gz")).toBe(true);
  });

  it("--noMemory and --noAuth drop their entries", async () => {
    const result = await runExtract({ outDir, home, noMemory: true, noAuth: true });
    const paths = result.entries.map((e) => e.bundlePath);
    expect(paths).not.toContain("memory/memory.db");
    expect(paths).not.toContain("pi/agent/auth.json");
    expect(paths).toContain("pi/agent/skills");
  });
});

describe("runImport", () => {
  it("round-trips state into a fresh home", async () => {
    const extract = await runExtract({ outDir, home });
    const home2 = await mkdtemp(join(tmpdir(), "pisync-target-"));
    try {
      const imported = await runImport(extract.archivePath, { home: home2 });
      expect(imported.restored).toContain(join(home2, ".pi/agent/settings.json"));
      expect(await readFile(join(home2, ".pi/agent/settings.json"), "utf8")).toContain("defaultModel");
      expect(await readFile(join(home2, ".agents/skills/other/SKILL.md"), "utf8")).toBe("# other");
      if (dbReady) {
        const { stdout } = await execFile("sqlite3", [join(home2, ".pi/memory/memory.db"), "SELECT x FROM t;"]);
        expect(stdout.trim()).toBe("42");
      }
      expect(imported.backupDir).toContain("pre-import-");
    } finally {
      await rm(home2, { recursive: true, force: true });
    }
  });
});
