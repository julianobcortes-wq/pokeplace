import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { connectChannel, disconnectChannel, listSnapshots, syncCatalog, syncOrders } from "./hub";

const sellerInput = z.object({
  sellerId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
});

const channelInput = sellerInput.extend({
  channelId: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
});

export const listChannelSnapshots = createServerFn({ method: "GET" })
  .inputValidator((d: { sellerId: string }) => sellerInput.parse(d))
  .handler(async ({ data }) => listSnapshots(data.sellerId));

export const connectSellerChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data }) => connectChannel(data.sellerId, data.channelId));

export const disconnectSellerChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data }) => disconnectChannel(data.sellerId, data.channelId));

export const syncSellerCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data }) => syncCatalog(data.sellerId, data.channelId));

export const syncSellerOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sellerId: string; channelId: string }) => channelInput.parse(d))
  .handler(async ({ data }) => syncOrders(data.sellerId, data.channelId));
