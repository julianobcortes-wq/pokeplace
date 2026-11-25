export type MpPreference = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

function accessToken(): string | null {
  return process.env["MP_ACCESS_TOKEN"]?.trim() || null;
}

export function mercadoPagoConfigured(): boolean {
  return Boolean(accessToken());
}

export async function createCheckoutPreference(input: {
  orderId: string;
  title: string;
  amount: number;
  payerEmail?: string | null;
}): Promise<MpPreference> {
  const token = accessToken();
  if (!token) throw new Error("Mercado Pago não configurado");

  const base = (process.env["APP_PUBLIC_URL"] ?? "").replace(/\/+$/, "") || "http://127.0.0.1:8080";
  const body = {
    external_reference: input.orderId,
    items: [
      {
        id: input.orderId,
        title: input.title.slice(0, 120),
        quantity: 1,
        currency_id: "BRL",
        unit_price: Math.round(input.amount * 100) / 100,
      },
    ],
    payer: input.payerEmail ? { email: input.payerEmail } : undefined,
    back_urls: {
      success: `${base}/pedidos/${input.orderId}`,
      pending: `${base}/pedidos/${input.orderId}`,
      failure: `${base}/pedidos/${input.orderId}`,
    },
    auto_return: "approved",
    notification_url: `${base}/api/mercadopago/webhook`,
    metadata: { order_id: input.orderId },
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mercado Pago preference: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as MpPreference;
  if (!data.id || !data.init_point) throw new Error("Resposta inválida do Mercado Pago");
  return data;
}

export async function fetchMercadoPagoPayment(paymentId: string): Promise<{
  id: number | string;
  status: string;
  external_reference?: string;
  transaction_amount?: number;
}> {
  const token = accessToken();
  if (!token) throw new Error("Mercado Pago não configurado");
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago payment: ${res.status}`);
  return (await res.json()) as { id: number | string; status: string; external_reference?: string; transaction_amount?: number };
}

export function verifyWebhookSecret(request: Request): boolean {
  const expected = process.env["MP_WEBHOOK_SECRET"]?.trim();
  if (!expected) return true; // secret optional until configured
  const got = request.headers.get("x-signature") || request.headers.get("x-hub-signature") || "";
  const qs = new URL(request.url).searchParams.get("secret") || "";
  return got === expected || qs === expected;
}
