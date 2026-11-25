import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import "@lovable.dev/cloud-auth-js/styles.css";
import { BRAND } from "@/lib/format";

const safeNext = (n?: string) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s["next"] === "string" ? { next: s["next"] } : {}),
  head: () => ({
    meta: [
      { title: `Entrar ou criar conta | ${BRAND.name}` },
      { name: "description", content: "Acesse sua conta para comprar, vender e acompanhar pedidos." },
      { property: "og:title", content: `Entrar | ${BRAND.name}` },
      { property: "og:description", content: "Acesse sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { next } = Route.useSearch();
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next);

  useEffect(() => {
    sessionStorage.setItem("auth_next", dest);
    supabase.auth.getUser().then(({ data }) => { if (data.user) nav({ href: dest }); });
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === "SIGNED_IN") nav({ href: sessionStorage.getItem("auth_next") || "/" }); });
    return () => sub.subscription.unsubscribe();
  }, [dest, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + dest } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (mode === "up") toast.success("Conta criada! Confira seu e-mail para confirmar.");
  };
  const social = async (p: "google" | "lovable") => {
    const r = await lovable.auth.signInWithOAuth(p, { redirect_uri: window.location.origin });
    if (r.error) toast.error(String(r.error.message ?? r.error));
  };

  return (
    <PageShell>
      <main className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-md bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">{mode === "in" ? "Entrar" : "Criar conta"}</h1>
          <div className="mt-5 space-y-2">
            <button type="button" onClick={() => social("google")} className="flex w-full items-center justify-center gap-2.5 rounded-md border border-input bg-card px-3 py-2.5 text-sm font-medium">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
              Continue with Google
            </button>
            <button type="button" className="lovable-auth-button w-full" onClick={() => social("lovable")}>Continue with Lovable</button>
          </div>
          <div className="my-5 text-center text-xs text-muted-foreground">ou com e-mail</div>
          <form onSubmit={submit} className="space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="w-full rounded-md border border-input bg-card px-3 py-2" />
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" className="w-full rounded-md border border-input bg-card px-3 py-2" />
            <button disabled={busy} className="w-full rounded-md bg-primary py-2.5 font-semibold text-primary-foreground disabled:opacity-50">{mode === "in" ? "Entrar" : "Criar conta"}</button>
          </form>
          <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-primary">
            {mode === "in" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
          </button>
        </div>
      </main>
    </PageShell>
  );
}
