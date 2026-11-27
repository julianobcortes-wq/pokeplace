import { useState } from "react";
import { HelpCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CONDITION_GUIDE } from "@/lib/marketplace/grading";

export function ConditionGuide({
  compact = false,
  label = "Guia visual de condições",
}: {
  compact?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={compact ? "link" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        className={compact ? "h-auto gap-1 p-0 text-xs" : "gap-1.5 rounded-full text-xs"}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Guia oficial de condições e grading — PokePlace
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            Classificar corretamente evita disputas e mantém sua reputação verde no termômetro.
            Sempre fotografe frente e verso sob boa luz para cartas raras ou graduadas.
          </p>

          <div className="mt-2 grid gap-2.5">
            {CONDITION_GUIDE.map((spec) => (
              <div key={spec.code} className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${spec.badgeClass}`}
                    >
                      {spec.code}
                    </span>
                    <span className="text-sm font-bold">{spec.name}</span>
                    <span className="text-xs text-muted-foreground">· {spec.shortLabel}</span>
                  </div>
                  <span className="num text-[11px] text-muted-foreground">
                    Ref. estimada: {Math.round(spec.priceFactor * 100)}% do NM
                  </span>
                </div>
                <p className="mt-1.5 text-xs">{spec.summary}</p>
                <div className="mt-1.5 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <p>
                    <strong className="text-foreground">Bordas/cantos:</strong> {spec.edges}
                  </p>
                  <p>
                    <strong className="text-foreground">Superfície:</strong> {spec.surface}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-border bg-card p-3 text-xs">
            <p className="font-semibold">Cartas graduadas (Slabs)</p>
            <p className="mt-1 text-muted-foreground">
              Aceitamos certificação <b>PSA</b> (1–10 / Authentic), <b>BGS</b> (1–10, 9.5, 10 Black
              Label), <b>CGC</b> (1–10, 10 Pristine), <b>TAG</b> (1–10) e outras certificadoras com
              número de série visível na foto.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
