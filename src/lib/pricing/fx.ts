import { createServerFn } from "@tanstack/react-start";

export type FxRates = {
  USD: number;
  EUR: number;
  BRL: 1;
  live: boolean;
  asOf: string;
};

/** Conservative market fallback rates used only if live FX endpoint is unreachable. */
export const FALLBACK_FX: FxRates = {
  USD: 5.75,
  EUR: 6.2,
  BRL: 1,
  live: false,
  asOf: "fallback",
};

const TTL_MS = 6 * 60 * 60 * 1000;
let cached: { at: number; rates: FxRates } | null = null;

/**
 * Fetches live USD->BRL and EUR->BRL exchange rates (ECB/Frankfurter public API)
 * with a 6-hour in-memory cache and fast timeout fallback.
 */
export async function getFxRates(): Promise<FxRates> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2200);
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=BRL,EUR", { signal: ctrl.signal });
    if (res.ok) {
      const body = (await res.json()) as { date?: string; rates?: { BRL?: number; EUR?: number } };
      const usdToBrl = Number(body.rates?.BRL);
      const usdToEur = Number(body.rates?.EUR);
      if (Number.isFinite(usdToBrl) && usdToBrl > 1 && Number.isFinite(usdToEur) && usdToEur > 0) {
        const rates: FxRates = {
          USD: Math.round(usdToBrl * 100) / 100,
          EUR: Math.round((usdToBrl / usdToEur) * 100) / 100,
          BRL: 1,
          live: true,
          asOf: body.date ?? new Date().toISOString().slice(0, 10),
        };
        cached = { at: Date.now(), rates };
        return rates;
      }
    }
  } catch {
    /* fallback below */
  } finally {
    clearTimeout(timer);
  }

  return FALLBACK_FX;
}

export function fxRateToBrl(currency: string | null | undefined, rates: FxRates): number {
  const code = (currency ?? "USD").toUpperCase();
  if (code === "BRL") return 1;
  if (code === "EUR") return rates.EUR;
  return rates.USD;
}

export function convertToBrl(amount: number, currency: string | null | undefined, rates: FxRates): number {
  return Math.round(amount * fxRateToBrl(currency, rates) * 100) / 100;
}

export const getFxRatesFn = createServerFn({ method: "GET" }).handler(() => getFxRates());
