import { defineConfig } from "nitro";

export default defineConfig({
  plugins: ["./server/plugins/cloudflare-cron.ts"],
});
