export type SqlMigrationSection = {
  id: string;
  sql: string;
  legacyProbe: string | null;
};

export function parseSqlMigrationSections(sqlText: string): SqlMigrationSection[];

export function resolveSupabaseProjectRef(
  env?: Record<string, string | undefined>,
  configTomlText?: string,
): string;

export function pickSupabaseApiKeys(
  apiKeys: Array<{ name?: string; type?: string; api_key?: string }>,
): { publishableKey: string; serviceRoleKey: string };

export function mergeRedirectUrls(existingList: string | string[] | undefined, siteUrl: string): string;

export function generateCronSecret(): string;

export function buildWorkerSecretsPayload(params: {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseProjectId?: string;
  supabaseServiceRoleKey?: string;
  cronSecret?: string;
  appPublicUrl?: string;
  env?: Record<string, string | undefined>;
}): Record<string, string>;

export function resolvePermanentUrl(params: {
  customDomain?: string;
  workerName?: string;
  workersSubdomain?: string;
}): string;

export function extractDeployedWorkerUrl(wranglerOutput: string): string;

export function applyAllMigrations(params: {
  sections: SqlMigrationSection[];
  execQuery: (query: string) => Promise<Array<Record<string, unknown>>>;
  log?: (msg: string) => void;
}): Promise<{
  applied: string[];
  skippedLegacy: string[];
  reappliedIdempotent: string[];
}>;
