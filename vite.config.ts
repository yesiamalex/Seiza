import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Keeps local-only test models out of every build.
 *
 * `public/__poselab/` holds VRM files for the local pose lab, some of which
 * may not be redistributed. The folder is gitignored, but Vite copies all of
 * `public/` into `dist/`, so a deploy from this machine would have served
 * them publicly. The dev server still serves the folder, so the pose lab
 * keeps working.
 */
function excludeLocalOnlyAssets(): Plugin {
  return {
    name: "seiza-exclude-local-only-assets",
    apply: "build",
    closeBundle() {
      rmSync(resolve(__dirname, "dist/__poselab"), { recursive: true, force: true });
    },
  };
}

/**
 * Serves a separate world's files in development, as its build.mjs does in
 * a build: /worlds/<id>/... from worlds/<id>/world/... (its world.json, and
 * any pictures it ships). So `VITE_SEIZA_WORLD_ID=seisugbo npm run dev`
 * runs that world with hot reload. Files in public/worlds/ win, as before.
 */
function serveWorldFolders(): Plugin {
  const types: Record<string, string> = { ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
  return {
    name: "seiza-serve-world-folders",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.split("?")[0].match(/^\/worlds\/([a-z0-9-]+)\/(.+)$/);
        if (!match || match[2].includes("..")) return next();
        const file = resolve(__dirname, "worlds", match[1], "world", match[2]);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
  };
}

// Static frontend dev server only. The Worker (worker/index.ts, which
// also hosts the room server as a bound Durable Object — worker/room.ts)
// runs separately via `npm run worker:dev` — see DOCS.md's "Local
// development" section.
export default defineConfig({
  plugins: [react(), excludeLocalOnlyAssets(), serveWorldFolders()],
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
