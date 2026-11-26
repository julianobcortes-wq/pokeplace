import { MarketplaceImage } from "./MarketplaceImage";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/runtime-config";

function cardImageFallbacks(src: string | null): string[] {
  if (!src) return [];
  const list = [src];
  if (src.endsWith(".webp")) list.push(src.replace(/\.webp$/, ".png"));
  else if (src.endsWith(".png")) list.push(src.replace(/\.png$/, ".webp"));
  return list;
}

/** Card image with 3D tilt + holographic glare following pointer + graceful fallback. */
export function HoloCard({ src, alt, className = "", eager = false }: { src: string | null; alt: string; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const candidates = cardImageFallbacks(src);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [src]);
  const activeSrc = candidates[idx] ?? null;

  const move = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", String(x)); el.style.setProperty("--my", String(y));
    el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`); el.style.setProperty("--rx", `${(0.5 - y) * 18}deg`);
    el.dataset["active"] = "true";
  };
  const leave = () => { const el = ref.current; if (!el) return; el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); el.dataset["active"] = "false"; };
  return (
    <div ref={ref} onPointerMove={move} onPointerLeave={leave} className={`holo-tilt relative overflow-hidden rounded-[4.5%/3.2%] ${className}`}>
      {activeSrc ? (
        <img
          src={activeSrc}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setIdx((i) => i + 1)}
          className="block aspect-[5/7] w-full select-none object-cover"
        />
      ) : (
        <div className="grid aspect-[5/7] w-full place-items-center bg-ink-glow p-3 text-center text-ink-foreground">
          <span className="font-display text-xs font-bold leading-snug opacity-85">{alt}</span>
        </div>
      )}
      <span className="glare" />
    </div>
  );
}

/** Set logo image with automatic .webp -> .png -> typographic fallback (never renders broken image icon). */
export function SetLogo({ src, name, className = "h-12 max-w-[140px]" }: { src: string | null | undefined; name: string; className?: string }) {
  const candidates: string[] = [];
  if (src) {
    const normalized = /^https:\/\/assets\.tcgdex\.net\/.+\/(logo|symbol)$/i.test(src) ? `${src}.webp` : src;
    candidates.push(normalized);
    if (normalized.endsWith(".webp")) candidates.push(normalized.replace(/\.webp$/, ".png"));
    else if (normalized.endsWith(".png")) candidates.push(normalized.replace(/\.png$/, ".webp"));
  }
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [src]);
  const active = candidates[idx];
  if (!active) {
    return (
      <span className="inline-flex items-center justify-center rounded-lg border border-border/80 bg-muted/60 px-3 py-1.5 font-display text-xs font-extrabold tracking-tight text-foreground">
        {name}
      </span>
    );
  }
  return (
    <img
      src={active}
      alt={name}
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
      className={`${className} object-contain`}
    />
  );
}

export function Sparkline({ points, className = "h-8 w-full" }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), span = max - min || 1;
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 100},${30 - ((p - min) / span) * 28 - 1}`).join(" ");
  const up = (points.at(-1) ?? 0) >= (points[0] ?? 0);
  const color = up ? "var(--up)" : "var(--down)";
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={`0,30 ${d} 100,30`} fill={color} opacity={0.12} />
      <polyline points={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Change({ pct, className = "" }: { pct: number | null | undefined; className?: string }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return <span className={`num inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-up" : "text-down"} ${className}`}>{up ? "▲" : "▼"} {Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>;
}

export function Stars({ value, size = "h-3.5 w-3.5" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-label={`${value.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="relative">
          <Star className={`${size} text-border`} fill="currentColor" strokeWidth={0} />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - i + 1)) * 100}%` }}>
            <Star className={`${size} text-chart-4`} fill="currentColor" strokeWidth={0} />
          </span>
        </span>
      ))}
    </span>
  );
}

export const LEVELS: Record<string, { label: string; step: number }> = {
  nova: { label: "Loja nova", step: 0 }, regular: { label: "Regular", step: 1 }, boa: { label: "Boa", step: 2 }, otima: { label: "Ótima", step: 3 }, excelente: { label: "Excelente", step: 4 },
};

export function levelOf(rating: number | null | undefined, reviews: number | null | undefined) {
  const n = Number(reviews ?? 0), r = Number(rating ?? 0);
  if (n < 3) return "nova";
  return r >= 4.7 ? "excelente" : r >= 4.2 ? "otima" : r >= 3.5 ? "boa" : "regular";
}

export function ReputationMeter({ level }: { level: string }) {
  const l = LEVELS[level] ?? { label: "Loja nova", step: 0 };
  const colors = ["bg-destructive", "bg-chart-5", "bg-chart-4", "bg-success/70", "bg-success"];
  return (
    <div>
      <div className="flex gap-1">{colors.map((c, i) => <span key={c} className={`h-1.5 flex-1 rounded-full ${l.step > 0 && i <= l.step ? c : "bg-muted"} ${l.step === i + 0 && l.step > 0 ? "ring-2 ring-foreground/20" : ""}`} />)}</div>
      <p className="mt-1 text-xs font-medium">{l.label}</p>
    </div>
  );
}

export function StoreAvatar({ name, logo, size = "h-10 w-10" }: { name: string; logo?: string | null | undefined; size?: string }) {
  return logo
    ? <MarketplaceImage src={logo} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />
    : <span className={`${size} grid shrink-0 place-items-center rounded-xl bg-ink-glow font-display text-sm font-extrabold text-ink-foreground`}>{name.slice(0, 2).toUpperCase()}</span>;
}

/** Compact seller identity used wherever a store appears (offers, cart, orders). */
export function SellerLine({ s }: { s: { seller_id?: string; id?: string; store_name: string; store_slug?: string | null; slug?: string | null; is_official?: boolean | null; city?: string | null; state?: string | null; rating?: number | string | null; reviews?: number | string | null; completed_sales?: number | string | null; logo_url?: string | null } }) {
  const trust = useSellerTrust(s.seller_id ?? s.id);
  const slug = s.store_slug ?? s.slug;
  const reviews = Number(trust.data?.reviews ?? s.reviews ?? 0), rating = Number(trust.data?.rating ?? s.rating ?? 0);
  const name = (
    <span className="inline-flex items-center gap-1 font-semibold hover:text-primary">
      {s.store_name}{s.is_official && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Loja oficial" />}
    </span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      <StoreAvatar name={s.store_name} logo={s.logo_url} />
      <div className="min-w-0">
        {slug ? <Link to="/loja/$slug" params={{ slug }}>{name}</Link> : name}
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {reviews > 0 ? <span className="inline-flex items-center gap-1"><Stars value={rating} /> <b className="num text-foreground">{rating.toFixed(1)}</b> ({reviews})</span>
            : <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Loja nova</span>}
          <span>· {Number(trust.data?.completed_sales ?? s.completed_sales ?? 0)} itens entregues</span>
          {s.city && <span>· {s.city}/{s.state}</span>}
        </div>
        {trust.data && <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success"><ShieldCheck className="h-3 w-3" />{LEVELS[trust.data.level]?.label ?? "Loja nova"}</span>}
      </div>
    </div>
  );
}

export function VerifiedPill() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success"><ShieldCheck className="h-3 w-3" /> Verificada</span>;
}

export function useSellerTrust(id?: string) {
  return useQuery({ queryKey: ["seller-trust", id], enabled: !!id && isSupabaseConfigured(), staleTime: 60000,
    queryFn: async () => { if (!id) return null; const { data, error } = await supabase.rpc("get_seller_trust", { _seller_id: id }); if (error) throw error; return data?.[0] ?? null; },
  });
}

export function SellerTrustPanel({ sellerId, approved = false }: { sellerId: string; approved?: boolean }) {
  const { data, isPending, isError } = useSellerTrust(sellerId);
  return <section className="border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl font-bold">Reputação da loja</h2>{approved && <VerifiedPill />}</div>
    {isError ? <p className="mt-3 text-sm text-muted-foreground">Não foi possível consultar a reputação agora.</p> : isPending ? <p className="mt-3 text-sm text-muted-foreground">Consultando reputação…</p> : data ? <>
      <div className="mt-4 grid gap-6 sm:grid-cols-3"><ReputationMeter level={data.level} /><div><p className="num text-2xl font-bold">{data.reviews ? Number(data.rating).toFixed(1) : "—"}</p><p className="text-xs text-muted-foreground">{data.reviews} avaliações verificadas</p></div><div><p className="num text-2xl font-bold">{data.completed_sales}</p><p className="text-xs text-muted-foreground">itens entregues com pagamento real</p></div></div>
      <p className="mt-4 text-sm text-muted-foreground">{data.reviews < 3 ? "Loja nova: ainda não há avaliações suficientes para classificar sua reputação." : "Nível calculado pelas avaliações dos compradores."} Pedidos de teste não contam.</p>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Critérios dos níveis</summary><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-muted-foreground"><dt>Loja nova</dt><dd>Menos de 3 avaliações</dd><dt>Regular</dt><dd>Nota abaixo de 3,5</dd><dt>Boa</dt><dd>Nota de 3,5 a 4,19</dd><dt>Ótima</dt><dd>Nota de 4,2 a 4,69</dd><dt>Excelente</dt><dd>Nota a partir de 4,7</dd></dl><p className="mt-3 text-xs text-muted-foreground">Os níveis não são comprados. Curadoria e reputação são critérios distintos; não representam garantia de reembolso.</p></details>
    </> : <p className="mt-3 text-sm text-muted-foreground">Reputação ainda indisponível.</p>}
  </section>;
}
