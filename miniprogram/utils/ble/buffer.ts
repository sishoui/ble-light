/**
 * BLE 字节转换。
 *
 * 微信 BLE 的 characteristic value 是 ArrayBuffer，不是 hex 字符串。
 * 单独抽出来是因为「带偏移的 Uint8Array 视图」是个容易错的地方：
 * 直接用 view.buffer 会把整个底层 buffer 发出去。
 */

/** Uint8Array → ArrayBuffer，只含该视图自己的区间。 */
export function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function bufferToBytes(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}
