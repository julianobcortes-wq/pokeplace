import { NotificationBell } from "@/components/ops";
import { Link, useNavigate } from "@tanstack/react-router";
import { Home, Layers, Moon, Search, ShoppingBag, Sun, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/useAuth";
import { searchCards } from "@/lib/catalog.functions";
import { BRAND } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "./ui/button";
import logoCard from "@/assets/logo-card.png";

type Hit = Awaited<ReturnType<typeof searchCards>>[number];

export function Logo({ imgClass = "h-10" }: { imgClass?: string }) {
  return (
    <Link to="/" className="flex shrink-0 items-center" aria-label={BRAND.name}>
      <img src={logoCard} alt={BRAND.name} width={944} height={399} className={`${imgClass} w-auto`} />
    </Link>
  );
}

export function SearchBox({ big = false }: { big?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setHits([]); return; }
    t.current = setTimeout(async () => {
      try { setHits(await searchCards({ data: { q, limit: 8 } })); } catch { setHits([]); }
    }, 200);
  }, [q]);
  const go = () => { setOpen(false); navigate({ to: "/busca", search: { q, set: undefined, rarity: undefined } }); };
  return (
    <div className="relative w-full">
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(); }}
        className={`flex items-center gap-2 rounded-full border border-border bg-card text-foreground shadow-sm focus-within:ring-2 focus-within:ring-ring ${big ? "px-5 py-3.5" : "px-4 py-2"}`}>
        <Search className={big ? "h-5 w-5 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={big ? "Charizard, 4/102, sv3pt5-199…" : "Buscar cartas"} aria-label="Buscar cartas"
          className={`w-full bg-transparent outline-none placeholder:text-muted-foreground ${big ? "text-lg" : "text-sm"}`} />
        {big && <button className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Buscar</button>}
      </form>
      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
          {hits.map((h) => (
            <Link key={h.id} to="/carta/$cardId" params={{ cardId: h.id }} onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2 hover:bg-muted">
              {h.image_small && <img src={h.image_small} alt="" className="h-12 w-auto rounded-sm" />}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{h.name} <span className="num text-muted-foreground">#{h.number}</span></p>
                <p className="truncate text-xs text-muted-foreground">{h.card_sets?.name} · {h.rarity ?? "—"}</p>
              </div>
            </Link>
          ))}
          <button onMouseDown={go} className="w-full border-t border-border px-3 py-2 text-left text-sm font-medium text-primary">Ver todos os resultados →</button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { const d = localStorage.getItem("theme") === "dark"; setDark(d); document.documentElement.classList.toggle("dark", d); }, []);
  return (
    <button aria-label="Alternar tema" onClick={() => { const d = !dark; setDark(d); localStorage.setItem("theme", d ? "dark" : "light"); document.documentElement.classList.toggle("dark", d); }}
      className="rounded-full p-2 opacity-80 hover:bg-ink-foreground/10 hover:opacity-100">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function SiteHeader() {
  const { items } = useCart();
  const { user, isAdmin, roles } = useAuth();
  const count = items.reduce((s, i) => s + i.qty, 0);
  const nav = "rounded-full px-3 py-1.5 opacity-75 transition hover:bg-ink-foreground/10 hover:opacity-100 [&.active]:bg-ink-foreground/10 [&.active]:opacity-100";
  return (
    <header className="sticky top-0 z-30 bg-ink text-ink-foreground">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2">
        <Logo imgClass="h-12" />
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          <Link to="/" className={nav} activeOptions={{ exact: true }}>Marketplace</Link>
          <Link to="/colecoes" className={nav}>Coleções</Link>
          <Link to="/canais" className={nav}>Canais</Link>
          <Link to="/vender" className={nav}>Vender</Link>
          <Link to="/colecao" className={nav}>Meu acervo</Link>
          {roles.includes("seller") && <Link to="/minha-loja" className={nav}>Minha loja</Link>}
          {isAdmin && <Link to="/admin" className={nav}>Admin</Link>}
        </nav>
        <div className="ml-auto hidden w-72 md:block"><SearchBox /></div>
        <div className="flex items-center gap-1 text-sm">
          <ThemeToggle />
          {user ? (
            <>
              <NotificationBell userId={user.id} />
              <Link to="/pedidos" className={nav}>Pedidos</Link>
              <Link to="/conta" className={nav}>Conta</Link>
              <Button variant="ghost" onClick={() => supabase.auth.signOut()} className={nav}>Sair</Button>
            </>
          ) : <Link to="/auth" className="rounded-full bg-ink-foreground px-4 py-1.5 font-medium text-ink">Entrar</Link>}
          <Link to="/carrinho" aria-label="Carrinho" className="relative rounded-full p-2 hover:bg-ink-foreground/10">
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count}</span>}
          </Link>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden"><SearchBox /></div>
      <div className="holo-edge h-[3px]" />
    </header>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <SiteHeader />
      {children}
      <BottomNav />
      <footer className="grain mt-20 bg-ink-glow text-ink-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-6 px-4 py-10 text-sm">
          <div><Logo imgClass="h-12" /><p className="mt-2 max-w-sm opacity-60">{BRAND.tagline}.</p></div>
          <nav aria-label="Ajuda" className="flex flex-wrap gap-4"><Link to="/compra-garantida">Compra Garantida</Link><Link to="/seguranca">Segurança</Link><Link to="/termos">Termos</Link><Link to="/privacidade">Privacidade</Link><Link to="/regras-vendedor">Regras para lojas</Link><Link to="/atendimento">Atendimento</Link><Link to="/colecao">Minha coleção</Link><Link to="/planos">Planos</Link><Link to="/vender">Vender</Link></nav>
          <p className="max-w-md text-xs opacity-50">Catálogo baseado em dados abertos (PokemonTCG/pokemon-tcg-data). Pokémon e nomes relacionados são marcas de seus respectivos donos.</p>
        </div>
      </footer>
    </div>
  );
}

function BottomNav() {
  const { items } = useCart();
  const { user } = useAuth();
  const count = items.reduce((s, i) => s + i.qty, 0);
  const cls = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium opacity-60 transition [&.active]:opacity-100 [&.active]:text-primary";
  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-3 bottom-3 z-40 flex rounded-2xl border border-ink-foreground/10 bg-ink/95 text-ink-foreground shadow-float backdrop-blur lg:hidden">
      <Link to="/" activeOptions={{ exact: true }} className={cls}><Home className="h-5 w-5" />Início</Link>
      <Link to="/busca" search={{ q: undefined, set: undefined, rarity: undefined }} className={cls}><Search className="h-5 w-5" />Buscar</Link>
      <Link to="/colecao" className={cls}><Layers className="h-5 w-5" />Meu acervo</Link>
      <Link to="/carrinho" className={cls}>
        <span className="relative"><ShoppingBag className="h-5 w-5" />{count > 0 && <span key={count} className="num animate-pop absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{count}</span>}</span>Carrinho
      </Link>
      <Link to={user ? "/pedidos" : "/auth"} className={cls}><User className="h-5 w-5" />{user ? "Conta" : "Entrar"}</Link>
    </nav>
  );
}
