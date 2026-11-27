import { describe, expect, it } from "vitest";
import {
  buildDeliveryWarningEmail,
  buildOrderPaidEmail,
  buildOrderShippedEmail,
  buildPriceAlertEmail,
  buildShippingSlaWarningEmail,
  sendTransactionalEmail,
} from "@/lib/notify/email";
import {
  calculateSplitBreakdown,
  mercadoPagoConfigured,
  mercadoPagoWebhookConfigured,
  verifyMercadoPagoWebhook,
} from "@/lib/payments/mercadopago";

describe("Phase 3 transactional emails (Resend templates & safe stub fallback)", () => {
  it("builds complete Brazilian Portuguese email payloads including carrier tracking URL", () => {
    const paid = buildOrderPaidEmail({
      to: "buyer@example.com",
      orderId: "12345678-aaaa-bbbb",
      totalBrl: 149.9,
    });
    expect(paid.subject).toContain("#12345678");
    expect(paid.text).toContain("R$ 149,90");

    const shipped = buildOrderShippedEmail({
      to: "buyer@example.com",
      orderId: "12345678-aaaa-bbbb",
      carrier: "Correios",
      trackingCode: "BR123456789BR",
    });
    expect(shipped.text).toContain("BR123456789BR");
    expect(shipped.text).toContain("rastreamento.correios.com.br");

    const warn = buildDeliveryWarningEmail({ to: "buyer@example.com", orderId: "12345678-aaaa" });
    expect(warn.text).toContain("48 horas");

    const sla = buildShippingSlaWarningEmail({
      to: "seller@example.com",
      orderId: "12345678-aaaa",
      hoursRemaining: 6,
    });
    expect(sla.text).toContain("6h");

    const alert = buildPriceAlertEmail({
      to: "collector@example.com",
      cardName: "Charizard ex #199",
      currentBrl: 820,
      thresholdBrl: 850,
      direction: "below",
      cardUrl: "https://pokeplace.com.br/carta/sv3pt5-199",
    });
    expect(alert.subject).toContain("Charizard ex #199");
    expect(alert.text).toContain("caiu para R$ 820,00");
  });

  it("never throws when RESEND_API_KEY is unset and returns clean stub status", async () => {
    const prev = process.env["RESEND_API_KEY"];
    delete process.env["RESEND_API_KEY"];
    try {
      const res = await sendTransactionalEmail({
        to: "test@example.com",
        subject: "Teste",
        text: "Corpo",
      });
      expect(res.sent).toBe(false);
      expect(res.reason).toContain("RESEND_API_KEY");
    } finally {
      if (prev !== undefined) process.env["RESEND_API_KEY"] = prev;
    }
  });
});

describe("Phase 3 Mercado Pago split math, config guards & fail-closed webhook", () => {
  it("computes accurate commission / seller split breakdown without negative drift", () => {
    const split = calculateSplitBreakdown(250, 0.08);
    expect(split.marketplaceFee).toBe(20);
    expect(split.sellerNetAmount).toBe(230);

    // Clamps extreme commission inputs safely
    const capped = calculateSplitBreakdown(100, 0.99);
    expect(capped.commissionRate).toBe(0.5);
    expect(capped.marketplaceFee).toBe(50);
    expect(capped.sellerNetAmount).toBe(50);
  });

  it("stays disabled when credentials are absent and fails closed on webhooks", async () => {
    const prevToken = process.env["MP_ACCESS_TOKEN"];
    const prevSecret = process.env["MP_WEBHOOK_SECRET"];
    delete process.env["MP_ACCESS_TOKEN"];
    delete process.env["MP_WEBHOOK_SECRET"];
    try {
      expect(mercadoPagoConfigured()).toBe(false);
      expect(mercadoPagoWebhookConfigured()).toBe(false);
      const req = new Request("https://pokeplace.com.br/api/mercadopago/webhook?data.id=999", {
        method: "POST",
        headers: { "x-signature": "ts=1,v1=deadbeef", "x-request-id": "req-1" },
      });
      expect(await verifyMercadoPagoWebhook(req, "999")).toBe(false);
    } finally {
      if (prevToken !== undefined) process.env["MP_ACCESS_TOKEN"] = prevToken;
      if (prevSecret !== undefined) process.env["MP_WEBHOOK_SECRET"] = prevSecret;
    }
  });
});
