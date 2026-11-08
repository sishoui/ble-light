import { describe, it, expect } from "vitest";

/**
 * 这一层没有独立的业务语义，但字节转换是错一次就断链的地方：
 * 微信 BLE 的 value 是 ArrayBuffer，不是 hex 字符串。
 * 用 transport 内部导出的转换函数验证边界。
 */
import { bytesToBuffer, bufferToBytes } from "../../utils/ble/buffer";

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
