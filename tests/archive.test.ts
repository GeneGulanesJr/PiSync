import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listArchive, packArchive, unpackArchive } from "../src/archive.js";

let root: string;
let stage: string;
let outDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pisync-arch-"));
  stage = join(root, "stage");
  outDir = join(root, "out");
  await mkdir(join(stage, "pisync-test/inner"), { recursive: true });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(stage, "pisync-test/a.txt"), "a");
  await writeFile(join(stage, "pisync-test/inner/b.txt"), "b");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe.each(["zstd", "gzip"] as const)("packArchive (%s)", (compression) => {
  it("writes a .part file, renames atomically, lists and unpacks", async () => {
    const out = join(outDir, `pisync-test.tar.${compression === "zstd" ? "zst" : "gz"}`);
    await packArchive(stage, "pisync-test", out, compression);
    const listing = await readdir(outDir);
    expect(listing).toEqual([`pisync-test.tar.${compression === "zstd" ? "zst" : "gz"}`]); // no .part left
    const names = await listArchive(out);
    expect(names).toContain("pisync-test/a.txt");
    const dest = join(root, "unpacked");
    await unpackArchive(out, dest);
    const entries = await readdir(join(dest, "pisync-test"));
    expect(entries).toContain("a.txt");
  });
});
