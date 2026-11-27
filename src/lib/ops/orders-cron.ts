import { buildDeliveryWarningEmail, buildPriceAlertEmail, sendTransactionalEmail } from "@/lib/notify/email";

export type OrdersMaintenanceSummary = {
  expiredOrdersRan: boolean;
  expiredOffersCount: number;
  autoConfirmedDeliveriesCount: number;
  deliveryWarningsSent: number;
  priceAlertsTriggered: number;
  notes: string[];
};

/**
 * Runs periodic marketplace maintenance safely using service_role:
 * 1. Expires unpaid orders past reservation TTL and releases stock.
 * 2. Expires stale listing offers past 48h TTL.
 * 3. Auto-confirms shipped orders past delivery window without open disputes.
 * 4. Sends pre-confirmation email notices to buyers with orders shipped 5–7 days ago.
 */
export async function runOrdersMaintenance(): Promise<OrdersMaintenanceSummary> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminRpc = supabaseAdmin.rpc as unknown as <T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string } | null }>;

  const summary: OrdersMaintenanceSummary = {
    expiredOrdersRan: false,
    expiredOffersCount: 0,
    autoConfirmedDeliveriesCount: 0,
    deliveryWarningsSent: 0,
    priceAlertsTriggered: 0,
    notes: [],
  };

  const expOrders = await adminRpc("expire_unpaid_orders");
  if (expOrders.error) summary.notes.push(`expire_unpaid_orders: ${expOrders.error.message}`);
  else summary.expiredOrdersRan = true;

  const expOffers = await adminRpc<number>("expire_stale_offers");
  if (expOffers.error) summary.notes.push(`expire_stale_offers: ${expOffers.error.message}`);
  else summary.expiredOffersCount = Number(expOffers.data ?? 0);

  const autoConfirm = await adminRpc<number>("auto_confirm_delivered_orders");
  if (autoConfirm.error)
    summary.notes.push(`auto_confirm_delivered_orders: ${autoConfirm.error.message}`);
  else summary.autoConfirmedDeliveriesCount = Number(autoConfirm.data ?? 0);

  const warnings = await adminRpc<{ order_id: string; buyer_id: string }[]>(
    "list_orders_needing_delivery_warning",
  );
  if (!warnings.error && Array.isArray(warnings.data)) {
    for (const row of warnings.data.slice(0, 50)) {
      try {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.buyer_id);
        const email = userRes?.user?.email;
        if (!email) continue;
        await sendTransactionalEmail(
          buildDeliveryWarningEmail({ to: email, orderId: row.order_id }),
        );
        summary.deliveryWarningsSent++;
      } catch {
        /* never abort maintenance loop on individual notification error */
      }
    }
  }

  const alertsRes = await adminRpc<
    Array<{
      alert_id: string;
      user_id: string;
      card_id: string;
      card_name: string;
      direction: string;
      target_brl: number;
      current_price: number;
    }>
  >("evaluate_price_alerts");
  if (!alertsRes.error && Array.isArray(alertsRes.data)) {
    for (const row of alertsRes.data) {
      summary.priceAlertsTriggered++;
      try {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
        const email = userRes?.user?.email;
        if (!email) continue;
        await sendTransactionalEmail(
          buildPriceAlertEmail({
            to: email,
            cardName: row.card_name,
            currentBrl: Number(row.current_price),
            thresholdBrl: Number(row.target_brl),
            direction: row.direction === "above" ? "above" : "below",
            cardUrl: `/carta/${row.card_id}`,
          }),
        );
      } catch {
        /* keep loop resilient */
      }
    }
  } else if (alertsRes.error) {
    summary.notes.push(`evaluate_price_alerts: ${alertsRes.error.message}`);
  }

  return summary;
}
