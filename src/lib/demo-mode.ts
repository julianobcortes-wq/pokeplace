/**
 * Static GitHub Pages demo mode flag.
 * Only enabled when built with VITE_DEMO_MODE=true (vite.pages.config.ts);
 * always false in production Cloudflare Workers / Supabase builds and unit tests.
 */
export function isDemoMode(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return env?.["VITE_DEMO_MODE"] === "true";
}

export const DEMO_USER = {
  id: "demo-collector",
  email: "colecionador@demo.pokeplace.br",
  displayName: "Colecionador Demo",
} as const;

export const DEMO_COUPON_CODE = "DEMO10";
