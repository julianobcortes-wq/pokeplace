import { describe, expect, it } from "vitest";
import {
  DISPUTE_MAX_FILE_BYTES,
  disputeDeadlineStatus,
  validateEvidenceFile,
  validateStrikeAppealReason,
} from "@/lib/marketplace/disputes";

describe("dispute SLA countdown", () => {
  const now = new Date("2026-11-27T12:00:00Z").getTime();

  it("returns null for resolved disputes", () => {
    expect(disputeDeadlineStatus("2026-11-28T12:00:00Z", "resolved_refund", now)).toBeNull();
    expect(disputeDeadlineStatus("2026-11-28T12:00:00Z", "resolved_seller", now)).toBeNull();
  });

  it("flags overdue deadlines", () => {
    const res = disputeDeadlineStatus("2026-11-27T08:00:00Z", "open", now);
    expect(res?.overdue).toBe(true);
    expect(res?.urgent).toBe(true);
    expect(res?.label).toContain("vencido");
  });

  it("flags urgent deadlines under 12 hours", () => {
    const res = disputeDeadlineStatus("2026-11-27T18:30:00Z", "open", now);
    expect(res?.overdue).toBe(false);
    expect(res?.urgent).toBe(true);
    expect(res?.label).toContain("7h");
  });

  it("shows days and hours for non-urgent deadlines", () => {
    const res = disputeDeadlineStatus("2026-11-29T15:00:00Z", "open", now);
    expect(res?.overdue).toBe(false);
    expect(res?.urgent).toBe(false);
    expect(res?.label).toContain("51h");
  });
});

describe("dispute evidence & strike appeal validation", () => {
  it("accepts JPG/PNG/WebP up to 5 MB and rejects others", () => {
    expect(validateEvidenceFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateEvidenceFile({ type: "image/png", size: DISPUTE_MAX_FILE_BYTES })).toBeNull();
    expect(validateEvidenceFile({ type: "application/pdf", size: 1024 })).toContain(
      "JPG, PNG ou WebP",
    );
    expect(
      validateEvidenceFile({ type: "image/webp", size: DISPUTE_MAX_FILE_BYTES + 1 }),
    ).toContain("5 MB");
    expect(validateEvidenceFile({ type: "image/png", size: 0 })).toContain("5 MB");
  });

  it("validates strike appeal justification length", () => {
    expect(validateStrikeAppealReason("curto")).toContain("20 caracteres");
    expect(
      validateStrikeAppealReason(
        "Ajustamos o SLA de envio e resolvemos os pedidos atrasados com reposição.",
      ),
    ).toBeNull();
    expect(validateStrikeAppealReason("a".repeat(2001))).toContain("2000");
  });
});
