import { describe, it, expect } from "vitest";

/**
 * 这一层没有独立的业务语义，但字节转换是错一次就断链的地方：
 * 微信 BLE 的 value 是 ArrayBuffer，不是 hex 字符串。
 * 用 transport 内部导出的转换函数验证边界。
 */
import { bytesToBuffer, bufferToBytes } from "../../utils/ble/buffer";
import { framesForWrite } from "../../utils/ble/transport";

describe("BLE 字节转换", () => {
  it("往返转换保持字节一致", () => {
    const bytes = new Uint8Array([0xa6, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
    expect(Array.from(bufferToBytes(bytesToBuffer(bytes)))).toEqual(Array.from(bytes));
  });

  it("带偏移的视图只取自己的区间", () => {
    const whole = new Uint8Array([1, 2, 3, 4, 5]);
    const view = whole.subarray(1, 4);
    expect(Array.from(bufferToBytes(bytesToBuffer(view)))).toEqual([2, 3, 4]);
  });

  it("空数组也能往返", () => {
    expect(bufferToBytes(bytesToBuffer(new Uint8Array(0))).length).toBe(0);
  });

  it("全 0x00 与全 0xFF 不被截断", () => {
    const zeros = new Uint8Array(8);
    const ff = new Uint8Array(8).fill(0xff);
    expect(Array.from(bufferToBytes(bytesToBuffer(zeros)))).toEqual(Array(8).fill(0));
    expect(Array.from(bufferToBytes(bytesToBuffer(ff)))).toEqual(Array(8).fill(255));
  });

  it("转换不复制原数组的引用，改原数组不影响结果", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const buf = bytesToBuffer(bytes);
    bytes[0] = 99;
    expect(new Uint8Array(buf)[0]).toBe(1);
  });
});

describe("写入分片", () => {
  /**
   * 固件 chunk_reasm.c 把每次写入的第一个字节当 ctrl：
   * bit7 FIRST、bit6 LAST、低 6 位序号。裸帧会被当成只有 FIRST 的分片，
   * 设备等着后续分片直到 1000ms 超时，整帧静默丢弃——灯不亮，也没有错误。
   */
  it("整帧必须带上 ctrl 字节，不能直接写裸帧", () => {
    const frame = new Uint8Array([0xa6, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00, 0x25, 0x4d]);
    const chunks = framesForWrite(frame, 247);
    expect(chunks.length).toBe(1);
    // ctrl 0xC0 = FIRST | LAST | seq 0
    expect(chunks[0][0]).toBe(0xc0);
    expect(Array.from(chunks[0].subarray(1))).toEqual(Array.from(frame));
  });

  it("大帧按 MTU 切开，首片 FIRST、末片 LAST、序号递增", () => {
    const frame = new Uint8Array(240).fill(0x55);
    const chunks = framesForWrite(frame, 23); // 容量 19 字节数据
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0][0] & 0x80).toBe(0x80); // FIRST
    expect(chunks[0][0] & 0x40).toBe(0);    // 不是 LAST
    expect(chunks.at(-1)![0] & 0x40).toBe(0x40); // LAST
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i][0] & 0x3f).toBe(i & 0x3f);
      expect(chunks[i].length - 1).toBeLessThanOrEqual(19);
    }
  });

  it("拼回所有分片的数据段能得到原帧", () => {
    const frame = Uint8Array.from({ length: 200 }, (_, i) => i & 0xff);
    const joined = framesForWrite(frame, 247).map((c) => Array.from(c.subarray(1))).flat();
    expect(joined).toEqual(Array.from(frame));
  });
});
