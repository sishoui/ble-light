#!/usr/bin/env node
/**
 * 从 docs/protocol.json 生成四样东西：
 *
 *   firmware/main/protocol_gen.h              固件侧常量
 *   miniprogram/utils/protocol/constants.gen.ts  小程序侧常量
 *   docs/protocol-vectors.json                两端共跑的测试向量
 *   docs/protocol.md 里 <!-- GENERATED:xxx --> 标记之间的表格段
 *
 * 生成物一律带「GENERATED — DO NOT EDIT」头。改协议只改 protocol.json。
 * `--check` 模式不写盘，只校验生成物与源一致（CI 用）。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs", "protocol.json");
const CHECK = process.argv.includes("--check");

const spec = JSON.parse(readFileSync(SRC, "utf8"));

/* ---------- CRC16 CCITT-FALSE ---------- */
function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/* ---------- 帧编码 ---------- */
function encodeFrame({ command, seq, payload }) {
  const len = payload.length;
  const body = [
    toInt(spec.frame.magic), toInt(spec.frame.version), toInt(command), seq,
    len & 0xff, (len >> 8) & 0xff,
    ...payload,
  ];
  const c = crc16(body);
  return [...body, c & 0xff, (c >> 8) & 0xff];
}

const hex = (arr) => arr.map((b) => b.toString(16).padStart(2, "0")).join(" ");
const toInt = (s) => (typeof s === "number" ? s : parseInt(String(s), 16));

/* ---------- 命名 ---------- */
const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/**
 * 一个字段 → 若干条宏。数组额外给出元素宽、元素数，以及元素内每个字段的偏移，
 * 这样两端都不必再自己算 base + i * elem + offset。
 */
function fieldMacros(f) {
  const out = [[`${f.name}_OFF`, f.offset], [`${f.name}_BYTES`, f.bytes]];
  if (f.type === "array") {
    out.push([`${f.name}_COUNT`, f.count], [`${f.name}_ELEM_BYTES`, f.elementBytes]);
    for (const e of f.element) {
      out.push([`${f.name}_ELEM_${e.name}_OFF`, e.offset]);
      out.push([`${f.name}_ELEM_${e.name}_BYTES`, e.bytes]);
    }
  }
  return out;
}

/* ---------- 生成 C 头 ---------- */
function genHeader() {
  const L = spec.limits;
  const lines = [
    "/* GENERATED — DO NOT EDIT. Source: docs/protocol.json, generator: scripts/gen-protocol.mjs */",
    "#ifndef BLE_LIGHT_PROTOCOL_GEN_H",
    "#define BLE_LIGHT_PROTOCOL_GEN_H",
    "",
    "#include <stdint.h>",
    "",
    `#define PROTO_MAGIC              ${spec.frame.magic}u`,
    `#define PROTO_VERSION            ${spec.frame.version}u`,
    `#define PROTO_HEADER_BYTES       ${spec.frame.headerBytes}u`,
    `#define PROTO_MAX_PAYLOAD        ${spec.frame.maxPayload}u`,
    `#define PROTO_MAX_FRAME          ${spec.frame.maxFrame}u`,
    `#define PROTO_CRC_INIT           ${spec.frame.crc.initial}u`,
    `#define PROTO_CRC_POLY           ${spec.frame.crc.polynomial}u`,
    "",
    `#define PROTO_MAX_LEDS           ${L.maxLeds}u`,
    `#define PROTO_MAX_STRIPS         ${L.maxStrips}u`,
    `#define PROTO_MAX_PARTS          ${L.maxParts}u`,
    `#define PROTO_MAX_PART_SEGS      ${L.maxPartSegs}u`,
    `#define PROTO_MAX_STEPS          ${L.maxSteps}u`,
    `#define PROTO_MAX_SCENES         ${L.maxScenes}u`,
    `#define PROTO_MAX_LAYERS         ${L.maxLayers}u`,
    `#define PROTO_NAME_BYTES         ${L.nameBytes}u`,
    `#define PROTO_STEP_MIN_MS        ${L.stepMinMs}u`,
    `#define PROTO_STEP_MAX_MS        ${L.stepMaxMs}u`,
    `#define PROTO_LAYER_LEVEL_MAX    ${L.layerLevelMax}u`,
    `#define PROTO_LAYER_BYTES        ${L.layerBytes}u`,
    `#define PROTO_STATE_BYTES        ${L.stateBytes}u`,
    `#define PROTO_LAYOUT_PART_BYTES  ${L.layoutPartBytes}u`,
    `#define PROTO_LAYOUT_REPORT_BYTES ${L.layoutReportBytes}u`,
    `#define PROTO_SCENE_STEP_BYTES   ${L.sceneStepBytes}u`,
    `#define PROTO_SCENE_NAME_BYTES   ${L.sceneNameBytes}u`,
    "",
    "/* commands */",
  ];
  for (const c of spec.commands) {
    lines.push(`#define CMD_${snake(c.name)} ${c.code}u`);
  }
  lines.push("", "/* reports */");
  for (const r of spec.reports) {
    lines.push(`#define RPT_${snake(r.name)} ${r.code}u`);
  }
  lines.push("", "/* result codes */");
  for (const r of spec.resultCodes) {
    lines.push(`#define RES_${snake(r.name)} ${r.code}u`);
  }

  lines.push("", "/* field offsets and widths — 逐字节契约，codec 只照这张表写 */");
  for (const c of spec.commands) {
    if (c.fields.length === 0) continue;
    lines.push("", `/* ${c.name} (${c.code}) */`);
    for (const f of c.fields) {
      for (const [k, v] of fieldMacros(f)) lines.push(`#define CMD_${snake(c.name)}_FIELD_${snake(k)} ${v}u`);
    }
  }
  for (const r of spec.reports) {
    if (r.fields.length === 0) continue;
    lines.push("", `/* ${r.name} (${r.code}) */`);
    for (const f of r.fields) {
      for (const [k, v] of fieldMacros(f)) lines.push(`#define RPT_${snake(r.name)}_FIELD_${snake(k)} ${v}u`);
    }
  }
  lines.push("", "/* layer layout (9 bytes) */");
  for (const f of spec.layer.fields) {
    lines.push(`#define LAYER_${snake(f.name)}_OFF ${f.offset}u`);
    lines.push(`#define LAYER_${snake(f.name)}_BYTES ${f.bytes}u`);
  }
  lines.push("", "/* state layout (32 bytes) */");
  for (const f of spec.state.fields) {
    lines.push(`#define STATE_${snake(f.name)}_OFF ${f.offset}u`);
    lines.push(`#define STATE_${snake(f.name)}_BYTES ${f.bytes}u`);
    if (f.type === "array") {
      lines.push(`#define STATE_${snake(f.name)}_COUNT ${f.count}u`);
      lines.push(`#define STATE_${snake(f.name)}_ELEM_BYTES ${f.elementBytes}u`);
      for (const e of f.element) {
        lines.push(`#define STATE_${snake(f.name)}_ELEM_${snake(e.name)}_OFF ${e.offset}u`);
      }
    }
  }

  lines.push("", "#endif /* BLE_LIGHT_PROTOCOL_GEN_H */", "");
  return lines.join("\n");
}

/* ---------- 生成 TS 常量 ---------- */
function genTs() {
  const L = spec.limits;
  const lines = [
    "/** GENERATED — DO NOT EDIT. Source: docs/protocol.json, generator: scripts/gen-protocol.mjs */",
    "",
    "export const FRAME = {",
    `  magic: ${spec.frame.magic},`,
    `  version: ${spec.frame.version},`,
    `  headerBytes: ${spec.frame.headerBytes},`,
    `  maxPayload: ${spec.frame.maxPayload},`,
    `  maxFrame: ${spec.frame.maxFrame},`,
    `  crcInit: ${spec.frame.crc.initial},`,
    `  crcPoly: ${spec.frame.crc.polynomial},`,
    "} as const;",
    "",
    "export const LIMITS = {",
    ...Object.entries(L).map(([k, v]) => `  ${k}: ${v},`),
    "} as const;",
    "",
    "export const CMD = {",
    ...spec.commands.map((c) => `  ${c.name}: ${c.code},`),
    "} as const;",
    "",
    "export const RPT = {",
    ...spec.reports.map((r) => `  ${r.name}: ${r.code},`),
    "} as const;",
    "",
    "export const RESULT = {",
    ...spec.resultCodes.map((r) => `  ${r.name}: ${r.code},`),
    "} as const;",
    "",
    "export const EFFECT = {",
    ...spec.effects.map((e) => `  ${e.name}: ${e.type},`),
    "} as const;",
    "",
    "/** 字段描述：偏移、宽度、类型、取值域。codec 只照这张表写。 */",
    "export interface FieldSpec {",
    "  offset: number;",
    "  bytes: number;",
    "  type: string;",
    "  range?: readonly [number, number];",
    "  values?: Readonly<Record<string, number>>;",
    "  count?: number;",
    "  elementBytes?: number;",
    "}",
    "",
    "/** 每条命令的逐字节字段表，按字段名索引。 */",
    "export const COMMAND_FIELDS = {",
    ...spec.commands.map((c) => `  ${c.name}: ${tsFieldTable(c.fields)},`),
    "} as const;",
    "",
    "/** 每种报告的逐字节字段表，按字段名索引。 */",
    "export const REPORT_FIELDS = {",
    ...spec.reports.map((r) => `  ${r.name}: ${tsFieldTable(r.fields)},`),
    "} as const;",
    "",
    "/** 层与状态的字段表，按字段名索引。 */",
    `export const LAYER_FIELDS = ${tsFieldTable(spec.layer.fields)} as const;`,
    `export const STATE_FIELDS = ${tsFieldTable(spec.state.fields)} as const;`,
    "",
    "export type CommandName = keyof typeof CMD;",
    "export type ResultName = keyof typeof RESULT;",
    "export type EffectName = keyof typeof EFFECT;",
    "",
  ];
  return lines.join("\n");
}

/** TS 侧只需要 codec 用得到的那几项，不把整份 JSON 塞进去。 */
function tsFieldTable(fields) {
  if (fields.length === 0) return "{}";
  const rows = fields.map((f) => `${JSON.stringify(f.name)}: ${tsFieldSpec(f)}`);
  return `{\n${rows.map((r) => `    ${r},`).join("\n")}\n  }`;
}

function tsFieldSpec(f) {
  const parts = [`offset: ${f.offset}`, `bytes: ${f.bytes}`, `type: ${JSON.stringify(f.type)}`];
  if (f.range) parts.push(`range: [${f.range[0]}, ${f.range[1]}]`);
  if (f.values) parts.push(`values: ${JSON.stringify(f.values)}`);
  if (f.count) parts.push(`count: ${f.count}`, `elementBytes: ${f.elementBytes}`);
  if (f.lengthField) parts.push(`lengthField: ${JSON.stringify(f.lengthField)}`);
  if (f.pad) parts.push(`pad: ${JSON.stringify(f.pad)}`);
  if (f.element) {
    const els = f.element.map((e) => `${JSON.stringify(e.name)}: ${tsFieldSpec(e)}`);
    parts.push(`element: { ${els.join(", ")} }`);
  }
  return `{ ${parts.join(", ")} }`;
}

/* ---------- 生成测试向量 ---------- */

/** 每个字段取一个位于取值域内的确定性样例值；数组取满 8 个元素。 */
function samplePayload(fields) {
  const out = new Array(fields.reduce((n, f) => Math.max(n, f.offset + f.bytes), 0)).fill(0);
  for (const f of fields) {
    switch (f.type) {
      case "enum": {
        const vals = Object.values(f.values);
        out[f.offset] = vals[Math.min(1, vals.length - 1)];
        break;
      }
      case "u8":
        out[f.offset] = Math.min(f.range[1], Math.max(f.range[0], 5));
        break;
      case "u16le": {
        const v = Math.min(f.range[1], Math.max(f.range[0], 300));
        out[f.offset] = v & 0xff;
        out[f.offset + 1] = (v >> 8) & 0xff;
        break;
      }
      case "utf8": {
        const text = Buffer.from("ab", "utf8");
        for (let i = 0; i < text.length; i++) out[f.offset + i] = text[i];
        const lenField = fields.find((x) => x.name === f.lengthField);
        if (lenField) out[lenField.offset] = text.length;
        break;
      }
      case "layer": {
        out[f.offset] = 0x01;
        out[f.offset + 8] = 100;
        break;
      }
      case "state":
        for (let i = 0; i < f.bytes; i++) out[f.offset + i] = (i + 1) & 0xff;
        break;
      case "array": {
        for (let i = 0; i < f.count; i++) {
          for (const e of f.element) {
            const at = f.offset + i * f.elementBytes + e.offset;
            const v = e.type === "u16le" ? 7 : 1;
            out[at] = v;
            if (e.type === "u16le") out[at + 1] = 0;
          }
        }
        break;
      }
      default:
        out[f.offset] = 0;
    }
  }
  return out;
}

/** 把样例载荷再按字段切回来，作为「逐字段期望值」写进向量。 */
function expectedFields(fields, payload) {
  return fields.map((f) => ({
    name: f.name,
    offset: f.offset,
    bytes: f.bytes,
    hex: payload.slice(f.offset, f.offset + f.bytes).map((b) => b.toString(16).padStart(2, "0")).join(" "),
  }));
}

function genVectors() {  const vectors = [];
  const push = (v) => vectors.push(v);

  push({
    kind: "crc",
    name: "crc16_check_string",
    input_ascii: "123456789",
    expect_crc: hex([0x29, 0xb1]),
  });

  push({
    kind: "frame",
    name: "frame_set_power_on",
    command: "SetPower",
    seq: 1,
    payload: [1],
    expect_hex: hex(encodeFrame({ command: toInt(spec.commands[0].code), seq: 1, payload: [1] })),
  });

  push({
    kind: "frame",
    name: "frame_set_brightness_128",
    command: "SetBrightness",
    seq: 2,
    payload: [128],
    expect_hex: hex(encodeFrame({ command: toInt(spec.commands[1].code), seq: 2, payload: [128] })),
  });

  push({
    kind: "frame",
    name: "frame_query_state",
    command: "QueryState",
    seq: 3,
    payload: [],
    expect_hex: hex(encodeFrame({ command: toInt(spec.commands[2].code), seq: 3, payload: [] })),
  });

  push({
    kind: "frame",
    name: "frame_set_led_count_strip0_64",
    command: "SetLedCount",
    seq: 4,
    payload: [0, 64, 0],
    expect_hex: hex(encodeFrame({ command: toInt(spec.commands[3].code), seq: 4, payload: [0, 64, 0] })),
  });

  push({
    kind: "frame",
    name: "frame_activate_scene_1",
    command: "ActivateScene",
    seq: 5,
    payload: [1],
    expect_hex: hex(encodeFrame({ command: toInt(spec.commands.at(-2).code), seq: 5, payload: [1] })),
  });

  // 每个命令都至少一条「载荷长度正确即可编码」的向量
  for (const c of spec.commands) {
    const payload = Array.from({ length: c.payloadBytes }, (_, i) => (i + 1) & 0xff);
    push({
      kind: "frame_shape",
      name: `frame_shape_${c.name}`,
      command: c.name,
      payloadBytes: c.payloadBytes,
      expect_total_bytes: spec.frame.headerBytes + c.payloadBytes,
      expect_hex: hex(encodeFrame({ command: toInt(c.code), seq: 0, payload })),
    });
  }

  // 逐字段向量：不只给整帧 hex，还给每个字段的偏移、字节与期望值。
  // 两端 codec 可以直接按字段断言，不必自己从 hex 里切。
  for (const c of spec.commands) {
    if (c.fields.length === 0) continue;
    const payload = samplePayload(c.fields);
    push({
      kind: "fields",
      name: `fields_${c.name}`,
      command: c.name,
      payload_bytes: c.payloadBytes,
      expect_payload_hex: hex(payload),
      expect_fields: expectedFields(c.fields, payload),
    });
  }
  for (const r of spec.reports) {
    if (r.fields.length === 0) continue;
    const payload = samplePayload(r.fields);
    push({
      kind: "fields",
      name: `fields_${r.name}`,
      report: r.name,
      payload_bytes: r.payloadBytes,
      expect_payload_hex: hex(payload),
      expect_fields: expectedFields(r.fields, payload),
    });
  }

  // 退役命令：必须回 UnknownCommand
  for (const r of spec.retired) {
    push({
      kind: "retired",
      name: `retired_${r.name}`,
      command: r.name,
      code: r.code,
      expect_result: "UnknownCommand",
    });
  }

  // State 示例：32 字节，1 条链 30 颗
  const state = new Array(32).fill(0);
  state[0] = 1;    // power
  state[1] = 128;  // brightness
  state[2] = 200;  // max_brightness
  state[3] = 1;    // strip_count
  state[4] = 0x01; // strip_power_mask
  state[5] = 0;    // active_scene
  state[6] = 1;    // layout_valid
  state[7] = 0;    // reserved
  state[8] = 30;   // led_count[0] lo
  state[9] = 0;    // led_count[0] hi
  state[24] = 2;   // part_count[0]

  push({
    kind: "state",
    name: "state_example_one_strip_30_leds",
    expect_hex: hex(state),
    expect_bytes: 32,
    decoded: {
      power: 1, brightness: 128, max_brightness: 200, strip_count: 1,
      strip_power_mask: 1, active_scene: 0, layout_valid: 1,
      led_count: [30, 0, 0, 0, 0, 0, 0, 0],
      part_count: [2, 0, 0, 0, 0, 0, 0, 0],
    },
  });

  // 上限值：两端常量必须一致
  push({
    kind: "limits",
    name: "limits_match",
    expect: spec.limits,
  });

  // 层编码：9 字节，静态红
  push({
    kind: "layer",
    name: "layer_static_red_level_100",
    bytes: ["0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x00", "0x64"],
    expect_len: 9,
  });

  return {
    generatedFrom: "docs/protocol.json",
    generator: "scripts/gen-protocol.mjs",
    protocolVersion: spec.version,
    count: vectors.length,
    vectors,
  };
}

/* ---------- 生成 markdown 表格段 ---------- */
function genMarkdownSections() {
  const cmdRows = spec.commands.map(
    (c) => `| \`${c.code}\` | \`${c.name}\` | ${c.payloadBytes} | ${c.desc} |`,
  );
  const rptRows = spec.reports.map(
    (r) => `| \`${r.code}\` | \`${r.name}\` | ${r.payloadBytes} | ${r.desc} |`,
  );
  const retRows = spec.retired.map((r) => `\`${r.code}\` ${r.name}`);
  const effRows = spec.effects.map(
    (e) => `| \`${e.type}\` | ${e.name} | ${e.params.map((p) => (p === 0 ? "0" : p)).join(" / ")} | ${e.desc} |`,
  );
  const resRows = spec.resultCodes.map((r) => `\`${r.code}\` ${r.name}`).join(" / ");
  const limRows = Object.entries(spec.limits)
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");

  return {
    commands: [
      "| 码 | 名称 | 载荷字节 | 说明 |",
      "|---|---|---:|---|",
      ...cmdRows,
    ].join("\n"),
    reports: [
      "| 码 | 名称 | 载荷字节 | 说明 |",
      "|---|---|---:|---|",
      ...rptRows,
    ].join("\n"),
    retired: `已退役（一律回 \`0x02 UnknownCommand\`，码不复用）：${retRows.join("、")}。`,
    effects: [
      "| type | 名称 | param[0..6] | 说明 |",
      "|---|---|---|---|",
      ...effRows,
    ].join("\n"),
    resultCodes: resRows,
    limits: ["| 常量 | 值 |", "|---|---:|", limRows].join("\n"),
    commandFields: fieldTables(spec.commands),
    reportFields: fieldTables(spec.reports),
    stateFields: oneFieldTable(spec.state.fields),
    layerFields: oneFieldTable(spec.layer.fields),
  };
}

/** 每条命令/报告一张字段表，表头带码与名称。 */
function fieldTables(entries) {
  const blocks = [];
  for (const e of entries) {
    if (e.fields.length === 0) continue;
    blocks.push(`#### \`${e.code}\` ${e.name}（${e.payloadBytes} 字节）\n\n${oneFieldTable(e.fields)}`);
  }
  return blocks.join("\n\n");
}

function oneFieldTable(fields) {
  const rows = [];
  for (const f of fields) {
    if (f.type === "array") {
      for (const e of f.element) {
        rows.push(`| ${f.offset + e.offset} | \`${f.name}[].${e.name}\` | ${e.bytes} | ${e.type} | ${rangeCell(e)} |`);
      }
      continue;
    }
    rows.push(`| ${f.offset} | \`${f.name}\` | ${f.bytes} | ${f.type} | ${rangeCell(f)} |`);
  }
  return ["| 偏移 | 字段 | 字节 | 类型 | 取值域 |", "|---:|---|---:|---|---|", ...rows].join("\n");
}

function rangeCell(f) {
  if (f.type === "enum") return Object.entries(f.values).map(([k, v]) => `${v}=${k}`).join(" / ");
  if (f.type === "utf8") return `UTF-8，补零到 ${f.bytes}，长度见 \`${f.lengthField}\``;
  if (f.type === "layer") return "见 §7";
  if (f.type === "state") return "见 §8";
  if (f.type === "bytes") return "保留，必须为 0";
  if (f.type === "array") return `${f.count} × ${f.elementBytes} 字节`;
  if (f.range) return `${f.range[0]}–${f.range[1]}`;
  return "—";
}

/* ---------- 写文件 ---------- */
const outputs = new Map();
outputs.set(join(ROOT, "firmware", "main", "protocol_gen.h"), genHeader());
outputs.set(join(ROOT, "miniprogram", "utils", "protocol", "constants.gen.ts"), genTs());
outputs.set(
  join(ROOT, "docs", "protocol-vectors.json"),
  `${JSON.stringify(genVectors(), null, 2)}\n`,
);

// protocol.md 的标记段
const mdPath = join(ROOT, "docs", "protocol.md");
if (existsSync(mdPath)) {
  const md = readFileSync(mdPath, "utf8");
  const sections = genMarkdownSections();
  let out = md;
  for (const [key, body] of Object.entries(sections)) {
    const re = new RegExp(`(<!-- GENERATED:${key} -->)[\\s\\S]*?(<!-- /GENERATED:${key} -->)`);
    if (re.test(out)) out = out.replace(re, `$1\n${body}\n$2`);
  }
  outputs.set(mdPath, out);
}

let changed = 0;
for (const [path, content] of outputs) {
  const rel = path.replace(ROOT + "\\", "").replace(ROOT + "/", "").split("\\").join("/");
  const prev = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (prev === content) continue;
  changed++;
  if (CHECK) {
    console.error(`STALE  ${rel}`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
    console.log(`wrote  ${rel}`);
  }
}

if (CHECK && changed > 0) {
  console.error(`\n${changed} 个生成物与 docs/protocol.json 不一致。跑 npm run gen。`);
  process.exit(1);
}
console.log(
  CHECK
    ? "生成物与协议源一致"
    : `协议生成完成：${spec.commands.length} 命令 / ${spec.reports.length} 报告 / ${spec.retired.length} 退役码`,
);
