export interface PiSyncConfig {
  peer: string;
  sshKey: string;
  sshPort: number;
  rsyncPort: number;
  syncPaths: string[];
  excludePatterns: string[];
}

export interface PeerInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  piVersion: string;
  lastSeen: number; // ms epoch
}

export interface Baseline {
  peerId: string;
  lastSyncMs: number;
  // map from relative path to mtime_ms of the version that was synced
  mtimes: Record<string, number>;
}

export type SyncDirection = "push" | "pull";

export interface SyncEvent {
  ts: string; // ISO
  peer: string; // peer id
  direction: SyncDirection;
  action: "transfer" | "conflict" | "skip" | "error" | "snapshot" | "rename";
  path: string;
  detail?: Record<string, unknown>;
}

export interface LockHandle {
  pid: number;
  acquiredAt: number;
}

export interface RsyncItem {
  direction: RsyncDirFlag;
  typeFlag: string;       // e.g. "f" for file, "d" for dir
  attributeFlags: string; // e.g. ".c..t......"
  sizeOrMode: string;
  path: string;
}

export type RsyncDirFlag = ">" | "<" | "*" | "+" | ".";