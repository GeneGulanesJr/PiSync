import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extract, install, DEFAULT_EXCLUDES } from "../src/bundle.js";

const execFileP = promisify(execFile);

let tmp: string;
let fakeHome: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-bundle-test-"));
  fakeHome = join(tmp, "home");
  await mkdir(join(fakeHome, ".pi", "agent", "skills", "foo"), { recursive: true });
  await writeFile(join(fakeHome, ".pi", "agent", "AGENTS.md"), "agents");
  await writeFile(join(fakeHome, ".pi", "agent", "settings.json"), "{}");
  await writeFile(join(fakeHome, ".pi", "agent", "auth.json"), '{"secret":true}');
  await writeFile(join(fakeHome, ".pi", "agent", "models-store.json.bak"), "bak");
  await writeFile(join(fakeHome, ".pi", "agent", "skills", "foo", "SKILL.md"), "foo");
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// We can't easily monkey-patch the bundle module's PI_DIR, so we create a fake ~/.pi
// under `tmp` and run `tar -tzf` against the result. The point of these tests is
// to verify the EXCLUDE list and that the tar is non-empty.

describe("DEFAULT_EXCLUDES", () => {
  it("includes auth.json", () => {
    expect(DEFAULT_EXCLUDES).toContain("auth.json");
  });
  it("includes *.bak", () => {
    expect(DEFAULT_EXCLUDES.some((p) => p.endsWith(".bak"))).toBe(true);
  });
  it("includes node_modules", () => {
    expect(DEFAULT_EXCLUDES).toContain("node_modules");
  });
});

describe("extract + install roundtrip", () => {
  it("produces a tar.gz and the file is non-empty", async () => {
    // Override HOME so PI_DIR points at our fixture.
    const prevHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const out = join(tmp, "bundle.tar.gz");
      const r = await extract(out);
      expect(r.path).toBe(out);
      expect(r.bytes).toBeGreaterThan(0);
      const s = await stat(out);
      expect(s.isFile()).toBe(true);
    } finally {
      process.env.HOME = prevHome;
    }
  }, 30_000);

  it("tar contents exclude auth.json and *.bak", async () => {
    const prevHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const out = join(tmp, "bundle.tar.gz");
      await extract(out);
      const { stdout } = await execFileP("tar", ["-tzf", out]);
      expect(stdout).toContain("agent/AGENTS.md");
      expect(stdout).toContain("agent/settings.json");
      expect(stdout).toContain("agent/skills/foo/SKILL.md");
      expect(stdout).not.toContain("auth.json");
      expect(stdout).not.toContain(".bak");
    } finally {
      process.env.HOME = prevHome;
    }
  }, 30_000);
});
