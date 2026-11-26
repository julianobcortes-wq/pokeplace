import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getLaunchReadiness } from "@/lib/ops/readiness";
import { sanitizeSetIds, verifyCronBearer } from "@/lib/ops/sync-runner";

describe("Launch readiness & ops helpers", () => {
  const prevCron = process.env["CRON_SECRET"];
  const prevMp = process.env["MP_ACCESS_TOKEN"];
  const prevWebhook = process.env["MP_WEBHOOK_SECRET"];

  beforeEach(() => {
    delete process.env["CRON_SECRET"];
    delete process.env["MP_ACCESS_TOKEN"];
    delete process.env["MP_WEBHOOK_SECRET"];
  });

  afterEach(() => {
    if (prevCron === undefined) delete process.env["CRON_SECRET"];
    else process.env["CRON_SECRET"] = prevCron;
    if (prevMp === undefined) delete process.env["MP_ACCESS_TOKEN"];
    else process.env["MP_ACCESS_TOKEN"] = prevMp;
    if (prevWebhook === undefined) delete process.env["MP_WEBHOOK_SECRET"];
    else process.env["MP_WEBHOOK_SECRET"] = prevWebhook;
  });

  it("reports readiness booleans without ever leaking secret values", async () => {
    process.env["MP_ACCESS_TOKEN"] = "APP_USR-super-secret-value";
    process.env["MP_WEBHOOK_SECRET"] = "whsec-never-expose";
    const report = await getLaunchReadiness();
    const serialized = JSON.stringify(report);
    expect(report.ok).toBe(true);
    expect(report.checks.mercadoPago).toBe(true);
    expect(report.checks.webhookSecret).toBe(true);
    expect(serialized).not.toContain("APP_USR-super-secret-value");
    expect(serialized).not.toContain("whsec-never-expose");
  });

  it("fails closed on cron sync when CRON_SECRET is unset or wrong", () => {
    const req = new Request("https://example.com/api/cron/sync-prices", {
      method: "POST",
      headers: { Authorization: "Bearer anything" },
    });
    expect(verifyCronBearer(req)).toEqual({ ok: false, status: 503 });

    process.env["CRON_SECRET"] = "cron-secret-123";
    expect(verifyCronBearer(req)).toEqual({ ok: false, status: 401 });

    const validReq = new Request("https://example.com/api/cron/sync-prices", {
      method: "POST",
      headers: { Authorization: "Bearer cron-secret-123" },
    });
    expect(verifyCronBearer(validReq)).toEqual({ ok: true, status: 200 });
  });

  it("sanitizes catalog set IDs against injection and enforces batch cap", () => {
    expect(sanitizeSetIds(["Base1", "../etc/passwd", "sv3pt5", "swsh7", "sv8", "sv8pt5"], 4)).toEqual([
      "base1",
      "sv3pt5",
      "swsh7",
      "sv8",
    ]);
  });
});
