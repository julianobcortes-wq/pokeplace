import { MarketplaceImage } from "./MarketplaceImage";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Award, BadgeCheck, Clock, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import {
  BUYER_TIER_META,
  formatResponseTime,
  legacyLevelToThermometer,
  MEDAL_META,
  THERMOMETER_META,
  type BuyerTier,
  type SellerMedal,
  type StrikeStatus,
  type ThermometerLevel,
} from "@/lib/marketplace/rules";

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

export function ThermometerBar({
  thermometer,
  compact = false,
}: {
  thermometer: ThermometerLevel;
  compact?: boolean;
}) {
  const meta = THERMOMETER_META[thermometer] ?? THERMOMETER_META.new;
  const segments = [
    { key: "red", active: "bg-destructive", idle: "bg-destructive/20" },
    { key: "orange", active: "bg-chart-5", idle: "bg-chart-5/20" },
    { key: "yellow", active: "bg-chart-4", idle: "bg-chart-4/20" },
    { key: "light_green", active: "bg-success/70", idle: "bg-success/15" },
    { key: "green", active: "bg-success", idle: "bg-success/20" },
  ] as const;

  return (
    <div>
      <div className="flex items-center gap-1" aria-label={`Termômetro de reputação: ${meta.label}`}>
        {segments.map((seg, idx) => {
          const isCurrent = meta.step === idx + 1;
          const isReached = meta.step > 0 && idx + 1 <= meta.step;
          return (
            <span
              key={seg.key}
              className={`flex-1 rounded-full transition-all ${isCurrent ? "h-2.5 ring-2 ring-foreground/25" : "h-1.5"} ${
                meta.step === 0 ? "bg-muted" : isReached ? seg.active : seg.idle
              }`}
            />
          );
        })}
      </div>
      {!compact && <p className={`mt-1.5 text-xs font-semibold ${meta.textClass}`}>{meta.label}</p>}
    </div>
  );
}

export function MedalBadge({ medal }: { medal: SellerMedal | string | null | undefined }) {
  if (!medal || medal === "none") return null;
  const key = (medal in MEDAL_META ? medal : "none") as SellerMedal;
  const label = MEDAL_META[key].label;
  if (!label) return null;
  const styles: Record<Exclude<SellerMedal, "none">, string> = {
    lider: "bg-success/15 text-success border-success/30",
    lider_gold: "bg-chart-4/20 text-chart-4 border-chart-4/40",
    lider_platinum: "bg-primary/15 text-primary border-primary/35",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
        styles[key as Exclude<SellerMedal, "none">]
      }`}
    >
      <Award className="h-3 w-3" />
      {label}
    </span>
  );
}

export function BuyerTierBadge({ tier }: { tier: BuyerTier | string }) {
  const key = (tier in BUYER_TIER_META ? tier : "novo") as BuyerTier;
  const meta = BUYER_TIER_META[key];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}>
      {meta.label}
    </span>
  );
}

export function ReputationMeter({ level, thermometer }: { level: string; thermometer?: ThermometerLevel | undefined }) {
  return <ThermometerBar thermometer={thermometer ?? legacyLevelToThermometer(level)} />;
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

type SellerThermoRow = {
  claim_rate: number;
  cancel_rate: number;
  on_time_rate: number;
  avg_response_hours: number | null;
  thermometer: ThermometerLevel;
  medal: SellerMedal;
  strike_status: StrikeStatus;
  score: number;
};

export function useSellerThermometer(id?: string) {
  return useQuery<SellerThermoRow | null>({
    queryKey: ["seller-thermometer", id],
    enabled: !!id && isSupabaseConfigured(),
    staleTime: 60000,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown[] | null; error: unknown }>;
      }).rpc("get_seller_thermometer", { _seller_id: id });
      if (error || !Array.isArray(data) || !data[0]) return null;
      const r = data[0] as Record<string, unknown>;
      return {
        claim_rate: Number(r["claim_rate"] ?? 0),
        cancel_rate: Number(r["cancel_rate"] ?? 0),
        on_time_rate: Number(r["on_time_rate"] ?? 100),
        avg_response_hours: r["avg_response_hours"] != null ? Number(r["avg_response_hours"]) : null,
        thermometer: String(r["thermometer"] ?? "new") as ThermometerLevel,
        medal: String(r["medal"] ?? "none") as SellerMedal,
        strike_status: String(r["strike_status"] ?? "ok") as StrikeStatus,
        score: Number(r["score"] ?? 0),
      };
    },
  });
}

export function SellerTrustPanel({ sellerId, approved = false }: { sellerId: string; approved?: boolean }) {
  const { data, isPending, isError } = useSellerTrust(sellerId);
  const { data: thermo } = useSellerThermometer(sellerId);
  const activeThermometer = thermo?.thermometer ?? legacyLevelToThermometer(data?.level);
  return <section className="border-y border-border py-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-bold">Termômetro de reputação</h2>
        {thermo && <MedalBadge medal={thermo.medal} />}
      </div>
      <div className="flex items-center gap-2">
        {approved && <VerifiedPill />}
        <Link to="/ranking" className="text-xs font-semibold text-primary hover:underline">Ver ranking →</Link>
      </div>
    </div>
    {thermo?.strike_status === "restricted" && (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p><b>Restrição automática ativa:</b> taxa de reclamações ou cancelamentos acima do limite da plataforma. Novos anúncios ficam pausados até revisão do suporte.</p>
      </div>
    )}
    {thermo?.strike_status === "warning" && (
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-chart-4/40 bg-chart-4/10 p-3 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-chart-4" />
        <p><b>Alerta de desempenho:</b> mantenha reclamações e cancelamentos abaixo de 5% e postagens no prazo acima de 90% para evitar restrições.</p>
      </div>
    )}
    {isError ? <p className="mt-3 text-sm text-muted-foreground">Não foi possível consultar a reputação agora.</p> : isPending ? <p className="mt-3 text-sm text-muted-foreground">Consultando reputação…</p> : data ? <>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="mb-1.5 text-xs text-muted-foreground">Termômetro</p>
          <ThermometerBar thermometer={activeThermometer} />
        </div>
        <div>
          <p className="num text-2xl font-bold">{data.reviews ? Number(data.rating).toFixed(1) : "—"}</p>
          <p className="text-xs text-muted-foreground">{data.reviews} avaliações verificadas</p>
        </div>
        <div>
          <p className="num text-2xl font-bold">{data.completed_sales}</p>
          <p className="text-xs text-muted-foreground">vendas concluídas</p>
        </div>
        <div>
          <p className="num text-2xl font-bold">{thermo ? `${thermo.on_time_rate.toFixed(0)}%` : "—"}</p>
          <p className="text-xs text-muted-foreground">envios no prazo (SLA)</p>
        </div>
        <div>
          <p className="num text-2xl font-bold">{thermo ? `${thermo.claim_rate.toFixed(1)}%` : "—"}</p>
          <p className="text-xs text-muted-foreground">
            reclamações · {thermo ? `${thermo.cancel_rate.toFixed(1)}% cancel.` : "0% cancel."}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatResponseTime(thermo?.avg_response_hours)}</span>
        <span>· {THERMOMETER_META[activeThermometer].summary} Pedidos de teste não contam.</span>
      </div>
      <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Critérios do termômetro e medalhas</summary><dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-2"><dt className="font-medium text-foreground">Termômetro (5 cores)</dt><dd>Combina nota dos compradores, % de envios no prazo (SLA), % de reclamações e % de cancelamentos em vendas reais.</dd><dt className="font-medium text-foreground">PokeLíder / Gold / Platinum</dt><dd>Termômetro verde escuro + 25 / 75 / 250 vendas concluídas, reclamações &lt; 2%, cancelamentos &lt; 2% e envios no prazo ≥ 95%.</dd><dt className="font-medium text-foreground">Proteção automática (Strikes)</dt><dd>Com 5+ vendas, taxas de reclamação ou cancelamento acima de 5% bloqueiam novos anúncios até revisão do suporte.</dd><dt className="font-medium text-foreground">Independência</dt><dd>Medalhas e posições no ranking nunca são compradas — são calculadas automaticamente no banco de dados.</dd></dl></details>
    </> : <p className="mt-3 text-sm text-muted-foreground">Reputação ainda indisponível.</p>}
  </section>;
}
