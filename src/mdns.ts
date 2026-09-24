import Bonjour from "bonjour-service";
import type { PeerInfo } from "./types.js";

export type MdnsService = {
  name: string;
  host: string;
  port: number;
  txt: Record<string, string>;
};

export const SERVICE_TYPE = "pi-sync";
export const SERVICE_PROTO = "tcp";
export const SERVICE_PORT = 7333;

export function formatServiceName(type: string = SERVICE_TYPE, proto: string = SERVICE_PROTO): string {
  return `_${type}._${proto}.local`;
}

/** Convert raw bonjour-service browse result into our PeerInfo shape. */
export function parseServiceName(s: MdnsService): PeerInfo {
  return {
    id: s.txt["id"] ?? "",
    name: s.txt["name"] ?? s.name,
    host: s.host,
    port: s.port,
    piVersion: s.txt["pi"] ?? "unknown",
    lastSeen: Date.now(),
  };
}

export interface Advertiser {
  stop(): void;
}

export function advertise(opts: { id: string; name: string; piVersion: string; port?: number }): Advertiser {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: opts.name,
    type: SERVICE_TYPE,
    protocol: SERVICE_PROTO,
    port: opts.port ?? SERVICE_PORT,
    txt: { id: opts.id, name: opts.name, pi: opts.piVersion },
  });
  return {
    stop() {
      try { service.stop(); } catch { /* ignore */ }
      try { bonjour.unpublishAll(); } catch { /* ignore */ }
      try { bonjour.destroy(); } catch { /* ignore */ }
    },
  };
}

/** Browse for peers. Resolves with whatever is found within `timeoutMs`. */
export function findPeers(timeoutMs: number = 5000): Promise<PeerInfo[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const found: PeerInfo[] = [];
    const browser = bonjour.find({ type: SERVICE_TYPE, protocol: SERVICE_PROTO });
    browser.on("up", (svc: unknown) => {
      const s = svc as MdnsService;
      const info = parseServiceName(s);
      if (info.id) found.push(info);
    });
    setTimeout(() => {
      try { browser.stop(); } catch { /* ignore */ }
      try { bonjour.destroy(); } catch { /* ignore */ }
      resolve(found);
    }, timeoutMs);
  });
}