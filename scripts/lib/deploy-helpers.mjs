import crypto from "node:crypto";

const LEGACY_SECTION_PROBES = new Map([
  ["0000_migration.sql", "select to_regclass('public.user_roles') is not null as applied;"],
  [
    "0002_seller_reviews_reputation_trends.sql",
    "select to_regclass('public.seller_reviews') is not null as applied;",
  ],
  [
    "0004_marketplace_trust_integrity.sql",
    "select exists (select 1 from pg_trigger where tgname = 'order_items_integrity') as applied;",
  ],
  [
    "0006_marketplace_completion.sql",
    "select to_regclass('public.collection_entries') is not null as applied;",
  ],
  [
    "0007_launch_security_guards.sql",
    "select exists (select 1 from pg_trigger where tgname = 'order_address_valid') as applied;",
  ],
  [
    "0009_marketplace_operations.sql",
    "select to_regclass('public.disputes') is not null as applied;",
  ],
  [
    "0010_ship_only_paid.sql",
    "select exists (select 1 from pg_trigger where tgname = 'order_items_paid_before_ship') as applied;",
  ],
  [
    "0013_ml_marketplace_rules_and_rankings.sql",
    "select to_regclass('public.buyer_reviews') is not null as applied;",
  ],
]);

/**
 * Splits scripts/sql/all-migrations.sql into ordered sections with legacy probes
 * so repeated runs are 100% idempotent on both fresh and partially migrated DBs.
 */
export function parseSqlMigrationSections(sqlText) {
  const lines = sqlText.replace(/\r\n/g, "\n").split("\n");
  const markers = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Format 1: -- ===== 0000_migration.sql =====
    const m1 = line.match(/^--\s*={3,}\s*([A-Za-z0-9_.-]+)\s*={3,}$/);
    if (m1) {
      markers.push({ index: i, id: m1[1] });
      continue;
    }

    // Format 2:
    // -- =====================================================================
    // -- 0014_reference_prices_rpc.sql
    if (/^--\s*={10,}$/.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      const m2 = next.match(/^--\s*(0\d{3}_[A-Za-z0-9_.-]+\.sql)\s*$/);
      if (m2) {
        markers.push({ index: i, id: m2[1] });
      }
    }
  }

  if (markers.length === 0) {
    const trimmed = sqlText.trim();
    return trimmed ? [{ id: "all-migrations.sql", sql: trimmed, legacyProbe: null }] : [];
  }

  const sections = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index;
    const end = i + 1 < markers.length ? markers[i + 1].index : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (!body) continue;
    const id = markers[i].id;
    sections.push({
      id,
      sql: body,
      legacyProbe: LEGACY_SECTION_PROBES.get(id) ?? null,
    });
  }
  return sections;
}

export function resolveSupabaseProjectRef(env = process.env, configTomlText = "") {
  const direct = (env.SUPABASE_PROJECT_ID || env.VITE_SUPABASE_PROJECT_ID || "").trim();
  if (direct) return direct;

  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const fromUrl = url.match(/^https?:\/\/([a-z0-9]{10,40})\.supabase\.co/i)?.[1];
  if (fromUrl) return fromUrl;

  const fromToml = configTomlText.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1]?.trim();
  if (fromToml) return fromToml;

  return "";
}

export function pickSupabaseApiKeys(apiKeys) {
  if (!Array.isArray(apiKeys)) {
    return { publishableKey: "", serviceRoleKey: "" };
  }

  const readVal = (item) =>
    typeof item?.api_key === "string" && item.api_key.trim() ? item.api_key.trim() : "";

  const publishable =
    apiKeys.find((k) => k?.name === "anon" && readVal(k)) ||
    apiKeys.find((k) => k?.type === "publishable" && readVal(k)) ||
    apiKeys.find((k) => readVal(k).startsWith("sb_publishable_"));

  const serviceRole =
    apiKeys.find((k) => k?.name === "service_role" && readVal(k)) ||
    apiKeys.find((k) => k?.type === "secret" && readVal(k)) ||
    apiKeys.find((k) => readVal(k).startsWith("sb_secret_"));

  return {
    publishableKey: readVal(publishable),
    serviceRoleKey: readVal(serviceRole),
  };
}

export function mergeRedirectUrls(existingList, siteUrl) {
  const origin = new URL(siteUrl).origin;
  const required = [
    origin,
    `${origin}/**`,
    `${origin}/auth`,
    `${origin}/conta`,
    `${origin}/pedidos`,
    `${origin}/minha-loja`,
    `${origin}/colecao`,
  ];

  const existing = Array.isArray(existingList)
    ? existingList
    : typeof existingList === "string"
      ? existingList.split(",")
      : [];

  const seen = new Set();
  const merged = [];
  for (const raw of [...existing, ...required]) {
    const val = String(raw ?? "").trim();
    if (!val) continue;
    if (!seen.has(val)) {
      seen.add(val);
      merged.push(val);
    }
  }
  return merged.join(",");
}

export function generateCronSecret() {
  return crypto.randomBytes(32).toString("hex");
}

export function buildWorkerSecretsPayload({
  supabaseUrl = "",
  supabasePublishableKey = "",
  supabaseProjectId = "",
  supabaseServiceRoleKey = "",
  cronSecret = "",
  appPublicUrl = "",
  env = process.env,
}) {
  const resolvedCronSecret = (cronSecret || env.CRON_SECRET || "").trim() || generateCronSecret();

  const candidates = {
    SUPABASE_URL: (supabaseUrl || env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim(),
    SUPABASE_PUBLISHABLE_KEY: (
      supabasePublishableKey ||
      env.SUPABASE_PUBLISHABLE_KEY ||
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ""
    ).trim(),
    SUPABASE_PROJECT_ID: (
      supabaseProjectId ||
      env.SUPABASE_PROJECT_ID ||
      env.VITE_SUPABASE_PROJECT_ID ||
      ""
    ).trim(),
    SUPABASE_SERVICE_ROLE_KEY: (
      supabaseServiceRoleKey ||
      env.SUPABASE_SERVICE_ROLE_KEY ||
      ""
    ).trim(),
    CRON_SECRET: resolvedCronSecret,
    APP_PUBLIC_URL: (appPublicUrl || env.APP_PUBLIC_URL || "").trim(),
    RESEND_API_KEY: (env.RESEND_API_KEY || "").trim(),
    RESEND_FROM: (env.RESEND_FROM || "").trim(),
    EMAIL_FROM: (env.EMAIL_FROM || "").trim(),
    MP_ACCESS_TOKEN: (env.MP_ACCESS_TOKEN || "").trim(),
    MP_PUBLIC_KEY: (env.MP_PUBLIC_KEY || "").trim(),
    MP_WEBHOOK_SECRET: (env.MP_WEBHOOK_SECRET || "").trim(),
  };

  const payload = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (v) payload[k] = v;
  }
  return payload;
}

export function resolvePermanentUrl({ customDomain = "", workerName = "pokeplace", workersSubdomain = "" }) {
  const cleanDomain = customDomain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (cleanDomain) return `https://${cleanDomain}`;
  const cleanSub = workersSubdomain.trim().replace(/\.workers\.dev$/i, "");
  if (cleanSub && workerName.trim()) {
    return `https://${workerName.trim()}.${cleanSub}.workers.dev`;
  }
  return "";
}

export function extractDeployedWorkerUrl(wranglerOutput) {
  if (typeof wranglerOutput !== "string") return "";
  const matches = wranglerOutput.match(/https:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
  // Prefer workers.dev or non-cloudflare-dash/docs URLs
  const filtered = matches.filter(
    (u) =>
      !u.includes("developers.cloudflare.com") &&
      !u.includes("dash.cloudflare.com") &&
      !u.includes("github.com") &&
      !u.includes("wrangler"),
  );
  const workersDev = filtered.find((u) => u.includes(".workers.dev"));
  return (workersDev || filtered[0] || "").replace(/\/+$/, "");
}

export async function supabaseApiRequest({ token, path, method = "GET", body }) {
  const res = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const detail =
      (json && (json.message || json.error || json.msg)) || text.slice(0, 300) || res.statusText;
    throw new Error(`Supabase API ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return json;
}

export async function discoverSupabaseProjectRef({ token, fallbackRef = "" }) {
  if (fallbackRef) return fallbackRef;
  const projects = await supabaseApiRequest({ token, path: "/v1/projects" });
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("No Supabase projects found for SUPABASE_ACCESS_TOKEN.");
  }
  const match =
    projects.find((p) => String(p?.name || "").toLowerCase().includes("pokeplace")) || projects[0];
  if (!match?.id) {
    throw new Error("Could not determine Supabase project ref from Management API.");
  }
  return match.id;
}

export async function fetchSupabaseApiKeys({ token, projectRef }) {
  const keys = await supabaseApiRequest({
    token,
    path: `/v1/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`,
  });
  return pickSupabaseApiKeys(keys);
}

export async function runSupabaseSql({ token, projectRef, query }) {
  return supabaseApiRequest({
    token,
    path: `/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
    method: "POST",
    body: { query },
  });
}

function escapeSqlLiteral(val) {
  return String(val).replace(/'/g, "''");
}

/**
 * Applies every migration section cleanly and idempotently using either
 * Supabase Management API or direct Postgres connection.
 */
export async function applyAllMigrations({ sections, execQuery, log = console.log }) {
  await execQuery(`
    CREATE TABLE IF NOT EXISTS public.pokeplace_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    REVOKE ALL ON public.pokeplace_schema_migrations FROM PUBLIC, anon, authenticated;
    GRANT ALL ON public.pokeplace_schema_migrations TO service_role;
  `);

  const appliedRows = await execQuery(
    "SELECT id FROM public.pokeplace_schema_migrations ORDER BY id;",
  );
  const alreadyRecorded = new Set(
    (Array.isArray(appliedRows) ? appliedRows : []).map((r) => String(r?.id ?? "")),
  );

  const summary = { applied: [], skippedLegacy: [], reappliedIdempotent: [] };

  for (const section of sections) {
    const safeId = escapeSqlLiteral(section.id);

    if (section.legacyProbe) {
      if (alreadyRecorded.has(section.id)) {
        summary.skippedLegacy.push(section.id);
        continue;
      }
      const probeRows = await execQuery(section.legacyProbe);
      const exists = Boolean(Array.isArray(probeRows) && probeRows[0]?.applied === true);
      if (exists) {
        await execQuery(
          `INSERT INTO public.pokeplace_schema_migrations (id) VALUES ('${safeId}') ON CONFLICT (id) DO NOTHING;`,
        );
        summary.skippedLegacy.push(section.id);
        log(`[supabase] skipping already-applied legacy migration: ${section.id}`);
        continue;
      }
    }

    log(`[supabase] applying migration: ${section.id}`);
    await execQuery(section.sql);
    await execQuery(
      `INSERT INTO public.pokeplace_schema_migrations (id) VALUES ('${safeId}') ON CONFLICT (id) DO UPDATE SET applied_at = now();`,
    );

    if (alreadyRecorded.has(section.id)) {
      summary.reappliedIdempotent.push(section.id);
    } else {
      summary.applied.push(section.id);
    }
  }

  return summary;
}

export async function configureSupabaseAuth({ token, projectRef, siteUrl }) {
  const current = await supabaseApiRequest({
    token,
    path: `/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
  });
  const mergedAllowList = mergeRedirectUrls(current?.uri_allow_list, siteUrl);
  const updated = await supabaseApiRequest({
    token,
    path: `/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
    method: "PATCH",
    body: {
      site_url: siteUrl,
      uri_allow_list: mergedAllowList,
    },
  });
  return {
    siteUrl: updated?.site_url || siteUrl,
    uriAllowList: updated?.uri_allow_list || mergedAllowList,
  };
}

export async function cloudflareApiRequest({ token, path, method = "GET", body }) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json && json.success === false)) {
    const errMsg =
      json?.errors?.map((e) => `${e.code ?? ""}: ${e.message ?? ""}`).join("; ") ||
      res.statusText;
    throw new Error(`Cloudflare API ${method} ${path} failed (${res.status}): ${errMsg}`);
  }
  return json?.result;
}

export async function discoverCloudflareAccount({ token, explicitAccountId = "" }) {
  if (explicitAccountId.trim()) return explicitAccountId.trim();
  const accounts = await cloudflareApiRequest({ token, path: "/accounts?per_page=20" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error(
      "No Cloudflare accounts accessible with CLOUDFLARE_API_TOKEN. Ensure Account Read + Workers Scripts Edit permissions.",
    );
  }
  return String(accounts[0].id);
}

export async function discoverWorkersSubdomain({ token, accountId }) {
  try {
    const result = await cloudflareApiRequest({
      token,
      path: `/accounts/${encodeURIComponent(accountId)}/workers/subdomain`,
    });
    return typeof result?.subdomain === "string" ? result.subdomain.trim() : "";
  } catch {
    return "";
  }
}
