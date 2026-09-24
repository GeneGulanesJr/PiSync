import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, type ManifestEntry, DEFAULT_EXCLUDES, matchesGlob } from "../src/manifest.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pi-sync-mf-"));
  await mkdir(join(root, "skills/a"), { recursive: true });
  await mkdir(join(root, "skills/b"), { recursive: true });
  await writeFile(join(root, "skills/a/SKILL.md"), "a");
  await writeFile(join(root, "skills/b/SKILL.md"), "b");
  await writeFile(join(root, "AGENTS.md"), "agents");
  await writeFile(join(root, "auth.json"), "{}");
  await writeFile(join(root, "settings.json"), "{}");
  await writeFile(join(root, "models-store.json.bak"), "bak");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("manifest", () => {
  it("walks the tree and returns relative entries", async () => {
    const m = await buildManifest(root);
    const paths = m.map((e) => e.relPath).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "settings.json",
        "skills/a/SKILL.md",
        "skills/b/SKILL.md",
      ]),
    );
  });

  it("excludes auth.json by default", async () => {
    const m = await buildManifest(root);
    expect(m.find((e) => e.relPath === "auth.json")).toBeUndefined();
  });

  it("excludes *.bak by default", async () => {
    const m = await buildManifest(root);
    expect(m.find((e) => e.relPath === "models-store.json.bak")).toBeUndefined();
  });

  it("records size and mtime", async () => {
    const m = await buildManifest(root);
    const a = m.find((e) => e.relPath === "AGENTS.md");
    expect(a).toBeDefined();
    expect(a!.size).toBeGreaterThan(0);
    expect(a!.mtimeMs).toBeGreaterThan(0);
  });

  it("adds an extra exclude pattern", async () => {
    const m = await buildManifest(root, { extra: ["skills/a/**"] });
    expect(m.find((e) => e.relPath.startsWith("skills/a"))).toBeUndefined();
  });

  it("DEFAULT_EXCLUDES contains auth.json", () => {
    expect(DEFAULT_EXCLUDES).toContain("auth.json");
    expect(DEFAULT_EXCLUDES.some((p) => p.endsWith(".bak"))).toBe(true);
  });

  it("matchesGlob handles ** and * correctly", () => {
    expect(matchesGlob("skills/a/foo.md", "skills/**")).toBe(true);
    expect(matchesGlob("skills/a/foo.md", "skills/*/foo.md")).toBe(true);
    expect(matchesGlob("skills/a/b/foo.md", "skills/*/foo.md")).toBe(false);
    expect(matchesGlob("anything.bak", "**/*.bak")).toBe(true);
    expect(matchesGlob("nested/dir/anything.bak", "**/*.bak")).toBe(true);
  });
});