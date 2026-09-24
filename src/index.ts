import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { loadConfig } from "./config.js";
import { advertise } from "./mdns.js";
import { fullSync } from "./commands/sync.js";
import { syncPush } from "./commands/sync-push.js";
import { syncPull } from "./commands/sync-pull.js";
import { listPeers } from "./commands/sync-peers.js";
import { setupPeer } from "./commands/sync-setup.js";
import { statusSummary } from "./commands/sync-status.js";
import type { PeerInfo } from "./types.js";

const MY_ID = randomUUID();
const MY_NAME = hostname();

export default function (pi: ExtensionAPI) {
  // Advertiser is created lazily on session_start and torn down on session_shutdown.
  // session_shutdown is registered at factory scope so it always fires.
  let currentAdv: ReturnType<typeof advertise> | null = null;

  pi.on("session_start", async (_event, ctx) => {
    currentAdv = advertise({
      id: MY_ID,
      name: MY_NAME,
      piVersion: "0.1.0",
      port: 7333,
    });
    ctx.ui.setStatus("pi-sync", "advertising");
  });

  pi.on("session_shutdown", async () => {
    currentAdv?.stop();
    currentAdv = null;
  });

  // Resolve peer: arg → configured peer (with mDNS enrichment)
  async function resolvePeer(arg: string | undefined): Promise<PeerInfo | null> {
    if (arg) {
      const [host, port] = arg.split(":");
      return { id: "manual", name: arg, host, port: Number(port ?? 22), piVersion: "unknown", lastSeen: 0 };
    }
    const config = await loadConfig();
    if (!config) return null;
    const { peers } = await listPeers(3000);
    const match = peers.find((p) => p.host === config.peer || p.name === config.peer);
    return match ?? {
      id: "configured",
      name: config.peer,
      host: config.peer,
      port: config.sshPort,
      piVersion: "unknown",
      lastSeen: 0,
    };
  }

  pi.registerCommand("sync", {
    description: "Bidirectional sync with peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      if (!config) {
        ctx.ui.notify("Run /sync-setup <remote-host> first.", "error");
        return;
      }
      const peer = await resolvePeer(args);
      if (!peer) {
        ctx.ui.notify("Could not resolve peer.", "error");
        return;
      }
      ctx.ui.setStatus("pi-sync", `syncing with ${peer.name}…`);
      const result = await fullSync(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.setStatus("pi-sync", "idle");
      const totalConflicts = result.push.conflicts.length + result.pull.conflicts.length;
      const totalTransferred = result.push.transferred + result.pull.transferred;
      if (totalConflicts > 0) {
        ctx.ui.notify(`Synced ${totalTransferred} files. ${totalConflicts} conflict(s).`, "warning");
      } else if (result.push.error || result.pull.error) {
        ctx.ui.notify(`Sync failed: ${result.push.error ?? result.pull.error}`, "error");
      } else {
        ctx.ui.notify(`Synced ${totalTransferred} files with ${peer.name}.`, "info");
      }
    },
  });

  pi.registerCommand("sync-push", {
    description: "One-way push to peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      const peer = await resolvePeer(args);
      if (!config || !peer) return ctx.ui.notify("config or peer missing", "error");
      const r = await syncPush(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.notify(`Pushed ${r.transferred} files.`, r.error ? "error" : "info");
    },
  });

  pi.registerCommand("sync-pull", {
    description: "One-way pull from peer",
    handler: async (args, ctx) => {
      const config = await loadConfig();
      const peer = await resolvePeer(args);
      if (!config || !peer) return ctx.ui.notify("config or peer missing", "error");
      const r = await syncPull(config, peer, (m) => ctx.ui.setStatus("pi-sync", m));
      ctx.ui.notify(`Pulled ${r.transferred} files.`, r.error ? "error" : "info");
    },
  });

  pi.registerCommand("sync-peers", {
    description: "List discovered peers",
    handler: async (_args, ctx) => {
      const { peers, hint } = await listPeers();
      if (peers.length === 0) {
        ctx.ui.notify(hint ?? "no peers found", "info");
      } else {
        const lines = peers.map((p) => `• ${p.name} (${p.host}:${p.port}) — pi ${p.piVersion}`);
        ctx.ui.notify(`Peers:\n${lines.join("\n")}${hint ? "\n\n" + hint : ""}`, "info");
      }
    },
  });

  pi.registerCommand("sync-setup", {
    description: "One-time setup against a remote host",
    handler: async (args, ctx) => {
      const host = args?.trim();
      if (!host) return ctx.ui.notify("Usage: /sync-setup <remote-host>", "error");
      try {
        await setupPeer(host);
        ctx.ui.notify(`Setup complete. Peer ${host} configured. Run /sync to start.`, "info");
      } catch (err) {
        ctx.ui.notify(`Setup failed: ${err instanceof Error ? err.message : err}`, "error");
      }
    },
  });

  pi.registerCommand("sync-status", {
    description: "Last sync info, conflicts, errors",
    handler: async (_args, ctx) => {
      const s = await statusSummary();
      const lastSync = s.lastSyncMs ? new Date(s.lastSyncMs).toISOString() : "never";
      ctx.ui.notify(
        `Last sync: ${lastSync}\nTransfers: ${s.totalEvents}\nConflicts: ${s.totalConflicts}\nErrors: ${s.totalErrors}`,
        "info",
      );
    },
  });
}