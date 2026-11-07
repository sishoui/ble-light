#!/usr/bin/env node
/**
 * 扫描仓库，生成 docs/map.generated.json。
 *
 * 面板只读这个产物，所以面板里没有一个手抄的数字。
 * 维护 = 跑一次 `npm run map`；`npm run map:check` 在 CI 里检查是否过期。
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectTasks, ghAvailable } from "./tasks.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_JSON = join(ROOT, "docs", "map.json");
// --out：让测试写到别处，不污染真实产物。
const outArg = process.argv.indexOf("--out");
const OUT = outArg !== -1 && process.argv[outArg + 1]
  ? resolve(process.argv[outArg + 1])
  : join(ROOT, "docs", "map.generated.json");

const IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", ".vite", "__pycache__", ".pytest_cache",
  "build", "managed_components", ".reports", ".sim-out", ".layout-shots",
  ".scope-shots", ".test-run-tmp", ".runs", ".scratch", ".zcode", ".vscode",
]);

const TEXT_EXT = new Set([
  ".c", ".h", ".ts", ".js", ".mjs", ".vue", ".json", ".md", ".css",
  ".wxml", ".wxss", ".py", ".cmd", ".bat", ".yml", ".yaml", ".toml", ".csv",
  ".html", ".txt", ".gitignore", ".gitattributes",
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm",
  ".bin", ".hex", ".elf", ".pdf", ".zip",
]);

const TEST_HINT = /(^|[\\/])(tests?|__tests__|spec)([\\/]|$)|\.(test|spec)\.[cm]?[jt]sx?$|^test_.*\.c$|_test\.(c|cc|cpp)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function toPosix(p) {
  return p.split(sep).join("/");
}

function rel(abs) {
  return toPosix(relative(ROOT, abs));
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function lineCount(abs) {
  try {
    const buf = readFileSync(abs);
    if (buf.includes(0)) return 0;
    return buf.toString("utf8").split("\n").length - (buf.at(-1) === 10 ? 1 : 0);
  } catch {
    return 0;
  }
}

/** 文档头部 frontmatter：---\npurpose: ...\nstatus: ...\n--- */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text, has: false };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: text.slice(m[0].length), has: true };
}

function firstHeading(body) {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1].trim() : null;
}

/** 提取 markdown 表格里的验收行：| # | 项 | ... | 状态 | 证据 | */
function parseAcceptance(text) {
  const rows = [];
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(raw);
    if (h) { section = h[1].trim(); continue; }
    const cells = raw.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    if (!/^[A-Z]\d+$/.test(cells[0])) continue;
    rows.push({
      id: cells[0],
      area: section,
      title: cells[1],
      how: cells[2],
      status: cells[3],
      evidence: cells[4],
    });
  }
  return rows;
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return "";
  }
}

function gitAvailable() {
  return git(["rev-parse", "--is-inside-work-tree"]) === "true";
}

/** 迭代 = 合并进 main 的合并提交；无合并时按连续提交分块。 */
function collectIterations() {
  if (!gitAvailable()) return { iterations: [], note: "不是 git 仓库，迭代不可用" };

  const raw = git([
    "log", "HEAD", "--first-parent", "--reverse",
    "--pretty=format:%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1f%b%x1e",
  ]);
  if (!raw) return { iterations: [], note: "没有提交" };

  const commits = raw.split("\x1e").map((s) => s.trim()).filter(Boolean).map((block) => {
    const [hash, short, date, author, subject, body] = block.split("\x1f");
    return { hash, short, date, author, subject, body: body ?? "" };
  });

  const mergeSet = new Set(
    git(["log", "HEAD", "--first-parent", "--merges", "--pretty=format:%H"])
      .split("\n").map((s) => s.trim()).filter(Boolean),
  );
  const merges = commits.filter((c) => mergeSet.has(c.hash));
  const iterations = [];

  if (merges.length === 0) {
    iterations.push({
      index: 1,
      id: commits.at(-1)?.short ?? "head",
      title: "初始提交",
      date: commits.at(-1)?.date ?? null,
      commits: commits.length,
      pr: null,
      branch: null,
      sha: commits.at(-1)?.hash ?? null,
      body: "",
      files: [],
    });
    return { iterations, note: "尚无合并提交，按单次提交计" };
  }

  for (let i = 0; i < merges.length; i++) {
    const merge = merges[i];
    const prMatch = /^Merge pull request #(\d+)/.exec(merge.subject);
    const pr = prMatch ? Number(prMatch[1]) : null;
    const branch = /from [^\s/]+\/(\S+)/.exec(merge.subject)?.[1]
      ?? /into [^\s]+ from (\S+)/.exec(merge.subject)?.[1]
      ?? null;
    const prev = i === 0 ? null : merges[i - 1].hash;
    const range = prev ? `${prev}..${merge.hash}` : merge.hash;

    const log = git(["log", `${range}`, "--pretty=format:%h%x1f%s%x1e"]);
    const commitList = log.split("\x1e").map((s) => s.trim()).filter(Boolean).map((line) => {
      const [short, subject] = line.split("\x1f");
      return { short, subject };
    });

    const base = prev ?? `${merge.hash}^1`;
    const stat = git(["diff", "--numstat", base, merge.hash]);
    const files = stat.split("\n").filter(Boolean).map((line) => {
      const [add, del, path] = line.split("\t");
      return { path, add: Number(add) || 0, del: Number(del) || 0 };
    });

    const branchTip = git(["rev-parse", "--verify", "--quiet", `${merge.hash}^2`]);
    const title = branchTip
      ? git(["log", "-1", "--pretty=%s", `${merge.hash}^2`])
      : merge.subject;

    iterations.push({
      index: i + 1,
      id: pr ? `pr-${pr}` : merge.short,
      title,
      date: merge.date,
      commits: commitList.length,
      pr,
      branch,
      sha: merge.hash,
      short: merge.short,
      body: merge.body.trim(),
      files: files.sort((a, b) => b.add + b.del - (a.add + a.del)).slice(0, 40),
      fileCount: files.length,
      additions: files.reduce((n, f) => n + f.add, 0),
      deletions: files.reduce((n, f) => n + f.del, 0),
      commitList,
    });
  }

  return { iterations, note: null };
}

function collectDocs(config) {
  const docsDir = join(ROOT, config.rules.docsDir);
  const files = walk(docsDir).filter((f) => f.endsWith(".md"));
  const docs = files.map((abs) => {
    const text = readFileSync(abs, "utf8");
    const fm = parseFrontmatter(text);
    const path = rel(abs);
    return {
      path,
      name: path.split("/").pop(),
      title: firstHeading(fm.body) ?? path,
      purpose: fm.data.purpose ?? null,
      status: fm.data.status ?? null,
      hasFrontmatter: fm.has,
      lines: text.split("\n").length,
      bytes: statSync(abs).size,
      hash: sha256(text),
      isAdr: /^docs\/adr\//.test(path),
      isAgentDoc: /^docs\/agents\//.test(path),
    };
  });
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * 从文件头读「这个文件做什么」。
 * 优先取紧跟头部注释/文档块的第一段有意义文字，不要求任何特殊标记。
 */
function describeFile(text, path) {
  const ext = path.slice(path.lastIndexOf("."));

  // 跳过 shebang，否则所有 /* ... */ 开头的脚本都读不到注释
  const src = text.replace(/^#![^\n]*\n/, "");

  // JSON 没有注释，读约定字段
  if (ext === ".json") {
    try {
      const obj = JSON.parse(src);
      const d = obj.$comment ?? obj.description ?? null;
      if (typeof d === "string" && d.trim()) return clip(d.trim());
    } catch {
      /* 解析失败就走通用路径 */
    }
  }

  // .vue：注释在 <script setup> 里
  if (ext === ".vue") {
    const m = /<script[^>]*>\s*(\/\*\*?[\s\S]*?\*\/)/.exec(src);
    if (m) {
      const body = m[1].replace(/^\/\*\*?/, "").replace(/\*\/$/, "")
        .split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, "").trim()).filter(Boolean);
      if (body.length) return clip(body.join(" "));
    }
  }

  // JSDoc/块注释开头的 /** ... */ 或 /* ... */
  const block = /^\s*\/\*\*?([\s\S]*?)\*\//.exec(src);
  if (block) {
    const body = block[1]
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*\*?\s?/, "").trim())
      .filter((l) => l && !l.startsWith("@"));
    const prose = body.filter((l) => !/^[{}()[\];]/.test(l) && !/^(import|export|const|let|function|class)\b/.test(l));
    if (prose.length) return clip(prose.join(" "));
  }

  // 头部 // 行注释（C / TS）
  const lines = src.split(/\r?\n/).slice(0, 30);
  const commentLines = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (commentLines.length) break;
      continue;
    }
    if (t.startsWith("//")) {
      const body = t.replace(/^\/\/+/, "").trim();
      if (body) commentLines.push(body);
      continue;
    }
    if (commentLines.length) break;
    if (/^(import|export|const|let|var|function|class|package|#include|#define|<!doctype|<html)/i.test(t)) break;
  }
  if (commentLines.length) return clip(commentLines.join(" "));

  // CSS / HTML 块注释
  if (ext === ".css" || ext === ".html") {
    const c = /^\s*\/\*([\s\S]*?)\*\/|^<!--([\s\S]*?)-->/.exec(src);
    if (c) {
      const raw = c[1] ?? c[2] ?? "";
      const body = raw.split(/\r?\n/).map((l) => l.replace(/^\s*\*?\s?/, "").trim()).filter(Boolean);
      if (body.length) return clip(body.join(" "));
    }
  }

  // HTML 的 <!-- --> 可能在 <!doctype> 之后
  const htmlComment = /<!--([\s\S]*?)-->/.exec(src.slice(0, 400));
  if (htmlComment) {
    const body = htmlComment[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (body.length) return clip(body.join(" "));
  }

  // 生成的 JSON 没有注释也没有描述字段，用文件名说明
  if (ext === ".json") {
    return `JSON 数据文件${path.includes("generated") || path.includes("vectors") ? "（生成物，不要手改）" : ""}`;
  }

  // 点文件：本身就是「忽略规则」这份数据
  if (path === ".gitignore") {
    return "Git 忽略规则：node_modules、构建产物、报告与临时目录不进仓库。";
  }

  // markdown 用第一个标题
  if (ext === ".md") {
    const h = /^#\s+(.+)$/m.exec(src);
    if (h) return clip(h[1].trim());
  }

  return null;
}

function clip(s, max = 220) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function collectTests(config) {
  const roots = ["firmware", "miniprogram", "panel", "scripts", "tests", "src"];
  const toolingPaths = config.rules?.toolingTestPaths ?? [];
  const toolingSeam = config.rules?.toolingTestSeam ?? null;
  const files = [];
  for (const r of roots) {
    for (const abs of walk(join(ROOT, r))) {
      const p = rel(abs);
      if (TEST_HINT.test(p)) files.push(abs);
    }
  }
  return files.map((abs) => {
    const text = readFileSync(abs, "utf8");
    const path = rel(abs);
    const isTooling = toolingPaths.some((tp) => path.startsWith(tp));
    const isC = path.endsWith(".c");
    const cases = isC
      ? (text.match(/^\s*RUN_TEST\s*\(/gm) ?? []).length
      : (text.match(/^\s*(?:it|test)\s*\(/gm) ?? []).length;
    const asserts = isC
      ? (text.match(/\b(?:TEST_ASSERT\w*|assert)\s*\(/g) ?? []).length
      : (text.match(/\bexpect\s*\(|\bassert\.\w+\s*\(/g) ?? []).length;

    // 工具测试验的是生成器本身，读源码是它的正当手段，不算违规
    let seam = null;
    if (isTooling && toolingSeam) {
      seam = toolingSeam;
    } else if (/protocol|codec|frame|chunk|commands/.test(path)) {
      seam = "protocol";
    } else if (/command|reducer|state/.test(path)) {
      seam = "reducer";
    } else if (/render|effect|pixel|gamma/.test(path)) {
      seam = "render";
    } else if (/session|transport|ble|control/.test(path)) {
      seam = "session";
    } else if (/page|component|view/.test(path)) {
      seam = "page";
    }

    const violations = [];
    if (!isTooling) {
      if (/readFileSync|readFile\(/.test(text) && /\.(ts|js|mjs|vue|wxml|wxss)/.test(text)) {
        if (/source\b|\.ts["'`]|\.wxml|\.wxss/.test(text)) violations.push("reads-source");
      }
      if (/toHaveBeenCalled|toBeCalled/.test(text)) violations.push("asserts-call");
    }
    return {
      path,
      name: path.split("/").pop(),
      description: describeFile(text, path),
      lines: text.split("\n").length,
      cases,
      asserts,
      seam,
      violations,
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function collectFiles(config) {
  const modulePaths = new Set(config.modules.map((m) => m.path));
  const files = walk(ROOT).map((abs) => {
    const path = rel(abs);
    const lastSlash = path.lastIndexOf("/");
    const ext = path.slice(path.lastIndexOf("."));
    const size = statSync(abs).size;
    const isText = TEXT_EXT.has(ext);
    const isDoc = path.startsWith("docs/") && ext === ".md";
    const isTest = TEST_HINT.test(path);
    const text = isText ? readFileSync(abs, "utf8") : null;
    return {
      path,
      name: lastSlash >= 0 ? path.slice(lastSlash + 1) : path,
      dir: lastSlash >= 0 ? path.slice(0, lastSlash) : ".",
      ext,
      size,
      lines: isText ? lineCount(abs) : null,
      binary: BINARY_EXT.has(ext),
      isDoc,
      isTest,
      module: modulePaths.has(path) ? path : null,
      description: text ? describeFile(text, path) : null,
    };
  });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function checkHealth(config, docs, tests, files) {
  const issues = [];
  const allowed = new Set(config.rules.docsAllowed);
  const prefixes = config.rules.docsAllowedPrefixes ?? [];
  const seams = config.rules.testSeams ?? {};

  // 生成物不是产品代码
  const productCode = files.filter(
    (f) =>
      !f.isDoc && !f.isTest && !f.binary &&
      !/\.gen\.|_gen\./.test(f.path) &&
      (/^firmware\/main\//.test(f.path) ||
        /^miniprogram\/utils\//.test(f.path) ||
        /^miniprogram\/pages\//.test(f.path) ||
        /^miniprogram\/components\//.test(f.path)),
  );

  for (const d of docs) {
    if (d.isAgentDoc) continue;
    const okPath = allowed.has(d.path) || prefixes.some((p) => d.path.startsWith(p));
    if (!okPath) issues.push({ level: "error", kind: "doc-not-declared", path: d.path, message: "文档不在 map.json 的 docsAllowed 里，说明它没有家" });
    if (config.rules.requireFrontmatter && !d.hasFrontmatter) issues.push({ level: "error", kind: "doc-no-frontmatter", path: d.path, message: "缺少 purpose/status frontmatter" });
    for (const pat of config.rules.bannedDocPatterns) {
      if (new RegExp(pat).test(d.name)) issues.push({ level: "error", kind: "banned-doc-name", path: d.path, message: `文件名命中禁用模式 ${pat}` });
    }
  }

  const status = docs.find((d) => d.path === "docs/status.md");
  if (status && status.lines > config.rules.maxStatusLines) {
    issues.push({ level: "error", kind: "status-too-long", path: "docs/status.md", message: `${status.lines} 行，上限 ${config.rules.maxStatusLines}` });
  }

  // 每个接缝必须至少有一个测试文件。没有产品代码时只是提醒，
  // 一旦写下第一行产品代码，缺少测试就是错误——门禁随之启用。
  const seamLevel = productCode.length > 0 ? "error" : "warn";
  for (const [seam, label] of Object.entries(seams)) {
    const covering = tests.filter((t) => t.seam === seam);
    if (covering.length === 0) {
      issues.push({
        level: seamLevel,
        kind: "seam-untested",
        path: null,
        message: productCode.length > 0
          ? `接缝「${label}」(${seam}) 没有任何测试文件`
          : `接缝「${label}」(${seam}) 暂无测试（还没有产品代码，门禁未启用）`,
      });
    }
  }

  // 有测试但不属于任何接缝 → 它没有家，要么归位要么删掉
  for (const t of tests) {
    if (!t.seam) {
      issues.push({ level: "warn", kind: "test-unseamed", path: t.path, message: "测试不属于任何接缝" });
    }
  }

  // 生成物必须与协议源同步
  if (files.some((f) => f.path === "docs/protocol-vectors.json")) {
    const stale = checkGenerated();
    if (stale) issues.push({ level: "error", kind: "generated-stale", path: "docs/protocol.json", message: stale });
  }

  for (const t of tests) {
    for (const v of t.violations) {
      issues.push({ level: "error", kind: `test-${v}`, path: t.path, message: v === "reads-source" ? "读源码做断言" : "断言方法被调用" });
    }
  }

  issues.push(...checkStyleTokens(files));

  const dupes = new Map();
  for (const d of docs) {
    const key = d.title.toLowerCase();
    if (dupes.has(key)) issues.push({ level: "warn", kind: "duplicate-title", path: d.path, message: `与 ${dupes.get(key)} 标题重复` });
    else dupes.set(key, d.path);
  }

  if (productCode.length === 0) {
    issues.push({ level: "info", kind: "no-code", path: null, message: "还没有产品代码，接缝门禁暂未启用" });
  }

  return issues;
}

/** 页面样式不许写死颜色与字号：必须用 docs/design.md 定义的变量。 */
function checkStyleTokens(files) {
  const issues = [];
  const styles = files.filter(
    (f) => f.ext === ".wxss" && f.path.startsWith("miniprogram/") && f.path !== "miniprogram/app.wxss",
  );

  for (const f of styles) {
    let text;
    try {
      text = readFileSync(join(ROOT, f.path), "utf8");
    } catch {
      continue;
    }
    // 去掉注释再检查，避免注释里的示例误报
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "");

    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hex) {
      const uniq = [...new Set(hex)].slice(0, 3);
      issues.push({
        level: "error",
        kind: "style-hardcoded-color",
        path: f.path,
        message: `写死了颜色 ${uniq.join(" ")}，改用 docs/design.md 的变量`,
      });
    }

    const rgb = code.match(/\brgba?\s*\(/g);
    if (rgb) {
      issues.push({
        level: "error",
        kind: "style-hardcoded-color",
        path: f.path,
        message: "写死了 rgba() 颜色，改用变量",
      });
    }
  }

  return issues;
}

/** 生成物过期时返回说明，否则 null。 */
function checkGenerated() {
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", "gen-protocol.mjs"), "--check"], {
      cwd: ROOT, encoding: "utf8", stdio: "pipe",
    });
    return null;
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
    return out || "生成物与 docs/protocol.json 不一致，跑 npm run gen";
  }
}

function main() {
  if (!existsSync(MAP_JSON)) {
    console.error(`缺少 ${rel(MAP_JSON)}`);
    process.exit(2);
  }
  const config = readJson(MAP_JSON);
  const docs = collectDocs(config);
  const tests = collectTests(config);
  const files = collectFiles(config);
  const { iterations, note } = collectIterations();
  const acceptance = existsSync(join(ROOT, "docs", "acceptance.md"))
    ? parseAcceptance(readFileSync(join(ROOT, "docs", "acceptance.md"), "utf8"))
    : [];
  const issues = checkHealth(config, docs, tests, files);

  const byExt = {};
  const byDir = {};
  for (const f of files) {
    byExt[f.ext || "(none)"] = (byExt[f.ext || "(none)"] ?? 0) + 1;
    byDir[f.dir] = (byDir[f.dir] ?? 0) + 1;
  }

  const worktreeDirty = git(["status", "--porcelain"]).length > 0;
  // --skip-tasks：测试与离线环境用。任务图来自网络，不该让每次扫描都等它。
  const skipTasks = process.argv.includes("--skip-tasks");
  const tasks = skipTasks
    ? { ok: false, error: "本次扫描跳过了任务图（--skip-tasks）" }
    : ghAvailable()
      ? collectTasks()
      : { ok: false, error: "gh 未登录，任务图不可用" };

  const payload = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/map.mjs",
    project: config.project,
    head: gitAvailable()
      ? {
          sha: git(["rev-parse", "--short", "HEAD"]),
          subject: git(["log", "-1", "--pretty=%s"]),
          date: git(["log", "-1", "--pretty=%aI"]),
          branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
          dirty: worktreeDirty,
        }
      : null,
    tasks,
    layers: config.layers,
    modules: config.modules.map((m) => {
      const matching = files.filter((f) => f.path === m.path || f.path.startsWith(`${m.path}/`));
      return {
        ...m,
        exists: matching.length > 0,
        fileCount: matching.length,
        lines: matching.reduce((n, f) => n + (f.lines ?? 0), 0),
        files: matching.map((f) => f.path),
        testCount: tests.filter((t) => t.path.startsWith(m.path) || m.path.startsWith(t.path.split("/").slice(0, 2).join("/"))).length,
      };
    }),
    docs,
    docStats: {
      count: docs.length,
      lines: docs.reduce((n, d) => n + d.lines, 0),
      withoutFrontmatter: docs.filter((d) => !d.hasFrontmatter && !d.isAgentDoc).length,
      adrCount: docs.filter((d) => d.isAdr).length,
    },
    tests,
    testStats: {
      files: tests.length,
      cases: tests.reduce((n, t) => n + t.cases, 0),
      asserts: tests.reduce((n, t) => n + t.asserts, 0),
      lines: tests.reduce((n, t) => n + t.lines, 0),
      bySeam: Object.fromEntries(
        [...Object.keys(config.rules.testSeams), config.rules.toolingTestSeam]
          .filter(Boolean)
          .map((k) => [k, tests.filter((t) => t.seam === k).length]),
      ),
      unseamed: tests.filter((t) => !t.seam).length,
    },
    files: {
      total: files.length,
      code: files.filter((f) => !f.isDoc && !f.isTest && !f.binary).length,
      docs: files.filter((f) => f.isDoc).length,
      tests: files.filter((f) => f.isTest).length,
      binary: files.filter((f) => f.binary).length,
      lines: files.reduce((n, f) => n + (f.lines ?? 0), 0),
      byExt,
      byDir,
      list: files,
    },
    iterations,
    iterationNote: note,
    acceptance,
    acceptanceStats: {
      total: acceptance.length,
      done: acceptance.filter((r) => r.status === "✅").length,
      partial: acceptance.filter((r) => r.status === "◐").length,
      blocked: acceptance.filter((r) => r.status === "⛔").length,
      todo: acceptance.filter((r) => r.status === "☐").length,
    },
    health: {
      issues,
      errors: issues.filter((i) => i.level === "error").length,
      warnings: issues.filter((i) => i.level === "warn").length,
      ok: issues.filter((i) => i.level === "error").length === 0,
    },
  };

  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  const isCheck = process.argv.includes("--strict");
  const previous = existsSync(OUT) ? readFileSync(OUT, "utf8") : null;

  // --strict 不写盘：只比对。否则「检查自己刚写的产物」是循环论证。
  if (isCheck) {
    // generatedAt 每次都变，不参与比对；否则永远误报。
    if (stableJson(previous) !== stableJson(serialized)) {
      const fresh = JSON.parse(serialized);
      issues.push({
        level: "error",
        kind: "panel-stale",
        path: "docs/map.generated.json",
        message: staleSummary(previous, fresh),
      });
      payload.health.issues = issues;
      payload.health.errors = issues.filter((i) => i.level === "error").length;
      payload.health.warnings = issues.filter((i) => i.level === "warn").length;
      payload.health.ok = payload.health.errors === 0;
    }
    for (const i of issues) console.log(`  ${i.level.toUpperCase()}  ${i.path ?? "-"}  ${i.message}`);
    if (payload.health.errors > 0) process.exit(1);
    console.log("面板数据与仓库一致");
    return;
  }

  writeFileSync(OUT, serialized, "utf8");
  console.log(`map.generated.json  ${files.length} 文件 / ${docs.length} 文档 / ${tests.length} 测试 / ${iterations.length} 迭代`);
  if (issues.length) {
    for (const i of issues) console.log(`  ${i.level.toUpperCase()}  ${i.path ?? "-"}  ${i.message}`);
  } else {
    console.log("  健康检查通过");
  }
}

/** 去掉易变字段后的规范化 JSON，用于比对「实质内容是否相同」。 */
function stableJson(text) {
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    delete obj.generatedAt;
    if (obj.head) delete obj.head.dirty;
    // 面板产物自己会变：去掉它的条目，否则一致时也永远报落后
    if (Array.isArray(obj.files?.list)) {
      obj.files.list = obj.files.list.filter((f) => f.path !== "docs/map.generated.json");
    }
    return JSON.stringify(obj);
  } catch {
    return text;
  }
}

/** 指出面板数据落后在哪，而不是只说「不一致」。 */
function staleSummary(previousJson, fresh) {
  if (!previousJson) return "面板数据不存在，跑 npm run sync";
  let prev;
  try {
    prev = JSON.parse(previousJson);
  } catch {
    return "面板数据损坏，跑 npm run sync";
  }

  const diffs = [];
  const cmp = (label, a, b) => {
    if (a !== b) diffs.push(`${label} ${a ?? "?"} → ${b}`);
  };
  cmp("文件数", prev.files?.total, fresh.files?.total);
  cmp("文档数", prev.docStats?.count, fresh.docStats?.count);
  cmp("测试文件", prev.testStats?.files, fresh.testStats?.files);
  cmp("用例数", prev.testStats?.cases, fresh.testStats?.cases);
  cmp("迭代数", prev.iterations?.length, fresh.iterations?.length);
  cmp("任务数", prev.tasks?.stats?.total, fresh.tasks?.stats?.total);
  cmp("健康错误", prev.health?.errors, fresh.health?.errors);
  if (prev.head?.sha !== fresh.head?.sha) diffs.push(`HEAD ${prev.head?.sha ?? "?"} → ${fresh.head?.sha ?? "?"}`);

  // 找出具体变动的文件（新增、删除、行数、大小、描述）
  // 面板产物自己不参与比对——它每次生成都会变，否则永远报「落后」。
  const IGNORE = new Set(["docs/map.generated.json"]);
  const prevFiles = new Map((prev.files?.list ?? []).filter((f) => !IGNORE.has(f.path)).map((f) => [f.path, f]));
  const nextFiles = new Map((fresh.files?.list ?? []).filter((f) => !IGNORE.has(f.path)).map((f) => [f.path, f]));
  const added = [...nextFiles.keys()].filter((p) => !prevFiles.has(p));
  const removed = [...prevFiles.keys()].filter((p) => !nextFiles.has(p));
  const changed = [];
  for (const [p, nf] of nextFiles) {
    const pf = prevFiles.get(p);
    if (!pf) continue;
    if (pf.lines !== nf.lines || pf.size !== nf.size || pf.description !== nf.description) changed.push(p);
  }
  if (added.length) diffs.push(`新增 ${added.slice(0, 3).join(", ")}${added.length > 3 ? ` 等 ${added.length} 个` : ""}`);
  if (removed.length) diffs.push(`删除 ${removed.slice(0, 3).join(", ")}${removed.length > 3 ? ` 等 ${removed.length} 个` : ""}`);
  if (changed.length) diffs.push(`改动 ${changed.slice(0, 3).join(", ")}${changed.length > 3 ? ` 等 ${changed.length} 个` : ""}`);

  // 任务状态变化
  const prevTasks = new Map((prev.tasks?.tasks ?? []).map((t) => [t.number, t.state]));
  const changedTasks = (fresh.tasks?.tasks ?? []).filter((t) => prevTasks.has(t.number) && prevTasks.get(t.number) !== t.state);
  if (changedTasks.length) diffs.push(`任务状态变化 ${changedTasks.map((t) => `#${t.number}`).join(", ")}`);

  return diffs.length
    ? `面板数据落后：${diffs.join("；")}。跑 npm run sync`
    : "面板数据与仓库不一致。跑 npm run sync";
}

main();
