import { describe, it, expect } from "vitest";
import { buildSshArgs, generateKeyArgs, sshCopyIdArgs } from "../src/ssh.js";

describe("ssh", () => {
  it("buildSshArgs adds BatchMode and key", () => {
    const args = buildSshArgs({ host: "user@b.local", keyPath: "/tmp/id_ed25519", port: 22 });
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/id_ed25519");
    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("ConnectTimeout=5");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).not.toContain("-p");
    expect(args[args.length - 1]).toBe("user@b.local");
  });

  it("buildSshArgs includes -p when port != 22", () => {
    const args = buildSshArgs({ host: "host", keyPath: "/k", port: 2222 });
    expect(args).toContain("-p");
    expect(args).toContain("2222");
  });

  it("buildSshArgs appends command when provided", () => {
    const args = buildSshArgs({ host: "h", keyPath: "/k", port: 22, command: "echo hi" });
    expect(args[args.length - 2]).toBe("h");
    expect(args[args.length - 1]).toBe("echo hi");
  });

  it("buildSshArgs respects custom connectTimeout", () => {
    const args = buildSshArgs({ host: "h", keyPath: "/k", port: 22, connectTimeout: 30 });
    expect(args).toContain("ConnectTimeout=30");
  });

  it("generateKeyArgs is ssh-keygen flags", () => {
    const args = generateKeyArgs("/tmp/pi-sync-id", "ed25519");
    expect(args[0]).toBe("-t");
    expect(args[1]).toBe("ed25519");
    expect(args[2]).toBe("-f");
    expect(args[3]).toBe("/tmp/pi-sync-id");
    expect(args[4]).toBe("-N");
    expect(args[5]).toBe("");
    expect(args).toContain("-q");
  });

  it("generateKeyArgs defaults to ed25519", () => {
    const args = generateKeyArgs("/tmp/pi-sync-id");
    expect(args[1]).toBe("ed25519");
  });

  it("sshCopyIdArgs targets the right host", () => {
    const args = sshCopyIdArgs("/tmp/key.pub", "user@host");
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/tmp/key.pub");
    expect(args[2]).toBe("user@host");
  });
});
