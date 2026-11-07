/* 分片重组：单分片 / 多分片 / 序号回绕 / 超时 / 乱序。 */
#include "chunk_reasm.h"

#include <string.h>

#define FIRST_BIT 0x80u
#define LAST_BIT 0x40u
#define SEQ_MASK 0x3Fu

void lumen_reasm_reset(lumen_reasm_t *r) {
    r->length = 0;
    r->next_seq = 0;
    r->active = false;
    r->started_ms = 0;
}

bool lumen_reasm_feed(lumen_reasm_t *r, const uint8_t *chunk, size_t len, uint32_t now_ms) {
    if (len < 2) return false;  /* 至少 1 字节 ctrl + 1 字节数据 */

    const uint8_t ctrl = chunk[0];
    const uint8_t seq = (uint8_t)(ctrl & SEQ_MASK);
    const bool first = (ctrl & FIRST_BIT) != 0;
    const bool last = (ctrl & LAST_BIT) != 0;
    const size_t data_len = len - 1;

    if (first) {
        r->length = 0;
        r->next_seq = seq;
        r->active = true;
        r->started_ms = now_ms;
    }

    if (!r->active) return false;
    if (seq != r->next_seq) {
        lumen_reasm_reset(r);
        return false;
    }
    if (r->length + data_len > PROTO_MAX_FRAME) {
        lumen_reasm_reset(r);
        return false;
    }

    memcpy(r->buf + r->length, chunk + 1, data_len);
    r->length += data_len;
    r->next_seq = (uint8_t)((r->next_seq + 1u) & SEQ_MASK);

    if (last) {
        r->active = false;
        return true;
    }
    return false;
}

bool lumen_reasm_tick(lumen_reasm_t *r, uint32_t now_ms) {
    if (!r->active) return false;
    if ((uint32_t)(now_ms - r->started_ms) < CHUNK_REASSEMBLY_TIMEOUT_MS) return false;
    lumen_reasm_reset(r);
    return true;
}
