/**
 * 帧编解码。协议接缝里唯一允许出现字节偏移的地方。
 *
 * 布局固定：magic | version | command | seq | length(u16 LE) | payload | crc16(u16 LE)
 */
import { FRAME } from "./constants.gen";
import { crc16 } from "./crc";

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameError";
  }
}

export interface Frame {
  command: number;
  seq: number;
  payload: number[];
}

export function encodeFrame(frame: Frame): Uint8Array {
  const len = frame.payload.length;
  if (len > FRAME.maxPayload) {
    throw new FrameError(`payload ${len} 超过上限 ${FRAME.maxPayload}`);
  }
  if (frame.seq < 0 || frame.seq > 255) {
    throw new FrameError(`seq ${frame.seq} 越界`);
  }

  const out = new Uint8Array(FRAME.headerBytes + len);
  out[0] = FRAME.magic;
  out[1] = FRAME.version;
  out[2] = frame.command;
  out[3] = frame.seq;
  out[4] = len & 0xff;
  out[5] = (len >> 8) & 0xff;
  out.set(frame.payload, 6);

  const crc = crc16(out.subarray(0, 6 + len));
  out[6 + len] = crc & 0xff;
  out[7 + len] = crc >> 8;
  return out;
}

export function decodeFrame(bytes: Uint8Array): Frame {
  if (bytes.length < FRAME.headerBytes) {
    throw new FrameError(`帧长 ${bytes.length} 小于头部 ${FRAME.headerBytes}`);
  }
  if (bytes[0] !== FRAME.magic) {
    throw new FrameError(`magic 0x${bytes[0].toString(16)} 不是 0x${FRAME.magic.toString(16)}`);
  }
  if (bytes[1] !== FRAME.version) {
    throw new FrameError(`version ${bytes[1]} 不受支持`);
  }

  const len = bytes[4] | (bytes[5] << 8);
  if (len > FRAME.maxPayload) {
    throw new FrameError(`length ${len} 超过上限 ${FRAME.maxPayload}`);
  }
  if (bytes.length !== FRAME.headerBytes + len) {
    throw new FrameError(`length ${len} 与实到 ${bytes.length - FRAME.headerBytes} 字节不符`);
  }

  const want = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  const got = crc16(bytes.subarray(0, bytes.length - 2));
  if (got !== want) {
    throw new FrameError(`crc 0x${got.toString(16)} 与 0x${want.toString(16)} 不符`);
  }

  return {
    command: bytes[2],
    seq: bytes[3],
    payload: Array.from(bytes.subarray(6, 6 + len)),
  };
}
