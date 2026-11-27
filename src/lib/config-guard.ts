export function publicSupabaseConfigMissing(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const url = (env["SUPABASE_URL"] ?? env["VITE_SUPABASE_URL"] ?? "").trim();
  const key = (
    env["SUPABASE_PUBLISHABLE_KEY"] ??
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    ""
  ).trim();
  return !url || !key;
}
