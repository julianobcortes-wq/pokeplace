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

/**
 * Returns true when a real Supabase URL + publishable key are configured in the
 * current runtime (Vite env, SSR-injected meta tags, or server process.env).
 * Prevents unconfigured local previews from firing doomed requests to 127.0.0.1:54321.
 */
export function isSupabaseConfigured(): boolean {
  const browserCfg = readBrowserPublicConfig();
  const serverEnv = typeof process !== "undefined" ? process.env : undefined;
  const url = (
    (import.meta.env?.["VITE_SUPABASE_URL"] as string | undefined) ||
    browserCfg.supabaseUrl ||
    serverEnv?.["SUPABASE_URL"] ||
    ""
  ).trim();
  const key = (
    (import.meta.env?.["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ||
    browserCfg.supabasePublishableKey ||
    serverEnv?.["SUPABASE_PUBLISHABLE_KEY"] ||
    ""
  ).trim();
  return Boolean(url && key);
}
