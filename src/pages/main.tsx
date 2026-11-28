import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, useRouterState } from "@tanstack/react-router";
import { getRouter } from "@/router";
import "@/styles.css";

const router = getRouter();

function DocumentHeadSync() {
  const title = useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i--) {
        const meta = state.matches[i]?.meta;
        if (!meta) continue;
        for (const entry of meta) {
          if (entry && typeof entry === "object" && "title" in entry && typeof entry.title === "string") {
            return entry.title;
          }
        }
      }
      return "PokePlace — Marketplace e preços de cartas Pokémon";
    },
  });

  useEffect(() => {
    document.title = title;
  }, [title]);

  return null;
}

function PagesApp() {
  return (
    <RouterProvider
      router={router}
      InnerWrap={({ children }) => (
        <>
          <DocumentHeadSync />
          {children}
        </>
      )}
    />
  );
}

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <PagesApp />
    </StrictMode>,
  );
}
