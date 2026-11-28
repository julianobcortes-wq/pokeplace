import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // One client per request: a module-level QueryClient leaks cached data between SSR requests.
  const queryClient = new QueryClient();
  const rawBase = (
    (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"
  ).replace(/\/+$/, "");
  const basepath = rawBase && rawBase !== "/" ? rawBase : undefined;

  const router = createRouter({
    routeTree,
    ...(basepath ? { basepath } : {}),
    context: { queryClient },
    scrollRestoration: true,
    // Lets Query own freshness; set caching defaults on the QueryClient, not the router.
    defaultPreloadStaleTime: 0,
  });

  return router;
};
