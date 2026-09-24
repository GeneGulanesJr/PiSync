import { describe, it, expect } from "vitest";
import { parseItemizeLine, parseItemizeStream } from "../src/itemize-parser.js";

describe("itemize-parser", () => {
  it("parses a transfer line", () => {
    const line = ">f+++++++++ skills/a/SKILL.md";
    const r = parseItemizeLine(line);
    expect(r).not.toBeNull();
    expect(r!.direction).toBe(">");
    expect(r!.typeFlag).toBe("f");
    expect(r!.path).toBe("skills/a/SKILL.md");
  });

  it("parses a checksum-triggered line", () => {
    const line = ">fc..t...... skills/a/SKILL.md";
    const r = parseItemizeLine(line);
    expect(r!.attributeFlags).toBe("c..t......");
  });

  it("parses a deletion line", () => {
    const line = "*deleting   skills/old.md";
    const r = parseItemizeLine(line);
    expect(r).not.toBeNull();
    expect(r!.direction).toBe("*");
    expect(r!.path).toBe("skills/old.md");
  });

  it("parses a directory line", () => {
    const line = ".d..t...... skills/b/";
    const r = parseItemizeLine(line);
    expect(r!.typeFlag).toBe("d");
    expect(r!.path).toBe("skills/b/");
  });

  it("returns null for blank lines and rsync progress lines", () => {
    expect(parseItemizeLine("")).toBeNull();
    expect(parseItemizeLine(" ")).toBeNull();
    expect(parseItemizeLine("sending incremental file list")).toBeNull();
    expect(parseItemizeLine("total size is 1234 speedup is 1.23")).toBeNull();
    expect(parseItemizeLine("building file list...")).toBeNull();
  });

  it("parses a multi-line stream and filters noise", () => {
    const input = [
      "sending incremental file list",
      ">f+++++++++ skills/a/SKILL.md",
      "*deleting   skills/old.md",
      "",
      "total size is 1234 speedup is 1.23",
    ].join("\n");
    const events = parseItemizeStream(input);
    expect(events).toHaveLength(2);
    expect(events[0].path).toBe("skills/a/SKILL.md");
    expect(events[1].path).toBe("skills/old.md");
  });
});
