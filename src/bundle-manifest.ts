import { hostname } from "node:os";
import type { BundleManifest, BundleManifestEntry } from "./types.js";

export const SUPPORTED_SCHEMA = 1;
export const PISYNC_VERSION = "0.2.0";

export function buildBundleManifest(
  entries: Omit<BundleManifestEntry, "files" | "bytes">[],
  meta: { piVersion: string; compression: "zstd" | "gzip" },
): BundleManifest {
  const withSizes: BundleManifestEntry[] = entries.map((e) => ({ ...e, files: 0, bytes: 0 }));
  return {
    schema: SUPPORTED_SCHEMA,
    createdAt: new Date().toISOString(),
    hostname: hostname(),
    piVersion: meta.piVersion,
    pisyncVersion: PISYNC_VERSION,
    compression: meta.compression,
    entries: withSizes,
    totals: { files: 0, bytes: 0 },
  };
}

export function validateManifest(raw: unknown): {
  ok: boolean;
  errors: string[];
  manifest?: BundleManifest;
} {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object") {
    return { ok: false, errors: ["manifest is not an object"] };
  }
  const m = raw as Record<string, unknown>;
  if (m.schema !== SUPPORTED_SCHEMA) errors.push(`unsupported schema: ${String(m.schema)}`);
  if (m.compression !== "zstd" && m.compression !== "gzip") errors.push("missing/invalid compression");
  if (!Array.isArray(m.entries)) errors.push("missing entries array");
  else if (m.entries.some((e) => typeof (e as BundleManifestEntry)?.bundlePath !== "string")) {
    errors.push("malformed entry in entries");
  }
  if (typeof m.createdAt !== "string") errors.push("missing createdAt");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], manifest: m as unknown as BundleManifest };
}
