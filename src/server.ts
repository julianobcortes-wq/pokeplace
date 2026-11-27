import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { publicSupabaseConfigMissing } from "./lib/config-guard";
import {
  extractClientIp,
  hydrateEnvFromBindings,
  publicApiRateLimiter,
  sensitiveEndpointRateLimiter,
  withSecurityHeaders,
} from "./lib/rate-limit";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const reqRuntimeEnv = (
        request as Request & { runtime?: { cloudflare?: { env?: unknown } } }
      ).runtime?.cloudflare?.env;
      const globalEnv = (globalThis as { __env__?: unknown }).__env__;
      hydrateEnvFromBindings(env ?? reqRuntimeEnv ?? globalEnv);
      const url = new URL(request.url);
      const ip = extractClientIp(request);

      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_serverFn/")) {
        const limiter =
          url.pathname.startsWith("/api/cron/") || url.pathname === "/api/mercadopago/webhook"
            ? sensitiveEndpointRateLimiter
            : publicApiRateLimiter;
        const decision = limiter.check(`${ip}:${url.pathname.startsWith("/api/cron/") ? "cron" : "api"}`);
        if (!decision.allowed) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: "rate_limited" }), {
              status: 429,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "retry-after": String(decision.retryAfterSec),
                "cache-control": "no-store",
              },
            }),
          );
        }
      }

      if (url.pathname === "/api/health" && request.method === "GET") {
        const { verifyCronBearer } = await import("./lib/ops/sync-runner");
        const auth = verifyCronBearer(request);
        if (!auth.ok) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
            }),
          );
        }
        const { getLaunchReadiness } = await import("./lib/ops/readiness");
        const report = await getLaunchReadiness();
        return withSecurityHeaders(
          new Response(JSON.stringify({ ok: true, ready: report.ready }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          }),
        );
      }
      if (url.pathname === "/api/cron/sync-prices" && request.method === "POST") {
        const { syncPricesBatch, verifyCronBearer, SyncBusyError } = await import("./lib/ops/sync-runner");
        const auth = verifyCronBearer(request);
        if (!auth.ok) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: auth.status === 503 ? "cron not configured" : "unauthorized" }), {
              status: auth.status,
              headers: { "content-type": "application/json; charset=utf-8" },
            }),
          );
        }
        const limit = Number(url.searchParams.get("limit") ?? "10");
        let result: Awaited<ReturnType<typeof syncPricesBatch>>;
        try {
          result = await syncPricesBatch(Number.isFinite(limit) ? limit : 10);
        } catch (error) {
          if (error instanceof SyncBusyError) {
            return withSecurityHeaders(
              new Response(JSON.stringify({ error: "busy" }), {
                status: 429,
                headers: { "content-type": "application/json; charset=utf-8", "retry-after": "60" },
              }),
            );
          }
          throw error;
        }
        return withSecurityHeaders(
          new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          }),
        );
      }
      if (url.pathname === "/api/cron/orders-maintenance" && request.method === "POST") {
        const { verifyCronBearer } = await import("./lib/ops/sync-runner");
        const auth = verifyCronBearer(request);
        if (!auth.ok) {
          return withSecurityHeaders(
            new Response(JSON.stringify({ error: auth.status === 503 ? "cron not configured" : "unauthorized" }), {
              status: auth.status,
              headers: { "content-type": "application/json; charset=utf-8" },
            }),
          );
        }
        const { runOrdersMaintenance } = await import("./lib/ops/orders-cron");
        const result = await runOrdersMaintenance();
        return withSecurityHeaders(
          new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          }),
        );
      }
      if (url.pathname === "/api/mercadopago/webhook" && request.method === "POST") {
        const { handleMercadoPagoWebhook } = await import("./lib/payments/webhook");
        return withSecurityHeaders(await handleMercadoPagoWebhook(request));
      }
      if (process.env["NODE_ENV"] === "production" && publicSupabaseConfigMissing()) {
        return withSecurityHeaders(
          new Response("Serviço temporariamente indisponível.", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          }),
        );
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
