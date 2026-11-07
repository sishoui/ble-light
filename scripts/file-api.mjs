/**
 * 面板的文件读取接口。
 *
 * 只允许读「被 map.generated.json 索引过的文件」——索引本身就是白名单，
 * 所以不存在路径穿越，也读不到 .env / node_modules / .git 里的东西。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize, resolve, sep } from "node:path";

const MAX_BYTES = 512 * 1024;

export const TEXT_EXT = new Set([
  ".c", ".h", ".ts", ".js", ".mjs", ".vue", ".json", ".md", ".css",
  ".wxml", ".wxss", ".py", ".cmd", ".bat", ".yml", ".yaml", ".toml", ".csv",
  ".html", ".txt", ".gitignore", ".gitattributes",
]);

/**
 * @param {string} root 仓库根目录
 * @param {Set<string>} allowed 允许读取的相对路径集合（来自 map.generated.json）
 * @param {string} relPath 请求的相对路径
 * @returns {{ ok: true, path: string, text: string, truncated: boolean, lines: number }
 *          | { ok: false, status: number, error: string }}
 */
export function readRepoFile(root, allowed, relPath) {
  if (typeof relPath !== "string" || !relPath) {
    return { ok: false, status: 400, error: "缺少 path 参数" };
  }

  // 归一化后必须是相对路径，且解析结果仍在 root 内
  const cleaned = relPath.split("\\").join("/").replace(/^\/+/, "");
  const normalized = normalize(cleaned).split(sep).join("/");
  const abs = resolve(root, normalized);
  const rootAbs = resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    return { ok: false, status: 400, error: "路径越界" };
  }
  if (normalized.startsWith("..") || normalized.split("/").includes("..")) {
    return { ok: false, status: 400, error: "路径越界" };
  }

  if (!allowed.has(normalized)) {
    return { ok: false, status: 403, error: "该文件未被索引，不允许读取" };
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { ok: false, status: 404, error: "文件不存在" };
  }

  const ext = normalized.slice(normalized.lastIndexOf(".")).toLowerCase();
  if (!TEXT_EXT.has(ext) && !normalized.endsWith(".gitignore")) {
    return { ok: false, status: 415, error: `不支持预览 ${ext || "该类型"}` };
  }

  const size = statSync(abs).size;
  const buf = readFileSync(abs);
  const slice = buf.subarray(0, MAX_BYTES);
  if (slice.includes(0)) {
    return { ok: false, status: 415, error: "二进制文件" };
  }
  const text = slice.toString("utf8");

  return {
    ok: true,
    path: normalized,
    text,
    truncated: size > MAX_BYTES,
    lines: text.split("\n").length,
    bytes: size,
  };
}

/** 从 map.generated.json 内容里取出允许读取的路径集合。 */
export function allowedPaths(mapJson) {
  const list = mapJson?.files?.list ?? [];
  return new Set(list.filter((f) => !f.binary).map((f) => f.path));
}

export function mapPath(root) {
  return join(root, "docs", "map.generated.json");
}

export function loadAllowed(root) {
  const p = mapPath(root);
  if (!existsSync(p)) return new Set();
  try {
    return allowedPaths(JSON.parse(readFileSync(p, "utf8")));
  } catch {
    return new Set();
  }
}
