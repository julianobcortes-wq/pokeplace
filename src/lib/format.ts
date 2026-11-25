export const BRAND = { name: "PokePlace", tagline: "Marketplace e inteligência de preços Pokémon TCG" };

export const money = (v: number, currency = "BRL") =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency });

export const CONDITIONS: Record<string, string> = {
  M: "Mint (M)", NM: "Near Mint (NM)", SP: "Slightly Played (SP)", MP: "Moderately Played (MP)", HP: "Heavily Played (HP)", D: "Danificada (D)",
};
export const LANGUAGES: Record<string, string> = { en: "Inglês", pt: "Português", ja: "Japonês", es: "Espanhol", fr: "Francês", de: "Alemão", it: "Italiano", ko: "Coreano", zh: "Chinês" };
export const FINISHES: Record<string, string> = { normal: "Normal", holo: "Holo", reverse: "Reverse Holo", first_edition: "1ª edição" };

export const SELLER_STATUS: Record<string, string> = {
  draft: "Cadastro iniciado", submitted: "Em análise", info_requested: "Documentação solicitada",
  approved: "Aprovado", rejected: "Rejeitado", suspended: "Suspenso", blocked: "Bloqueado",
};
export const ORDER_STATUS: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento", paid: "Pago", shipped: "Enviado", delivered: "Entregue", cancelled: "Cancelado",
};
