import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BULK_EDIT_MAX_LISTINGS,
  planBulkEdit,
  validatePriceRule,
  type BulkEditListing,
} from "@/lib/marketplace/bulk-edit";

type Authed = {
  supabase: {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data?: any; error: { message: string } | null }>;
  };
  userId: string;
};

function auth(context: unknown): Authed {
  const ctx = context as Partial<Authed>;
  if (!ctx.supabase || !ctx.userId) throw new Error("Acesso negado");
  return ctx as Authed;
}

async function assertAdmin(ctx: Authed) {
  const { data, error } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  if (error || !data) throw new Error("Acesso negado");
}

async function assertOwnsSeller(ctx: Authed, sellerId: string) {
  const { data, error } = await ctx.supabase.from("sellers").select("id").eq("id", sellerId).eq("user_id", ctx.userId).maybeSingle();
  if (error || !data) throw new Error("Acesso negado");
}

const sellerStatus = z.enum(["draft", "submitted", "info_requested", "approved", "rejected", "suspended", "blocked"]);

export const setSellerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; status: string; note: string; official?: boolean }) =>
    z.object({ sellerId: z.string().uuid(), status: sellerStatus, note: z.string().max(2000), official: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("admin_set_seller_status", {
      _seller_id: data.sellerId,
      _status: data.status,
      _note: data.note,
      ...(data.official === undefined ? {} : { _official: data.official }),
    });
    if (error) throw new Error(error.message);
  });

export const setPlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: number }) => z.object({ key: z.string().min(1).max(80), value: z.number().finite() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("admin_set_setting", { _key: data.key, _value: data.value });
    if (error) throw new Error(error.message);
  });

export const processPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { payoutId: string; status: string; note: string }) =>
    z.object({ payoutId: z.string().uuid(), status: z.enum(["paid", "rejected"]), note: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("admin_process_payout", { _payout_id: data.payoutId, _status: data.status, _note: data.note });
    if (error) throw new Error(error.message);
  });

export const reviewReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reportId: string; status: string; note: string }) =>
    z.object({ reportId: z.string().uuid(), status: z.string().min(1).max(40), note: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("admin_review_report", { _report_id: data.reportId, _status: data.status, _note: data.note });
    if (error) throw new Error(error.message);
  });

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { disputeId: string; outcome: string; amount: number; note: string }) =>
    z.object({
      disputeId: z.string().uuid(),
      outcome: z.enum(["resolved_refund", "resolved_partial", "resolved_seller"]),
      amount: z.number().finite().min(0),
      note: z.string().max(4000),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    const { error } = await ctx.supabase.rpc("admin_resolve_dispute", {
      _dispute_id: data.disputeId,
      _outcome: data.outcome,
      _amount: data.amount,
      _note: data.note,
    });
    if (error) throw new Error(error.message);
  });

export const requestSellerPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; amount: number; pixKey: string }) =>
    z.object({ sellerId: z.string().uuid(), amount: z.number().positive().finite(), pixKey: z.string().min(3).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertOwnsSeller(ctx, data.sellerId);
    const { error } = await ctx.supabase.rpc("request_payout", { _seller_id: data.sellerId, _amount: data.amount, _pix_key: data.pixKey });
    if (error) throw new Error(error.message);
  });

const listingPatch = z.object({
  price: z.number().positive().finite().optional(),
  quantity: z.number().int().min(0).max(9999).optional(),
  status: z.enum(["active", "paused", "sold_out", "removed"]).optional(),
}).refine((p) => p.price !== undefined || p.quantity !== undefined || p.status !== undefined, "Nada para atualizar");

const adminSellerFields = "id,store_name,is_official,person_type,document,city,state,contact_email,status,operation_type,monthly_volume,categories,sales_history,phone,terms_accepted_at";

export const listAdminSellers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string }) => z.object({ status: sellerStatus.optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    await assertAdmin(ctx);
    let sellersQuery = ctx.supabase.from("sellers").select(adminSellerFields).order("created_at", { ascending: false }).limit(100);
    if (data.status) sellersQuery = sellersQuery.eq("status", data.status);
    const [{ data: sellers, error: sellersError }, { data: logs, error: logsError }, { data: orders, error: ordersError }, { data: rate, error: rateError }] = await Promise.all([
      sellersQuery,
      ctx.supabase.from("seller_status_log").select("id,seller_id,from_status,to_status,note,created_at").order("created_at", { ascending: false }).limit(200),
      ctx.supabase.rpc("get_marketplace_financials"),
      ctx.supabase.from("platform_settings").select("value").eq("key", "commission_rate").maybeSingle(),
    ]);
    if (sellersError || logsError || ordersError || rateError) throw new Error("Acesso negado");
    return { sellers: sellers ?? [], logs: logs ?? [], financials: orders?.[0] ?? null, rate: Number(rate?.value ?? 0) };
  });

export const updateOwnListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string; patch: { price?: number; quantity?: number; status?: string } }) =>
    z.object({ listingId: z.string().uuid(), patch: listingPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    const { data: listing, error: readError } = await ctx.supabase.from("listings").select("id,seller_id,status").eq("id", data.listingId).maybeSingle();
    if (readError || !listing) throw new Error("Anúncio não encontrado");
    const { data: seller, error: sellerError } = await ctx.supabase.from("sellers").select("id,status").eq("id", listing.seller_id).eq("user_id", ctx.userId).maybeSingle();
    if (sellerError || !seller) throw new Error("Acesso negado");
    const nextStatus = data.patch.status ?? listing.status;
    if (nextStatus === "active" && seller.status !== "approved") throw new Error("Acesso negado");
    const { error } = await ctx.supabase.from("listings").update({
      ...(data.patch.price !== undefined ? { price: data.patch.price } : {}),
      ...(data.patch.quantity !== undefined ? { quantity: data.patch.quantity } : {}),
      ...(data.patch.status !== undefined ? { status: data.patch.status } : {}),
    }).eq("id", data.listingId).eq("seller_id", seller.id);
    if (error) throw new Error(error.message);
  });

const bulkEditAction = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("price"),
    rule: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("set"), price: z.number().finite() }),
      z.object({ mode: z.literal("percent"), percent: z.number().finite() }),
    ]),
  }),
  z.object({ kind: z.literal("quantity"), quantity: z.number().int().min(0).max(9999) }),
  z.object({ kind: z.literal("status"), status: z.enum(["active", "paused", "removed"]) }),
]);

export const bulkUpdateOwnListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; listingIds: string[]; action: unknown }) =>
    z
      .object({
        sellerId: z.string().uuid(),
        listingIds: z.array(z.string().uuid()).min(1).max(BULK_EDIT_MAX_LISTINGS),
        action: bulkEditAction,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    if (data.action.kind === "price") {
      const ruleError = validatePriceRule(data.action.rule);
      if (ruleError) throw new Error(ruleError);
    }
    const { data: seller, error: sellerError } = await ctx.supabase
      .from("sellers")
      .select("id,status")
      .eq("id", data.sellerId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (sellerError || !seller) throw new Error("Acesso negado");
    const { data: rows, error: readError } = await ctx.supabase
      .from("listings")
      .select("id,price,quantity,status")
      .eq("seller_id", seller.id)
      .in("id", data.listingIds);
    if (readError) throw new Error("Não foi possível ler os anúncios");
    const plan = planBulkEdit(
      (rows ?? []) as BulkEditListing[],
      data.action,
      seller.status === "approved",
    );
    const failed: { id: string; reason: string }[] = [];
    let updated = 0;
    for (const u of plan.updates) {
      const { error } = await ctx.supabase
        .from("listings")
        .update(u.patch)
        .eq("id", u.id)
        .eq("seller_id", seller.id);
      if (error) failed.push({ id: u.id, reason: error.message });
      else updated++;
    }
    const missing = data.listingIds.filter(
      (id) => !(rows ?? []).some((r: { id: string }) => r.id === id),
    );
    return {
      updated,
      skipped: [
        ...plan.skipped,
        ...failed,
        ...missing.map((id) => ({ id, reason: "Anúncio não encontrado." })),
      ],
    };
  });
