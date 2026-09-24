export interface SshOpts {
  host: string;
  keyPath: string;
  port: number;
  connectTimeout?: number;
  command?: string;
}

export function buildSshArgs(opts: SshOpts): string[] {
  const args: string[] = [];
  if (opts.port !== 22) args.push("-p", String(opts.port));
  args.push("-i", opts.keyPath);
  args.push("-o", "BatchMode=yes");
  args.push("-o", `ConnectTimeout=${opts.connectTimeout ?? 5}`);
  args.push("-o", "StrictHostKeyChecking=accept-new");
  args.push(opts.host);
  if (opts.command !== undefined) args.push(opts.command);
  return args;
}

export function generateKeyArgs(keyPath: string, type: "ed25519" | "rsa" = "ed25519"): string[] {
  return ["-t", type, "-f", keyPath, "-N", "", "-q"];
}

export function sshCopyIdArgs(pubKeyPath: string, host: string): string[] {
  return ["-i", pubKeyPath, host];
}
