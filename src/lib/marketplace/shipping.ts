export const BRAZILIAN_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type BrazilianUf = (typeof BRAZILIAN_UFS)[number];

export const BRAZIL_REGIONS: Record<string, readonly BrazilianUf[]> = {
  Sudeste: ["SP", "RJ", "MG", "ES"],
  Sul: ["PR", "SC", "RS"],
  "Centro-Oeste": ["DF", "GO", "MT", "MS"],
  Nordeste: ["BA", "PE", "CE", "RN", "PB", "AL", "SE", "PI", "MA"],
  Norte: ["AM", "PA", "RO", "AC", "RR", "AP", "TO"],
};

export type ShippingCarrierId =
  "correios" | "jadlog" | "loggi" | "azul_cargo" | "melhor_envio" | "outro";

export const SHIPPING_CARRIERS: {
  id: ShippingCarrierId;
  name: string;
  trackingUrl?: (code: string) => string;
}[] = [
  {
    id: "correios",
    name: "Correios",
    trackingUrl: (code) =>
      `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(code)}`,
  },
  {
    id: "jadlog",
    name: "Jadlog",
    trackingUrl: (code) => `https://www.jadlog.com.br/tracking?cte=${encodeURIComponent(code)}`,
  },
  {
    id: "loggi",
    name: "Loggi",
    trackingUrl: (code) => `https://www.loggi.com/rastreador/${encodeURIComponent(code)}`,
  },
  {
    id: "azul_cargo",
    name: "Azul Cargo",
    trackingUrl: (code) =>
      `https://www.azulcargoexpress.com.br/Rastreio/Rastreio?codigo=${encodeURIComponent(code)}`,
  },
  {
    id: "melhor_envio",
    name: "Melhor Envio",
    trackingUrl: (code) => `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(code)}`,
  },
  { id: "outro", name: "Outra transportadora" },
];

export type ShippingProfileLike = {
  flat_fee: number | string;
  free_over?: number | string | null;
  handling_days?: number | null;
  state_rates?: Record<string, number> | null;
  preferred_carrier?: string | null;
  local_pickup?: boolean | null;
};

export function normalizeUf(raw: string | null | undefined): BrazilianUf | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return (BRAZILIAN_UFS as readonly string[]).includes(upper) ? (upper as BrazilianUf) : null;
}

export function sanitizeStateRates(
  input: Record<string, unknown> | null | undefined,
): Record<string, number> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(input)) {
    const uf = normalizeUf(key);
    if (!uf) continue;
    const num = Number(val);
    if (Number.isFinite(num) && num >= 0 && num <= 500) {
      out[uf] = Math.round(num * 100) / 100;
    }
  }
  return out;
}

export type ShippingQuote = {
  fee: number;
  isFree: boolean;
  freeRemaining: number | null;
  appliedUf: BrazilianUf | null;
  source: "free_threshold" | "uf_rate" | "flat_fee" | "default";
};

export function calculateStoreShipping(
  profile: ShippingProfileLike | null | undefined,
  subtotal: number,
  destinationUf?: string | null,
): ShippingQuote {
  if (!profile) {
    return { fee: 0, isFree: true, freeRemaining: null, appliedUf: null, source: "default" };
  }
  const freeOver = profile.free_over != null ? Number(profile.free_over) : null;
  const uf = normalizeUf(destinationUf);
  const rates = sanitizeStateRates(profile.state_rates);
  const ufRate = uf && uf in rates ? rates[uf] : undefined;
  const baseFee = ufRate !== undefined ? ufRate : Math.max(0, Number(profile.flat_fee) || 0);

  if (freeOver != null && freeOver > 0 && subtotal >= freeOver) {
    return {
      fee: 0,
      isFree: true,
      freeRemaining: 0,
      appliedUf: uf,
      source: "free_threshold",
    };
  }

  const freeRemaining =
    freeOver != null && freeOver > 0
      ? Math.max(0, Math.round((freeOver - subtotal) * 100) / 100)
      : null;

  return {
    fee: Math.round(baseFee * 100) / 100,
    isFree: baseFee === 0,
    freeRemaining,
    appliedUf: uf,
    source: ufRate !== undefined ? "uf_rate" : "flat_fee",
  };
}

export function getCarrierTrackingUrl(
  carrier: string | null | undefined,
  code: string | null | undefined,
): string | null {
  const clean = (code ?? "").trim();
  if (!clean) return null;
  const normalized = (carrier ?? "").trim().toLowerCase();
  const match = SHIPPING_CARRIERS.find(
    (c) => c.id === normalized || c.name.toLowerCase() === normalized,
  );
  if (match?.trackingUrl) return match.trackingUrl(clean);
  // Default Correios format detection (e.g. BR123456789BR)
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(clean)) {
    return `https://rastreamento.correios.com.br/app/index.php?objetos=${encodeURIComponent(clean)}`;
  }
  return `https://www.melhorrastreio.com.br/rastreio/${encodeURIComponent(clean)}`;
}
