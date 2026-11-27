#!/usr/bin/env node
/**
 * Zero-touch production deployment for PokePlace (Supabase + Cloudflare Workers).
 *
 * Requires ONLY up to two credentials in environment:
 *   - CLOUDFLARE_API_TOKEN   (Workers Scripts:Edit, Account:Read; Zone/DNS if using custom domain)
 *   - SUPABASE_ACCESS_TOKEN  (Management API token — fetches API keys, applies migrations, sets Auth URLs)
 *     (or SUPABASE_DB_URL + SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + SUPABASE_SERVICE_ROLE_KEY)
 *
 * Optional:
 *   - CLOUDFLARE_ACCOUNT_ID     (auto-discovered from CLOUDFLARE_API_TOKEN if omitted)
 *   - CLOUDFLARE_CUSTOM_DOMAIN  (e.g. pokeplace.com.br; defaults to https://pokeplace.<subdomain>.workers.dev)
 *   - CRON_SECRET               (auto-generated with 256-bit entropy if omitted)
 *   - MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET, RESEND_API_KEY, RESEND_FROM
 *
 * Usage:
 *   node scripts/deploy-production.mjs [--dry-run]
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkerSecretsPayload,
  configureSupabaseAuth,
  discoverCloudflareAccount,
  discoverWorkersSubdomain,
  extractDeployedWorkerUrl,
  generateCronSecret,
  resolvePermanentUrl,
} from "./lib/deploy-helpers.mjs";
import { provisionSupabase } from "./supabase-provision.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function runCmd(cmd, args, { env = process.env, capture = false } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (capture) {
    if (res.stdout) process.stdout.write(res.stdout);
    if (res.stderr) process.stderr.write(res.stderr);
  }
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(" ")}`);
  }
  return `${res.stdout || ""}\n${res.stderr || ""}`;
}

async function seedCatalogIfNeeded({ supabaseUrl, serviceRoleKey }) {
  if (!supabaseUrl || !serviceRoleKey) return;
  const headers = {
    apikey: serviceRoleKey,
    Accept: "application/json",
    ...(!serviceRoleKey.startsWith("sb_") ? { Authorization: `Bearer ${serviceRoleKey}` } : {}),
  };
  const checkRes = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/cards?select=id&limit=1`, {
    headers,
  });
  if (checkRes.ok) {
    const rows = await checkRes.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) {
      console.log("[catalog] cards table already seeded; skipping seed.");
      return;
    }
  }

  console.log("[catalog] cards table is empty — seeding starter Pokémon TCG catalog...");
  const hasBun = spawnSync("which", ["bun"], { encoding: "utf8" }).status === 0;
  if (hasBun) {
    runCmd("bun", ["scripts/import-catalog.ts"], {
      env: {
        ...process.env,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
    });
  } else {
    console.log("[catalog] bun not available; catalog can be seeded via /admin or bun run catalog:import.");
  }
}

async function verifyPermanentUrl(permanentUrl, cronSecret) {
  const base = permanentUrl.replace(/\/+$/, "");
  const maxAttempts = 12;

  let homeStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${base}/`, { redirect: "follow" });
      homeStatus = res.status;
      if (homeStatus === 200) break;
    } catch {
      homeStatus = 0;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
  if (homeStatus !== 200) {
    throw new Error(`Permanent URL ${base}/ returned HTTP ${homeStatus} (expected 200).`);
  }

  const healthRes = await fetch(`${base}/api/health`);
  if (healthRes.status !== 200) {
    throw new Error(`Health check ${base}/api/health returned HTTP ${healthRes.status}.`);
  }

  let authHealth = null;
  let cronSyncStatus = null;
  let cronMaintStatus = null;
  if (cronSecret) {
    const authHeaders = {
      Authorization: `Bearer ${cronSecret}`,
      "x-cron-secret": cronSecret,
    };
    const ah = await fetch(`${base}/api/health`, { headers: authHeaders });
    authHealth = { status: ah.status, body: await ah.json().catch(() => null) };

    const syncRes = await fetch(`${base}/api/cron/sync-prices?limit=5`, {
      method: "POST",
      headers: authHeaders,
    });
    cronSyncStatus = syncRes.status;

    const maintRes = await fetch(`${base}/api/cron/orders-maintenance`, {
      method: "POST",
      headers: authHeaders,
    });
    cronMaintStatus = maintRes.status;
  }

  return {
    url: base,
    homeStatus,
    healthStatus: healthRes.status,
    authHealth,
    cronSyncStatus,
    cronMaintStatus,
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfToken = (process.env.CLOUDFLARE_API_TOKEN || "").trim();
  const sbToken = (process.env.SUPABASE_ACCESS_TOKEN || "").trim();
  const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "").trim();
  const customDomain = (process.env.CLOUDFLARE_CUSTOM_DOMAIN || "").trim();

  const wranglerJsonc = JSON.parse(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8"));
  const workerName = wranglerJsonc.name || "pokeplace";

  if (dryRun) {
    console.log("[deploy] Running --dry-run build + Wrangler validation (no remote mutations)...");
    runCmd("npm", ["run", "build"]);
    runCmd("npx", ["--yes", "wrangler@4", "deploy", "--dry-run"]);
    console.log("[deploy] Dry-run succeeded.");
    return;
  }

  if (!cfToken) {
    throw new Error("Missing CLOUDFLARE_API_TOKEN environment variable.");
  }

  // 1. Auto-generate CRON_SECRET if not provided
  const cronSecret = (process.env.CRON_SECRET || "").trim() || generateCronSecret();
  console.log(
    `[deploy] CRON_SECRET ready (${process.env.CRON_SECRET ? "from env" : "auto-generated 256-bit"})`,
  );

  // 2. Provision Supabase (migrations + auto-fetched API keys)
  let sb = {
    projectRef: (process.env.SUPABASE_PROJECT_ID || "").trim(),
    supabaseUrl: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim(),
    publishableKey: (
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      ""
    ).trim(),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  };

  if (sbToken || dbUrl) {
    sb = await provisionSupabase({
      accessToken: sbToken,
      dbUrl,
      siteUrl: "", // Applied right after permanent URL is confirmed
    });
    await seedCatalogIfNeeded({
      supabaseUrl: sb.supabaseUrl,
      serviceRoleKey: sb.serviceRoleKey,
    });
  } else {
    console.warn(
      "[deploy] Neither SUPABASE_ACCESS_TOKEN nor SUPABASE_DB_URL set — skipping DB migration/Auth step.",
    );
  }

  // 3. Discover Cloudflare account & permanent domain
  const accountId = await discoverCloudflareAccount({
    token: cfToken,
    explicitAccountId: process.env.CLOUDFLARE_ACCOUNT_ID || "",
  });
  const workersSubdomain = customDomain
    ? ""
    : await discoverWorkersSubdomain({ token: cfToken, accountId });

  let permanentUrl = resolvePermanentUrl({
    customDomain,
    workerName,
    workersSubdomain,
  });
  console.log(
    `[deploy] Cloudflare account=${accountId}, planned URL=${permanentUrl || "(will detect from wrangler deploy)"}`,
  );

  // 4. Build Vite/Nitro bundle with public Supabase env vars baked in
  const buildEnv = {
    ...process.env,
    ...(sb.supabaseUrl
      ? { SUPABASE_URL: sb.supabaseUrl, VITE_SUPABASE_URL: sb.supabaseUrl }
      : {}),
    ...(sb.publishableKey
      ? {
          SUPABASE_PUBLISHABLE_KEY: sb.publishableKey,
          VITE_SUPABASE_PUBLISHABLE_KEY: sb.publishableKey,
        }
      : {}),
    ...(sb.projectRef
      ? { SUPABASE_PROJECT_ID: sb.projectRef, VITE_SUPABASE_PROJECT_ID: sb.projectRef }
      : {}),
  };
  runCmd("npm", ["run", "build"], { env: buildEnv });

  // 5. Single atomic `wrangler deploy --secrets-file <tmp>` setting code + assets + secrets + crons + domain
  const secretsPayload = buildWorkerSecretsPayload({
    supabaseUrl: sb.supabaseUrl,
    supabasePublishableKey: sb.publishableKey,
    supabaseProjectId: sb.projectRef,
    supabaseServiceRoleKey: sb.serviceRoleKey,
    cronSecret,
    appPublicUrl: permanentUrl,
  });

  const tmpDir = mkdtempSync(join(tmpdir(), "pokeplace-cf-"));
  const secretsPath = join(tmpDir, "secrets.json");
  let deployOutput = "";
  try {
    writeFileSync(secretsPath, JSON.stringify(secretsPayload), { mode: 0o600 });

    const deployArgs = [
      "--yes",
      "wrangler@4",
      "deploy",
      "--secrets-file",
      secretsPath,
      ...(customDomain ? ["--domain", customDomain] : []),
    ];

    deployOutput = runCmd("npx", deployArgs, {
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: cfToken,
        CLOUDFLARE_ACCOUNT_ID: accountId,
      },
      capture: true,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const detectedUrl = extractDeployedWorkerUrl(deployOutput);
  if (!permanentUrl && detectedUrl) {
    permanentUrl = detectedUrl;
    // Ensure APP_PUBLIC_URL matches the newly minted workers.dev URL
    const tmpDir2 = mkdtempSync(join(tmpdir(), "pokeplace-cf-url-"));
    const secretsPath2 = join(tmpDir2, "url-secret.json");
    try {
      writeFileSync(secretsPath2, JSON.stringify({ APP_PUBLIC_URL: permanentUrl }), { mode: 0o600 });
      runCmd("npx", ["--yes", "wrangler@4", "secret", "bulk", secretsPath2], {
        env: {
          ...process.env,
          CLOUDFLARE_API_TOKEN: cfToken,
          CLOUDFLARE_ACCOUNT_ID: accountId,
        },
      });
    } finally {
      rmSync(tmpDir2, { recursive: true, force: true });
    }
  }

  if (!permanentUrl) {
    throw new Error("Could not determine permanent Worker URL after wrangler deploy.");
  }

  // 6. Configure Supabase Auth Site URL + Redirect URLs to match the permanent URL
  if (sbToken && sb.projectRef) {
    console.log(`[deploy] Updating Supabase Auth site_url & redirect URLs -> ${permanentUrl}`);
    await configureSupabaseAuth({
      token: sbToken,
      projectRef: sb.projectRef,
      siteUrl: permanentUrl,
    });
  }

  // 7. Verify permanent URL returns HTTP 200 + health + crons
  console.log(`[deploy] Verifying live deployment at ${permanentUrl} ...`);
  const verification = await verifyPermanentUrl(permanentUrl, cronSecret);
  console.log(JSON.stringify({ ok: true, verification }, null, 2));
}

main().catch((err) => {
  console.error(`[deploy-production] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
