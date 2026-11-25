import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectChannel, disconnectChannel, listSnapshots, syncCatalog, syncOrders } from "./hub";

const sellerInput = z.object({
  sellerId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
});

const channelInput = z.object({
  sellerId: z.string().uuid(),
  channelId: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
});

type Authed = { supabase: { from: (table: string) => any }; userId: string };

async function assertOwnsSeller(context: unknown, sellerId: string) {
  const ctx = context as Partial<Authed>;
  if (!ctx.supabase || !ctx.userId) throw new Error("Acesso negado");
  const { data, error } = await ctx.supabase.from("sellers").select("id").eq("id", sellerId).eq("user_id", ctx.userId).maybeSingle();
  if (error || !data) throw new Error("Acesso negado");
}

export const listChannelSnapshots = createServerFn({ method: "GET" })
  .inputValidator((d: { sellerId: string }) => sellerInput.parse(d))
  .handler(async ({ data }) => listSnapshots(data.sellerId));

export const connectSellerChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsSeller(context, data.sellerId);
    return connectChannel(data.sellerId, data.channelId);
  });

export const disconnectSellerChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsSeller(context, data.sellerId);
    return disconnectChannel(data.sellerId, data.channelId);
  });

export const syncSellerCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsSeller(context, data.sellerId);
    return syncCatalog(data.sellerId, data.channelId);
  });

export const syncSellerOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsSeller(context, data.sellerId);
    return syncOrders(data.sellerId, data.channelId);
  });
