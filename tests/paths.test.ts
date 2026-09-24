import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { BUNDLE_EXCLUDES, bundleSpec, expandTildeWith, resolveSpec } from "../src/paths.js";

const HOME = "/home/tester";

describe("expandTildeWith", () => {
  it("expands ~ and ~/ prefixes", () => {
    expect(expandTildeWith("~", HOME)).toBe(HOME);
    expect(expandTildeWith("~/.pi/agent/skills", HOME)).toBe(join(HOME, ".pi/agent/skills"));
  });
  it("leaves absolute paths alone", () => {
    expect(expandTildeWith("/tmp/x", HOME)).toBe("/tmp/x");
  });
});

describe("bundleSpec", () => {
  it("covers both skill stores, the git package store, and the memory DB", () => {
    const spec = bundleSpec();
    const paths = spec.map((e) => e.bundlePath);
    expect(paths).toContain("pi/agent/skills");
    expect(paths).toContain("agents/skills");
    expect(paths).toContain("pi/agent/git");
    expect(paths).toContain("memory/memory.db");
    expect(paths).toContain("pi/agent/auth.json");
  });
  it("memory DB entry is flagged sqlite", () => {
    const db = bundleSpec().find((e) => e.bundlePath === "memory/memory.db")!;
    expect(db.sqlite).toBe(true);
    expect(db.skipFlag).toBe("no-memory");
  });
});

describe("resolveSpec", () => {
  it("maps ~-form source and dest to absolute paths under home", () => {
    const spec = bundleSpec().find((e) => e.bundlePath === "pi/agent/skills")!;
    const r = resolveSpec(spec, HOME);
    expect(r.source).toBe(join(HOME, ".pi/agent/skills"));
    expect(r.dest).toBe(join(HOME, ".pi/agent/skills"));
    expect(r.bundlePath).toBe("pi/agent/skills");
  });
});

describe("BUNDLE_EXCLUDES", () => {
  it("never ships sessions, bak files, or node_modules", () => {
    expect(BUNDLE_EXCLUDES).toContain("**/node_modules/**");
    expect(BUNDLE_EXCLUDES).toContain("**/*.bak");
    expect(BUNDLE_EXCLUDES).toContain("**/claude-sessions/**");
  });
});
