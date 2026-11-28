import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env["PAGES_BASE_PATH"] ?? "/pokeplace/").replace(/\/?$/, "/");

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: [
      { find: /^@tanstack\/react-start\/server$/, replacement: path.resolve(__dirname, "src/pages/start-server-shim.ts") },
      { find: /^@tanstack\/react-start$/, replacement: path.resolve(__dirname, "src/pages/start-shim.ts") },
      { find: /^@\/integrations\/supabase\/client\.server$/, replacement: path.resolve(__dirname, "src/pages/client-server-shim.ts") },
      { find: /^@\/lib\/public-db$/, replacement: path.resolve(__dirname, "src/pages/public-db-shim.ts") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  define: {
    "process.env": JSON.stringify({}),
    "import.meta.env.VITE_DEMO_MODE": JSON.stringify("true"),
  },
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "pages.html"),
    },
  },
});
