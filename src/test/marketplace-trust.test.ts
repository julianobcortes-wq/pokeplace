// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

async function sql(strings: TemplateStringsArray) {
  const result = execFileSync("lovable", ["supabase", "query", strings.join(""), "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const parsed = JSON.parse(result);
  if (parsed.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
  return parsed.rows as Record<string, unknown>[];
}

describe("Marketplace trust database rules", () => {
  it("does not count sandbox orders in reputation", async () => {
    const [row] = await sql`select pg_get_functiondef('public.is_real_completed_order(uuid)'::regprocedure) definition`;
    expect(String(row?.['definition'])).toMatch(/environment\s*=\s*'live'/);
    expect(String(row?.['definition'])).not.toMatch(/environment\s*=\s*'sandbox'/);
  });
  it("requires a signed-in buyer to confirm receipt", async () => {
    await expect(sql`select public.confirm_item_received(gen_random_uuid())`).rejects.toThrow("permission denied for function confirm_item_received");
  });
  it("rejects reviews from someone other than the buyer", async () => {
    await expect(sql`select public.submit_review(gen_random_uuid(),gen_random_uuid(),5,5,5,'teste')`).rejects.toThrow("Somente o comprador");
  });
  it("rejects blank review replies", async () => {
    await expect(sql`select public.reply_review(gen_random_uuid(),'   ')`).rejects.toThrow("1 a 1000");
  });
  it("does not allow sellers to update financial fields", async () => {
    const [row] = await sql`select has_column_privilege('authenticated','public.order_items','unit_price','UPDATE') price, has_column_privilege('authenticated','public.order_items','status','UPDATE') status`;
    expect(row?.['price']).toBe(false);
    expect(row?.['status']).toBe(true);
  });
  it("does not expose buyer identity in public review reads", async () => {
    const [row] = await sql`select has_column_privilege('anon','public.seller_reviews','buyer_id','SELECT') allowed`;
    expect(row?.['allowed']).toBe(false);
  });
  it("keeps a seller without transactions at the new level", async () => {
    const [row] = await sql`select * from public.get_seller_reputation(gen_random_uuid())`;
    expect(row?.['level']).toBe("nova");
    expect(Number(row?.['completed_sales'])).toBe(0);
    expect(row?.['rating']).toBe(null);
  });
});