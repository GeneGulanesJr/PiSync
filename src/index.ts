import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pisync", {
    description: "Extract pi state to a portable archive / import on another PC",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-sync v2: not wired up yet.", "info");
    },
  });
}
