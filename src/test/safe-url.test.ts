import { describe, expect, it } from "vitest";
import { safeNotificationHref } from "@/lib/safe-url";

describe("safeNotificationHref", () => {
  it("keeps site paths and https links", () => {
    expect(safeNotificationHref("/minha-loja")).toBe("/minha-loja");
    expect(safeNotificationHref("https://pokeplace.example/carta")).toBe("https://pokeplace.example/carta");
  });

  it("blocks javascript and data urls", () => {
    expect(safeNotificationHref("javascript:alert(1)")).toBe("#");
    expect(safeNotificationHref("data:text/html,hi")).toBe("#");
    expect(safeNotificationHref("//evil.example")).toBe("#");
  });
});