import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runExtract } from "./commands/extract.js";
import { runInstall } from "./commands/install.js";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("extract", {
    description: "Pack ~/.pi/ into a tar.gz (cwd default, or <path>)",
    handler: async (args, ctx) => {
      const target = args?.trim() || undefined;
      try {
        const r = await runExtract(target);
        const kb = Math.round(r.bytes / 1024);
        ctx.ui.notify(
          `Extracted ${r.path} (${kb} KB${r.hadMemoryDb ? ", memory.db included" : ""})`,
          "info",
        );
      } catch (err) {
        ctx.ui.notify(`Extract failed: ${err instanceof Error ? err.message : err}`, "error");
      }
    },
  });

  pi.registerCommand("install", {
    description: "Restore ~/.pi/ from a tar.gz (cwd default, or <path>)",
    handler: async (args, ctx) => {
      const target = args?.trim() || undefined;
      try {
        const r = await runInstall(target);
        const parts = r.restored.length ? r.restored.join(", ") : "nothing";
        const backup = r.backedUpTo ? `\nBackup: ${r.backedUpTo}` : "";
        ctx.ui.notify(`Installed: ${parts}${backup}`, "info");
      } catch (err) {
        ctx.ui.notify(`Install failed: ${err instanceof Error ? err.message : err}`, "error");
      }
    },
  });
}
