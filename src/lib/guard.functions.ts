import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Authed = {
  supabase: {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
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

export const updateOwnListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { listingId: string; patch: { price?: number; quantity?: number; status?: string } }) =>
    z.object({ listingId: z.string().uuid(), patch: listingPatch }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = auth(context);
    const { data: listing, error: readError } = await ctx.supabase.from("listings").select("id,seller_id").eq("id", data.listingId).maybeSingle();
    if (readError || !listing) throw new Error("Anúncio não encontrado");
    await assertOwnsSeller(ctx, listing.seller_id);
    const { error } = await ctx.supabase.from("listings").update(data.patch).eq("id", data.listingId).eq("seller_id", listing.seller_id);
    if (error) throw new Error(error.message);
  });
