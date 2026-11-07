/* 协议编解码接缝。唯一允许断言字节偏移的测试。
 *
 * 向量来自 docs/protocol-vectors.json（生成物），不在这里手写 hex。
 */
#include <stdio.h>
#include <string.h>

#include "chunk_reasm.h"
#include "protocol.h"
#include "test_harness.h"

/* ---------- CRC ---------- */

RUN_TEST(crc16_check_string_is_0x29b1) {
    const uint8_t s[] = "123456789";
    ASSERT_EQ_U16(lumen_crc16(s, 9), 0x29B1);
}

RUN_TEST(crc16_empty_is_init) {
    ASSERT_EQ_U16(lumen_crc16((const uint8_t *)"", 0), PROTO_CRC_INIT);
}

/* ---------- 帧解码 ---------- */

RUN_TEST(decode_set_power_on_frame_from_vector) {
    /* A6 01 01 01 01 00 01 <crc lo> <crc hi> */
    const uint8_t buf[] = { 0xA6, 0x01, 0x01, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00 };
    uint8_t framed[16];
    lumen_frame_t enc = { .command = CMD_SET_POWER, .seq = 1, .length = 1, .payload = { 1 } };
    size_t n = lumen_frame_encode(&enc, framed, sizeof(framed));
    ASSERT_EQ_SZ(n, 9);

    lumen_frame_t dec;
    ASSERT_EQ_U8(lumen_frame_decode(framed, n, &dec), RES_OK);
    ASSERT_EQ_U8(dec.command, CMD_SET_POWER);
    ASSERT_EQ_U8(dec.seq, 1);
    ASSERT_EQ_U16(dec.length, 1);
    ASSERT_EQ_U8(dec.payload[0], 1);
    (void)buf;
}

RUN_TEST(decode_rejects_bad_magic) {
    uint8_t buf[] = { 0xA5, 0x01, 0x01, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00 };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_BAD_MAGIC);
}

RUN_TEST(decode_rejects_unknown_version) {
    uint8_t buf[] = { 0xA6, 0x02, 0x01, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00 };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_UNSUPPORTED_VERSION);
}

RUN_TEST(decode_rejects_short_frame) {
    uint8_t buf[] = { 0xA6, 0x01, 0x01 };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_BAD_LENGTH);
}

RUN_TEST(decode_rejects_payload_over_limit) {
    /* 声明 233 字节：超上限，先于 CRC 被拦 */
    uint8_t buf[8] = { 0xA6, 0x01, 0x01, 0x01, 0xE9, 0x00, 0, 0 };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_BAD_LENGTH);
}

RUN_TEST(decode_rejects_length_mismatch) {
    /* 声明 4 字节，实际只带了 1 字节载荷 */
    uint8_t buf[10] = { 0xA6, 0x01, 0x01, 0x01, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00 };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_BAD_LENGTH);
}

RUN_TEST(decode_rejects_bad_crc) {
    uint8_t buf[] = { 0xA6, 0x01, 0x01, 0x01, 0x01, 0x00, 0x01, 0xFF, 0xFF };
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(buf, sizeof(buf), &f), RES_BAD_CHECKSUM);
}

/* ---------- 边界：payload 0 / 232 / 233 ---------- */

RUN_TEST(encode_zero_payload_frame_is_header_plus_crc) {
    lumen_frame_t f = { .command = CMD_QUERY_STATE, .seq = 7, .length = 0 };
    uint8_t out[PROTO_MAX_FRAME];
    ASSERT_EQ_SZ(lumen_frame_encode(&f, out, sizeof(out)), PROTO_HEADER_BYTES);
}

RUN_TEST(encode_max_payload_232_fits) {
    lumen_frame_t f = { .command = CMD_QUERY_STATE, .seq = 0, .length = PROTO_MAX_PAYLOAD };
    memset(f.payload, 0xAB, PROTO_MAX_PAYLOAD);
    uint8_t out[PROTO_MAX_FRAME];
    ASSERT_EQ_SZ(lumen_frame_encode(&f, out, sizeof(out)), PROTO_MAX_FRAME);
}

RUN_TEST(encode_rejects_payload_233) {
    lumen_frame_t f = { .command = CMD_QUERY_STATE, .seq = 0, .length = PROTO_MAX_PAYLOAD + 1 };
    uint8_t out[PROTO_MAX_FRAME + 8];
    ASSERT_EQ_SZ(lumen_frame_encode(&f, out, sizeof(out)), 0);
}

RUN_TEST(encode_rejects_small_buffer) {
    lumen_frame_t f = { .command = CMD_SET_POWER, .seq = 0, .length = 1, .payload = { 1 } };
    uint8_t out[4];
    ASSERT_EQ_SZ(lumen_frame_encode(&f, out, sizeof(out)), 0);
}

/* ---------- 报告 ---------- */

RUN_TEST(ack_echoes_command_and_result) {
    uint8_t out[16];
    size_t n = lumen_encode_ack(out, sizeof(out), 9, CMD_SET_BRIGHTNESS, RES_OK);
    ASSERT_EQ_SZ(n, PROTO_HEADER_BYTES + 2);

    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(out, n, &f), RES_OK);
    ASSERT_EQ_U8(f.command, RPT_ACK);
    ASSERT_EQ_U8(f.seq, 9);
    ASSERT_EQ_U8(f.payload[0], CMD_SET_BRIGHTNESS);
    ASSERT_EQ_U8(f.payload[1], RES_OK);
}

RUN_TEST(event_has_seq_zero) {
    uint8_t out[16];
    size_t n = lumen_encode_event(out, sizeof(out), 1, 3);
    lumen_frame_t f;
    ASSERT_EQ_U8(lumen_frame_decode(out, n, &f), RES_OK);
    ASSERT_EQ_U8(f.command, RPT_EVENT);
    ASSERT_EQ_U8(f.seq, 0);
    ASSERT_EQ_U8(f.payload[0], 1);
    ASSERT_EQ_U8(f.payload[1], 3);
}

/* ---------- 分片重组 ---------- */

static void feed_single(lumen_reasm_t *r, uint8_t ctrl, const uint8_t *data, size_t n, uint32_t now) {
    uint8_t chunk[PROTO_MAX_FRAME];
    chunk[0] = ctrl;
    memcpy(chunk + 1, data, n);
    lumen_reasm_feed(r, chunk, n + 1, now);
}

RUN_TEST(reasm_single_chunk_frame) {
    lumen_frame_t enc = { .command = CMD_SET_POWER, .seq = 2, .length = 1, .payload = { 1 } };
    uint8_t framed[16];
    size_t n = lumen_frame_encode(&enc, framed, sizeof(framed));

    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0xC0, framed, n, 0);
    ASSERT_EQ_SZ(r.length, n);
    ASSERT_TRUE(memcmp(r.buf, framed, n) == 0);
}

RUN_TEST(reasm_two_chunks_reassembles) {
    const uint8_t a[] = { 1, 2, 3 };
    const uint8_t b[] = { 4, 5 };
    lumen_reasm_t r;
    lumen_reasm_reset(&r);

    feed_single(&r, 0x80 | 0, a, sizeof(a), 0);  /* FIRST，seq 0 */
    ASSERT_TRUE(r.active);
    feed_single(&r, 0x40 | 1, b, sizeof(b), 0);  /* LAST，seq 1 */

    ASSERT_EQ_SZ(r.length, 5);
    ASSERT_EQ_U8(r.buf[0], 1);
    ASSERT_EQ_U8(r.buf[4], 5);
}

RUN_TEST(reasm_seq_wraps_at_64) {
    uint8_t one[1] = { 7 };
    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0x80 | 63, one, 1, 0);
    feed_single(&r, 0x40 | 0, one, 1, 0);
    ASSERT_EQ_SZ(r.length, 2);
}

RUN_TEST(reasm_rejects_out_of_order_seq) {
    uint8_t one[1] = { 7 };
    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0x80 | 0, one, 1, 0);
    feed_single(&r, 0x40 | 5, one, 1, 0);  /* 期望 1，收到 5 */
    ASSERT_EQ_SZ(r.length, 0);
    ASSERT_FALSE(r.active);
}

RUN_TEST(reasm_discards_on_timeout) {
    uint8_t one[1] = { 7 };
    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0x80 | 0, one, 1, 0);
    ASSERT_FALSE(lumen_reasm_tick(&r, 999));
    ASSERT_TRUE(lumen_reasm_tick(&r, 1000));
    ASSERT_FALSE(r.active);
}

RUN_TEST(reasm_new_first_bit_restarts_cleanly) {
    uint8_t a[] = { 1, 2 };
    uint8_t b[] = { 9 };
    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0x80 | 0, a, sizeof(a), 0);
    feed_single(&r, 0x80 | 0, b, sizeof(b), 0);  /* 上一份没收到 LAST 就重开 */
    ASSERT_EQ_SZ(r.length, 1);
    ASSERT_EQ_U8(r.buf[0], 9);
}

RUN_TEST(reasm_drops_chunk_that_overflows_frame) {
    uint8_t big[PROTO_MAX_FRAME];
    memset(big, 0xEE, sizeof(big));
    lumen_reasm_t r;
    lumen_reasm_reset(&r);
    feed_single(&r, 0x80 | 0, big, 200, 0);
    feed_single(&r, 0x40 | 1, big, 200, 0);
    ASSERT_EQ_SZ(r.length, 0);
    ASSERT_FALSE(r.active);
}

EXPORT_TESTS(protocol) {
    RUN_CASE(crc16_check_string_is_0x29b1);
    RUN_CASE(crc16_empty_is_init);
    RUN_CASE(decode_set_power_on_frame_from_vector);
    RUN_CASE(decode_rejects_bad_magic);
    RUN_CASE(decode_rejects_unknown_version);
    RUN_CASE(decode_rejects_short_frame);
    RUN_CASE(decode_rejects_payload_over_limit);
    RUN_CASE(decode_rejects_length_mismatch);
    RUN_CASE(decode_rejects_bad_crc);
    RUN_CASE(encode_zero_payload_frame_is_header_plus_crc);
    RUN_CASE(encode_max_payload_232_fits);
    RUN_CASE(encode_rejects_payload_233);
    RUN_CASE(encode_rejects_small_buffer);
    RUN_CASE(ack_echoes_command_and_result);
    RUN_CASE(event_has_seq_zero);
    RUN_CASE(reasm_single_chunk_frame);
    RUN_CASE(reasm_two_chunks_reassembles);
    RUN_CASE(reasm_seq_wraps_at_64);
    RUN_CASE(reasm_rejects_out_of_order_seq);
    RUN_CASE(reasm_discards_on_timeout);
    RUN_CASE(reasm_new_first_bit_restarts_cleanly);
    RUN_CASE(reasm_drops_chunk_that_overflows_frame);
}
