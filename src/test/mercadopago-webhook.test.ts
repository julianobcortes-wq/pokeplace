import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { verifyMercadoPagoWebhook, sandboxPaymentsAllowed } from "@/lib/payments/mercadopago";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("Mercado Pago webhook verification", () => {
  const prevSecret = process.env.MP_WEBHOOK_SECRET;
  const prevToken = process.env.MP_ACCESS_TOKEN;
  const prevSandbox = process.env.ALLOW_SANDBOX_PAYMENTS;

  beforeEach(() => {
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.ALLOW_SANDBOX_PAYMENTS;
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.MP_WEBHOOK_SECRET;
    else process.env.MP_WEBHOOK_SECRET = prevSecret;
    if (prevToken === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = prevToken;
    if (prevSandbox === undefined) delete process.env.ALLOW_SANDBOX_PAYMENTS;
    else process.env.ALLOW_SANDBOX_PAYMENTS = prevSandbox;
  });

  it("rejects when webhook secret is unset", async () => {
    const req = new Request("https://example.com/api/mercadopago/webhook?data.id=123", {
      method: "POST",
      headers: { "x-signature": "ts=1,v1=abc", "x-request-id": "req-1" },
    });
    expect(await verifyMercadoPagoWebhook(req, "123")).toBe(false);
  });

  it("accepts a valid HMAC signature", async () => {
    process.env.MP_WEBHOOK_SECRET = "test-secret";
    const ts = "1700000000";
    const dataId = "999";
    const requestId = "abc-req";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = await hmacSha256Hex("test-secret", manifest);
    const req = new Request(`https://example.com/api/mercadopago/webhook?data.id=${dataId}`, {
      method: "POST",
      headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
    });
    expect(await verifyMercadoPagoWebhook(req, dataId)).toBe(true);
  });

  it("keeps sandbox payments off when Mercado Pago is configured", () => {
    process.env.ALLOW_SANDBOX_PAYMENTS = "true";
    process.env.MP_ACCESS_TOKEN = "APP_USR-xxx";
    expect(sandboxPaymentsAllowed()).toBe(false);
  });
});
