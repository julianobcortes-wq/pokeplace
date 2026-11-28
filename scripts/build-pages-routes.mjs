import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist-pages");

const pagesHtmlPath = path.join(outDir, "pages.html");
const base = (process.env["PAGES_BASE_PATH"] ?? "/pokeplace/").replace(/\/?$/, "/");
// Rewrite relative ./favicon.png so nested routes (e.g. /pokeplace/carta/base1-4) resolve favicon cleanly.
const html = readFileSync(pagesHtmlPath, "utf8").replace(
  'href="./favicon.png"',
  `href="${base}favicon.png"`,
);

function writeRoute(relPath, content = html) {
  const full = path.join(outDir, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content);
}

writeRoute("index.html");
writeRoute("404.html");
writeRoute(".nojekyll", "");
rmSync(pagesHtmlPath, { force: true });

const leafRoutes = [
  "busca",
  "ranking",
  "carrinho",
  "colecao",
  "vender",
  "planos",
  "auth",
  "conta",
  "atendimento",
  "canais",
  "compra-garantida",
  "regras-vendedor",
  "seguranca",
  "termos",
  "privacidade",
  "minha-loja",
  "admin",
];
for (const route of leafRoutes) {
  writeRoute(`${route}.html`);
}

writeRoute("colecoes/index.html");
writeRoute("pedidos/index.html");

const demoStores = ["pokevault-sp", "charizard-club-rj", "eevee-cards-sul", "kanto-colecionaveis-mg"];
for (const slug of demoStores) {
  writeRoute(`loja/${slug}.html`);
}
writeRoute("acervo/colecionador-demo.html");

const seed = JSON.parse(readFileSync(path.join(root, "src/lib/catalog/seed.json"), "utf8"));
for (const s of seed.sets) {
  if (/^[a-zA-Z0-9._-]+$/.test(s.id)) {
    writeRoute(`colecoes/${s.id}.html`);
  }
}
for (const [, id] of seed.cards) {
  if (/^[a-zA-Z0-9._-]+$/.test(id)) {
    writeRoute(`carta/${id}.html`);
  }
}

console.log(
  `[pages] Generated index.html, 404.html, ${leafRoutes.length} leaf routes, ${seed.sets.length} sets, ${demoStores.length} stores, and ${seed.cards.length} card pages in dist-pages/`,
);
