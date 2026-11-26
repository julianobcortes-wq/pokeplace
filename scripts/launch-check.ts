// One-shot terminal check before going live.
// Usage: bun run launch:check
import { getLaunchReadiness } from "../src/lib/ops/readiness";

const report = await getLaunchReadiness();

const rows: Array<[string, boolean, string]> = [
  ["SUPABASE_URL + PUBLISHABLE_KEY", report.checks.supabasePublic, "Conexão pública do navegador"],
  ["SUPABASE_SERVICE_ROLE_KEY", report.checks.supabaseAdmin, "Webhook, importação e sync"],
  ["Schema aplicado (all-migrations.sql)", report.checks.schemaApplied, `${report.counts.sets} sets`],
  ["Catálogo importado", report.checks.catalogSeeded, `${report.counts.cards} cartas`],
  ["Preços sincronizados (TCGdex)", report.checks.pricesSynced, `${report.counts.priceObservations} observações`],
  ["MP_ACCESS_TOKEN", report.checks.mercadoPago, "Checkout Pro Mercado Pago"],
  ["MP_WEBHOOK_SECRET", report.checks.webhookSecret, "Validação HMAC fail-closed"],
  ["APP_PUBLIC_URL", report.checks.publicUrl, "URL pública de retorno e webhook"],
  ["Modo teste desativado", report.checks.sandboxDisabled, "Apenas pagamentos reais"],
  ["RESEND_API_KEY (opcional)", report.checks.emailConfigured, "E-mail transacional"],
];

console.log("\n=== PokePlace Launch Readiness ===");
for (const [label, ok, detail] of rows) {
  console.log(`${ok ? "[OK]  " : "[WAIT]"} ${label.padEnd(38)} — ${detail}`);
}
console.log(
  `\nResumo: ${report.ready ? "PRONTO PARA PRODUÇÃO" : "PENDÊNCIAS EXTERNAS"} | Lojas aprovadas: ${report.counts.approvedSellers} | Comissão: ${report.counts.commissionRate != null ? `${(report.counts.commissionRate * 100).toFixed(2)}%` : "não definida"}\n`,
);
process.exit(report.ready ? 0 : 1);
