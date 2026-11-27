import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import {
  normalizeCouponCode,
  validateCouponDefinition,
  validateVolumeTier,
  type CouponType,
  type StoreCoupon,
  type VolumeDiscountTier,
} from "@/lib/marketplace/promotions";
import { dbTable } from "@/lib/supabase-ext";

export function SellerPromotions({ sellerId }: { sellerId: string }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<CouponType>("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [minOrder, setMinOrder] = useState("0");
  const [maxUses, setMaxUses] = useState("");

  const [minQty, setMinQty] = useState("3");
  const [volPct, setVolPct] = useState("5");
  const [busy, setBusy] = useState(false);

  const { data: coupons = [] } = useQuery({
    queryKey: ["seller-coupons", sellerId],
    queryFn: async () => {
      const { data, error } = await dbTable("store_coupons")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) return [] as StoreCoupon[];
      return (data ?? []) as StoreCoupon[];
    },
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ["seller-volume-tiers", sellerId],
    queryFn: async () => {
      const { data, error } = await dbTable("store_volume_discounts")
        .select("*")
        .eq("seller_id", sellerId)
        .order("min_qty", { ascending: true });
      if (error) return [] as VolumeDiscountTier[];
      return (data ?? []) as VolumeDiscountTier[];
    },
  });

  const addCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(discountValue.replace(",", "."));
    const min = Number(minOrder.replace(",", ".")) || 0;
    const max = maxUses.trim() ? parseInt(maxUses, 10) : null;
    const err = validateCouponDefinition({
      code,
      discountType,
      discountValue: val,
      minOrderAmount: min,
      maxUses: max,
    });
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const { error } = await dbTable("store_coupons").insert({
      seller_id: sellerId,
      code: normalizeCouponCode(code),
      discount_type: discountType,
      discount_value: val,
      min_order_amount: min,
      max_uses: max,
      active: true,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Cupom ${normalizeCouponCode(code)} criado!`);
    setCode("");
    await qc.invalidateQueries({ queryKey: ["seller-coupons", sellerId] });
  };

  const toggleCoupon = async (c: StoreCoupon) => {
    if (!c.id) return;
    const { error } = await dbTable("store_coupons").update({ active: !c.active }).eq("id", c.id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["seller-coupons", sellerId] });
  };

  const deleteCoupon = async (id: string) => {
    const { error } = await dbTable("store_coupons").delete().eq("id", id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["seller-coupons", sellerId] });
  };

  const addTier = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(minQty, 10);
    const p = Number(volPct.replace(",", "."));
    const err = validateVolumeTier(q, p);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    const { error } = await dbTable("store_volume_discounts").upsert(
      { seller_id: sellerId, min_qty: q, discount_pct: p, active: true },
      { onConflict: "seller_id,min_qty" },
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Desconto de ${p}% para ${q}+ cartas salvo!`);
    await qc.invalidateQueries({ queryKey: ["seller-volume-tiers", sellerId] });
  };

  const deleteTier = async (id: string) => {
    const { error } = await dbTable("store_volume_discounts").delete().eq("id", id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: ["seller-volume-tiers", sellerId] });
  };

  const inputCls = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-slab">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold">Cupons de desconto</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Crie cupons promocionais válidos exclusivamente para compras na sua loja.
        </p>

        <form onSubmit={addCoupon} className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <label className="col-span-2 text-xs">
            Código
            <input
              required
              placeholder="POKE10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs">
            Tipo
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as CouponType)}
              className={`mt-1 ${inputCls}`}
            >
              <option value="percent">% off</option>
              <option value="fixed">R$ fixo</option>
            </select>
          </label>
          <label className="text-xs">
            Valor
            <input
              required
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className={`num mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs">
            Pedido mín. (R$)
            <input
              inputMode="decimal"
              value={minOrder}
              onChange={(e) => setMinOrder(e.target.value)}
              className={`num mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs">
            Limite usos
            <input
              inputMode="numeric"
              placeholder="Ilimitado"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              className={`num mt-1 ${inputCls}`}
            />
          </label>
          <div className="col-span-2 flex items-end">
            <Button type="submit" size="sm" disabled={busy} className="w-full">
              Criar cupom
            </Button>
          </div>
        </form>

        {coupons.length > 0 && (
          <div className="mt-4 divide-y divide-border text-xs">
            {coupons.map((c) => (
              <div
                key={c.id ?? c.code}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <span className="num font-bold">{c.code}</span>{" "}
                  <span className="rounded-full bg-muted px-2 py-0.5">
                    {c.discount_type === "percent"
                      ? `${c.discount_value}%`
                      : money(Number(c.discount_value))}
                  </span>
                  {Number(c.min_order_amount) > 0 && (
                    <span className="ml-1.5 text-muted-foreground">
                      mín. {money(Number(c.min_order_amount))}
                    </span>
                  )}
                  <span className="ml-1.5 text-muted-foreground">
                    · {c.uses_count}
                    {c.max_uses ? `/${c.max_uses}` : ""} usos
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => void toggleCoupon(c)}>
                    {c.active ? "Pausar" : "Ativar"}
                  </Button>
                  {c.id && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remover cupom ${c.code}`}
                      onClick={() => void deleteCoupon(c.id!)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-slab">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold">Desconto por volume</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Incentive carrinhos maiores oferecendo desconto automático ao levar várias cartas da sua
          loja.
        </p>

        <form onSubmit={addTier} className="mt-3 grid grid-cols-3 gap-2.5">
          <label className="text-xs">
            A partir de (cartas)
            <input
              required
              type="number"
              min={2}
              max={100}
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              className={`num mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs">
            Desconto (%)
            <input
              required
              inputMode="decimal"
              value={volPct}
              onChange={(e) => setVolPct(e.target.value)}
              className={`num mt-1 ${inputCls}`}
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={busy} className="w-full">
              Salvar faixa
            </Button>
          </div>
        </form>

        {tiers.length > 0 && (
          <div className="mt-4 divide-y divide-border text-xs">
            {tiers.map((t) => (
              <div key={t.id ?? t.min_qty} className="flex items-center justify-between py-2">
                <span>
                  Leve <b className="num">{t.min_qty}+</b> cartas →{" "}
                  <b className="num text-success">{t.discount_pct}% de desconto</b> automático
                </span>
                {t.id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remover faixa ${t.min_qty}+`}
                    onClick={() => void deleteTier(t.id!)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
