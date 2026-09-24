export interface SshOpts {
  host: string;
  keyPath: string;
  port: number;
  connectTimeout?: number;
  command?: string;
  /**
   * When true, omit `opts.host` from the returned argv. Used when building
   * the `-e` value for rsync — rsync appends the host itself from the
   * destination argument, so including it here would duplicate the host
   * and the remote shell would try to execute the bare hostname.
   */
  skipHost?: boolean;
}

export function buildSshArgs(opts: SshOpts): string[] {
  const args: string[] = [];
  if (opts.port !== 22) args.push("-p", String(opts.port));
  args.push("-i", opts.keyPath);
  args.push("-o", "BatchMode=yes");
  args.push("-o", `ConnectTimeout=${opts.connectTimeout ?? 5}`);
  args.push("-o", "StrictHostKeyChecking=accept-new");
  if (!opts.skipHost) args.push(opts.host);
  if (opts.command !== undefined) args.push(opts.command);
  return args;
}

export function generateKeyArgs(keyPath: string, type: "ed25519" | "rsa" = "ed25519"): string[] {
  return ["-t", type, "-f", keyPath, "-N", "", "-q"];
}

export function sshCopyIdArgs(pubKeyPath: string, host: string): string[] {
  return ["-i", pubKeyPath, host];
}
