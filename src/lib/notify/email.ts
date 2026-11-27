import { getCarrierTrackingUrl } from "@/lib/marketplace/shipping";

/**
 * Transactional email sender via Resend API.
 * Safe when RESEND_API_KEY is absent: logs a stub and never throws into critical order flows.
 */
export type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function emailProviderConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]?.trim());
}

export async function sendTransactionalEmail(
  payload: MailPayload,
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env["RESEND_API_KEY"]?.trim();
  const from =
    process.env["RESEND_FROM"]?.trim() ||
    process.env["EMAIL_FROM"]?.trim() ||
    "PokePlace <noreply@pokeplace.local>";
  if (!key) {
    console.info("[email:stub]", payload.subject, "→", payload.to);
    return { sent: false, reason: "RESEND_API_KEY ausente" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        text: payload.text,
        ...(payload.html ? { html: payload.html } : {}),
      }),
    });
    if (!res.ok) return { sent: false, reason: await res.text() };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}

function brl(value: number): string {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

export function buildOrderPaidEmail(input: {
  to: string;
  orderId: string;
  totalBrl: number;
}): MailPayload {
  const shortId = input.orderId.slice(0, 8);
  return {
    to: input.to,
    subject: `Pagamento confirmado — Pedido PokePlace #${shortId}`,
    text: `Seu pagamento de ${brl(input.totalBrl)} via Mercado Pago foi confirmado. A loja já foi avisada para embalar e postar suas cartas dentro do prazo de envio.`,
  };
}

export function buildOrderShippedEmail(input: {
  to: string;
  orderId: string;
  carrier: string;
  trackingCode: string;
}): MailPayload {
  const shortId = input.orderId.slice(0, 8);
  const trackUrl = getCarrierTrackingUrl(input.carrier, input.trackingCode);
  return {
    to: input.to,
    subject: `Seu pedido #${shortId} foi enviado — PokePlace`,
    text: [
      `Boas notícias! Seu pedido #${shortId} foi postado pela loja.`,
      `Transportadora: ${input.carrier || "Correios"}`,
      `Código de rastreio: ${input.trackingCode}`,
      trackUrl ? `Acompanhe aqui: ${trackUrl}` : null,
      `Assim que receber e conferir o estado das cartas, confirme o recebimento no seu painel de pedidos.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildDeliveryWarningEmail(input: { to: string; orderId: string }): MailPayload {
  const shortId = input.orderId.slice(0, 8);
  return {
    to: input.to,
    subject: `Confirme o recebimento do pedido #${shortId} — PokePlace`,
    text: `Seu pedido #${shortId} foi enviado há mais de 5 dias. Se já recebeu e está tudo certo, confirme o recebimento. Caso tenha algum problema, abra uma disputa antes da confirmação automática em 48 horas.`,
  };
}

export function buildShippingSlaWarningEmail(input: {
  to: string;
  orderId: string;
  hoursRemaining: number;
}): MailPayload {
  const shortId = input.orderId.slice(0, 8);
  return {
    to: input.to,
    subject: `Aviso de prazo de postagem — Pedido #${shortId}`,
    text: `Restam aproximadamente ${Math.max(1, Math.round(input.hoursRemaining))}h para postar o pedido #${shortId} e informar o código de rastreio sem impactar seu termômetro de reputação.`,
  };
}

export function buildPriceAlertEmail(input: {
  to: string;
  cardName: string;
  currentBrl: number;
  thresholdBrl: number;
  direction: "below" | "above";
  cardUrl?: string;
}): MailPayload {
  const verb = input.direction === "below" ? "caiu para" : "subiu para";
  return {
    to: input.to,
    subject: `Alerta de preço: ${input.cardName} (${brl(input.currentBrl)}) — PokePlace`,
    text: [
      `Seu alerta para ${input.cardName} foi disparado!`,
      `O preço atual ${verb} ${brl(input.currentBrl)} (seu gatilho: ${brl(input.thresholdBrl)}).`,
      input.cardUrl ? `Veja a carta: ${input.cardUrl}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
