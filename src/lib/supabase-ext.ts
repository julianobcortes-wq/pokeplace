import { supabase } from "@/integrations/supabase/client";

type QueryResult<T = unknown> = Promise<{ data: T | null; error: { message: string } | null }>;

type DynamicTable = {
  select: (columns?: string) => DynamicFilter;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => DynamicFilter;
  update: (values: Record<string, unknown>) => DynamicFilter;
  delete: () => DynamicFilter;
  upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => DynamicFilter;
};

type DynamicFilter = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  eq: (col: string, val: unknown) => DynamicFilter;
  in: (col: string, vals: unknown[]) => DynamicFilter;
  neq: (col: string, val: unknown) => DynamicFilter;
  order: (col: string, opts?: { ascending?: boolean }) => DynamicFilter;
  limit: (n: number) => DynamicFilter;
  maybeSingle: () => QueryResult;
  single: () => QueryResult;
};

/**
 * Typed escape hatch for tables and RPCs appended in `scripts/sql/all-migrations.sql`
 * after the generated `src/integrations/supabase/types.ts` snapshot.
 */
export function dbTable(name: string): DynamicTable {
  return (supabase as unknown as { from: (t: string) => DynamicTable }).from(name);
}

export function dbRpc<T = unknown>(fn: string, args?: Record<string, unknown>): QueryResult<T> {
  return (
    supabase as unknown as {
      rpc: (name: string, params?: Record<string, unknown>) => QueryResult<T>;
    }
  ).rpc(fn, args);
}
