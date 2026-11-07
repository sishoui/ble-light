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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAP_JSON = join(ROOT, "docs", "map.json");
const OUT = join(ROOT, "docs", "map.generated.json");

const IGNORE_DIRS = new Set([
  ".git", "node_modules", "dist", ".vite", "__pycache__", ".pytest_cache",
  "build", "managed_components", ".reports", ".sim-out", ".layout-shots",
  ".scope-shots", ".test-run-tmp", ".runs", ".scratch", ".zcode", ".vscode",
]);

const TEXT_EXT = new Set([
  ".c", ".h", ".ts", ".js", ".mjs", ".vue", ".json", ".md", ".css",
  ".wxml", ".wxss", ".py", ".cmd", ".bat", ".yml", ".yaml", ".toml", ".csv",
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

function collectTests() {
  const roots = ["firmware", "miniprogram", "panel", "scripts", "tests", "src"];
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
    const isC = path.endsWith(".c");
    const cases = isC
      ? (text.match(/^\s*RUN_TEST\s*\(/gm) ?? []).length
      : (text.match(/^\s*(?:it|test)\s*\(/gm) ?? []).length;
    const asserts = isC
      ? (text.match(/\b(?:TEST_ASSERT\w*|assert)\s*\(/g) ?? []).length
      : (text.match(/\bexpect\s*\(/g) ?? []).length;
    const seam =
      /protocol|codec|frame|chunk|commands/.test(path) ? "protocol" :
      /command|reducer|state/.test(path) ? "reducer" :
      /render|effect|pixel|gamma/.test(path) ? "render" :
      /session|transport|ble|control/.test(path) ? "session" :
      /page|component|view/.test(path) ? "page" : null;
    const violations = [];
    if (/readFileSync|readFile\(/.test(text) && /\.(ts|js|mjs|vue|wxml|wxss)/.test(text)) {
      if (/source\b|\.ts["'`]|\.wxml|\.wxss/.test(text)) violations.push("reads-source");
    }
    if (/toHaveBeenCalled|toBeCalled/.test(text)) violations.push("asserts-call");
    return { path, name: path.split("/").pop(), lines: text.split("\n").length, cases, asserts, seam, violations };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function collectFiles(config) {
  const modulePaths = new Set(config.modules.map((m) => m.path));
  const files = walk(ROOT).map((abs) => {
    const path = rel(abs);
    const ext = path.slice(path.lastIndexOf("."));
    const size = statSync(abs).size;
    return {
      path,
      dir: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".",
      ext,
      size,
      lines: TEXT_EXT.has(ext) ? lineCount(abs) : null,
      binary: BINARY_EXT.has(ext),
      isDoc: path.startsWith("docs/") && ext === ".md",
      isTest: TEST_HINT.test(path),
      module: modulePaths.has(path) ? path : null,
    };
  });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function checkHealth(config, docs, tests) {
  const issues = [];
  const allowed = new Set(config.rules.docsAllowed);
  const prefixes = config.rules.docsAllowedPrefixes ?? [];

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

  for (const t of tests) {
    for (const v of t.violations) {
      issues.push({ level: "warn", kind: `test-${v}`, path: t.path, message: v === "reads-source" ? "疑似读源码做断言" : "疑似断言方法被调用" });
    }
  }

  const dupes = new Map();
  for (const d of docs) {
    const key = d.title.toLowerCase();
    if (dupes.has(key)) issues.push({ level: "warn", kind: "duplicate-title", path: d.path, message: `与 ${dupes.get(key)} 标题重复` });
    else dupes.set(key, d.path);
  }

  const code = walk(join(ROOT, "firmware")).length + walk(join(ROOT, "miniprogram")).length;
  if (code === 0) issues.push({ level: "info", kind: "no-code", path: null, message: "还没有产品代码" });

  return issues;
}

function main() {
  if (!existsSync(MAP_JSON)) {
    console.error(`缺少 ${rel(MAP_JSON)}`);
    process.exit(2);
  }
  const config = readJson(MAP_JSON);
  const docs = collectDocs(config);
  const tests = collectTests();
  const files = collectFiles(config);
  const { iterations, note } = collectIterations();
  const acceptance = existsSync(join(ROOT, "docs", "acceptance.md"))
    ? parseAcceptance(readFileSync(join(ROOT, "docs", "acceptance.md"), "utf8"))
    : [];
  const issues = checkHealth(config, docs, tests);

  const byExt = {};
  const byDir = {};
  for (const f of files) {
    byExt[f.ext || "(none)"] = (byExt[f.ext || "(none)"] ?? 0) + 1;
    byDir[f.dir] = (byDir[f.dir] ?? 0) + 1;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    generator: "scripts/map.mjs",
    project: config.project,
    head: gitAvailable() ? { sha: git(["rev-parse", "--short", "HEAD"]), subject: git(["log", "-1", "--pretty=%s"]), date: git(["log", "-1", "--pretty=%aI"]), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) } : null,
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
      bySeam: Object.fromEntries(Object.keys(config.rules.testSeams).map((k) => [k, tests.filter((t) => t.seam === k).length])),
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

  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`map.generated.json  ${files.length} 文件 / ${docs.length} 文档 / ${tests.length} 测试 / ${iterations.length} 迭代`);
  if (issues.length) {
    for (const i of issues) console.log(`  ${i.level.toUpperCase()}  ${i.path ?? "-"}  ${i.message}`);
  } else {
    console.log("  健康检查通过");
  }
  if (process.argv.includes("--strict") && payload.health.errors > 0) process.exit(1);
}

main();
