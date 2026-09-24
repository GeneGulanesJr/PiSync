import { runSync, type SyncResult } from "../sync.js";
import type { PiSyncConfig, PeerInfo } from "../types.js";

export async function syncPull(
  config: PiSyncConfig,
  peer: PeerInfo,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  return runSync({ config, peer, direction: "pull", onProgress });
}