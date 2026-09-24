import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyFiltered, matchesGlob } from "../src/manifest.js";

let root: string;
let srcDir: string;
let destDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pisync-copy-"));
  srcDir = join(root, "src");
  destDir = join(root, "dest");
  await mkdir(srcDir, { recursive: true });
  await mkdir(destDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("copyFiltered", () => {
  it("copies plain trees recursively", async () => {
    await mkdir(join(srcDir, "a/b"), { recursive: true });
    await writeFile(join(srcDir, "a/one.txt"), "one");
    await writeFile(join(srcDir, "a/b/two.txt"), "two");
    const stats = await copyFiltered(srcDir, join(destDir, "out"), []);
    expect(stats.files).toBe(2);
    expect(await readFile(join(destDir, "out/a/b/two.txt"), "utf8")).toBe("two");
  });

  it("skips excluded files and directories", async () => {
    await mkdir(join(srcDir, "node_modules/pkg"), { recursive: true });
    await mkdir(join(srcDir, "claude-sessions"), { recursive: true });
    await writeFile(join(srcDir, "keep.txt"), "k");
    await writeFile(join(srcDir, "old.bak"), "b");
    await writeFile(join(srcDir, "node_modules/pkg/index.js"), "n");
    await writeFile(join(srcDir, "claude-sessions/s.json"), "c");
    await copyFiltered(srcDir, join(destDir, "out"), ["**/node_modules/**", "**/*.bak", "**/claude-sessions/**"]);
    expect(await readFile(join(destDir, "out/keep.txt"), "utf8")).toBe("k");
    await expect(readFile(join(destDir, "out/old.bak"), "utf8")).rejects.toThrow();
    await expect(readFile(join(destDir, "out/node_modules/pkg/index.js"), "utf8")).rejects.toThrow();
    await expect(readFile(join(destDir, "out/claude-sessions/s.json"), "utf8")).rejects.toThrow();
  });

  it("dereferences symlinks into real files", async () => {
    await writeFile(join(root, "target.txt"), "real");
    await symlink(join(root, "target.txt"), join(srcDir, "link.txt"));
    await copyFiltered(srcDir, join(destDir, "out"), []);
    const copied = await readFile(join(destDir, "out/link.txt"), "utf8");
    expect(copied).toBe("real");
  });

  it("returns zero stats for a missing source", async () => {
    const stats = await copyFiltered(join(srcDir, "does-not-exist"), join(destDir, "out"), []);
    expect(stats).toEqual({ files: 0, bytes: 0 });
  });
});

describe("matchesGlob", () => {
  it("matchesGlob handles ** and * correctly", () => {
    expect(matchesGlob("skills/a/foo.md", "skills/**")).toBe(true);
    expect(matchesGlob("skills/a/foo.md", "skills/*/foo.md")).toBe(true);
    expect(matchesGlob("skills/a/b/foo.md", "skills/*/foo.md")).toBe(false);
    expect(matchesGlob("anything.bak", "**/*.bak")).toBe(true);
    expect(matchesGlob("nested/dir/anything.bak", "**/*.bak")).toBe(true);
  });
});
