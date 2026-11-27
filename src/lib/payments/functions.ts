import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createCheckoutPreference,
  fetchMercadoPagoPayment,
  mercadoPagoConfigured,
  mercadoPagoWebhookConfigured,
  refundMercadoPagoPayment,
} from "./mercadopago";
import { buildOrderShippedEmail, sendTransactionalEmail } from "@/lib/notify/email";

type Authed = {
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          eq?: (
            c: string,
            v: unknown,
          ) => {
            maybeSingle: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
          maybeSingle: () => Promise<{
            data: Record<string, unknown> | null;
            error: { message: string } | null;
          }>;
        };
      };
      update: (vals: Record<string, unknown>) => {
        eq: (c: string, v: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

function auth(context: unknown): Authed {
  const ctx = context as Partial<Authed>;
  if (!ctx.supabase || !ctx.userId) throw new Error("Acesso negado");
  return ctx as Authed;
}

async function assertAdmin(ctx: Authed) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Acesso restrito a administradores");
}

export const getPaymentOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    mercadoPago: mercadoPagoConfigured() && mercadoPagoWebhookConfigured(),
    mercadoPagoTokenReady: mercadoPagoConfigured(),
    webhookSecretReady: mercadoPagoWebhookConfigured(),
  }));

export const startMercadoPagoCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!mercadoPagoConfigured()) throw new Error("Mercado Pago ainda não está configurado");
    const ctx = auth(context);
    const { data: order, error } = await ctx.supabase
      .from("orders")
      .select("id,buyer_id,status,subtotal,shipping_total,commission_total,seller_total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido não encontrado");
    if (order["buyer_id"] !== ctx.userId) throw new Error("Acesso negado");
    if (order["status"] !== "awaiting_payment")
      throw new Error("Este pedido não aguarda pagamento");

    const orderId = String(order["id"]);
    const amount = Number(order["subtotal"]) + Number(order["shipping_total"] ?? 0);
    const pref = await createCheckoutPreference({
      orderId,
      title: `Pedido PokePlace #${orderId.slice(0, 8)}`,
      amount,
      commissionAmount: Number(order["commission_total"] ?? 0),
      sellerAmount: Number(order["seller_total"] ?? amount),
    });

    await ctx.supabase
      .from("payments")
      .update({ provider: "mercadopago", environment: "live", status: "pending" })
      .eq("order_id", orderId);

    const live = process.env["MP_ACCESS_TOKEN"]?.startsWith("TEST")
      ? (pref.sandbox_init_point ?? pref.init_point)
      : pref.init_point;
    return { preferenceId: pref.id, checkoutUrl: live };
  });

export const notifyOrderShipped = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderItemId: string; carrier: string; trackingCode: string }) =>
    z
      .object({
        orderItemId: z.string().uuid(),
        carrier: z.string().max(80),
        trackingCode: z.string().min(3).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    const { data: item } = await ctx.supabase
      .from("order_items")
      .select("order_id,seller_id")
      .eq("id", data.orderItemId)
      .maybeSingle();
    if (!item?.["order_id"] || !item["seller_id"]) return { sent: false };
    const sellerQuery = ctx.supabase.from("sellers").select("id").eq("id", item["seller_id"]);
    const { data: seller } = sellerQuery.eq
      ? await sellerQuery.eq("user_id", ctx.userId).maybeSingle()
      : { data: null };
    if (!seller) throw new Error("Acesso negado");

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const orderId = String(item["order_id"]);
      const { data: order } = await supabaseAdmin
        .from("orders")
        .select("buyer_id")
        .eq("id", orderId)
        .maybeSingle();
      if (!order?.buyer_id) return { sent: false };
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(order.buyer_id);
      const email = userRes?.user?.email;
      if (!email) return { sent: false };
      return await sendTransactionalEmail(
        buildOrderShippedEmail({
          to: email,
          orderId,
          carrier: data.carrier,
          trackingCode: data.trackingCode,
        }),
      );
    } catch {
      return { sent: false };
    }
  });

export const reconcileOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; externalPaymentId: string }) =>
    z
      .object({
        orderId: z.string().uuid(),
        externalPaymentId: z.string().min(3).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    if (!mercadoPagoConfigured())
      throw new Error("Mercado Pago não está configurado neste ambiente");
    const mpPayment = await fetchMercadoPagoPayment(data.externalPaymentId);
    if (mpPayment.external_reference && mpPayment.external_reference !== data.orderId) {
      throw new Error("ID de pagamento Mercado Pago não pertence a este pedido");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminRpc = supabaseAdmin.rpc as unknown as <T = unknown>(
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { message: string } | null }>;
    const { data: outcome, error } = await adminRpc<string>("reconcile_payment_status", {
      _order_id: data.orderId,
      _provider: "mercadopago",
      _external_id: String(mpPayment.id),
      _provider_status: mpPayment.status,
    });
    if (error) throw new Error(error.message);
    return { providerStatus: mpPayment.status, outcome: outcome ?? "updated" };
  });

export const adminRefundOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; amount?: number; reason: string }) =>
    z
      .object({
        orderId: z.string().uuid(),
        amount: z.number().positive().optional(),
        reason: z.string().min(5).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    if (!mercadoPagoConfigured())
      throw new Error("Mercado Pago não está configurado neste ambiente");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const paymentRes = await (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{
                data: { external_id?: string | null; amount: number; status: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from("payments")
      .select("external_id,amount,status")
      .eq("order_id", data.orderId)
      .maybeSingle();
    const payment = paymentRes.data;
    if (!payment?.external_id) {
      throw new Error("Pedido sem pagamento externo registrado no Mercado Pago");
    }
    const refundAmount = data.amount ?? Number(payment.amount);
    const mpRefund = await refundMercadoPagoPayment({
      paymentId: payment.external_id,
      ...(data.amount != null ? { amount: data.amount } : {}),
      idempotencyKey: `refund-${data.orderId}-${Math.round(refundAmount * 100)}`,
    });
    const adminRpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await adminRpc("record_payment_refund", {
      _order_id: data.orderId,
      _amount: refundAmount,
      _reason: data.reason,
      _external_refund_id: String(mpRefund.id),
      _external_payment_id: payment.external_id,
      _actor: ctx.userId,
    });
    if (error) throw new Error(error.message);
    return { refundId: String(mpRefund.id), amount: refundAmount, status: mpRefund.status };
  });

export const runAdminOrdersMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { runOrdersMaintenance } = await import("@/lib/ops/orders-cron");
    return await runOrdersMaintenance();
  });
