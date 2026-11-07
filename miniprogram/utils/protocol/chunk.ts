/**
 * 分片与重组。BLE 一次写最多 179 字节，整帧 240 字节要切。
 *
 * 每片 1 字节 ctrl：bit7 FIRST、bit6 LAST、bit5..0 序号。重组超时 1000ms。
 */
import { FRAME } from "./constants.gen";

export const CHUNK_TIMEOUT_MS = 1000;
const FIRST = 0x80;
const LAST = 0x40;
const SEQ_MASK = 0x3f;

/** 把一整帧切成若干片，每片 = 1 字节 ctrl + 最多 chunkData 字节。 */
export function chunkFrame(frame: Uint8Array, chunkData: number): Uint8Array[] {
  if (chunkData < 1) throw new Error("单次写入容量必须大于 0");
  if (frame.length === 0) throw new Error("空帧不需要分片");

  const count = Math.ceil(frame.length / chunkData);
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * chunkData;
    const piece = frame.subarray(start, Math.min(start + chunkData, frame.length));
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const seq = i & SEQ_MASK;
    const ctrl = (isFirst ? FIRST : 0) | (isLast ? LAST : 0) | seq;
    const chunk = new Uint8Array(piece.length + 1);
    chunk[0] = ctrl;
    chunk.set(piece, 1);
    out.push(chunk);
  }
  return out;
}

export class ChunkReassembler {
  private buf: number[] = [];
  private nextSeq = 0;
  private startedAt = 0;
  active = false;

  reset(): void {
    this.buf = [];
    this.nextSeq = 0;
    this.active = false;
  }

  /** 喂一片；凑满一帧返回它，否则 null。超时或乱序都丢弃整份。 */
  feed(chunk: Uint8Array, nowMs: number): Uint8Array | null {
    if (chunk.length < 2) return null;

    const ctrl = chunk[0];
    const seq = ctrl & SEQ_MASK;
    const isFirst = (ctrl & FIRST) !== 0;
    const isLast = (ctrl & LAST) !== 0;
    const data = chunk.subarray(1);

    if (isFirst) {
      this.buf = [];
      this.nextSeq = seq;
      this.active = true;
      this.startedAt = nowMs;
    }

    if (!this.active) return null;
    if (nowMs - this.startedAt >= CHUNK_TIMEOUT_MS) {
      this.reset();
      return null;
    }
    if (seq !== this.nextSeq) {
      this.reset();
      return null;
    }
    if (this.buf.length + data.length > FRAME.maxFrame) {
      this.reset();
      return null;
    }

    for (const b of data) this.buf.push(b);
    this.nextSeq = (this.nextSeq + 1) & SEQ_MASK;

    if (isLast) {
      this.active = false;
      return Uint8Array.from(this.buf);
    }
    return null;
  }
}
