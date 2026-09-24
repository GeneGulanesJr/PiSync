import { describe, it, expect } from "vitest";
import { formatServiceName, parseServiceName, type MdnsService, SERVICE_TYPE, SERVICE_PROTO, SERVICE_PORT } from "../src/mdns.js";

describe("mdns", () => {
  it("formatServiceName produces _type._proto.local", () => {
    expect(formatServiceName()).toBe("_pi-sync._tcp.local");
    expect(formatServiceName("foo", "udp")).toBe("_foo._udp.local");
  });

  it("constants are correct", () => {
    expect(SERVICE_TYPE).toBe("pi-sync");
    expect(SERVICE_PROTO).toBe("tcp");
    expect(SERVICE_PORT).toBe(7333);
  });

  it("parseServiceName extracts TXT records into PeerInfo", () => {
    const txt: Record<string, string> = { id: "abc-123", pi: "1.0", name: "laptop-b" };
    const s: MdnsService = {
      name: "laptop-b",
      host: "192.168.100.42",
      port: 7333,
      txt,
    };
    const parsed = parseServiceName(s);
    expect(parsed.id).toBe("abc-123");
    expect(parsed.piVersion).toBe("1.0");
    expect(parsed.name).toBe("laptop-b");
    expect(parsed.host).toBe("192.168.100.42");
    expect(parsed.port).toBe(7333);
    expect(parsed.lastSeen).toBeGreaterThan(0);
  });

  it("parseServiceName falls back gracefully when TXT records are missing", () => {
    const s: MdnsService = { name: "laptop-c", host: "10.0.0.5", port: 7333, txt: {} };
    const parsed = parseServiceName(s);
    expect(parsed.id).toBe("");
    expect(parsed.name).toBe("laptop-c");
    expect(parsed.piVersion).toBe("unknown");
  });
});