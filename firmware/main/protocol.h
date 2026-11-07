/* 协议编解码。纯函数：不读写全局、不碰硬件、不碰存储。
 *
 * 唯一允许出现字节偏移的地方——其余模块一律用 protocol_gen.h 的宏。
 */
#ifndef LUMEN_PROTOCOL_H
#define LUMEN_PROTOCOL_H

#include <stddef.h>
#include <stdint.h>

#include "protocol_gen.h"

typedef struct {
    uint8_t command;
    uint8_t seq;
    uint16_t length;
    uint8_t payload[PROTO_MAX_PAYLOAD];
} lumen_frame_t;

/** CRC16 CCITT-FALSE：poly 0x1021，init 0xFFFF，不反转，无末尾异或。 */
uint16_t lumen_crc16(const uint8_t *data, size_t len);

/**
 * 校验顺序固定：magic → version → length → crc。
 * 成功返回 RES_OK，并把解出的帧写进 out；失败返回对应结果码，out 不可用。
 */
uint8_t lumen_frame_decode(const uint8_t *buf, size_t len, lumen_frame_t *out);

/** 编码整帧。返回写入的字节数；容量不够返回 0。 */
size_t lumen_frame_encode(const lumen_frame_t *frame, uint8_t *out, size_t cap);

/** 编码一条固定报告（ACK / Event / StateReport / ...）。返回字节数，容量不够 0。 */
size_t lumen_encode_report(uint8_t *out, size_t cap, uint8_t report, uint8_t seq,
                           const uint8_t *payload, uint16_t length);

/** 编码 ACK：command 是回显的命令字，result 是结果码。 */
size_t lumen_encode_ack(uint8_t *out, size_t cap, uint8_t seq, uint8_t command, uint8_t result);

/** 编码 Event：seq 恒 0。 */
size_t lumen_encode_event(uint8_t *out, size_t cap, uint8_t event_code, uint8_t detail);

#endif /* LUMEN_PROTOCOL_H */
