import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

describe("SQL migrations & RLS security invariants", () => {
  const sql = readFileSync(join(ROOT, "scripts/sql/all-migrations.sql"), "utf8");

  it("enables Row Level Security on every new marketplace table", () => {
    const tables = [
      "store_coupons",
      "store_volume_discounts",
      "listing_offers",
      "payment_webhook_events",
      "payment_refunds",
      "seller_strike_appeals",
      "price_alerts",
    ];
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`));
    }
  });

  it("restricts service-only RPCs to service_role and revokes PUBLIC/anon/authenticated", () => {
    const serviceOnlyFns = [
      "record_payment_refund",
      "reconcile_payment_status",
      "list_orders_needing_delivery_warning",
      "evaluate_price_alerts",
    ];
    for (const fn of serviceOnlyFns) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC`),
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`),
      );
    }
  });

  it("protects admin RPCs with has_role(..., 'admin') check", () => {
    expect(sql).toContain("public.admin_review_strike_appeal");
    expect(sql).toMatch(
      /admin_review_strike_appeal[\s\S]{0,600}has_role\(auth\.uid\(\), 'admin'\)/,
    );
  });

  it("keeps public collection opt-in LGPD-safe (never selects purchase_price or emails)", () => {
    const match = sql.match(
      /CREATE OR REPLACE FUNCTION public\.get_public_collection[\s\S]*?GRANT EXECUTE ON FUNCTION public\.get_public_collection/,
    );
    expect(match).not.toBeNull();
    const fnBody = match?.[0] ?? "";
    expect(fnBody).toContain("collection_public_opt_in = true");
    expect(fnBody).not.toContain("purchase_price");
    expect(fnBody).not.toContain("email");
    expect(fnBody).toContain("ce.kind = 'owned'");
  });

  it("never inserts approved or paid payment rows directly from place_order_v2", () => {
    const match = sql.match(
      /CREATE OR REPLACE FUNCTION public\.place_order_v2[\s\S]*?GRANT EXECUTE ON FUNCTION public\.place_order_v2/,
    );
    expect(match).not.toBeNull();
    const fnBody = match?.[0] ?? "";
    expect(fnBody).not.toMatch(/'paid'/);
    expect(fnBody).toContain(
      "INSERT INTO public.payments (order_id, provider, environment, amount, currency)",
    );
  });
});

describe("public asset & secret hygiene", () => {
  it("contains zero .sql or .env files under public/", () => {
    const pubFiles = listFilesRecursive(join(ROOT, "public"));
    for (const f of pubFiles) {
      expect(f).not.toMatch(/\.(sql|env|pem|key)$/i);
    }
  });

  it("never imports supabaseAdmin or reads server secrets in client routes/components", () => {
    const clientDirs = [join(ROOT, "src/components"), join(ROOT, "src/routes")];
    for (const dir of clientDirs) {
      for (const f of listFilesRecursive(dir)) {
        if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
        const src = readFileSync(f, "utf8");
        expect(src, `Client file ${f} must not import client.server`).not.toContain(
          "client.server",
        );
        expect(src, `Client file ${f} must not read SUPABASE_SERVICE_ROLE_KEY`).not.toMatch(
          /process\.env\[?['"]?SUPABASE_SERVICE_ROLE_KEY/,
        );
        expect(src, `Client file ${f} must not read MP_ACCESS_TOKEN`).not.toMatch(
          /process\.env\[?['"]?MP_ACCESS_TOKEN/,
        );
      }
    }
  });

  it("enforces fail-closed HMAC verification on Mercado Pago webhooks and server security headers", () => {
    const webhookSrc = readFileSync(join(ROOT, "src/lib/payments/webhook.ts"), "utf8");
    expect(webhookSrc).toContain("verifyMercadoPagoWebhook");
    expect(webhookSrc).toContain("payment_webhook_events");

    const mpSrc = readFileSync(join(ROOT, "src/lib/payments/mercadopago.ts"), "utf8");
    expect(mpSrc).toContain("MP_WEBHOOK_SECRET");
    expect(mpSrc).toContain("verifyMercadoPagoWebhook");

    const serverSrc = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(serverSrc).toContain("withSecurityHeaders");
    expect(serverSrc).toContain("publicApiRateLimiter");
    expect(serverSrc).toContain("sensitiveEndpointRateLimiter");
    expect(serverSrc).toContain("/api/cron/orders-maintenance");

    const rlSrc = readFileSync(join(ROOT, "src/lib/rate-limit.ts"), "utf8");
    expect(rlSrc).toContain("x-content-type-options");
    expect(rlSrc).toContain("x-frame-options");
    expect(rlSrc).toContain("referrer-policy");
  });
});
