// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

function q(sql: string) {
  const r = JSON.parse(execFileSync("lovable", ["supabase", "query", sql, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (r.error) throw new Error(r.error.message ?? JSON.stringify(r.error));
  return r.rows as Record<string, unknown>[];
}

describe("Marketplace operations rules", () => {
  it("reserves cart stock for 15 minutes", () => {
    const [r] = q("select pg_get_functiondef('public.place_order(jsonb,jsonb)'::regprocedure) d");
    expect(String(r?.["d"])).toContain("interval '15 minutes'");
  });
  it("gives free shipping above the store threshold", () => {
    const [r] = q("select pg_get_functiondef('public.shipping_fee(uuid,numeric)'::regprocedure) d");
    expect(String(r?.["d"])).toMatch(/_subtotal >= free_over THEN 0/);
  });
  it("masks phone numbers and e-mails in messages", () => {
    const [r] = q("select public.mask_contacts('me chama 11 98765-4321 ou x@y.com') m");
    expect(String(r?.["m"])).not.toContain("98765");
    expect(String(r?.["m"])).not.toContain("x@y.com");
  });
  it("only counts live paid sales in seller balance", () => {
    const [r] = q("select pg_get_functiondef('public.get_seller_balance(uuid)'::regprocedure) d");
    expect(String(r?.["d"])).toContain("p.environment='live'");
  });
  it("rejects payouts from someone who does not own the store", () => {
    expect(() => q("select public.request_payout(gen_random_uuid(), 10, 'chave-pix')")).toThrow("Acesso negado");
  });
  it("only administrators resolve disputes", () => {
    expect(() => q("select public.admin_resolve_dispute(gen_random_uuid(),'resolved_refund',0,'x')")).toThrow("Acesso negado");
  });
  it("caps commission at 50%", () => {
    const [r] = q("select pg_get_functiondef('public.admin_set_setting(text,numeric)'::regprocedure) d");
    expect(String(r?.["d"])).toContain("_value>0.5");
  });
  it("blocks shipping before payment is confirmed", () => {
    const [r] = q("select pg_get_functiondef('public.require_paid_before_ship()'::regprocedure) d");
    expect(String(r?.["d"])).toContain("<> 'paid'");
  });
});
