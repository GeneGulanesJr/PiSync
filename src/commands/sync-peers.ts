import { findPeers } from "../mdns.js";
import { loadConfig } from "../config.js";
import type { PeerInfo } from "../types.js";

export interface PeersResult {
  peers: PeerInfo[];
  hint?: string;
}

export async function listPeers(timeoutMs = 5000): Promise<PeersResult> {
  const peers = await findPeers(timeoutMs);
  const hint = peers.length === 0
    ? "no peers found — if both laptops are on guest WiFi, AP isolation may block mDNS. Check connectivity or configure peer manually via /sync-setup."
    : undefined;
  // Honor settings.json peer as a fallback even when mDNS finds nothing
  const config = await loadConfig();
  if (config && peers.length === 0) {
    peers.push({
      id: "configured",
      name: "configured peer",
      host: config.peer,
      port: 22,
      piVersion: "unknown",
      lastSeen: 0,
    });
  }
  return { peers, hint };
}
