/** GENERATED — DO NOT EDIT. Source: docs/protocol.json, generator: scripts/gen-protocol.mjs */

export const FRAME = {
  magic: 0xA6,
  version: 0x01,
  headerBytes: 8,
  maxPayload: 232,
  maxFrame: 240,
  crcInit: 0xFFFF,
  crcPoly: 0x1021,
} as const;

export const LIMITS = {
  maxLeds: 100,
  maxStrips: 8,
  maxParts: 8,
  maxPartSegs: 8,
  maxSteps: 8,
  maxScenes: 3,
  maxLayers: 2,
  nameBytes: 24,
  stepMinMs: 100,
  stepMaxMs: 60000,
  layerLevelMax: 100,
  layerBytes: 9,
  stateBytes: 32,
  layoutPartBytes: 29,
  layoutReportBytes: 45,
  sceneStepBytes: 24,
  sceneNameBytes: 26,
} as const;

export const CMD = {
  SetPower: 0x01,
  SetBrightness: 0x02,
  QueryState: 0x05,
  SetLedCount: 0x06,
  SelfTest: 0x07,
  SetStripPower: 0x1B,
  QueryStripConfig: 0x1C,
  QueryDeviceInfo: 0x1D,
  LayoutWrite: 0x20,
  LayoutPart: 0x21,
  LayoutSeg: 0x22,
  LayoutCommit: 0x23,
  QueryLayout: 0x24,
  ScenePart: 0x25,
  SceneStep: 0x26,
  SceneName: 0x27,
  ActivateScene: 0x28,
  QueryScene: 0x29,
} as const;

export const RPT = {
  ACK: 0x80,
  Event: 0x81,
  StateReport: 0x82,
  StripConfigReport: 0x87,
  DeviceInfoReport: 0x88,
  LayoutReport: 0x89,
  LayoutListEnd: 0x8A,
  ScenePartReport: 0x8B,
  SceneStepReport: 0x8C,
  SceneListEnd: 0x8D,
} as const;

export const RESULT = {
  OK: 0x00,
  InvalidParam: 0x01,
  UnknownCommand: 0x02,
  BadChecksum: 0x03,
  BadLength: 0x04,
  Busy: 0x05,
  StorageFailed: 0x06,
  UnsupportedVersion: 0x07,
  BadMagic: 0x08,
  InternalError: 0x09,
} as const;

export const EFFECT = {
  静态: 0x00,
  呼吸: 0x01,
  彩虹: 0x02,
  流星: 0x03,
  爆闪: 0x04,
  心跳: 0x05,
  熄灭: 0x06,
  随机闪烁: 0x07,
  空层: 0xFF,
} as const;

/** 字段描述：偏移、宽度、类型、取值域。codec 只照这张表写。 */
export interface FieldSpec {
  offset: number;
  bytes: number;
  type: string;
  range?: readonly [number, number];
  values?: Readonly<Record<string, number>>;
  count?: number;
  elementBytes?: number;
}

/** 每条命令的逐字节字段表，按字段名索引。 */
export const COMMAND_FIELDS = {
  SetPower: {
    "power": { offset: 0, bytes: 1, type: "enum", values: {"off":0,"on":1} },
  },
  SetBrightness: {
    "brightness": { offset: 0, bytes: 1, type: "u8", range: [0, 255] },
  },
  QueryState: {},
  SetLedCount: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "count": { offset: 1, bytes: 2, type: "u16le", range: [1, 100] },
  },
  SelfTest: {},
  SetStripPower: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "on": { offset: 1, bytes: 1, type: "enum", values: {"off":0,"on":1} },
  },
  QueryStripConfig: {},
  QueryDeviceInfo: {},
  LayoutWrite: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "part_count": { offset: 1, bytes: 1, type: "u8", range: [1, 8] },
  },
  LayoutPart: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "name_len": { offset: 2, bytes: 1, type: "u8", range: [0, 24] },
    "name": { offset: 3, bytes: 24, type: "utf8", lengthField: "name_len", pad: "zero" },
    "seg_count": { offset: 27, bytes: 1, type: "u8", range: [1, 8] },
    "phase": { offset: 28, bytes: 1, type: "enum", values: {"continuous":0,"per_segment":1} },
  },
  LayoutSeg: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "seg_id": { offset: 2, bytes: 1, type: "u8", range: [0, 7] },
    "start": { offset: 3, bytes: 1, type: "u8", range: [0, 99] },
    "end": { offset: 4, bytes: 1, type: "u8", range: [0, 99] },
  },
  LayoutCommit: {},
  QueryLayout: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
  },
  ScenePart: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "strip_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 2, bytes: 1, type: "u8", range: [0, 7] },
    "step_count": { offset: 3, bytes: 1, type: "u8", range: [1, 8] },
    "loop": { offset: 4, bytes: 1, type: "enum", values: {"none":0,"all":1,"last":2} },
    "on": { offset: 5, bytes: 1, type: "enum", values: {"off":0,"on":1} },
  },
  SceneStep: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "strip_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 2, bytes: 1, type: "u8", range: [0, 7] },
    "step_index": { offset: 3, bytes: 1, type: "u8", range: [0, 7] },
    "duration": { offset: 4, bytes: 2, type: "u16le", range: [100, 60000] },
    "layer0": { offset: 6, bytes: 9, type: "layer" },
    "layer1": { offset: 15, bytes: 9, type: "layer" },
  },
  SceneName: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "name_len": { offset: 1, bytes: 1, type: "u8", range: [0, 24] },
    "name": { offset: 2, bytes: 24, type: "utf8", lengthField: "name_len", pad: "zero" },
  },
  ActivateScene: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
  },
  QueryScene: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
  },
} as const;

/** 每种报告的逐字节字段表，按字段名索引。 */
export const REPORT_FIELDS = {
  ACK: {
    "command": { offset: 0, bytes: 1, type: "u8", range: [0, 255] },
    "result": { offset: 1, bytes: 1, type: "u8", range: [0, 9] },
  },
  Event: {
    "event_code": { offset: 0, bytes: 1, type: "enum", values: {"storage_failed":1} },
    "detail": { offset: 1, bytes: 1, type: "u8", range: [0, 255] },
  },
  StateReport: {
    "state": { offset: 0, bytes: 32, type: "state" },
  },
  StripConfigReport: {
    "strips": { offset: 0, bytes: 24, type: "array", count: 8, elementBytes: 3, element: { "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] }, "gpio": { offset: 1, bytes: 1, type: "u8", range: [0, 48] }, "flags": { offset: 2, bytes: 1, type: "u8", range: [0, 255] } } },
  },
  DeviceInfoReport: {
    "fw_major": { offset: 0, bytes: 1, type: "u8", range: [0, 255] },
    "fw_minor": { offset: 1, bytes: 1, type: "u8", range: [0, 255] },
    "fw_patch": { offset: 2, bytes: 1, type: "u8", range: [0, 255] },
    "hw_id": { offset: 3, bytes: 2, type: "u16le", range: [0, 65535] },
    "max_leds": { offset: 5, bytes: 1, type: "u8", range: [1, 100] },
    "max_strips": { offset: 6, bytes: 1, type: "u8", range: [1, 8] },
    "max_parts": { offset: 7, bytes: 1, type: "u8", range: [1, 8] },
    "max_steps": { offset: 8, bytes: 1, type: "u8", range: [1, 8] },
    "max_scenes": { offset: 9, bytes: 1, type: "u8", range: [1, 3] },
    "max_layers": { offset: 10, bytes: 1, type: "u8", range: [1, 2] },
    "caps": { offset: 11, bytes: 2, type: "u16le", range: [0, 65535] },
    "reserved": { offset: 13, bytes: 2, type: "bytes" },
  },
  LayoutReport: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "name_len": { offset: 2, bytes: 1, type: "u8", range: [0, 24] },
    "name": { offset: 3, bytes: 24, type: "utf8", lengthField: "name_len", pad: "zero" },
    "seg_count": { offset: 27, bytes: 1, type: "u8", range: [1, 8] },
    "phase": { offset: 28, bytes: 1, type: "enum", values: {"continuous":0,"per_segment":1} },
    "segs": { offset: 29, bytes: 16, type: "array", count: 8, elementBytes: 2, element: { "start": { offset: 0, bytes: 1, type: "u8", range: [0, 99] }, "end": { offset: 1, bytes: 1, type: "u8", range: [0, 99] } } },
  },
  LayoutListEnd: {
    "strip_id": { offset: 0, bytes: 1, type: "u8", range: [0, 7] },
    "part_mask": { offset: 1, bytes: 1, type: "u8", range: [0, 255] },
  },
  ScenePartReport: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "strip_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 2, bytes: 1, type: "u8", range: [0, 7] },
    "step_count": { offset: 3, bytes: 1, type: "u8", range: [1, 8] },
    "loop": { offset: 4, bytes: 1, type: "enum", values: {"none":0,"all":1,"last":2} },
    "on": { offset: 5, bytes: 1, type: "enum", values: {"off":0,"on":1} },
  },
  SceneStepReport: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "strip_id": { offset: 1, bytes: 1, type: "u8", range: [0, 7] },
    "part_id": { offset: 2, bytes: 1, type: "u8", range: [0, 7] },
    "step_index": { offset: 3, bytes: 1, type: "u8", range: [0, 7] },
    "duration": { offset: 4, bytes: 2, type: "u16le", range: [100, 60000] },
    "layer0": { offset: 6, bytes: 9, type: "layer" },
    "layer1": { offset: 15, bytes: 9, type: "layer" },
  },
  SceneListEnd: {
    "scene_id": { offset: 0, bytes: 1, type: "u8", range: [0, 2] },
    "name_len": { offset: 1, bytes: 1, type: "u8", range: [0, 24] },
    "name": { offset: 2, bytes: 24, type: "utf8", lengthField: "name_len", pad: "zero" },
  },
} as const;

/** 层与状态的字段表，按字段名索引。 */
export const LAYER_FIELDS = {
    "type": { offset: 0, bytes: 1, type: "u8", range: [0, 255] },
    "param0": { offset: 1, bytes: 1, type: "u8", range: [0, 255] },
    "param1": { offset: 2, bytes: 1, type: "u8", range: [0, 255] },
    "param2": { offset: 3, bytes: 1, type: "u8", range: [0, 255] },
    "param3": { offset: 4, bytes: 1, type: "u8", range: [0, 255] },
    "param4": { offset: 5, bytes: 1, type: "u8", range: [0, 255] },
    "param5": { offset: 6, bytes: 1, type: "u8", range: [0, 255] },
    "param6": { offset: 7, bytes: 1, type: "u8", range: [0, 255] },
    "level": { offset: 8, bytes: 1, type: "u8", range: [0, 100] },
  } as const;
export const STATE_FIELDS = {
    "power": { offset: 0, bytes: 1, type: "enum", values: {"off":0,"on":1} },
    "brightness": { offset: 1, bytes: 1, type: "u8", range: [0, 255] },
    "max_brightness": { offset: 2, bytes: 1, type: "u8", range: [0, 255] },
    "strip_count": { offset: 3, bytes: 1, type: "u8", range: [0, 8] },
    "strip_power_mask": { offset: 4, bytes: 1, type: "u8", range: [0, 255] },
    "active_scene": { offset: 5, bytes: 1, type: "u8", range: [0, 2] },
    "layout_valid": { offset: 6, bytes: 1, type: "enum", values: {"invalid":0,"valid":1} },
    "reserved": { offset: 7, bytes: 1, type: "bytes" },
    "led_count": { offset: 8, bytes: 16, type: "array", count: 8, elementBytes: 2, element: { "count": { offset: 0, bytes: 2, type: "u16le", range: [0, 100] } } },
    "part_count": { offset: 24, bytes: 8, type: "array", count: 8, elementBytes: 1, element: { "count": { offset: 0, bytes: 1, type: "u8", range: [0, 8] } } },
  } as const;

export type CommandName = keyof typeof CMD;
export type ResultName = keyof typeof RESULT;
export type EffectName = keyof typeof EFFECT;
