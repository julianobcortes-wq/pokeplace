import { fetchMercadoPagoPayment, verifyMercadoPagoWebhook } from "./mercadopago";
import { buildOrderPaidEmail, sendTransactionalEmail } from "@/lib/notify/email";

type WebhookBody = {
  data?: { id?: string | number };
  id?: string | number;
  type?: string;
  action?: string;
};

export async function handleMercadoPagoWebhook(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let paymentId: string | null = url.searchParams.get("data.id") || url.searchParams.get("id");

  let body: WebhookBody | null = null;
  try {
    body = (await request.json()) as WebhookBody;
    if (!paymentId) {
      paymentId =
        body?.data?.id != null ? String(body.data.id) : body?.id != null ? String(body.id) : null;
    }
  } catch {
    // query-only notifications are fine
  }

  if (!(await verifyMercadoPagoWebhook(request, paymentId))) {
    return new Response("unauthorized", { status: 401 });
  }

  if (
    body?.type &&
    body.type !== "payment" &&
    body.action &&
    !String(body.action).includes("payment")
  ) {
    return new Response(JSON.stringify({ ignored: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (!paymentId) {
    return new Response(JSON.stringify({ ok: true, skipped: "no payment id" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const payment = await fetchMercadoPagoPayment(paymentId);
    const orderId = payment.external_reference;
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: "missing order" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const requestId = request.headers.get("x-request-id") ?? `${paymentId}:${payment.status}`;
    const eventKey = `${paymentId}:${payment.status}:${requestId}`;

    // Idempotency guard: skip duplicate webhook deliveries safely if table exists
    const eventsTable = (
      supabaseAdmin as unknown as {
        from: (t: string) => {
          insert: (
            v: Record<string, unknown>,
          ) => Promise<{ error: { code?: string; message: string } | null }>;
        };
      }
    ).from("payment_webhook_events");
    const dedup = await eventsTable.insert({
      provider: "mercadopago",
      event_key: eventKey,
      external_payment_id: String(payment.id),
      order_id: orderId,
      status: payment.status,
    });
    if (dedup.error?.code === "23505") {
      return new Response(JSON.stringify({ ok: true, deduplicated: true, orderId }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const adminRpc = supabaseAdmin.rpc as unknown as <T = unknown>(
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { message: string } | null }>;

    if (payment.status === "approved") {
      const { error } = await adminRpc("confirm_live_payment", {
        _order_id: orderId,
        _provider: "mercadopago",
        _external_id: String(payment.id),
      });
      if (error) {
        console.error("[mp-webhook] confirm_live_payment failed:", error.message);
        return new Response(JSON.stringify({ error: "payment confirmation failed" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      // Non-blocking buyer confirmation email via Resend
      void (async () => {
        try {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("buyer_id,subtotal,shipping_total")
            .eq("id", orderId)
            .maybeSingle();
          if (!order?.buyer_id) return;
          const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(order.buyer_id);
          const email = userRes?.user?.email;
          if (!email) return;
          const total = Number(order.subtotal ?? 0) + Number(order.shipping_total ?? 0);
          await sendTransactionalEmail(
            buildOrderPaidEmail({ to: email, orderId, totalBrl: total }),
          );
        } catch {
          /* never fail webhook because of notification */
        }
      })();

      return new Response(JSON.stringify({ ok: true, orderId, status: "approved" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (["refunded", "charged_back", "cancelled", "rejected"].includes(payment.status)) {
      await adminRpc("reconcile_payment_status", {
        _order_id: orderId,
        _provider: "mercadopago",
        _external_id: String(payment.id),
        _provider_status: payment.status,
      });
    }

    return new Response(JSON.stringify({ ok: true, orderId, status: payment.status }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[mp-webhook]", e);
    return new Response(JSON.stringify({ error: "webhook failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
