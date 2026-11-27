import { definePlugin } from "nitro";

type ScheduledController = {
  cron?: string;
  scheduledTime?: number;
};

type ScheduledContext = {
  controller?: ScheduledController;
  env?: Record<string, unknown>;
};

export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("cloudflare:scheduled", async (ctx: ScheduledContext) => {
    const env = ctx?.env ?? {};
    (globalThis as { __env__?: unknown }).__env__ = env;

    const secret =
      (typeof env["CRON_SECRET"] === "string" ? env["CRON_SECRET"].trim() : "") ||
      (typeof process !== "undefined" ? process.env["CRON_SECRET"]?.trim() ?? "" : "");

    if (!secret) {
      console.warn("[cloudflare:scheduled] CRON_SECRET missing; skipping cron execution");
      return;
    }

    const rawPublicUrl =
      (typeof env["APP_PUBLIC_URL"] === "string" ? env["APP_PUBLIC_URL"].trim() : "") ||
      (typeof process !== "undefined" ? process.env["APP_PUBLIC_URL"]?.trim() ?? "" : "");
    const baseUrl = rawPublicUrl.startsWith("http") ? rawPublicUrl : "https://pokeplace.internal";

    const runEndpoint = async (path: string) => {
      const req = new Request(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "x-cron-secret": secret,
        },
      });
      (req as Request & { runtime?: unknown }).runtime = {
        name: "cloudflare",
        cloudflare: { env },
      };
      const res = await nitroApp.fetch(req);
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(`[cloudflare:scheduled] ${path} failed (${res.status}): ${detail}`);
      } else {
        console.log(`[cloudflare:scheduled] ${path} -> ${res.status}`);
      }
    };

    const cron = ctx?.controller?.cron?.trim() ?? "";
    if (cron === "*/30 * * * *") {
      await runEndpoint("/api/cron/sync-prices?limit=10");
    } else if (cron === "0 * * * *") {
      await runEndpoint("/api/cron/orders-maintenance");
    } else {
      await runEndpoint("/api/cron/sync-prices?limit=10");
      await runEndpoint("/api/cron/orders-maintenance");
    }
  });
});
