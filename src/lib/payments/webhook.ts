import { fetchMercadoPagoPayment, verifyMercadoPagoWebhook } from "./mercadopago";

export async function handleMercadoPagoWebhook(request: Request): Promise<Response> {
  let paymentId: string | null = null;
  const url = new URL(request.url);
  paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");

  let body: { data?: { id?: string | number }; id?: string | number; type?: string; action?: string } | null = null;
  try {
    body = (await request.json()) as typeof body;
    if (!paymentId) paymentId = body?.data?.id != null ? String(body.data.id) : body?.id != null ? String(body.id) : null;
  } catch {
    // query-only notifications are fine
  }

  if (!(await verifyMercadoPagoWebhook(request, paymentId))) {
    return new Response("unauthorized", { status: 401 });
  }

  if (body?.type && body.type !== "payment" && body.action && !String(body.action).includes("payment")) {
    return new Response(JSON.stringify({ ignored: true }), { status: 200, headers: { "content-type": "application/json" } });
  }

  if (!paymentId) {
    return new Response(JSON.stringify({ ok: true, skipped: "no payment id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const payment = await fetchMercadoPagoPayment(paymentId);
    if (payment.status !== "approved") {
      return new Response(JSON.stringify({ ok: true, status: payment.status }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const orderId = payment.external_reference;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: "missing order" }), { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("confirm_live_payment", {
      _order_id: orderId,
      _provider: "mercadopago",
      _external_id: String(payment.id),
    });
    if (error) {
      const amount = payment.transaction_amount ?? 0;
      await supabaseAdmin.from("orders").update({ status: "paid", expires_at: null }).eq("id", orderId).eq("status", "awaiting_payment");
      const { data: existing } = await supabaseAdmin.from("payments").select("id").eq("order_id", orderId).limit(1);
      if (existing?.length) {
        await supabaseAdmin
          .from("payments")
          .update({ status: "succeeded", provider: "mercadopago", environment: "live" })
          .eq("order_id", orderId);
      } else if (amount > 0) {
        await supabaseAdmin.from("payments").insert({
          order_id: orderId,
          provider: "mercadopago",
          environment: "live",
          status: "succeeded",
          amount,
          currency: "BRL",
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, orderId }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[mp-webhook]", e);
    return new Response(JSON.stringify({ error: "webhook failed" }), { status: 500 });
  }
}
