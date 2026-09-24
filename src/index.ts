import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defaultHome, expandTildeWith } from "./paths.js";
import { runExtract, cacheDir } from "./bundle.js";
import { runImport } from "./restore.js";
import { readLog } from "./log.js";

const HELP = `pi-sync v2 — portable pi state
/pisync extract [dir] [--no-memory] [--no-auth] [--no-agents-skills]
    Bundle settings, skills, extensions, git package store and LaPis memory DB
    into ~/Downloads/pisync-<date>.tar.zst (or .tar.gz if zstd missing).
/pisync import <archive>
    Restore a bundle on this machine (backs up current state first).
/pisync
    This help + last operation.`;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pisync", {
    description: "Extract pi state to a portable archive / import on another PC",
    handler: async (args, ctx) => {
      const [sub, ...rest] = (args ?? "").trim().split(/\s+/).filter(Boolean);

      if (!sub || sub === "help") {
        const events = await readLog(cacheDir(defaultHome()));
        const last = events.at(-1);
        const lastLine = last
          ? `Last operation: ${last.op} ${last.status} at ${last.ts}`
          : "No operations yet.";
        ctx.ui.notify(`${HELP}\n\n${lastLine}`, "info");
        return;
      }

      if (sub === "extract") {
        const flags = rest.filter((a) => a.startsWith("--"));
        const positional = rest.filter((a) => !a.startsWith("--"));
        ctx.ui.setStatus("pi-sync", "extracting…");
        try {
          const r = await runExtract({
            outDir: positional[0],
            noMemory: flags.includes("--no-memory"),
            noAuth: flags.includes("--no-auth"),
            noAgentsSkills: flags.includes("--no-agents-skills"),
          });
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(
            `Bundle ready: ${r.archivePath}\n${(r.bytes / 1e6).toFixed(0)} MB in ${(r.durationMs / 1000).toFixed(1)}s (${r.compression}, ${r.entries.length} entries). Copy it to the other PC, then run /pisync import there.`,
            "info",
          );
        } catch (err) {
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(`Extract failed: ${err instanceof Error ? err.message : err}`, "error");
        }
        return;
      }

      if (sub === "import") {
        const archive = rest[0];
        if (!archive) {
          ctx.ui.notify("Usage: /pisync import <path-to-archive>", "error");
          return;
        }
        ctx.ui.setStatus("pi-sync", "importing…");
        try {
          const r = await runImport(expandTildeWith(archive, defaultHome()));
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(
            `Imported ${r.restored.length} entries (skipped ${r.skipped.length}).\nPre-import backup: ${r.backupDir}\nRestart pi to load everything.`,
            "info",
          );
        } catch (err) {
          ctx.ui.setStatus("pi-sync", "idle");
          ctx.ui.notify(`Import failed: ${err instanceof Error ? err.message : err}`, "error");
        }
        return;
      }

      ctx.ui.notify(`Unknown subcommand "${sub}".\n\n${HELP}`, "error");
    },
  });
}
