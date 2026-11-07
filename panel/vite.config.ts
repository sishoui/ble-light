/** 面板的构建配置：Vue 插件 + 两个开发期接口（map 数据、文件内容）。 */
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAllowed, readRepoFile } from "../scripts/file-api.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(here, "..");
const MAP_FILE = resolve(ROOT, "docs", "map.generated.json");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * 面板运行时读 /map.generated.json 与 /api/file?path=...，都不打包进 bundle。
 * 重新生成后刷新页面就能看到新数据，不用重新 build。
 */
function panelApi() {
  return {
    name: "panel-api",
    configureServer(server) {
      server.middlewares.use("/map.generated.json", (_req, res) => {
        if (!existsSync(MAP_FILE)) {
          json(res, 404, { error: "map.generated.json 不存在，先跑 npm run map" });
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(MAP_FILE));
      });

      server.middlewares.use("/api/file", (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.searchParams.get("path") ?? "";
        // 每次请求重新读白名单：map 重新生成后无需重启 dev server
        const result = readRepoFile(ROOT, loadAllowed(ROOT), path);
        if (!result.ok) {
          json(res, result.status, { error: result.error });
          return;
        }
        json(res, 200, result);
      });
    },
    closeBundle() {
      if (existsSync(MAP_FILE)) copyFileSync(MAP_FILE, resolve(here, "dist", "map.generated.json"));
    },
  };
}

export default defineConfig({
  plugins: [vue(), panelApi()],
  server: { port: 5180 },
  build: { outDir: "dist", emptyOutDir: true },
});
