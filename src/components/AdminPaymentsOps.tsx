import { useState } from "react";
import { RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  adminRefundOrderPayment,
  reconcileOrderPayment,
  runAdminOrdersMaintenance,
} from "@/lib/payments/functions";

export function AdminPaymentsOps() {
  const [busy, setBusy] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const runMaintenance = async () => {
    setBusy("maintenance");
    try {
      const res = await runAdminOrdersMaintenance();
      toast.success(
        `Manutenção executada: ${res.expiredOffersCount} ofertas expiradas · ${res.autoConfirmedDeliveriesCount} entregas auto-confirmadas · ${res.deliveryWarningsSent} avisos enviados`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao executar manutenção");
    } finally {
      setBusy(null);
    }
  };

  const reconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("reconcile");
    try {
      const res = await reconcileOrderPayment({
        data: { orderId: orderId.trim(), externalPaymentId: externalId.trim() },
      });
      toast.success(`Conciliado: status MP "${res.providerStatus}" → ${res.outcome}`);
      setOrderId("");
      setExternalId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na conciliação");
    } finally {
      setBusy(null);
    }
  };

  const refund = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("refund");
    try {
      const parsedAmount = refundAmount.trim() ? Number(refundAmount.replace(",", ".")) : undefined;
      const res = await adminRefundOrderPayment({
        data: {
          orderId: refundOrderId.trim(),
          ...(parsedAmount != null ? { amount: parsedAmount } : {}),
          reason: refundReason.trim(),
        },
      });
      toast.success(`Estorno #${res.refundId} registrado (${res.status})`);
      setRefundOrderId("");
      setRefundAmount("");
      setRefundReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao processar estorno");
    } finally {
      setBusy(null);
    }
  };

  const cls = "w-full rounded-xl border border-input bg-background px-3 py-2 text-xs";

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-slab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">
            Operação & Financeiro
          </p>
          <h2 className="text-lg font-bold">Mercado Pago: conciliação, estornos e rotinas</h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void runMaintenance()}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${busy === "maintenance" ? "animate-spin" : ""}`}
          />
          {busy === "maintenance" ? "Executando…" : "Rodar manutenção de pedidos/ofertas"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={reconcile}
          className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Conciliar pagamento Mercado Pago
          </p>
          <p className="text-xs text-muted-foreground">
            Consulta o status real na API do Mercado Pago e sincroniza o pedido (requer
            MP_ACCESS_TOKEN).
          </p>
          <input
            required
            placeholder="UUID do pedido (order_id)"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className={cls}
          />
          <input
            required
            placeholder="ID do pagamento no Mercado Pago"
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            className={cls}
          />
          <Button size="sm" type="submit" disabled={busy !== null}>
            {busy === "reconcile" ? "Conciliando…" : "Consultar e conciliar"}
          </Button>
        </form>

        <form
          onSubmit={refund}
          className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <RotateCcw className="h-4 w-4 text-destructive" /> Estorno via Mercado Pago
          </p>
          <p className="text-xs text-muted-foreground">
            Dispara estorno total ou parcial com chave de idempotência e registra auditoria em
            payment_refunds.
          </p>
          <input
            required
            placeholder="UUID do pedido (order_id)"
            value={refundOrderId}
            onChange={(e) => setRefundOrderId(e.target.value)}
            className={cls}
          />
          <input
            inputMode="decimal"
            placeholder="Valor R$ (vazio = estorno total)"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            className={`num ${cls}`}
          />
          <input
            required
            minLength={5}
            placeholder="Motivo do estorno (obrigatório)"
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            className={cls}
          />
          <Button size="sm" variant="destructive" type="submit" disabled={busy !== null}>
            {busy === "refund" ? "Estornando…" : "Processar estorno"}
          </Button>
        </form>
      </div>
    </section>
  );
}
