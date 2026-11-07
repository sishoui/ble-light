import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(here, "..");
const MAP_FILE = resolve(ROOT, "docs", "map.generated.json");

/**
 * 面板运行时读 /map.generated.json，不打包进 bundle。
 * 这样重新生成后刷新页面就能看到新数据，不用重新 build。
 */
function serveMap() {
  return {
    name: "serve-map",
    configureServer(server) {
      server.middlewares.use("/map.generated.json", (_req, res) => {
        if (!existsSync(MAP_FILE)) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "map.generated.json 不存在，先跑 npm run map" }));
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(MAP_FILE));
      });
    },
    closeBundle() {
      if (existsSync(MAP_FILE)) copyFileSync(MAP_FILE, resolve(here, "dist", "map.generated.json"));
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveMap()],
  server: { port: 5180 },
  build: { outDir: "dist", emptyOutDir: true },
});
