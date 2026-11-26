// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { catalogSearchInput } from "../lib/catalog-validation";

const hasLovableCli = spawnSync("lovable", ["--version"], { stdio: "ignore" }).status === 0;

function query(q: string) {
  const r = JSON.parse(execFileSync("lovable", ["supabase", "query", q, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  if (r.error) throw new Error(r.error.message);
  return r.rows as Record<string, unknown>[];
}

describe("Catalog search validation", () => {
  it("caps catalog queries at 120 cards", () => {
    expect(catalogSearchInput.safeParse({ limit: 121 }).success).toBe(false);
    expect(catalogSearchInput.parse({ limit: 120 }).limit).toBe(120);
  });
});

describe.skipIf(!hasLovableCli)("Launch security and collection DB rules", () => {
  it("ordinary signup never assigns admin", () => {
    const [r] = query("select pg_get_functiondef('public.handle_new_user()'::regprocedure) definition");
    expect(String(r?.["definition"])).not.toContain("'admin'");
    expect(String(r?.["definition"])).toContain("'buyer'");
  });
  it("keeps collection and support private to authenticated users", () => {
    const [r] = query("select has_table_privilege('anon','public.collection_entries','SELECT') collection,has_table_privilege('anon','public.support_messages','SELECT') messages");
    expect(r?.["collection"]).toBe(false);
    expect(r?.["messages"]).toBe(false);
  });
  it("does not permit buyers to resolve tickets", () => {
    const [r] = query("select qual from pg_policies where tablename='support_tickets' and policyname='ticket_admin'");
    expect(String(r?.["qual"])).toContain("has_role");
  });
  it("does not allow direct tracking changes", () => {
    const [r] = query("select has_column_privilege('authenticated','public.order_items','tracking_code','UPDATE') allowed");
    expect(r?.["allowed"]).toBe(false);
  });
  it("restricts support replies to the owner or administrator", () => {
    const [r] = query("select with_check from pg_policies where tablename='support_messages' and policyname='message_create'");
    expect(String(r?.["with_check"])).toContain("auth.uid()");
    expect(String(r?.["with_check"])).toContain("has_role");
    expect(String(r?.["with_check"])).toContain("resolved");
  });
});
