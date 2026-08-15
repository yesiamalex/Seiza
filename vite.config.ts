import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static frontend only. The realtime room server (party/room.ts) and the
// Cloudflare Worker config (wrangler.jsonc) are built/deployed separately —
// see README.md for the current split and the open question about
// unifying them behind a single "Deploy to Cloudflare" flow.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
