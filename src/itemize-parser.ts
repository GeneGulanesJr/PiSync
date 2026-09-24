import type { RsyncItem, RsyncDirFlag } from "./types.js";

// rsync itemize format: "<dir><type><attrs> <size-or-mode> <date-or-empty> <path>"
// example: ">f+++++++++ skills/a/SKILL.md"
// example: "*deleting   skills/old.md"
// example: ".d..t...... skills/b/"
// example: ">fc..t...... skills/a/SKILL.md"
const LINE_RE = /^([><*+.cdlps])(\S+)\s+(.+)$/;

export function parseItemizeLine(line: string): RsyncItem | null {
  if (!line || line.startsWith(" ")) return null;
  if (
    line.startsWith("sending ") ||
    line.startsWith("total ") ||
    line.startsWith("building ")
  ) {
    return null;
  }
  // Delete lines: "*deleting   path" — typeFlag = "deleting", path after spaces
  if (line.startsWith("*")) {
    const m = /^\*\s*\S+\s+(.+)$/.exec(line);
    if (!m) return null;
    return {
      direction: "*",
      typeFlag: "deleting",
      attributeFlags: "",
      sizeOrMode: "",
      path: m[1].trim(),
    };
  }
  const m = LINE_RE.exec(line);
  if (!m) return null;
  return {
    direction: m[1] as RsyncDirFlag,
    typeFlag: m[2][0],
    attributeFlags: m[2].slice(1),
    sizeOrMode: "",
    path: m[3].trim(),
  };
}

export function parseItemizeStream(input: string): RsyncItem[] {
  return input
    .split("\n")
    .map(parseItemizeLine)
    .filter((x): x is RsyncItem => x !== null);
}
