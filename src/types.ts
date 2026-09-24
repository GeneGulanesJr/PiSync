export interface BundleSpecEntry {
  source: string;      // ~-form source path on this machine
  bundlePath: string;  // path inside the bundle root
  dest: string;        // ~-form destination on the target machine
  kind: "dir" | "file";
  sqlite?: boolean;    // memory DB: snapshot on extract, atomic swap on import
  skipFlag?: "no-memory" | "no-auth" | "no-agents-skills"; // extract flag that omits this entry
}

export interface BundleManifestEntry {
  bundlePath: string;
  dest: string;
  kind: "dir" | "file";
  files: number;
  bytes: number;
  sqlite?: boolean;
}

export interface BundleManifest {
  schema: 1;
  createdAt: string; // ISO
  hostname: string;
  piVersion: string;
  pisyncVersion: string;
  compression: "zstd" | "gzip";
  entries: BundleManifestEntry[];
  totals: { files: number; bytes: number };
}

export interface ExtractOptions {
  outDir?: string;  // default ~/Downloads; ~-form ok
  home?: string;    // defaults to os.homedir(); test sandbox support
  noMemory?: boolean;
  noAuth?: boolean;
  noAgentsSkills?: boolean;
}

export interface ExtractResult {
  archivePath: string;
  compression: "zstd" | "gzip";
  bytes: number;        // compressed archive size
  durationMs: number;
  entries: BundleManifestEntry[];
}

export interface ImportOptions {
  home?: string; // defaults to os.homedir(); test sandbox support
}

export interface ImportResult {
  restored: string[];   // absolute dest paths written
  skipped: string[];    // bundle entries absent from the archive
  backupDir: string | null;
  durationMs: number;
}

export interface OperationEvent {
  ts: string;                          // ISO
  op: "extract" | "import";
  status: "start" | "done" | "error";
  detail?: Record<string, unknown>;
}
