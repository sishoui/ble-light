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

export type CommandName = keyof typeof CMD;
export type ResultName = keyof typeof RESULT;
export type EffectName = keyof typeof EFFECT;
