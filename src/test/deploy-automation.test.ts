import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyAllMigrations,
  buildWorkerSecretsPayload,
  extractDeployedWorkerUrl,
  generateCronSecret,
  mergeRedirectUrls,
  parseSqlMigrationSections,
  pickSupabaseApiKeys,
  resolvePermanentUrl,
  resolveSupabaseProjectRef,
} from "../../scripts/lib/deploy-helpers.mjs";
import { verifyCronBearer } from "@/lib/ops/sync-runner";

const ROOT = process.cwd();

describe("Cloudflare + Wrangler deploy configuration", () => {
  it("declares worker name, workers_dev, nodejs_compat, and native cron triggers in wrangler.jsonc", () => {
    const raw = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
    const cfg = JSON.parse(raw) as {
      name: string;
      compatibility_date: string;
      compatibility_flags: string[];
      workers_dev: boolean;
      triggers: { crons: string[] };
      vars: Record<string, string>;
    };
    expect(cfg.name).toBe("pokeplace");
    expect(cfg.compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cfg.compatibility_flags).toContain("nodejs_compat");
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.triggers.crons).toEqual(["*/30 * * * *", "0 * * * *"]);
    expect(cfg.vars["ALLOW_SANDBOX_PAYMENTS"]).toBe("false");
  });

  it("registers the Nitro cloudflare:scheduled cron plugin", () => {
    const nitroCfg = readFileSync(join(ROOT, "nitro.config.ts"), "utf8");
    expect(nitroCfg).toContain("./server/plugins/cloudflare-cron.ts");

    const pluginSrc = readFileSync(join(ROOT, "server/plugins/cloudflare-cron.ts"), "utf8");
    expect(pluginSrc).toContain("cloudflare:scheduled");
    expect(pluginSrc).toContain("/api/cron/sync-prices");
    expect(pluginSrc).toContain("/api/cron/orders-maintenance");
  });

  it("hydrates Cloudflare bindings from env, request.runtime, or globalThis.__env__", () => {
    const serverSrc = readFileSync(join(ROOT, "src/server.ts"), "utf8");
    expect(serverSrc).toContain("reqRuntimeEnv");
    expect(serverSrc).toContain("globalEnv");
    expect(serverSrc).toContain("hydrateEnvFromBindings");
  });

  it("accepts both Authorization Bearer and x-cron-secret headers in verifyCronBearer", () => {
    const prev = process.env["CRON_SECRET"];
    process.env["CRON_SECRET"] = "test-super-secret-value-123456";
    try {
      const okBearer = verifyCronBearer(
        new Request("https://example.com/api/cron/sync-prices", {
          headers: { authorization: "Bearer test-super-secret-value-123456" },
        }),
      );
      expect(okBearer).toEqual({ ok: true, status: 200 });

      const okHeader = verifyCronBearer(
        new Request("https://example.com/api/cron/sync-prices", {
          headers: { "x-cron-secret": "test-super-secret-value-123456" },
        }),
      );
      expect(okHeader).toEqual({ ok: true, status: 200 });

      const wrong = verifyCronBearer(
        new Request("https://example.com/api/cron/sync-prices", {
          headers: { "x-cron-secret": "wrong-secret" },
        }),
      );
      expect(wrong).toEqual({ ok: false, status: 401 });
    } finally {
      if (prev === undefined) delete process.env["CRON_SECRET"];
      else process.env["CRON_SECRET"] = prev;
    }
  });
});

describe("Supabase & Cloudflare zero-touch deploy helpers", () => {
  it("parses all 20 migration sections from scripts/sql/all-migrations.sql with legacy probes", () => {
    const sql = readFileSync(join(ROOT, "scripts/sql/all-migrations.sql"), "utf8");
    const sections = parseSqlMigrationSections(sql);
    const ids = sections.map((s) => s.id);

    expect(ids[0]).toBe("0000_migration.sql");
    expect(ids).toContain("0013_ml_marketplace_rules_and_rankings.sql");
    expect(ids).toContain("0014_reference_prices_rpc.sql");
    expect(ids).toContain("0015_offers_coupons_promotions_shipping_uf.sql");
    expect(ids).toContain("0016_mp_reconciliation_refunds_cron.sql");
    expect(ids).toContain("0017_disputes_attachments_strike_appeals.sql");
    expect(ids).toContain("0018_portfolio_alerts_public_share.sql");

    // Non-idempotent legacy sections must carry a probe
    const byId = new Map(sections.map((s) => [s.id, s]));
    expect(byId.get("0000_migration.sql")?.legacyProbe).toContain("user_roles");
    expect(byId.get("0009_marketplace_operations.sql")?.legacyProbe).toContain("disputes");
    expect(byId.get("0013_ml_marketplace_rules_and_rankings.sql")?.legacyProbe).toContain("buyer_reviews");
    // New idempotent sections run cleanly without needing a legacy skip probe
    expect(byId.get("0014_reference_prices_rpc.sql")?.legacyProbe).toBeNull();
    expect(byId.get("0018_portfolio_alerts_public_share.sql")?.legacyProbe).toBeNull();
  });

  it("skips already-applied legacy migrations and applies new idempotent ones", async () => {
    const executed: string[] = [];
    const sections = [
      { id: "0000_migration.sql", sql: "CREATE TABLE user_roles ();", legacyProbe: "SELECT true AS applied;" },
      { id: "0018_portfolio.sql", sql: "CREATE TABLE IF NOT EXISTS price_alerts ();", legacyProbe: null },
    ];
    const summary = await applyAllMigrations({
      sections,
      log: () => {},
      execQuery: async (q: string) => {
        executed.push(q);
        if (q.includes("SELECT id FROM public.pokeplace_schema_migrations")) return [];
        if (q.includes("SELECT true AS applied")) return [{ applied: true }];
        return [];
      },
    });
    expect(summary.skippedLegacy).toEqual(["0000_migration.sql"]);
    expect(summary.applied).toEqual(["0018_portfolio.sql"]);
    expect(executed.some((q) => q.includes("CREATE TABLE user_roles"))).toBe(false);
    expect(executed.some((q) => q.includes("CREATE TABLE IF NOT EXISTS price_alerts"))).toBe(true);
  });

  it("resolves Supabase project ref from env, URL, or supabase/config.toml", () => {
    const toml = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
    expect(resolveSupabaseProjectRef({}, toml)).toBe("cduyvlmlvcdpypilkcir");
    expect(resolveSupabaseProjectRef({ SUPABASE_URL: "https://abcdefghijklmno.supabase.co" }, toml)).toBe(
      "abcdefghijklmno",
    );
    expect(resolveSupabaseProjectRef({ SUPABASE_PROJECT_ID: "explicitref123" }, toml)).toBe(
      "explicitref123",
    );
  });

  it("extracts publishable and service_role keys from both legacy and new Supabase API key formats", () => {
    expect(
      pickSupabaseApiKeys([
        { name: "anon", api_key: "eyJ-anon-jwt" },
        { name: "service_role", api_key: "eyJ-service-jwt" },
      ]),
    ).toEqual({
      publishableKey: "eyJ-anon-jwt",
      serviceRoleKey: "eyJ-service-jwt",
    });

    expect(
      pickSupabaseApiKeys([
        { type: "publishable", api_key: "sb_publishable_abc" },
        { type: "secret", api_key: "sb_secret_xyz" },
      ]),
    ).toEqual({
      publishableKey: "sb_publishable_abc",
      serviceRoleKey: "sb_secret_xyz",
    });
  });

  it("merges and deduplicates Supabase Auth redirect URLs cleanly", () => {
    const merged = mergeRedirectUrls(
      "http://localhost:5173, https://pokeplace.example.workers.dev/auth",
      "https://pokeplace.example.workers.dev/",
    );
    const items = merged.split(",");
    expect(items).toContain("http://localhost:5173");
    expect(items).toContain("https://pokeplace.example.workers.dev");
    expect(items).toContain("https://pokeplace.example.workers.dev/**");
    expect(items).toContain("https://pokeplace.example.workers.dev/auth");
    expect(items).toContain("https://pokeplace.example.workers.dev/minha-loja");
    expect(new Set(items).size).toBe(items.length);
  });

  it("auto-generates a 64-hex CRON_SECRET and omits empty secret entries", () => {
    const s = generateCronSecret();
    expect(s).toMatch(/^[a-f0-9]{64}$/);

    const payload = buildWorkerSecretsPayload({
      supabaseUrl: "https://cduyvlmlvcdpypilkcir.supabase.co",
      supabasePublishableKey: "pk-test",
      supabaseServiceRoleKey: "sr-test",
      appPublicUrl: "https://pokeplace.demo.workers.dev",
      env: {},
    });
    expect(payload["CRON_SECRET"]).toMatch(/^[a-f0-9]{64}$/);
    expect(payload["SUPABASE_URL"]).toBe("https://cduyvlmlvcdpypilkcir.supabase.co");
    expect(payload["SUPABASE_SERVICE_ROLE_KEY"]).toBe("sr-test");
    expect(payload["MP_ACCESS_TOKEN"]).toBeUndefined();
  });

  it("resolves permanent URLs and parses wrangler deploy output", () => {
    expect(
      resolvePermanentUrl({ workerName: "pokeplace", workersSubdomain: "juliano" }),
    ).toBe("https://pokeplace.juliano.workers.dev");
    expect(
      resolvePermanentUrl({ customDomain: "https://pokeplace.com.br/", workerName: "pokeplace" }),
    ).toBe("https://pokeplace.com.br");
    expect(
      extractDeployedWorkerUrl(
        "Uploaded pokeplace (1.2s)\nDeployed pokeplace triggers (0.4s)\n  https://pokeplace.juliano.workers.dev\n  schedule: */30 * * * *",
      ),
    ).toBe("https://pokeplace.juliano.workers.dev");
  });
});
