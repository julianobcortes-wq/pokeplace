import { createServerFn } from "@tanstack/react-start";

export type PublicRuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

/**
 * Exposes ONLY public client-safe configuration (URL + publishable anon key)
 * so browsers on hosts that inject runtime env vars without a VITE_ prefix
 * connect to the live Supabase project instead of localhost.
 */
export const getPublicRuntimeConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicRuntimeConfig> => ({
    supabaseUrl: (process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"] ?? "").trim(),
    supabasePublishableKey: (
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      ""
    ).trim(),
  }),
);

export function readBrowserPublicConfig(): Partial<PublicRuntimeConfig> {
  if (typeof document === "undefined") return {};
  const url = document.querySelector('meta[name="pokeplace:supabase-url"]')?.getAttribute("content")?.trim() ?? "";
  const key = document.querySelector('meta[name="pokeplace:supabase-key"]')?.getAttribute("content")?.trim() ?? "";
  return {
    ...(url ? { supabaseUrl: url } : {}),
    ...(key ? { supabasePublishableKey: key } : {}),
  };
}
