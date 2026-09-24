import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, saveConfig, defaultConfigPath, type PiSyncConfig } from "../src/config.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "pi-sync-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("config", () => {
  it("returns null when file does not exist", async () => {
    const result = await loadConfig(join(tmp, "missing.json"));
    expect(result).toBeNull();
  });

  it("round-trips a config object", async () => {
    const path = join(tmp, "config.json");
    const cfg: PiSyncConfig = {
      peer: "laptop-b.local",
      sshKey: "~/.ssh/pi-sync-ed25519",
      sshPort: 22,
      rsyncPort: 22,
      syncPaths: ["default"],
      excludePatterns: [],
    };
    await saveConfig(path, cfg);
    const loaded = await loadConfig(path);
    expect(loaded).toEqual(cfg);
  });

  it("rejects config missing required fields", async () => {
    const path = join(tmp, "bad.json");
    await writeFile(path, JSON.stringify({ peer: "x" }));
    await expect(loadConfig(path)).rejects.toThrow(/sshKey/);
  });

  it("defaultConfigPath points to ~/.pi/agent/pi-sync.json", () => {
    expect(defaultConfigPath()).toMatch(/\.pi\/agent\/pi-sync\.json$/);
  });
});