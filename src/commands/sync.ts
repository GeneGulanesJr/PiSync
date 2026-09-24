import { syncPush } from "./sync-push.js";
import { syncPull } from "./sync-pull.js";
import type { PiSyncConfig, PeerInfo } from "../types.js";

export interface FullSyncResult {
  push: { transferred: number; conflicts: string[]; bytes: number; error?: string };
  pull: { transferred: number; conflicts: string[]; bytes: number; error?: string };
}

export async function fullSync(
  config: PiSyncConfig,
  peer: PeerInfo,
  onProgress?: (msg: string) => void,
): Promise<FullSyncResult> {
  const note = (m: string) => onProgress?.(m);
  note("push: local → remote");
  const push = await syncPush(config, peer, onProgress);
  note("pull: remote → local");
  const pull = await syncPull(config, peer, onProgress);
  return { push, pull };
}