/**
 * scripts/map.mjs 的测试。
 *
 * 为什么必须测：面板上每个数字、每条健康检查结论都由它生成。它悄悄错了，
 * 整个面板和所有门禁都是假的——而且不会有任何东西报错。
 *
 * 用法：node --test scripts/map.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const GEN = join(HERE, "gen-protocol.mjs");
/** 测试写到临时文件，绝不覆盖真实的面板产物。 */
const TMP_OUT = join(mkdtempSync(join(tmpdir(), "map-out-")), "map.generated.json");

/** 跑到临时产物，读回来做断言。不碰 docs/map.generated.json。 */
function runMap() {
  execFileSync(
    process.execPath,
    [join(HERE, "map.mjs"), "--skip-tasks", "--out", TMP_OUT],
    { cwd: REPO, encoding: "utf8" },
  );
  return JSON.parse(readFileSync(TMP_OUT, "utf8"));
}

/**
 * 只跑 map 本身。strict 必须比对真实产物且不跳任务，
 * 否则测的是临时文件，什么也没验证。
 */
function runMapOnly(args = []) {
  const strict = args.includes("--strict");
  const base = strict
    ? [join(HERE, "map.mjs"), ...args]
    : [join(HERE, "map.mjs"), "--skip-tasks", "--out", TMP_OUT, ...args];
  return execFileSync(process.execPath, base, { cwd: REPO, encoding: "utf8", stdio: "pipe" });
}

/* ---------------- 扫描正确性 ---------------- */

test("扫描出的文件列表包含所有已知文档", () => {
  const map = runMap();
  const paths = map.files.list.map((f) => f.path);
  for (const must of [
    "AGENTS.md",
    "GLOSSARY.md",
    "README.md",
    "docs/protocol.json",
    "docs/protocol.md",
    "docs/status.md",
    "docs/testing.md",
    "docs/acceptance.md",
  ]) {
    assert.ok(paths.includes(must), `缺少 ${must}`);
  }
});

test("node_modules 与 dist 不被计入", () => {
  const map = runMap();
  const bad = map.files.list.filter((f) => /(^|\/)node_modules\//.test(f.path) || /(^|\/)dist\//.test(f.path));
  assert.deepEqual(bad.map((f) => f.path), []);
});

test("文档扫描出 frontmatter 的 purpose", () => {
  const map = runMap();
  const protocol = map.docs.find((d) => d.path === "docs/protocol.md");
  assert.ok(protocol, "缺少 docs/protocol.md");
  assert.equal(protocol.hasFrontmatter, true);
  assert.match(protocol.purpose, /协议契约/);
});

test("ADR 被识别且计数正确", () => {
  const map = runMap();
  const adrs = map.docs.filter((d) => d.isAdr);
  assert.ok(adrs.length >= 4, `ADR 只有 ${adrs.length} 份`);
  assert.equal(map.docStats.adrCount, adrs.length);
  for (const a of adrs) assert.match(a.path, /^docs\/adr\/\d{4}-/);
});

test("验收矩阵被解析成行，统计与行数一致", () => {
  const map = runMap();
  const s = map.acceptanceStats;
  assert.ok(s.total > 0, "没解析出验收行");
  assert.equal(s.done + s.partial + s.blocked + s.todo, s.total);
});

test("迭代至少有一条，且带 sha", () => {
  const map = runMap();
  assert.ok(map.iterations.length >= 1);
  assert.ok(map.iterations[0].sha);
  assert.match(map.iterations[0].date, /^\d{4}-\d{2}-\d{2}/);
});

test("模块声明能匹配到真实文件并统计行数", () => {
  const map = runMap();
  const mapMod = map.modules.find((m) => m.path === "scripts/map.mjs");
  assert.ok(mapMod.exists, "scripts/map.mjs 应被识别为已存在");
  assert.ok(mapMod.lines > 100, `行数异常：${mapMod.lines}`);
});

/* ---------------- 健康检查 ---------------- */

test("健康检查：没有产品代码时接缝缺失只是警告", () => {
  const map = runMap();
  const seams = map.health.issues.filter((i) => i.kind === "seam-untested");
  // 这个仓库还没写产品代码，五个接缝都应被点名，但级别是 warn
  assert.equal(seams.length, 5, `期望 5 条 seam-untested，实际 ${seams.length}`);
  for (const s of seams) assert.equal(s.level, "warn", `${s.message} 应为 warn`);
});

test("健康检查：有产品代码但接缝没测试时必须报错", () => {
  // 造一个最小产品代码文件，门禁应当从 warn 升到 error
  const probe = join(REPO, "firmware", "main", "_probe.c");
  try {
    mkdirSync(dirname(probe), { recursive: true });
    writeFileSync(probe, "void probe(void) {}\n", "utf8");
    const map = runMap();
    const seams = map.health.issues.filter((i) => i.kind === "seam-untested");
    assert.equal(seams.length, 5, `期望 5 条 seam-untested，实际 ${seams.length}`);
    for (const s of seams) assert.equal(s.level, "error", `${s.message} 应为 error`);
    assert.ok(map.health.errors > 0, "有代码时健康检查应报错");
  } finally {
    rmSync(probe, { force: true });
    runMap();
  }
});

test("健康检查：生成物与协议源一致时不报 generated-stale", () => {
  const map = runMap();
  const stale = map.health.issues.filter((i) => i.kind === "generated-stale");
  assert.deepEqual(stale, []);
});

test("健康检查：没有未声明家的文档", () => {
  const map = runMap();
  const orphan = map.health.issues.filter((i) => i.kind === "doc-not-declared");
  assert.deepEqual(orphan.map((i) => i.path), []);
});

test("健康检查：所有文档都有 frontmatter", () => {
  const map = runMap();
  const missing = map.health.issues.filter((i) => i.kind === "doc-no-frontmatter");
  assert.deepEqual(missing.map((i) => i.path), []);
});

test("健康检查：status.md 不超过 60 行", () => {
  const map = runMap();
  const tooLong = map.health.issues.filter((i) => i.kind === "status-too-long");
  assert.deepEqual(tooLong, []);
});

/* ---------------- 样式 token 门禁 ---------------- */

test("页面 wxss 写死 hex 会被抓到", () => {
  const dir = join(REPO, "miniprogram", "pages", "_probe");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "probe.wxss"), ".card { background: #1c1c1e; }\n", "utf8");
    const map = runMap();
    const hit = map.health.issues.filter((i) => i.kind === "style-hardcoded-color");
    assert.equal(hit.length, 1, `期望 1 条，实际 ${hit.length}`);
    assert.match(hit[0].message, /#1c1c1e/);
    assert.equal(hit[0].level, "error");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    runMap();
  }
});

test("页面 wxss 写死 rgba 会被抓到", () => {
  const dir = join(REPO, "miniprogram", "pages", "_probe");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "probe.wxss"), ".t { color: rgba(255,255,255,0.9); }\n", "utf8");
    const map = runMap();
    const hit = map.health.issues.filter((i) => i.kind === "style-hardcoded-color");
    assert.equal(hit.length, 1, `期望 1 条，实际 ${hit.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    runMap();
  }
});

test("用设计变量的 wxss 不被误报", () => {
  const dir = join(REPO, "miniprogram", "pages", "_probe");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "probe.wxss"),
      ".card { background: var(--surface-1); color: var(--label); }\n/* #fff 在注释里不算 */\n",
      "utf8",
    );
    const map = runMap();
    const hit = map.health.issues.filter((i) => i.kind === "style-hardcoded-color");
    assert.deepEqual(hit.map((i) => i.path), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    runMap();
  }
});

test("app.wxss 本身允许定义颜色", () => {
  const map = runMap();
  const hit = map.health.issues.filter(
    (i) => i.kind === "style-hardcoded-color" && i.path === "miniprogram/app.wxss",
  );
  assert.deepEqual(hit, [], "app.wxss 是变量的定义处，不该被检");
});

/* ---------------- 面板新鲜度 ---------------- */

/**
 * strict 比对的是真实产物（docs/map.generated.json）。
 * 同步时必须与 strict 用同样参数（都含任务图），否则两边产物必然不同。
 */
function syncRealOutput() {
  execFileSync(
    process.execPath,
    [join(HERE, "map.mjs")],
    { cwd: REPO, encoding: "utf8", stdio: "pipe" },
  );
}

test("--strict 在一致时退出码 0", () => {
  syncRealOutput();
  assert.doesNotThrow(() => {
    runMapOnly(["--strict"]);
  });
});

test("--strict 在文件改动后退 1，并指出是哪个文件", () => {
  syncRealOutput();
  const probe = join(REPO, "README.md");
  const original = readFileSync(probe, "utf8");
  try {
    writeFileSync(probe, `${original}\n<!-- probe -->\n`, "utf8");
    let failed = false;
    let output = "";
    try {
      runMapOnly(["--strict"]);
    } catch (e) {
      failed = true;
      output = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    assert.equal(failed, true, "--strict 本应失败");
    assert.match(output, /panel-stale|面板数据落后/);
    assert.match(output, /README\.md/, "应当指出是 README.md 变了");
  } finally {
    writeFileSync(probe, original, "utf8");
    syncRealOutput();
  }
});

test("--strict 不会因为面板产物自身变化而误报", () => {
  syncRealOutput();
  // 连跑两次：第二次必须仍通过，证明 generatedAt 与产物自身条目未参与比对
  assert.doesNotThrow(() => {
    runMapOnly(["--strict"]);
  });
  assert.doesNotThrow(() => {
    runMapOnly(["--strict"]);
  });
});

/* ---------------- 违规检测（用临时文件模拟） ---------------- */

test("禁用的文档名会被抓到", () => {
  const tmp = mkdtempSync(join(tmpdir(), "map-test-"));
  try {
    // 直接在仓库里放一个违规文件，跑完删掉
    const bad = join(REPO, "docs", "handoff.md");
    writeFileSync(bad, "---\npurpose: x\nstatus: 生效\n---\n\n# bad\n", "utf8");
    const map = runMap();
    const hit = map.health.issues.filter((i) => i.kind === "banned-doc-name" && i.path === "docs/handoff.md");
    assert.equal(hit.length, 1, "没有抓到 handoff.md");
    assert.equal(hit[0].level, "error");
  } finally {
    rmSync(join(REPO, "docs", "handoff.md"), { force: true });
    rmSync(tmp, { recursive: true, force: true });
    runMap(); // 恢复干净的产物
  }
});

test("缺 frontmatter 的文档会被抓到", () => {
  try {
    const bad = join(REPO, "docs", "scratch-note.md");
    writeFileSync(bad, "# 临时笔记\n\n没有 frontmatter。\n", "utf8");
    const map = runMap();
    const kinds = map.health.issues
      .filter((i) => i.path === "docs/scratch-note.md")
      .map((i) => i.kind);
    assert.ok(kinds.includes("doc-no-frontmatter"), `只抓到 ${kinds.join(",")}`);
    assert.ok(kinds.includes("doc-not-declared"), `只抓到 ${kinds.join(",")}`);
  } finally {
    rmSync(join(REPO, "docs", "scratch-note.md"), { force: true });
    runMap();
  }
});

/* ---------------- 协议生成器 ---------------- */

test("协议生成器：CRC16 检查串算出 0x29B1", () => {
  const out = execFileSync(
    process.execPath,
    ["-e", `
      const fs = require("fs");
      const v = JSON.parse(fs.readFileSync("docs/protocol-vectors.json", "utf8"));
      const c = v.vectors.find(x => x.name === "crc16_check_string");
      process.stdout.write(c.expect_crc);
    `],
    { cwd: REPO, encoding: "utf8" },
  );
  assert.equal(out, "29 b1");
});

test("协议生成器：SetPower 帧的 CRC 可被独立复算", () => {
  const out = execFileSync(
    process.execPath,
    ["-e", `
      const fs = require("fs");
      const v = JSON.parse(fs.readFileSync("docs/protocol-vectors.json", "utf8"));
      const f = v.vectors.find(x => x.name === "frame_set_power_on");
      const bytes = f.expect_hex.split(" ").map(h => parseInt(h, 16));
      const body = bytes.slice(0, -2);
      const want = bytes.at(-2) | (bytes.at(-1) << 8);
      let crc = 0xffff;
      for (const b of body) {
        crc ^= b << 8;
        for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
      process.stdout.write(crc === want ? "match" : "mismatch " + crc.toString(16) + " vs " + want.toString(16));
    `],
    { cwd: REPO, encoding: "utf8" },
  );
  assert.equal(out, "match");
});

test("协议生成器：每条命令都有向量，退役码都标了 UnknownCommand", () => {
  const out = execFileSync(
    process.execPath,
    ["-e", `
      const fs = require("fs");
      const spec = JSON.parse(fs.readFileSync("docs/protocol.json", "utf8"));
      const vec = JSON.parse(fs.readFileSync("docs/protocol-vectors.json", "utf8"));
      const shaped = new Set(vec.vectors.filter(v => v.kind === "frame_shape").map(v => v.command));
      const missing = spec.commands.filter(c => !shaped.has(c.name)).map(c => c.name);
      const retired = vec.vectors.filter(v => v.kind === "retired");
      const badRetired = retired.filter(v => v.expect_result !== "UnknownCommand");
      process.stdout.write(JSON.stringify({ missing, retiredCount: retired.length, badRetired: badRetired.length }));
    `],
    { cwd: REPO, encoding: "utf8" },
  );
  const r = JSON.parse(out);
  assert.deepEqual(r.missing, [], `这些命令缺向量：${r.missing}`);
  assert.equal(r.retiredCount, 7);
  assert.equal(r.badRetired, 0);
});

test("协议生成器 --check 与源一致时退出码 0", () => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, [GEN, "--check"], { cwd: REPO, encoding: "utf8", stdio: "pipe" });
  });
});

test("协议生成器：C 头与 TS 常量的上限值来自同一份 JSON", () => {
  const out = execFileSync(
    process.execPath,
    ["-e", `
      const fs = require("fs");
      const spec = JSON.parse(fs.readFileSync("docs/protocol.json", "utf8"));
      const h = fs.readFileSync("firmware/main/protocol_gen.h", "utf8");
      const ts = fs.readFileSync("miniprogram/utils/protocol/constants.gen.ts", "utf8");
      const snake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c).toUpperCase();
      const missingH = [];
      const missingTs = [];
      for (const [k, v] of Object.entries(spec.limits)) {
        if (!h.includes("PROTO_" + snake(k))) missingH.push(k);
        if (!ts.includes(k + ": " + v)) missingTs.push(k);
      }
      process.stdout.write(JSON.stringify({ missingH, missingTs }));
    `],
    { cwd: REPO, encoding: "utf8" },
  );
  const r = JSON.parse(out);
  assert.deepEqual(r.missingH, [], `C 头缺：${r.missingH}`);
  assert.deepEqual(r.missingTs, [], `TS 缺：${r.missingTs}`);
});
