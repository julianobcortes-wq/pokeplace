import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publicSupabaseConfigMissing } from "@/lib/config-guard";
import { SYNC_MAX_LIMIT, SyncBusyError, syncPricesBatch } from "@/lib/ops/sync-runner";
import server from "@/server";

const KEYS = [
  "NODE_ENV",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
];

describe("security follow-ups", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("detects missing public Supabase configuration, including the Vite-prefixed names", () => {
    expect(publicSupabaseConfigMissing({})).toBe(true);
    expect(publicSupabaseConfigMissing({ SUPABASE_URL: "https://x.supabase.co" })).toBe(true);
    expect(
      publicSupabaseConfigMissing({
        VITE_SUPABASE_URL: "https://x.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "k",
      }),
    ).toBe(false);
  });

  it("fails closed with 503 for pages in production when public config is missing", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await server.fetch(new Request("https://example.com/"), {}, {});
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("127.0.0.1");
  });

  it("keeps the health endpoint reachable when public config is missing", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await server.fetch(new Request("https://example.com/api/health"), {}, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("caps price sync at a small batch size", () => {
    expect(SYNC_MAX_LIMIT).toBeLessThanOrEqual(10);
  });

  it("refuses a second price sync inside the cooldown window", async () => {
    await expect(syncPricesBatch(1)).rejects.toThrow();
    await expect(syncPricesBatch(1)).rejects.toBeInstanceOf(SyncBusyError);
  });
});
