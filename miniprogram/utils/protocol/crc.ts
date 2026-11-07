/**
 * CRC16 CCITT-FALSE：poly 0x1021，init 0xFFFF，不反转，无末尾异或。
 * 与固件用同一份生成出来的常量。
 */
import { FRAME } from "./constants.gen";

export function crc16(data: Uint8Array | number[]): number {
  let crc: number = FRAME.crcInit;
  for (const b of data) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ FRAME.crcPoly) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}
