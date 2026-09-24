import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { readFile } from "node:fs/promises";
import { saveConfig, defaultConfigPath } from "../config.js";
import { generateKeyArgs, sshCopyIdArgs, buildSshArgs } from "../ssh.js";
import type { PiSyncConfig } from "../types.js";

const execFileP = promisify(execFile);

export async function setupPeer(remoteHost: string): Promise<{ pubkey: string; config: PiSyncConfig }> {
  const keyPath = resolve(homedir(), ".ssh", "pi-sync-ed25519");
  const pubPath = keyPath + ".pub";

  // 1. Generate key if missing
  if (!existsSync(keyPath)) {
    await execFileP("ssh-keygen", generateKeyArgs(keyPath));
  }

  // 2. Try ssh-copy-id (uses password auth for one-time install)
  try {
    await execFileP("ssh-copy-id", sshCopyIdArgs(pubPath, remoteHost));
  } catch {
    throw new Error(
      `ssh-copy-id failed. Manually add this public key to ${remoteHost}:~/.ssh/authorized_keys:\n\n${await readPubKey(pubPath)}\n\nThen re-run /sync-setup.`,
    );
  }

  // 3. Verify
  await execFileP("ssh", buildSshArgs({ host: remoteHost, keyPath, port: 22, command: "true" }));

  // 4. Persist config
  const cfg: PiSyncConfig = {
    peer: remoteHost,
    sshKey: "~/.ssh/pi-sync-ed25519",
    sshPort: 22,
    rsyncPort: 22,
    syncPaths: ["default"],
    excludePatterns: [],
  };
  await saveConfig(defaultConfigPath(), cfg);

  return { pubkey: await readPubKey(pubPath), config: cfg };
}

async function readPubKey(p: string): Promise<string> {
  return (await readFile(p, "utf8")).trim();
}