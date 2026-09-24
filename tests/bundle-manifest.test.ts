import { describe, expect, it } from "vitest";
import { buildBundleManifest, validateManifest } from "../src/bundle-manifest.js";
import type { BundleManifest } from "../src/types.js";

const entries = [
  { bundlePath: "pi/agent/settings.json", dest: "~/.pi/agent/settings.json", kind: "file" as const },
  { bundlePath: "memory/memory.db", dest: "~/.pi/memory/memory.db", kind: "file" as const, sqlite: true },
];

describe("buildBundleManifest", () => {
  it("produces a schema-1 manifest with totals", () => {
    const m = buildBundleManifest(entries, { piVersion: "0.87.1", compression: "zstd" });
    expect(m.schema).toBe(1);
    expect(m.compression).toBe("zstd");
    expect(m.totals.files).toBe(0); // caller fills sizes via measure(); zeros ok at build time
    expect(m.entries[1].sqlite).toBe(true);
    expect(m.createdAt).toBeTruthy();
  });
});

describe("validateManifest", () => {
  it("accepts a valid manifest", () => {
    const m = buildBundleManifest(entries, { piVersion: "0.87.1", compression: "gzip" });
    const v = validateManifest(m);
    expect(v.ok).toBe(true);
    expect(v.manifest?.compression).toBe("gzip");
  });
  it("rejects non-objects and wrong schema", () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest("nope").ok).toBe(false);
    expect(validateManifest({ ...validManifest(), schema: 99 }).ok).toBe(false);
    expect(validateManifest({ ...validManifest(), entries: "x" }).ok).toBe(false);
  });
  it("rejects missing required fields", () => {
    const m = validManifest();
    delete (m as Partial<BundleManifest>).compression;
    expect(validateManifest(m).ok).toBe(false);
  });
});

function validManifest(): BundleManifest {
  return buildBundleManifest(entries, { piVersion: "0.87.1", compression: "zstd" });
}
