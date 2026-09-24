import { resolve } from "node:path";
import { extract } from "../bundle.js";
import type { BundleResult } from "../types.js";

export async function runExtract(outPath?: string): Promise<BundleResult> {
  const path = outPath ? resolve(outPath) : undefined;
  return extract(path);
}
