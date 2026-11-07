/* 协议编解码。纯函数：不读写全局、不碰硬件、不碰存储。 */
#include "protocol.h"

#include <string.h>

uint16_t lumen_crc16(const uint8_t *data, size_t len) {
    uint16_t crc = (uint16_t)PROTO_CRC_INIT;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);
        for (int b = 0; b < 8; b++) {
            if (crc & 0x8000u) {
                crc = (uint16_t)((crc << 1) ^ PROTO_CRC_POLY);
            } else {
                crc = (uint16_t)(crc << 1);
            }
        }
    }
    return crc;
}

size_t lumen_frame_encode(const lumen_frame_t *frame, uint8_t *out, size_t cap) {
    if (frame->length > PROTO_MAX_PAYLOAD) return 0;
    const size_t total = (size_t)PROTO_HEADER_BYTES + frame->length;
    if (total > cap || total > PROTO_MAX_FRAME) return 0;

    out[0] = (uint8_t)PROTO_MAGIC;
    out[1] = (uint8_t)PROTO_VERSION;
    out[2] = frame->command;
    out[3] = frame->seq;
    out[4] = (uint8_t)(frame->length & 0xFF);
    out[5] = (uint8_t)(frame->length >> 8);
    if (frame->length > 0) memcpy(out + 6, frame->payload, frame->length);

    const uint16_t crc = lumen_crc16(out, 6u + frame->length);
    out[6u + frame->length] = (uint8_t)(crc & 0xFF);
    out[7u + frame->length] = (uint8_t)(crc >> 8);
    return total;
}

uint8_t lumen_frame_decode(const uint8_t *buf, size_t len, lumen_frame_t *out) {
    /* 顺序固定：magic → version → 长度 → CRC */
    if (len < (size_t)PROTO_HEADER_BYTES) return RES_BAD_LENGTH;
    if (buf[0] != (uint8_t)PROTO_MAGIC) return RES_BAD_MAGIC;
    if (buf[1] != (uint8_t)PROTO_VERSION) return RES_UNSUPPORTED_VERSION;

    const uint16_t payload_len = (uint16_t)(buf[4] | ((uint16_t)buf[5] << 8));
    if (payload_len > PROTO_MAX_PAYLOAD) return RES_BAD_LENGTH;
    const size_t total = (size_t)PROTO_HEADER_BYTES + payload_len;
    if (len != total) return RES_BAD_LENGTH;

    const uint16_t want = (uint16_t)(buf[total - 2] | ((uint16_t)buf[total - 1] << 8));
    if (lumen_crc16(buf, total - 2) != want) return RES_BAD_CHECKSUM;

    out->command = buf[2];
    out->seq = buf[3];
    out->length = payload_len;
    if (payload_len > 0) memcpy(out->payload, buf + 6, payload_len);
    return RES_OK;
}

size_t lumen_encode_report(uint8_t *out, size_t cap, uint8_t report, uint8_t seq,
                           const uint8_t *payload, uint16_t length) {
    lumen_frame_t f = { .command = report, .seq = seq, .length = length };
    if (length > PROTO_MAX_PAYLOAD) return 0;
    if (length > 0) memcpy(f.payload, payload, length);
    return lumen_frame_encode(&f, out, cap);
}

size_t lumen_encode_ack(uint8_t *out, size_t cap, uint8_t seq, uint8_t command, uint8_t result) {
    const uint8_t payload[2] = { command, result };
    return lumen_encode_report(out, cap, RPT_ACK, seq, payload, 2);
}

size_t lumen_encode_event(uint8_t *out, size_t cap, uint8_t event_code, uint8_t detail) {
    const uint8_t payload[2] = { event_code, detail };
    return lumen_encode_report(out, cap, RPT_EVENT, 0, payload, 2);
}
