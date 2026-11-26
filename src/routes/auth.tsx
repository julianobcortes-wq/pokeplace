import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/SiteHeader";
import { isSupabaseConfigured } from "@/lib/runtime-config";
import { supabase } from "@/integrations/supabase/client";
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
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const dest = safeNext(next);

  useEffect(() => {
    sessionStorage.setItem("auth_next", dest);
    if (!isSupabaseConfigured()) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) nav({ href: dest });
    }).catch(() => undefined);
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN") nav({ href: sessionStorage.getItem("auth_next") || "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [dest, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) {
          toast.error(error.message);
        } else {
          toast.success("Se existir conta com este e-mail, enviamos o link de redefinição.");
          setMode("in");
        }
        return;
      }
      const { error } =
        mode === "in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + dest } });
      if (error) {
        toast.error(error.message);
        return;
      }
      if (mode === "up") toast.success("Conta criada! Confira seu e-mail para confirmar.");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + dest },
      });
      if (error) toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <PageShell>
      <main className="mx-auto max-w-md px-4 py-8 md:py-12">
        <div className="rounded-3xl border border-border bg-card p-7 shadow-float">
          <p className="num text-[11px] uppercase tracking-[0.2em] text-primary">{BRAND.name}</p>
          <h1 className="mt-1 text-3xl font-extrabold">
            {mode === "in" ? "Entrar na conta" : mode === "up" ? "Criar conta" : "Recuperar senha"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "reset"
              ? "Informe o e-mail cadastrado para receber o link de redefinição."
              : "Compre com Compra Garantida, salve seu acervo e acompanhe seus pedidos."}
          </p>

          {mode !== "reset" && (
            <>
              <div className="mt-6">
                <button
                  type="button"
                  disabled={busy}
                  onClick={google}
                  className="flex w-full items-center justify-center gap-2.5 rounded-full border border-input bg-background px-4 py-2.5 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                    />
                  </svg>
                  Continuar com Google
                </button>
              </div>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                ou com e-mail
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={submit} className={mode === "reset" ? "mt-6 space-y-3" : "space-y-3"}>
            <label className="block text-xs font-medium text-muted-foreground">
              E-mail
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className={`mt-1 ${input}`} />
            </label>
            {mode !== "reset" && (
              <label className="block text-xs font-medium text-muted-foreground">
                Senha
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={`mt-1 ${input}`}
                />
              </label>
            )}
            <button
              disabled={busy}
              className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Aguarde…" : mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Enviar link"}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-semibold text-primary hover:underline">
              {mode === "in" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
            </button>
            {mode === "in" && (
              <button type="button" onClick={() => setMode("reset")} className="text-muted-foreground hover:text-foreground">
                Esqueci minha senha
              </button>
            )}
          </div>

          <p className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
            Ao continuar, você concorda com os{" "}
            <Link to="/termos" className="text-primary underline">
              Termos de uso
            </Link>{" "}
            e a{" "}
            <Link to="/privacidade" className="text-primary underline">
              Privacidade
            </Link>
            .
          </p>
        </div>
      </main>
    </PageShell>
  );
}
