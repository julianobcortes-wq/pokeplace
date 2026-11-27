/**
 * Pure Mercado Livre-style marketplace rules engine for PokePlace.
 * Mirrors the PostgreSQL SECURITY DEFINER logic in scripts/sql/all-migrations.sql
 * so the UI, preview mode, and automated tests share identical thresholds.
 */

export type ThermometerLevel = "new" | "red" | "orange" | "yellow" | "light_green" | "green";
export type SellerMedal = "none" | "lider" | "lider_gold" | "lider_platinum";
export type StrikeStatus = "ok" | "warning" | "restricted";
export type BuyerTier = "novo" | "regular" | "confiavel" | "ouro" | "vip";

export type SellerMetricsInput = {
  rating: number;
  reviews: number;
  completedSales: number;
  cancelled: number;
  totalItems: number;
  claims: number;
  onTimeRate?: number; // 0..100, defaults to 100 when no shipped items
  avgResponseHours?: number | null;
  strikeCleared?: boolean;
  maxClaimRatePct?: number;
  maxCancelRatePct?: number;
};

export type SellerThermometerResult = {
  claimRate: number;
  cancelRate: number;
  onTimeRate: number;
  thermometer: ThermometerLevel;
  thermometerLabel: string;
  thermometerStep: number; // 0 (new) .. 5 (green)
  medal: SellerMedal;
  medalLabel: string | null;
  strikeStatus: StrikeStatus;
  score: number;
};

export const THERMOMETER_META: Record<
  ThermometerLevel,
  { label: string; step: number; summary: string; textClass: string }
> = {
  new: {
    label: "Loja nova",
    step: 0,
    summary: "Ainda acumulando as primeiras 3 vendas ou avaliações verificadas.",
    textClass: "text-muted-foreground",
  },
  red: {
    label: "Crítica",
    step: 1,
    summary: "Muitos problemas, cancelamentos ou atrasos recentes.",
    textClass: "text-destructive",
  },
  orange: {
    label: "Atenção",
    step: 2,
    summary: "Índices abaixo do padrão esperado pela plataforma.",
    textClass: "text-chart-5",
  },
  yellow: {
    label: "Regular",
    step: 3,
    summary: "Atendimento aceitável, mas com margem para melhorar prazos.",
    textClass: "text-chart-4",
  },
  light_green: {
    label: "Muito boa",
    step: 4,
    summary: "Bom histórico de entregas no prazo e poucas ocorrências.",
    textClass: "text-success/80",
  },
  green: {
    label: "Excelente",
    step: 5,
    summary: "Excelência em prazo, embalagem e índice mínimo de reclamações.",
    textClass: "text-success",
  },
};

export const MEDAL_META: Record<SellerMedal, { label: string | null; minSales: number; description: string }> = {
  none: { label: null, minSales: 0, description: "Sem medalha de volume ainda." },
  lider: {
    label: "PokeLíder",
    minSales: 25,
    description: "25+ vendas concluídas com termômetro verde escuro.",
  },
  lider_gold: {
    label: "PokeLíder Gold",
    minSales: 75,
    description: "75+ vendas concluídas com termômetro verde escuro.",
  },
  lider_platinum: {
    label: "PokeLíder Platinum",
    minSales: 250,
    description: "250+ vendas concluídas com excelência máxima na plataforma.",
  },
};

export const BUYER_TIER_META: Record<BuyerTier, { label: string; badgeClass: string; description: string }> = {
  novo: {
    label: "Novo",
    badgeClass: "bg-muted text-muted-foreground",
    description: "Primeiros passos no PokePlace.",
  },
  regular: {
    label: "Colecionador",
    badgeClass: "bg-secondary text-secondary-foreground",
    description: "1+ compra concluída com pagamento verificado.",
  },
  confiavel: {
    label: "Confiável",
    badgeClass: "bg-primary/15 text-primary",
    description: "5+ compras concluídas com boa avaliação das lojas.",
  },
  ouro: {
    label: "Colecionador Ouro",
    badgeClass: "bg-chart-4/20 text-chart-4",
    description: "15+ compras concluídas e histórico exemplar.",
  },
  vip: {
    label: "Colecionador VIP",
    badgeClass: "bg-success/15 text-success",
    description: "30+ compras concluídas, nota 4,7+ e quase zero disputas improcedentes.",
  },
};

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeSellerThermometer(input: SellerMetricsInput): SellerThermometerResult {
  const totalItems = Math.max(0, input.totalItems);
  const completedSales = Math.max(0, input.completedSales);
  const reviews = Math.max(0, input.reviews);
  const rating = Math.max(0, Math.min(5, input.rating));
  const claims = Math.max(0, input.claims);
  const cancelled = Math.max(0, input.cancelled);
  const maxClaim = input.maxClaimRatePct ?? 5;
  const maxCancel = input.maxCancelRatePct ?? 5;

  const claimRate = totalItems > 0 ? round1((claims / totalItems) * 100) : 0;
  const cancelRate = totalItems > 0 ? round1((cancelled / totalItems) * 100) : 0;
  const onTimeRate = round1(Math.max(0, Math.min(100, input.onTimeRate ?? 100)));

  let thermometer: ThermometerLevel = "green";
  if (completedSales < 3 && reviews < 3) {
    thermometer = "new";
  } else if (claimRate > 8 || cancelRate > 8 || onTimeRate < 75 || (reviews >= 3 && rating < 3.2)) {
    thermometer = "red";
  } else if (claimRate > 5 || cancelRate > 5 || onTimeRate < 85 || (reviews >= 3 && rating < 3.8)) {
    thermometer = "orange";
  } else if (claimRate > 3 || cancelRate > 3 || onTimeRate < 90 || (reviews >= 3 && rating < 4.3)) {
    thermometer = "yellow";
  } else if (claimRate > 2 || cancelRate > 2 || onTimeRate < 95 || (reviews >= 3 && rating < 4.7)) {
    thermometer = "light_green";
  } else {
    thermometer = "green";
  }

  let medal: SellerMedal = "none";
  if (thermometer === "green") {
    if (completedSales >= 250) medal = "lider_platinum";
    else if (completedSales >= 75) medal = "lider_gold";
    else if (completedSales >= 25) medal = "lider";
  }

  let strikeStatus: StrikeStatus = "ok";
  if (totalItems >= 5 && (claimRate > maxClaim || cancelRate > maxCancel)) {
    strikeStatus = input.strikeCleared ? "warning" : "restricted";
  } else if (totalItems >= 5 && (claimRate > maxClaim * 0.6 || cancelRate > maxCancel * 0.6 || onTimeRate < 90)) {
    strikeStatus = "warning";
  }

  const medalBonus =
    medal === "lider_platinum" ? 120 : medal === "lider_gold" ? 75 : medal === "lider" ? 35 : 0;

  const rawScore =
    rating * 120 +
    Math.min(completedSales, 500) * 0.6 +
    onTimeRate * 1.5 -
    claimRate * 12 -
    cancelRate * 10 +
    medalBonus;

  const meta = THERMOMETER_META[thermometer];
  return {
    claimRate,
    cancelRate,
    onTimeRate,
    thermometer,
    thermometerLabel: meta.label,
    thermometerStep: meta.step,
    medal,
    medalLabel: MEDAL_META[medal].label,
    strikeStatus,
    score: Math.max(0, round1(rawScore)),
  };
}

export type BuyerMetricsInput = {
  completedPurchases: number;
  rating: number;
  reviews: number;
  disputesLost: number;
};

export function computeBuyerTier(input: BuyerMetricsInput): {
  tier: BuyerTier;
  label: string;
  disputeRate: number;
  score: number;
} {
  const purchases = Math.max(0, input.completedPurchases);
  const reviews = Math.max(0, input.reviews);
  const rating = Math.max(0, Math.min(5, input.rating));
  const disputeRate = purchases > 0 ? round1((Math.max(0, input.disputesLost) / purchases) * 100) : 0;

  let tier: BuyerTier = "novo";
  if (purchases >= 30 && (reviews === 0 || rating >= 4.7) && disputeRate <= 2) {
    tier = "vip";
  } else if (purchases >= 15 && (reviews === 0 || rating >= 4.5) && disputeRate <= 4) {
    tier = "ouro";
  } else if (purchases >= 5 && (reviews === 0 || rating >= 4.2) && disputeRate <= 6) {
    tier = "confiavel";
  } else if (purchases >= 1) {
    tier = "regular";
  }

  const score = Math.max(0, round1(purchases * 12 + rating * 60 - disputeRate * 8));
  return { tier, label: BUYER_TIER_META[tier].label, disputeRate, score };
}

/** Art. 49 CDC — 7-day right of regret after delivery timestamp. */
export function isWithinRegretWindow(
  deliveredAt: string | Date | null | undefined,
  now: Date = new Date(),
  windowDays = 7,
): boolean {
  if (!deliveredAt) return false;
  const deliveredMs = deliveredAt instanceof Date ? deliveredAt.getTime() : Date.parse(deliveredAt);
  if (!Number.isFinite(deliveredMs)) return false;
  const diffMs = now.getTime() - deliveredMs;
  return diffMs >= 0 && diffMs <= windowDays * 24 * 60 * 60 * 1000;
}

/** Shipping SLA countdown label for sellers. */
export function shippingSlaStatus(
  shipBy: string | Date | null | undefined,
  now: Date = new Date(),
): { overdue: boolean; urgent: boolean; label: string } | null {
  if (!shipBy) return null;
  const deadlineMs = shipBy instanceof Date ? shipBy.getTime() : Date.parse(shipBy);
  if (!Number.isFinite(deadlineMs)) return null;
  const hoursLeft = (deadlineMs - now.getTime()) / (1000 * 60 * 60);
  if (hoursLeft < 0) {
    const lateHours = Math.ceil(Math.abs(hoursLeft));
    return {
      overdue: true,
      urgent: true,
      label: lateHours >= 24 ? `Atrasado há ${Math.floor(lateHours / 24)}d` : `Atrasado há ${lateHours}h`,
    };
  }
  if (hoursLeft <= 24) {
    return {
      overdue: false,
      urgent: true,
      label: `Postar em até ${Math.max(1, Math.ceil(hoursLeft))}h`,
    };
  }
  return {
    overdue: false,
    urgent: false,
    label: `Postar até ${new Date(deadlineMs).toLocaleDateString("pt-BR")}`,
  };
}

/** Human-friendly response-time string for store headers & rankings. */
export function formatResponseTime(avgHours: number | null | undefined): string {
  if (avgHours == null || !Number.isFinite(avgHours) || avgHours < 0) return "Sem histórico";
  if (avgHours < 1) return "Responde em < 1h";
  if (avgHours < 24) return `Responde em ~${Math.round(avgHours)}h`;
  const days = Math.round(avgHours / 24);
  return `Responde em ~${days}d`;
}

/** Maps legacy 5-step `level` (nova/regular/boa/otima/excelente) to ThermometerLevel when needed. */
export function legacyLevelToThermometer(level: string | null | undefined): ThermometerLevel {
  switch (level) {
    case "excelente":
      return "green";
    case "otima":
      return "light_green";
    case "boa":
      return "yellow";
    case "regular":
      return "orange";
    default:
      return "new";
  }
}
