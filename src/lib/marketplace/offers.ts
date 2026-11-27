export const OFFER_MIN_RATIO = 0.5;
export const OFFER_TTL_HOURS = 48;
export const OFFER_MESSAGE_MAX = 300;

export type OfferStatus =
  "pending" | "countered" | "accepted" | "declined" | "expired" | "cancelled";

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: "Aguardando loja",
  countered: "Contra-oferta recebida",
  accepted: "Aceita",
  declined: "Recusada",
  expired: "Expirada",
  cancelled: "Cancelada",
};

export type OfferValidationInput = {
  listingPrice: number;
  offeredPrice: number;
  quantity: number;
  availableStock: number;
  buyerUserId: string;
  sellerUserId: string;
  message?: string | null;
};

export function minAllowedOffer(listingPrice: number): number {
  return Math.max(0.01, Math.round(listingPrice * OFFER_MIN_RATIO * 100) / 100);
}

export function validateOfferSubmission(input: OfferValidationInput): string | null {
  if (!input.buyerUserId) return "Entre na sua conta para fazer uma proposta.";
  if (input.buyerUserId === input.sellerUserId) {
    return "Você não pode enviar proposta para um anúncio da sua própria loja.";
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return "Informe uma quantidade válida.";
  }
  if (input.quantity > input.availableStock) {
    return `Estoque disponível insuficiente (máximo ${input.availableStock}).`;
  }
  if (!Number.isFinite(input.offeredPrice) || input.offeredPrice <= 0) {
    return "Informe um valor de proposta válido.";
  }
  const minOffer = minAllowedOffer(input.listingPrice);
  if (input.offeredPrice < minOffer) {
    return `A proposta mínima é de R$ ${minOffer.toFixed(2).replace(".", ",")} (${Math.round(OFFER_MIN_RATIO * 100)}% do preço).`;
  }
  if (input.offeredPrice >= input.listingPrice) {
    return "A proposta deve ser menor que o preço anunciado — para o valor cheio, adicione ao carrinho.";
  }
  if (input.message && input.message.trim().length > OFFER_MESSAGE_MAX) {
    return `A mensagem deve ter no máximo ${OFFER_MESSAGE_MAX} caracteres.`;
  }
  return null;
}

export function validateCounterOffer(input: {
  listingPrice: number;
  offeredPrice: number;
  counterPrice: number;
}): string | null {
  if (!Number.isFinite(input.counterPrice) || input.counterPrice <= 0) {
    return "Informe um valor válido para a contra-oferta.";
  }
  if (input.counterPrice <= input.offeredPrice) {
    return "A contra-oferta deve ser maior que a proposta do comprador (ou aceite a proposta diretamente).";
  }
  if (input.counterPrice > input.listingPrice) {
    return "A contra-oferta não pode exceder o preço original do anúncio.";
  }
  return null;
}

export function isOfferExpired(expiresAt: string, now: number = Date.now()): boolean {
  const ts = Date.parse(expiresAt);
  if (!Number.isFinite(ts)) return true;
  return ts <= now;
}

export function formatOfferRemaining(expiresAt: string, now: number = Date.now()): string {
  const diffMs = Date.parse(expiresAt) - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return "Expirada";
  const hours = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${mins}m restantes`;
  return `${Math.max(1, mins)}m restantes`;
}
