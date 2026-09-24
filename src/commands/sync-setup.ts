import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { readFile, appendFile, writeFile } from "node:fs/promises";
import { saveConfig, defaultConfigPath } from "../config.js";
import { generateKeyArgs, buildSshArgs } from "../ssh.js";
import type { PiSyncConfig } from "../types.js";

const execFileP = promisify(execFile);

/**
 * Fetch the remote host's public key and append it to known_hosts.
 * This prevents the "authenticity can't be established" prompt that ssh
 * would otherwise emit (and which can't be answered when running from
 * inside pi's TUI, since there's no real PTY).
 */
async function preTrustHost(remoteHost: string): Promise<void> {
  const hostnameOnly = remoteHost.replace(/^.*@/, "");
  try {
    const { stdout } = await execFileP("ssh-keyscan", [
      "-T", "5",
      "-t", "ed25519,rsa,ecdsa",
      hostnameOnly,
    ]);
    if (stdout.trim()) {
      await appendFile(join(homedir(), ".ssh", "known_hosts"), stdout, { mode: 0o600 });
    }
  } catch {
    // ssh-keyscan failed (host unreachable, sshd not running, etc.) —
    // let the subsequent ssh-copy-id surface the real error.
  }
}

export async function setupPeer(remoteHost: string): Promise<{ pubkey: string; config: PiSyncConfig }> {
  const keyPath = resolve(homedir(), ".ssh", "pi-sync-ed25519");
  const pubPath = keyPath + ".pub";

  // 1. Generate key if missing
  if (!existsSync(keyPath)) {
    await execFileP("ssh-keygen", generateKeyArgs(keyPath));
  }

  // 2. Pre-trust the host key so ssh-copy-id doesn't prompt
  await preTrustHost(remoteHost);

  // 3. Try ssh-copy-id (uses password auth for one-time install).
  //    Pass StrictHostKeyChecking=accept-new as a belt-and-suspenders fallback.
  try {
    await execFileP("ssh-copy-id", [
      "-o", "StrictHostKeyChecking=accept-new",
      "-i", pubPath,
      remoteHost,
    ]);
  } catch (err) {
    // ssh-copy-id likely failed because the Mac has PasswordAuthentication=no
    // (default on modern macOS) or sshd isn't running. Write the pubkey to a
    // file and surface a single-line error — multi-line notify() messages
    // get mangled into escape codes by pi's TUI renderer.
    const pubkeyPath = "/tmp/pi-sync-pubkey.txt";
    await writeFile(pubkeyPath, await readPubKey(pubPath), { mode: 0o600 });
    const hint = (err as Error).message?.includes("Connection refused")
      ? `sshd doesn't appear to be running on ${remoteHost}. Enable it with: sudo systemsetup -setremotelogin on`
      : `Append the contents of ${pubkeyPath} to ${remoteHost}:~/.ssh/authorized_keys, then re-run /sync-setup`;
    throw new Error(`ssh-copy-id failed. ${hint}`);
  }

  // 4. Verify
  await execFileP("ssh", buildSshArgs({ host: remoteHost, keyPath, port: 22, command: "true" }));

  // 5. Persist config
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