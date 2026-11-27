#!/usr/bin/env node
/**
 * Zero-touch Supabase provisioning script for PokePlace.
 *
 * Supports:
 *   1. SUPABASE_ACCESS_TOKEN (Management API):
 *      - Auto-discovers project ref (env or supabase/config.toml)
 *      - Applies scripts/sql/all-migrations.sql idempotently
 *      - Configures Auth Site URL + Redirect URLs when APP_PUBLIC_URL / --site-url is provided
 *   2. SUPABASE_DB_URL / DATABASE_URL (Direct Postgres):
 *      - Applies scripts/sql/all-migrations.sql idempotently via `postgres`
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyAllMigrations,
  configureSupabaseAuth,
  discoverSupabaseProjectRef,
  fetchSupabaseApiKeys,
  parseSqlMigrationSections,
  resolveSupabaseProjectRef,
  runSupabaseSql,
} from "./lib/deploy-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function readOptionalFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

export async function provisionSupabase({
  accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim() || "",
  dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim(),
  siteUrl = process.env.APP_PUBLIC_URL?.trim() || "",
  env = process.env,
  log = console.log,
} = {}) {
  const sqlPath = resolve(ROOT, "scripts/sql/all-migrations.sql");
  const sqlText = readFileSync(sqlPath, "utf8");
  const sections = parseSqlMigrationSections(sqlText);
  const configToml = readOptionalFile(resolve(ROOT, "supabase/config.toml"));

  if (!accessToken && !dbUrl) {
    throw new Error(
      "Missing Supabase credential: set SUPABASE_ACCESS_TOKEN (preferred, Management API) or SUPABASE_DB_URL / DATABASE_URL.",
    );
  }

  let projectRef = resolveSupabaseProjectRef(env, configToml);
  let publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();
  let serviceRoleKey = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  let supabaseUrl = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();

  let migrationSummary;

  if (accessToken) {
    projectRef = await discoverSupabaseProjectRef({ token: accessToken, fallbackRef: projectRef });
    if (!supabaseUrl) {
      supabaseUrl = `https://${projectRef}.supabase.co`;
    }

    log(`[supabase] project ref: ${projectRef}`);
    if (!publishableKey || !serviceRoleKey) {
      const keys = await fetchSupabaseApiKeys({ token: accessToken, projectRef });
      publishableKey = publishableKey || keys.publishableKey;
      serviceRoleKey = serviceRoleKey || keys.serviceRoleKey;
      log(
        `[supabase] fetched API keys via Management API (publishable=${Boolean(publishableKey)}, service_role=${Boolean(serviceRoleKey)})`,
      );
    }

    migrationSummary = await applyAllMigrations({
      sections,
      execQuery: (query) => runSupabaseSql({ token: accessToken, projectRef, query }),
      log,
    });
  } else {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { ssl: "require", max: 1 });
    try {
      migrationSummary = await applyAllMigrations({
        sections,
        execQuery: async (query) => sql.unsafe(query),
        log,
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
    if (!supabaseUrl && projectRef) {
      supabaseUrl = `https://${projectRef}.supabase.co`;
    }
  }

  let authResult = null;
  if (accessToken && projectRef && siteUrl) {
    log(`[supabase] configuring Auth site_url & redirect URLs for ${siteUrl}`);
    authResult = await configureSupabaseAuth({ token: accessToken, projectRef, siteUrl });
  }

  return {
    projectRef,
    supabaseUrl,
    publishableKey,
    serviceRoleKey,
    migrationSummary,
    authResult,
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const siteIdx = process.argv.indexOf("--site-url");
  const cliSiteUrl = siteIdx >= 0 ? process.argv[siteIdx + 1] : undefined;
  provisionSupabase({ ...(cliSiteUrl ? { siteUrl: cliSiteUrl } : {}) })
    .then((res) => {
      console.log(
        JSON.stringify(
          {
            ok: true,
            projectRef: res.projectRef,
            supabaseUrl: res.supabaseUrl,
            applied: res.migrationSummary.applied.length,
            skippedLegacy: res.migrationSummary.skippedLegacy.length,
            reappliedIdempotent: res.migrationSummary.reappliedIdempotent.length,
            authConfigured: Boolean(res.authResult),
          },
          null,
          2,
        ),
      );
    })
    .catch((err) => {
      console.error(`[supabase-provision] ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
