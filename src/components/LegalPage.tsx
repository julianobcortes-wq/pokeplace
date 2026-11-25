import { PageShell } from "@/components/SiteHeader";

export function LegalPage({ title, intro, sections, draft = true }: { title: string; intro: string; sections: { h: string; p: string[] }[]; draft?: boolean }) {
  return (
    <PageShell>
      <main className="mx-auto max-w-3xl px-4 py-10">
        {draft && <p className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs">Rascunho para revisão jurídica. Este texto ainda não foi validado por advogado.</p>}
        <h1 className="mt-4 font-display text-4xl font-bold">{title}</h1>
        <p className="mt-3 text-muted-foreground">{intro}</p>
        {sections.map((s) => (
          <section key={s.h} className="mt-8">
            <h2 className="text-xl font-semibold">{s.h}</h2>
            {s.p.map((t) => <p key={t} className="mt-2 text-muted-foreground">{t}</p>)}
          </section>
        ))}
        <p className="mt-10 text-xs text-muted-foreground">Última atualização: novembro de 2026.</p>
      </main>
    </PageShell>
  );
}

export const legalHead = (title: string, description: string) => ({
  meta: [
    { title: `${title} | PokePlace` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} | PokePlace` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ],
});
