import { resolve } from "node:path";
import { install } from "../bundle.js";
import type { InstallResult } from "../types.js";

export async function runInstall(bundlePath?: string): Promise<InstallResult> {
  const path = bundlePath ? resolve(bundlePath) : undefined;
  return install(path);
}
