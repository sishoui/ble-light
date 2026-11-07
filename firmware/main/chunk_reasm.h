/* 分片重组。BLE 一次写最多 179 字节，整帧 240 字节要分片。
 *
 * 规则：每片 1 字节 ctrl（bit7 FIRST / bit6 LAST / bit5..0 序号），
 * 重组超时 1000ms，超时或乱序丢弃整份。
 */
#ifndef LUMEN_CHUNK_REASM_H
#define LUMEN_CHUNK_REASM_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "protocol_gen.h"

typedef struct {
    uint8_t buf[PROTO_MAX_FRAME];
    size_t length;
    uint8_t next_seq;
    bool active;
    uint32_t started_ms;
} lumen_reasm_t;

#define CHUNK_REASSEMBLY_TIMEOUT_MS 1000u

void lumen_reasm_reset(lumen_reasm_t *r);

/**
 * 喂入一片。返回 true 表示收到完整帧（写入 r->buf，长度 r->length）。
 * now_ms 由调用方提供，便于在宿主机上测超时。
 */
bool lumen_reasm_feed(lumen_reasm_t *r, const uint8_t *chunk, size_t len, uint32_t now_ms);

/** 超时检查：到点就丢弃未完成的帧并返回 true。 */
bool lumen_reasm_tick(lumen_reasm_t *r, uint32_t now_ms);

#endif /* LUMEN_CHUNK_REASM_H */
