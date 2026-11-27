import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLaunchReadiness } from "./readiness";
import { importCatalogBatch, importSeededCatalog, syncPricesBatch } from "./sync-runner";

type Authed = {
  supabase: { from: (table: string) => any };
  userId: string;
};

async function assertAdmin(context: unknown) {
  const ctx = context as Partial<Authed>;
  if (!ctx.supabase || !ctx.userId) throw new Error("Acesso negado");
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error || !data) throw new Error("Acesso negado");
}

export const getAdminReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return getLaunchReadiness();
  });

export const runAdminCatalogImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { setIds: string[] }) =>
    z.object({ setIds: z.array(z.string().regex(/^[a-z0-9]{2,16}$/i)).min(1).max(4) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return importCatalogBatch(data.setIds);
  });

export const runAdminSeedCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return importSeededCatalog();
  });

export const runAdminPriceSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number }) =>
    z.object({ limit: z.number().int().min(1).max(40).default(25) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    return syncPricesBatch(data.limit);
  });
