import { mercadoPagoConfigured, sandboxPaymentsAllowed } from "@/lib/payments/mercadopago";

export type LaunchReadiness = {
  ok: true;
  ready: boolean;
  checkedAt: string;
  checks: {
    supabasePublic: boolean;
    supabaseAdmin: boolean;
    schemaApplied: boolean;
    catalogSeeded: boolean;
    pricesSynced: boolean;
    mercadoPago: boolean;
    webhookSecret: boolean;
    publicUrl: boolean;
    emailConfigured: boolean;
    sandboxDisabled: boolean;
  };
  counts: {
    sets: number;
    cards: number;
    priceObservations: number;
    approvedSellers: number;
    commissionRate: number | null;
  };
};

export async function getLaunchReadiness(): Promise<LaunchReadiness> {
  const supabaseUrl = (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").trim();
  const supabaseKey = (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "").trim();
  const serviceKey = (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "").trim();
  const webhookSecret = Boolean(process.env["MP_WEBHOOK_SECRET"]?.trim());
  const publicUrl = Boolean(process.env["APP_PUBLIC_URL"]?.trim());
  const emailConfigured = Boolean(process.env["RESEND_API_KEY"]?.trim());
  const mp = mercadoPagoConfigured();
  const sandboxDisabled = !sandboxPaymentsAllowed();

  const supabasePublic = Boolean(supabaseUrl && supabaseKey);
  const supabaseAdminConfigured = Boolean(supabaseUrl && serviceKey);

  let schemaApplied = false;
  let sets = 0;
  let cards = 0;
  let priceObservations = 0;
  let approvedSellers = 0;
  let commissionRate: number | null = null;

  if (supabaseAdminConfigured) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [setsRes, cardsRes, obsRes, sellersRes, commRes] = await Promise.all([
        supabaseAdmin.from("card_sets").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("cards").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("price_observations").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("sellers").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabaseAdmin.from("platform_settings").select("value").eq("key", "commission_rate").maybeSingle(),
      ]);

      if (!setsRes.error && !cardsRes.error) {
        schemaApplied = true;
        sets = setsRes.count ?? 0;
        cards = cardsRes.count ?? 0;
        priceObservations = obsRes.error ? 0 : (obsRes.count ?? 0);
        approvedSellers = sellersRes.error ? 0 : (sellersRes.count ?? 0);
        if (!commRes.error && commRes.data?.value != null) {
          commissionRate = Number(commRes.data.value);
        }
      }
    } catch {
      schemaApplied = false;
    }
  }

  const catalogSeeded = cards > 0;
  const pricesSynced = priceObservations > 0;
  const ready =
    supabasePublic &&
    supabaseAdminConfigured &&
    schemaApplied &&
    catalogSeeded &&
    mp &&
    webhookSecret &&
    publicUrl &&
    sandboxDisabled;

  return {
    ok: true,
    ready,
    checkedAt: new Date().toISOString(),
    checks: {
      supabasePublic,
      supabaseAdmin: supabaseAdminConfigured,
      schemaApplied,
      catalogSeeded,
      pricesSynced,
      mercadoPago: mp,
      webhookSecret,
      publicUrl,
      emailConfigured,
      sandboxDisabled,
    },
    counts: {
      sets,
      cards,
      priceObservations,
      approvedSellers,
      commissionRate,
    },
  };
}
