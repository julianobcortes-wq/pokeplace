import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

  const routes = [
    "/",
    "/busca",
    "/colecoes",
    "/colecoes/base1",
    "/carta/base1-4",
    "/loja/pokeplace-oficial",
    "/carrinho",
    "/vender",
    "/planos",
    "/auth",
    "/canais",
    "/colecao",
    "/pedidos",
    "/minha-loja",
    "/admin",
    "/conta",
    "/atendimento",
    "/compra-garantida",
    "/regras-vendedor",
    "/seguranca",
    "/termos",
    "/privacidade",
  ];

  for (const path of routes) {
    it(`matches ${path} instead of falling back to root`, () => {
      const matches = router.matchRoutes(path);
      expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    });
  }
});
