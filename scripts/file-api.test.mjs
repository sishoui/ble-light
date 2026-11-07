/**
 * scripts/file-api.mjs 的测试。
 *
 * 为什么必须测：这是面板唯一的读取入口，也是唯一的攻击面。
 * 白名单、路径穿越、二进制拦截、大小截断，每一条都必须有测试守着。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepoFile } from "./file-api.mjs";

function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), "file-api-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const REPO = makeRepo({
  "README.md": "# hello\n",
  "docs/protocol.md": "---\npurpose: x\n---\n# 协议\n",
  ".env": "SECRET=leak\n",
  "node_modules/pkg/index.js": "module.exports = 1;\n",
  "logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]),
  "big.txt": "x".repeat(600 * 1024),
});

const ALLOWED = new Set(["README.md", "docs/protocol.md", "big.txt"]);

test("读取白名单内的文本文件", () => {
  const r = readRepoFile(REPO, ALLOWED, "README.md");
  assert.equal(r.ok, true);
  assert.equal(r.text, "# hello\n");
  assert.equal(r.truncated, false);
});

test("子目录路径也能读", () => {
  const r = readRepoFile(REPO, ALLOWED, "docs/protocol.md");
  assert.equal(r.ok, true);
  assert.match(r.text, /# 协议/);
});

test("反斜杠路径被归一化", () => {
  const r = readRepoFile(REPO, ALLOWED, "docs\\protocol.md");
  assert.equal(r.ok, true);
  assert.equal(r.path, "docs/protocol.md");
});

test("不在白名单的文件被拒绝（即使它存在）", () => {
  const r = readRepoFile(REPO, ALLOWED, ".env");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.ok(!JSON.stringify(r).includes("SECRET"), "错误信息泄漏了文件内容");
});

test("node_modules 不在白名单时也读不到", () => {
  const r = readRepoFile(REPO, ALLOWED, "node_modules/pkg/index.js");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("路径穿越被拒绝", () => {
  for (const bad of ["../.env", "../../etc/passwd", "docs/../../.env", "/etc/passwd", "..\\..\\.env"]) {
    const r = readRepoFile(REPO, ALLOWED, bad);
    assert.equal(r.ok, false, `${bad} 应当被拒绝`);
    assert.ok(r.status === 400 || r.status === 403, `${bad} 状态码 ${r.status}`);
  }
});

test("空路径被拒绝", () => {
  for (const bad of ["", null, undefined, 0]) {
    const r = readRepoFile(REPO, ALLOWED, bad);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  }
});

test("二进制文件被拒绝", () => {
  const r = readRepoFile(REPO, new Set([...ALLOWED, "logo.png"]), "logo.png");
  assert.equal(r.ok, false);
  assert.equal(r.status, 415);
  assert.match(r.error, /不支持预览|二进制/);
});

test("超过 512 KB 被截断并标记", () => {
  const r = readRepoFile(REPO, ALLOWED, "big.txt");
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= 512 * 1024, `实际 ${r.text.length}`);
});

test("白名单内的文件如果已被删除，返回 404", () => {
  const r = readRepoFile(REPO, new Set([...ALLOWED, "docs/gone.md"]), "docs/gone.md");
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
});
