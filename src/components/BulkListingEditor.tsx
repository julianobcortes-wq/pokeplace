import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bulkUpdateOwnListings } from "@/lib/guard.functions";
import type { BulkEditAction, BulkPriceRule } from "@/lib/marketplace/bulk-edit";
import { BULK_EDIT_MAX_LISTINGS } from "@/lib/marketplace/bulk-edit";

type Props = {
  sellerId: string;
  selectedIds: string[];
  approved: boolean;
  onClear: () => void;
  onDone: () => void;
};

const field = "rounded-lg border border-input bg-background px-2 py-1 text-sm";

export function BulkListingEditor({ sellerId, selectedIds, approved, onClear, onDone }: Props) {
  const [mode, setMode] = useState<BulkPriceRule["mode"]>("percent");
  const [value, setValue] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: BulkEditAction) => {
    if (selectedIds.length === 0) return;
    if (selectedIds.length > BULK_EDIT_MAX_LISTINGS) {
      toast.error(`Selecione no máximo ${BULK_EDIT_MAX_LISTINGS} anúncios por vez.`);
      return;
    }
    setBusy(true);
    try {
      const res = await bulkUpdateOwnListings({
        data: { sellerId, listingIds: selectedIds, action },
      });
      if (res.skipped.length === 0) {
        toast.success(`${res.updated} anúncios atualizados`);
      } else {
        toast.warning(`${res.updated} atualizados, ${res.skipped.length} não alterados`, {
          description: res.skipped
            .slice(0, 3)
            .map((s) => s.reason)
            .join(" · "),
        });
      }
      onClear();
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar");
    } finally {
      setBusy(false);
    }
  };

  const applyPrice = () => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n)) {
      toast.error("Informe um valor numérico");
      return;
    }
    const rule: BulkPriceRule = mode === "set" ? { mode, price: n } : { mode, percent: n };
    void run({ kind: "price", rule });
  };

  const applyQty = () => {
    const n = parseInt(qty, 10);
    if (!Number.isInteger(n) || n < 0) {
      toast.error("Informe um estoque válido");
      return;
    }
    void run({ kind: "quantity", quantity: n });
  };

  const disabled = busy || selectedIds.length === 0;

  return (
    <div className="sticky top-2 z-10 mt-3 flex flex-wrap items-end gap-3 rounded-2xl border border-primary/40 bg-card p-3 shadow-slab">
      <p className="text-sm font-semibold">
        {selectedIds.length} selecionado{selectedIds.length === 1 ? "" : "s"}
      </p>
      <div className="flex items-end gap-2">
        <label className="text-xs">
          Preço
          <select
            className={`ml-1 ${field}`}
            value={mode}
            onChange={(e) => setMode(e.target.value as BulkPriceRule["mode"])}
          >
            <option value="percent">ajustar em %</option>
            <option value="reference_percent">% sobre ref. BRL</option>
            <option value="set">definir R$</option>
          </select>
        </label>
        <input
          aria-label={
            mode === "set"
              ? "Preço fixo"
              : mode === "reference_percent"
                ? "Percentual sobre referência BRL"
                : "Percentual de ajuste"
          }
          inputMode="decimal"
          placeholder={mode === "set" ? "12,50" : "-10 ou 5"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={`num w-24 ${field}`}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !value.trim()}
          onClick={applyPrice}
        >
          Aplicar preço
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <input
          aria-label="Estoque"
          inputMode="numeric"
          placeholder="Estoque"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className={`num w-20 ${field}`}
        />
        <Button size="sm" variant="secondary" disabled={disabled || !qty.trim()} onClick={applyQty}>
          Aplicar estoque
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void run({ kind: "status", status: "paused" })}
        >
          Pausar
        </Button>
        {approved && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => void run({ kind: "status", status: "active" })}
          >
            Ativar
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => void run({ kind: "status", status: "removed" })}
          className="text-destructive hover:text-destructive"
        >
          Remover
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
