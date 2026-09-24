export interface BundleResult {
  path: string;
  bytes: number;
  hadMemoryDb: boolean;
}

export interface InstallResult {
  restored: string[];
  backedUpTo?: string;
}
