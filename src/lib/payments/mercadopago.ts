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

export function sandboxPaymentsAllowed(): boolean {
  return process.env["ALLOW_SANDBOX_PAYMENTS"]?.trim() === "true" && !mercadoPagoConfigured();
}

export async function createCheckoutPreference(input: {
  orderId: string;
  title: string;
  amount: number;
  payerEmail?: string | null;
}): Promise<MpPreference> {
  const token = accessToken();
  if (!token) throw new Error("Mercado Pago não configurado");

  const base = (process.env["APP_PUBLIC_URL"] ?? "").replace(/\/+$/, "");
  if (!base) throw new Error("APP_PUBLIC_URL é obrigatória para o checkout");
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

function parseSignatureHeader(header: string): { ts: string; v1: string } | null {
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.trim().split("=");
      return [k, rest.join("=")];
    }),
  );
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fail closed: requires MP_WEBHOOK_SECRET and a valid Mercado Pago x-signature.
 * Docs: manifest = id:{data.id};request-id:{x-request-id};ts:{ts};
 */
export async function verifyMercadoPagoWebhook(request: Request, dataId: string | null): Promise<boolean> {
  const secret = process.env["MP_WEBHOOK_SECRET"]?.trim();
  if (!secret) return false;
  if (!dataId) return false;

  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signatureHeader || !requestId) return false;

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${parsed.ts};`;
  const expected = await hmacSha256Hex(secret, manifest);
  if (expected.length !== parsed.v1.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) ok |= expected.charCodeAt(i) ^ parsed.v1.charCodeAt(i);
  return ok === 0;
}
