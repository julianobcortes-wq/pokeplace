import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import {
  BULK_MAX_ROWS,
  bulkListingTemplate,
  parseBulkListingCsv,
  toListingInserts,
  type BulkListingIssue,
  type BulkListingRow,
} from "@/lib/marketplace/bulk-listing";

const INSERT_CHUNK = 100;

type Preview = {
  fileName: string;
  rows: BulkListingRow[];
  issues: BulkListingIssue[];
  totalLines: number;
};

export function BulkListingUpload({ sellerId, onDone }: { sellerId: string; onDone: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(
      new Blob([bulkListingTemplate()], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-anuncios.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setChecking(true);
    try {
      const parsed = parseBulkListingCsv(await file.text());
      const ids = [...new Set(parsed.rows.map((r) => r.cardId))];
      const found = new Set<string>();
      for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
        const { data, error } = await supabase
          .from("cards")
          .select("id")
          .in("id", ids.slice(i, i + INSERT_CHUNK));
        if (error) throw error;
        for (const c of data ?? []) found.add(c.id);
      }
      const issues = [...parsed.issues];
      const rows = parsed.rows.filter((r) => {
        if (found.has(r.cardId)) return true;
        issues.push({
          line: r.line,
          field: "card_id",
          message: `Carta "${r.cardId}" não encontrada no catálogo.`,
        });
        return false;
      });
      issues.sort((a, b) => a.line - b.line);
      setPreview({ fileName: file.name, rows, issues, totalLines: parsed.totalLines });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a planilha");
      setPreview(null);
    } finally {
      setChecking(false);
    }
  };

  const publish = async () => {
    if (!preview || preview.rows.length === 0) return;
    setBusy(true);
    const payload = toListingInserts(preview.rows, sellerId);
    let inserted = 0;
    try {
      for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
        const chunk = payload.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from("listings").insert(chunk);
        if (error) {
          toast.error(
            inserted > 0
              ? `${inserted} anúncios publicados antes do erro: ${error.message}`
              : error.message,
          );
          return;
        }
        inserted += chunk.length;
      }
      toast.success(`${inserted} anúncios publicados!`);
      setPreview(null);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const total = preview ? preview.rows.reduce((a, r) => a + r.price * r.quantity, 0) : 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Enviar planilha de anúncios</h2>
          <p className="text-xs text-muted-foreground">
            Até {BULK_MAX_ROWS} linhas por arquivo. Colunas obrigatórias: card_id, condition, price.
            Separador vírgula ou ponto e vírgula.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          Baixar modelo CSV
        </Button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="sr-only">Arquivo CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={checking || busy}
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-primary-foreground"
        />
      </label>

      {checking && (
        <p className="mt-3 text-sm text-muted-foreground">Conferindo cartas no catálogo…</p>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            <b>{preview.fileName}</b>: {preview.totalLines} linhas lidas,{" "}
            <b className="text-success">{preview.rows.length} prontas</b>
            {preview.issues.length > 0 && (
              <>
                , <b className="text-destructive">{preview.issues.length} com erro</b>
              </>
            )}
            . Valor total dos anúncios prontos: <b className="num">{money(total)}</b>.
          </p>

          {preview.issues.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <p className="mb-1 font-semibold text-destructive">Linhas que não serão publicadas</p>
              <ul className="space-y-0.5">
                {preview.issues.slice(0, 100).map((issue, idx) => (
                  <li key={`${issue.line}-${issue.field}-${idx}`}>
                    Linha {issue.line}: {issue.message}
                  </li>
                ))}
              </ul>
              {preview.issues.length > 100 && (
                <p className="mt-1 text-muted-foreground">…e mais {preview.issues.length - 100}.</p>
              )}
            </div>
          )}

          {preview.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1">Linha</th>
                    <th>Carta</th>
                    <th>Condição</th>
                    <th>Idioma</th>
                    <th>Preço</th>
                    <th>Qtd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.rows.slice(0, 10).map((r) => (
                    <tr key={r.line}>
                      <td className="py-1 num">{r.line}</td>
                      <td className="font-mono">{r.cardId}</td>
                      <td>{r.condition}</td>
                      <td>{r.language}</td>
                      <td className="num">{money(r.price)}</td>
                      <td className="num">{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 10 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Mostrando 10 de {preview.rows.length}.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy || preview.rows.length === 0}
              onClick={publish}
              className="rounded-full"
            >
              {busy ? "Publicando…" : `Publicar ${preview.rows.length} anúncios`}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
