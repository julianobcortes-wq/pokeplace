export const DISPUTE_MAX_ATTACHMENTS = 4;
export const DISPUTE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_EVIDENCE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const STRIKE_APPEAL_MIN_LEN = 20;
export const STRIKE_APPEAL_MAX_LEN = 2000;

export type DisputeDeadlineInfo = {
  overdue: boolean;
  urgent: boolean;
  label: string;
};

export function disputeDeadlineStatus(
  sellerDeadline: string | null | undefined,
  status: string,
  now: number = Date.now(),
): DisputeDeadlineInfo | null {
  if (!sellerDeadline || status !== "open") return null;
  const dueMs = Date.parse(sellerDeadline);
  if (!Number.isFinite(dueMs)) return null;
  const diffHours = Math.round((dueMs - now) / 3_600_000);
  if (diffHours <= 0) {
    return {
      overdue: true,
      urgent: true,
      label: "Prazo da loja vencido — você pode acionar mediação PokePlace",
    };
  }
  if (diffHours <= 12) {
    return {
      overdue: false,
      urgent: true,
      label: `Restam ${diffHours}h para a loja responder`,
    };
  }
  const days = Math.ceil(diffHours / 24);
  return {
    overdue: false,
    urgent: false,
    label: `Loja tem até ${days} dia${days === 1 ? "" : "s"} (${diffHours}h) para responder`,
  };
}

export function validateEvidenceFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_EVIDENCE_MIMES.has(file.type)) {
    return "Envie apenas imagens JPG, PNG ou WebP como evidência.";
  }
  if (file.size <= 0 || file.size > DISPUTE_MAX_FILE_BYTES) {
    return "Cada foto de evidência deve ter no máximo 5 MB.";
  }
  return null;
}

export function validateStrikeAppealReason(reason: string): string | null {
  const len = reason.trim().length;
  if (len < STRIKE_APPEAL_MIN_LEN) {
    return `Descreva os fatos e medidas adotadas com pelo menos ${STRIKE_APPEAL_MIN_LEN} caracteres.`;
  }
  if (len > STRIKE_APPEAL_MAX_LEN) {
    return `O texto da revisão deve ter no máximo ${STRIKE_APPEAL_MAX_LEN} caracteres.`;
  }
  return null;
}
