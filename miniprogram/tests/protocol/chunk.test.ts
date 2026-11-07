import { describe, it, expect } from "vitest";
import { chunkFrame, ChunkReassembler } from "../../utils/protocol/chunk";

const CTRL_FIRST = 0x80;
const CTRL_LAST = 0x40;

describe("分片", () => {
  it("帧小于单次写入上限时只切一片，ctrl 是 0xC0", () => {
    const frame = new Uint8Array(Array.from({ length: 20 }, (_, i) => i));
    const chunks = chunkFrame(frame, 179);
    expect(chunks.length).toBe(1);
    expect(chunks[0][0]).toBe(0xC0);
    expect(Array.from(chunks[0].subarray(1))).toEqual(Array.from(frame));
  });

  it("大帧切成多片，FIRST / LAST 位正确", () => {
    const frame = new Uint8Array(Array.from({ length: 400 }, (_, i) => i & 0xff));
    const chunks = chunkFrame(frame, 179);
    expect(chunks.length).toBe(3);
    expect(chunks[0][0] & CTRL_FIRST).toBe(CTRL_FIRST);
    expect(chunks[0][0] & CTRL_LAST).toBe(0);
    expect(chunks[1][0] & CTRL_FIRST).toBe(0);
    expect(chunks[1][0] & CTRL_LAST).toBe(0);
    expect(chunks[2][0] & CTRL_LAST).toBe(CTRL_LAST);
  });

  it("分片序号从 0 起递增", () => {
    const frame = new Uint8Array(400);
    const chunks = chunkFrame(frame, 179);
    expect(chunks.map((c) => c[0] & 0x3f)).toEqual([0, 1, 2]);
  });

  it("序号在 64 处回绕", () => {
    /* 65 片：第 64 片的序号回到 0 */
    const frame = new Uint8Array(65 * 10);
    const chunks = chunkFrame(frame, 10);
    expect(chunks.length).toBe(65);
    expect(chunks[63][0] & 0x3f).toBe(63);
    expect(chunks[64][0] & 0x3f).toBe(0);
  });

  it("单次写入容量为 0 时抛错", () => {
    expect(() => chunkFrame(new Uint8Array(10), 0)).toThrow();
  });
});

describe("重组", () => {
  it("单片重组出原帧", () => {
    const frame = new Uint8Array([1, 2, 3, 4]);
    const r = new ChunkReassembler();
    const chunks = chunkFrame(frame, 179);
    const done = r.feed(chunks[0], 0);
    expect(done).not.toBeNull();
    expect(Array.from(done!)).toEqual([1, 2, 3, 4]);
  });

  it("多片按序重组", () => {
    const frame = new Uint8Array(Array.from({ length: 30 }, (_, i) => i));
    const chunks = chunkFrame(frame, 10);
    const r = new ChunkReassembler();
    expect(r.feed(chunks[0], 0)).toBeNull();
    expect(r.feed(chunks[1], 10)).toBeNull();
    const done = r.feed(chunks[2], 20);
    expect(Array.from(done!)).toEqual(Array.from(frame));
  });

  it("乱序丢弃整份", () => {
    const frame = new Uint8Array(30);
    const chunks = chunkFrame(frame, 10);
    const r = new ChunkReassembler();
    r.feed(chunks[0], 0);
    expect(r.feed(chunks[2], 10)).toBeNull();
    expect(r.active).toBe(false);
  });

  it("超时丢弃整份", () => {
    const frame = new Uint8Array(30);
    const chunks = chunkFrame(frame, 10);
    const r = new ChunkReassembler();
    r.feed(chunks[0], 0);
    expect(r.feed(chunks[1], 1001)).toBeNull();
    expect(r.active).toBe(false);
  });

  it("新的 FIRST 会重开一份", () => {
    const a = chunkFrame(new Uint8Array([1, 2]), 179)[0];
    const b = chunkFrame(new Uint8Array([9]), 179)[0];
    const r = new ChunkReassembler();
    r.feed(a, 0);
    const done = r.feed(b, 10);
    expect(Array.from(done!)).toEqual([9]);
  });
});
