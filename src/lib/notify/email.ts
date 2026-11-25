/**
 * Transactional email stub. Wire RESEND_API_KEY (or another provider) later.
 * Never throw into the purchase path — log and continue.
 */
export type MailPayload = {
  to: string;
  subject: string;
  text: string;
};

export async function sendTransactionalEmail(payload: MailPayload): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env["RESEND_API_KEY"]?.trim();
  const from = process.env["EMAIL_FROM"]?.trim() || "PokePlace <noreply@pokeplace.local>";
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
      body: JSON.stringify({ from, to: [payload.to], subject: payload.subject, text: payload.text }),
    });
    if (!res.ok) return { sent: false, reason: await res.text() };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}
