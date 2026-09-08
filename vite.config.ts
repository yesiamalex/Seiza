import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static frontend dev server only. The Worker (worker/index.ts, which
// also hosts the room server as a bound Durable Object — worker/room.ts)
// runs separately via `npm run worker:dev` — see README.md's "Local
// development" section.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/rooms": { target: "ws://127.0.0.1:8787", ws: true, changeOrigin: true },
    },
  },
});
