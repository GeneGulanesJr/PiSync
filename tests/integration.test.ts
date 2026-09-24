import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { runSync } from "../src/sync.js";

const HAS_SSH_LOOPBACK = (() => {
  try {
    execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=2", "localhost", "true"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!HAS_SSH_LOOPBACK)("integration", () => {
  beforeAll(() => {
    // Sanity: rsync available
    execFileSync("rsync", ["--version"], { stdio: "ignore" });
  });

  it("runs sync without throwing against localhost", async () => {
    const result = await runSync({
      config: {
        peer: "localhost",
        sshKey: "~/.ssh/id_ed25519",
        sshPort: 22,
        rsyncPort: 22,
        syncPaths: ["default"],
        excludePatterns: [],
      },
      peer: {
        id: "loopback",
        name: "loopback",
        host: "localhost",
        port: 22,
        piVersion: "test",
        lastSeen: 0,
      },
      direction: "push",
    });
    // We don't assert specific counts — sync may transfer 0 files if the
    // ~/.pi/agent/ tree on this box doesn't exist on loopback. We just want
    // to confirm the orchestrator doesn't crash.
    expect(result.error).toBeUndefined();
  }, 60_000);
});
