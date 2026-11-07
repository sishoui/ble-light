import { describe, it, expect } from "vitest";
import { crc16 } from "../../utils/protocol/crc";
import { encodeFrame, decodeFrame, FrameError } from "../../utils/protocol/frame";
import { CMD } from "../../utils/protocol/constants.gen";
import { vectors } from "./vectors";

const hex = (bytes: Uint8Array | number[]) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

const codeOf = (name: string): number => CMD[name as keyof typeof CMD];

describe("CRC16", () => {
  it("检查串 123456789 算出 0x29B1", () => {
    const v = vectors.find("crc", "crc16_check_string");
    /* 向量按值给，不按线序：帧里的 LE 由编码器负责 */
    expect(crc16(new TextEncoder().encode(v.input_ascii))).toBe(v.expect_crc);
  });
});

describe("帧编码", () => {
  it("向量里的每一帧都能编出同样的字节", () => {
    for (const v of vectors.of("frame")) {
      const got = encodeFrame({ command: codeOf(v.command), seq: v.seq, payload: v.payload });
      expect(hex(got)).toBe(v.expect_hex);
    }
  });

  it("每条命令的载荷长度都能编出定长帧", () => {
    for (const v of vectors.of("frame_shape")) {
      const payload = Array.from({ length: v.payloadBytes }, (_, i) => (i + 1) & 0xff);
      const got = encodeFrame({ command: codeOf(v.command), seq: 0, payload });
      expect(got.length).toBe(v.expect_total_bytes);
    }
  });

  it("payload 0 字节时帧长等于头 8 字节", () => {
    expect(encodeFrame({ command: 0x05, seq: 7, payload: [] }).length).toBe(8);
  });

  it("payload 232 字节时帧长等于 240", () => {
    const out = encodeFrame({ command: 0x05, seq: 0, payload: new Array(232).fill(0xab) });
    expect(out.length).toBe(240);
    expect(out[6]).toBe(0xab);
  });

  it("payload 233 字节被拒绝", () => {
    expect(() => encodeFrame({ command: 0x05, seq: 0, payload: new Array(233).fill(0) })).toThrow(FrameError);
  });
});

describe("帧解码", () => {
  it("编出来的帧能解回原样", () => {
    const dec = decodeFrame(encodeFrame({ command: 0x06, seq: 9, payload: [0, 64, 0] }));
    expect(dec.command).toBe(0x06);
    expect(dec.seq).toBe(9);
    expect(dec.payload).toEqual([0, 64, 0]);
  });

  it("magic 不对时拒绝", () => {
    const frame = encodeFrame({ command: 0x01, seq: 1, payload: [1] });
    frame[0] = 0xa5;
    expect(() => decodeFrame(frame)).toThrow(/magic/i);
  });

  it("version 不对时拒绝", () => {
    const frame = encodeFrame({ command: 0x01, seq: 1, payload: [1] });
    frame[1] = 2;
    expect(() => decodeFrame(frame)).toThrow(/version/i);
  });

  it("CRC 不对时拒绝", () => {
    const frame = encodeFrame({ command: 0x01, seq: 1, payload: [1] });
    frame[frame.length - 1] ^= 0xff;
    expect(() => decodeFrame(frame)).toThrow(/crc/i);
  });

  it("长度字段与实到字节不符时拒绝", () => {
    const frame = encodeFrame({ command: 0x01, seq: 1, payload: [1] });
    expect(() => decodeFrame(frame.slice(0, frame.length - 1))).toThrow(/length/i);
  });

  it("声明长度超过 232 时拒绝", () => {
    expect(() => decodeFrame(new Uint8Array([0xa6, 0x01, 0x01, 0x01, 0xe9, 0x00, 0, 0]))).toThrow(/length/i);
  });
});
