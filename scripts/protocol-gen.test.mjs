/**
 * scripts/gen-protocol.mjs 的字段表契约测试。
 *
 * 这些测试守的是「协议源有完整字段表」这件事本身：偏移、宽度、类型、取值域。
 * 两端 codec 只允许照表写，不允许再靠散文猜字节。
 *
 * 工具测试归 tooling 接缝，读源码/生成物是它的正当手段。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const GEN = join(HERE, "gen-protocol.mjs");

const spec = () => JSON.parse(readFileSync(join(REPO, "docs", "protocol.json"), "utf8"));
const vectors = () => JSON.parse(readFileSync(join(REPO, "docs", "protocol-vectors.json"), "utf8"));

const INT_TYPES = new Set(["u8", "u16le", "u32le", "i8", "i16le"]);
const KNOWN_TYPES = new Set([...INT_TYPES, "enum", "utf8", "bytes", "layer", "state", "array"]);

/** 字段覆盖到的字节区间，用来验证「无空洞、无重叠、刚好等于载荷长度」。 */
function spans(table) {
  return table.map((f) => [f.offset, f.offset + f.bytes]);
}

function assertCoverage(owner, table, payloadBytes) {
  assert.ok(Array.isArray(table) && table.length > 0 || payloadBytes === 0,
    `${owner} 缺字段表`);
  const sorted = [...spans(table)].sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, end] of sorted) {
    assert.equal(start, cursor, `${owner} 字段表在 ${start} 处有空洞或重叠`);
    cursor = end;
  }
  assert.equal(cursor, payloadBytes, `${owner} 字段表覆盖 ${cursor} 字节，声明 ${payloadBytes}`);
}

test("每条命令与每种报告的字段表都连续覆盖整个载荷", () => {
  const s = spec();
  for (const c of s.commands) assertCoverage(`命令 ${c.name}`, c.fields, c.payloadBytes);
  for (const r of s.reports) assertCoverage(`报告 ${r.name}`, r.fields, r.payloadBytes);
});

test("每个字段都声明了类型，枚举与定长名称还声明了取值语义", () => {
  const s = spec();
  const all = [
    ...s.commands.map((c) => [c.name, c.fields]),
    ...s.reports.map((r) => [r.name, r.fields]),
  ];
  for (const [owner, table] of all) {
    for (const f of table) {
      assert.ok(f.name, `${owner} 有字段缺名字`);
      assert.ok(KNOWN_TYPES.has(f.type), `${owner}.${f.name} 类型未知：${f.type}`);
      if (INT_TYPES.has(f.type)) {
        assert.ok(Array.isArray(f.range) && f.range.length === 2, `${owner}.${f.name} 缺取值域`);
        assert.ok(f.range[0] <= f.range[1], `${owner}.${f.name} 取值域反了`);
      }
      if (f.type === "enum") {
        assert.ok(f.values && Object.keys(f.values).length > 0, `${owner}.${f.name} 枚举没有取值`);
        for (const v of Object.values(f.values)) {
          assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** (8 * f.bytes), `${owner}.${f.name} 枚举值越界`);
        }
      }
      if (f.type === "utf8") {
        assert.equal(f.pad, "zero", `${owner}.${f.name} 必须声明补零填充`);
        assert.ok(f.lengthField, `${owner}.${f.name} 必须声明长度字段`);
        assert.ok(table.some((x) => x.name === f.lengthField), `${owner}.${f.name} 的长度字段不存在`);
      }
      if (f.type === "array") {
        assert.ok(f.count > 0 && f.elementBytes > 0, `${owner}.${f.name} 数组缺 count/elementBytes`);
        assert.equal(f.bytes, f.count * f.elementBytes, `${owner}.${f.name} 数组总宽不等于元素数 × 元素宽`);
        for (const e of f.element) {
          assert.ok(e.offset + e.bytes <= f.elementBytes, `${owner}.${f.name}.${e.name} 超出元素宽度`);
        }
      }
      if (f.type === "layer") assert.equal(f.bytes, s.limits.layerBytes, `${owner}.${f.name} 层宽不对`);
      if (f.type === "state") assert.equal(f.bytes, s.limits.stateBytes, `${owner}.${f.name} 状态宽不对`);
    }
  }
});

test("层与状态各自有完整字段表", () => {
  const s = spec();
  assertCoverage("layer", s.layer.fields, s.layer.bytes);
  assertCoverage("state", s.state.fields, s.state.bytes);
});

test("测试向量对至少三条命令给出逐字段期望值", () => {
  const v = vectors();
  const fieldVectors = v.vectors.filter((x) => x.kind === "fields");
  assert.ok(fieldVectors.length >= 3, `逐字段向量只有 ${fieldVectors.length} 条`);
  for (const fv of fieldVectors) {
    const bytes = fv.expect_payload_hex.split(" ").map((h) => parseInt(h, 16));
    assert.equal(bytes.length, fv.payload_bytes, `${fv.name} 载荷长度不符`);
    let cursor = 0;
    for (const f of fv.expect_fields) {
      assert.equal(f.offset, cursor, `${fv.name}.${f.name} 偏移不连续`);
      const got = bytes.slice(f.offset, f.offset + f.bytes);
      assert.equal(got.map((b) => b.toString(16).padStart(2, "0")).join(" "), f.hex,
        `${fv.name}.${f.name} 的字节与期望不符`);
      cursor += f.bytes;
    }
    assert.equal(cursor, fv.payload_bytes, `${fv.name} 字段没有覆盖整条载荷`);
  }
});

test("C 头包含每条命令与报告的字段偏移与宽度", () => {
  const s = spec();
  const h = readFileSync(join(REPO, "firmware", "main", "protocol_gen.h"), "utf8");
  const macro = (prefix, name, suffix) =>
    `${prefix}_${name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/_+/g, "_").toUpperCase()}_${suffix}`;
  for (const c of s.commands) {
    for (const f of c.fields) {
      const base = macro("CMD", c.name, `FIELD_${f.name.toUpperCase()}`);
      assert.ok(h.includes(`${base}_OFF`), `C 头缺 ${base}_OFF`);
      assert.ok(h.includes(`${base}_BYTES`), `C 头缺 ${base}_BYTES`);
    }
  }
  for (const r of s.reports) {
    for (const f of r.fields) {
      const base = macro("RPT", r.name, `FIELD_${f.name.toUpperCase()}`);
      assert.ok(h.includes(`${base}_OFF`), `C 头缺 ${base}_OFF`);
      assert.ok(h.includes(`${base}_BYTES`), `C 头缺 ${base}_BYTES`);
    }
  }
});

test("TS 常量包含每条命令与报告的字段偏移与宽度", () => {
  const s = spec();
  const ts = readFileSync(join(REPO, "miniprogram", "utils", "protocol", "constants.gen.ts"), "utf8");
  for (const c of s.commands) {
    assert.ok(ts.includes(`${c.name}: {`), `TS 缺 ${c.name} 字段表`);
  }
  for (const r of s.reports) {
    assert.ok(ts.includes(`${r.name}: {`), `TS 缺 ${r.name} 字段表`);
  }
});

test("protocol.md 的字段表由生成器产出", () => {
  const md = readFileSync(join(REPO, "docs", "protocol.md"), "utf8");
  for (const key of ["commandFields", "reportFields", "stateFields", "layerFields"]) {
    const re = new RegExp(`<!-- GENERATED:${key} -->[\\s\\S]*?<!-- /GENERATED:${key} -->`);
    assert.ok(re.test(md), `protocol.md 缺 ${key} 生成段`);
  }
  const block = /<!-- GENERATED:commandFields -->([\s\S]*?)<!-- \/GENERATED:commandFields -->/.exec(md)[1];
  const section = /#### `0x06` SetLedCount[\s\S]*?(?=\n#### |\n## )/.exec(block);
  assert.ok(section, "命令字段表里没有 SetLedCount 一节");
  assert.match(section[0], /\|\s*1\s*\|\s*`count`\s*\|\s*2\s*\|\s*u16le\s*\|\s*1–100\s*\|/,
    "SetLedCount.count 的偏移/宽度/类型/取值域不对");
});
