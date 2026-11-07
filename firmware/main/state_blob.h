/* 32 字节 State blob 的编解码。纯函数。
 *
 * 持久化格式：'L''M''E''N' + version(1) + 32 字节 State。解码失败整份拒绝。
 */
#ifndef LUMEN_STATE_BLOB_H
#define LUMEN_STATE_BLOB_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "command.h"

#define STATE_BLOB_MAGIC0 'L'
#define STATE_BLOB_MAGIC1 'M'
#define STATE_BLOB_MAGIC2 'E'
#define STATE_BLOB_MAGIC3 'N'
#define STATE_BLOB_VERSION 1u
#define STATE_BLOB_HEADER_BYTES 5u
#define STATE_BLOB_BYTES (STATE_BLOB_HEADER_BYTES + PROTO_STATE_BYTES)

/** 编码成可写 NVS 的 blob。返回总字节数。 */
size_t lumen_state_blob_encode(const lumen_state_t *st, uint8_t *out, size_t cap);

/** 解码。magic / version / 长度任一不符都整份拒绝，返回 false 且不动 *st。 */
bool lumen_state_blob_decode(const uint8_t *blob, size_t len, lumen_state_t *st);

#endif /* LUMEN_STATE_BLOB_H */
