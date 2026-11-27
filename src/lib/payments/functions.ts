import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createCheckoutPreference, mercadoPagoConfigured } from "./mercadopago";

type Authed = {
  supabase: { from: (table: string) => any };
  userId: string;
};

function auth(context: unknown): Authed {
  const ctx = context as Partial<Authed>;
  if (!ctx.supabase || !ctx.userId) throw new Error("Acesso negado");
  return ctx as Authed;
}

export const getPaymentOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    mercadoPago: mercadoPagoConfigured(),
  }));

export const startMercadoPagoCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!mercadoPagoConfigured()) throw new Error("Mercado Pago ainda não está configurado");
    const ctx = auth(context);
    const { data: order, error } = await ctx.supabase
      .from("orders")
      .select("id,buyer_id,status,subtotal,shipping_total")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error || !order) throw new Error("Pedido não encontrado");
    if (order.buyer_id !== ctx.userId) throw new Error("Acesso negado");
    if (order.status !== "awaiting_payment") throw new Error("Este pedido não aguarda pagamento");

    const amount = Number(order.subtotal) + Number(order.shipping_total ?? 0);
    const pref = await createCheckoutPreference({
      orderId: order.id,
      title: `Pedido PokePlace #${order.id.slice(0, 8)}`,
      amount,
    });

    await ctx.supabase
      .from("payments")
      .update({ provider: "mercadopago", environment: "live", status: "pending" })
      .eq("order_id", order.id);

    const live = process.env["MP_ACCESS_TOKEN"]?.startsWith("TEST") ? pref.sandbox_init_point ?? pref.init_point : pref.init_point;
    return { preferenceId: pref.id, checkoutUrl: live };
  });
