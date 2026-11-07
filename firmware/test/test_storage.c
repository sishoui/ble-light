/* 持久化结构的编解码。坏数据、版本不匹配、超容量、写失败都算行为。 */
#include <string.h>

#include "save_scheduler.h"
#include "state_blob.h"
#include "test_harness.h"

static lumen_state_t sample_state(void) {
    lumen_state_t st = lumen_state_default();
    st.power = 1;
    st.brightness = 77;
    st.max_brightness = 200;
    st.strip_count = 2;
    st.strip_power_mask = 0x02;
    st.active_scene = 1;
    st.layout_valid = 1;
    st.led_count[0] = 30;
    st.led_count[1] = 64;
    st.part_count[0] = 2;
    return st;
}

/* ---------- state blob ---------- */

RUN_TEST(state_blob_round_trips) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    const size_t n = lumen_state_blob_encode(&st, blob, sizeof(blob));
    ASSERT_EQ_SZ(n, STATE_BLOB_BYTES);

    lumen_state_t back;
    ASSERT_TRUE(lumen_state_blob_decode(blob, n, &back));
    ASSERT_EQ_U8(back.power, st.power);
    ASSERT_EQ_U8(back.brightness, st.brightness);
    ASSERT_EQ_U8(back.strip_count, st.strip_count);
    ASSERT_EQ_U8(back.strip_power_mask, st.strip_power_mask);
    ASSERT_EQ_U8(back.active_scene, st.active_scene);
    ASSERT_EQ_U16(back.led_count[0], 30u);
    ASSERT_EQ_U16(back.led_count[1], 64u);
    ASSERT_EQ_U8(back.part_count[0], 2u);
}

RUN_TEST(state_blob_has_magic_and_version) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    lumen_state_blob_encode(&st, blob, sizeof(blob));
    ASSERT_EQ_U8(blob[0], 'L');
    ASSERT_EQ_U8(blob[1], 'M');
    ASSERT_EQ_U8(blob[2], 'E');
    ASSERT_EQ_U8(blob[3], 'N');
    ASSERT_EQ_U8(blob[4], STATE_BLOB_VERSION);
}

RUN_TEST(state_blob_rejects_bad_magic) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    lumen_state_blob_encode(&st, blob, sizeof(blob));
    blob[0] = 'X';
    lumen_state_t out;
    ASSERT_FALSE(lumen_state_blob_decode(blob, sizeof(blob), &out));
}

RUN_TEST(state_blob_rejects_version_mismatch) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    lumen_state_blob_encode(&st, blob, sizeof(blob));
    blob[4] = STATE_BLOB_VERSION + 1;
    lumen_state_t out;
    ASSERT_FALSE(lumen_state_blob_decode(blob, sizeof(blob), &out));
}

RUN_TEST(state_blob_rejects_short_blob) {
    uint8_t blob[STATE_BLOB_BYTES];
    memset(blob, 0, sizeof(blob));
    lumen_state_t out;
    ASSERT_FALSE(lumen_state_blob_decode(blob, STATE_BLOB_BYTES - 1, &out));
}

RUN_TEST(state_blob_rejects_out_of_range_field) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    lumen_state_blob_encode(&st, blob, sizeof(blob));
    /* led_count[0] 改成 9999：超上限，整份拒绝 */
    blob[STATE_BLOB_HEADER_BYTES + STATE_LED_COUNT_OFF] = 0x0F;
    blob[STATE_BLOB_HEADER_BYTES + STATE_LED_COUNT_OFF + 1] = 0x27;
    lumen_state_t out;
    ASSERT_FALSE(lumen_state_blob_decode(blob, sizeof(blob), &out));
}

RUN_TEST(state_blob_decode_leaves_target_untouched_on_failure) {
    const lumen_state_t st = sample_state();
    uint8_t blob[STATE_BLOB_BYTES];
    lumen_state_blob_encode(&st, blob, sizeof(blob));
    blob[4] = 99;

    lumen_state_t target = lumen_state_default();
    const lumen_state_t before = target;
    ASSERT_FALSE(lumen_state_blob_decode(blob, sizeof(blob), &target));
    ASSERT_TRUE(memcmp(&target, &before, sizeof(target)) == 0);
}

RUN_TEST(state_blob_encode_rejects_small_buffer) {
    const lumen_state_t st = sample_state();
    uint8_t blob[4];
    ASSERT_EQ_SZ(lumen_state_blob_encode(&st, blob, sizeof(blob)), 0);
}

/* ---------- 保存调度 ---------- */

static const char *const KEYS[] = { "state", "layout", "scene0" };
static const uint32_t DEBOUNCE[] = { 500, 0, 2000 };

static lumen_save_scheduler_t make_scheduler(void) {
    lumen_save_scheduler_t s;
    lumen_save_init(&s, KEYS, DEBOUNCE, 3);
    return s;
}

RUN_TEST(save_state_waits_500ms) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "state", 0);
    ASSERT_FALSE(lumen_save_due(&s, "state", 499));
    ASSERT_TRUE(lumen_save_due(&s, "state", 500));
}

RUN_TEST(save_layout_is_immediate) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "layout", 0);
    ASSERT_TRUE(lumen_save_due(&s, "layout", 0));
}

RUN_TEST(save_scene_waits_2000ms) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "scene0", 0);
    ASSERT_FALSE(lumen_save_due(&s, "scene0", 1999));
    ASSERT_TRUE(lumen_save_due(&s, "scene0", 2000));
}

RUN_TEST(save_redirty_restarts_the_timer) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "state", 0);
    lumen_save_mark_dirty(&s, "state", 400);
    ASSERT_FALSE(lumen_save_due(&s, "state", 700));
    ASSERT_TRUE(lumen_save_due(&s, "state", 900));
}

RUN_TEST(save_done_clears_dirty) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "state", 0);
    ASSERT_TRUE(lumen_save_due(&s, "state", 500));
    lumen_save_done(&s, "state");
    ASSERT_FALSE(lumen_save_due(&s, "state", 1000));
}

RUN_TEST(save_collect_due_returns_all_ready_keys) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "state", 0);
    lumen_save_mark_dirty(&s, "layout", 0);

    const char *due[4];
    ASSERT_EQ_U8(lumen_save_collect_due(&s, 0, due, 4), 1);
    ASSERT_EQ_STR(due[0], "layout");

    ASSERT_EQ_U8(lumen_save_collect_due(&s, 600, due, 4), 2);
}

RUN_TEST(save_unknown_key_is_ignored) {
    lumen_save_scheduler_t s = make_scheduler();
    lumen_save_mark_dirty(&s, "nope", 0);
    ASSERT_FALSE(lumen_save_due(&s, "nope", 99999));
}

RUN_TEST(save_more_keys_than_capacity_is_clamped) {
    static const char *const many[] = { "a", "b", "c", "d", "e", "f", "g" };
    static const uint32_t db[] = { 0, 0, 0, 0, 0, 0, 0 };
    lumen_save_scheduler_t s;
    lumen_save_init(&s, many, db, 7);
    ASSERT_EQ_U8(s.count, SAVE_MAX_KEYS);
}

EXPORT_TESTS(storage) {
    RUN_CASE(state_blob_round_trips);
    RUN_CASE(state_blob_has_magic_and_version);
    RUN_CASE(state_blob_rejects_bad_magic);
    RUN_CASE(state_blob_rejects_version_mismatch);
    RUN_CASE(state_blob_rejects_short_blob);
    RUN_CASE(state_blob_rejects_out_of_range_field);
    RUN_CASE(state_blob_decode_leaves_target_untouched_on_failure);
    RUN_CASE(state_blob_encode_rejects_small_buffer);
    RUN_CASE(save_state_waits_500ms);
    RUN_CASE(save_layout_is_immediate);
    RUN_CASE(save_scene_waits_2000ms);
    RUN_CASE(save_redirty_restarts_the_timer);
    RUN_CASE(save_done_clears_dirty);
    RUN_CASE(save_collect_due_returns_all_ready_keys);
    RUN_CASE(save_unknown_key_is_ignored);
    RUN_CASE(save_more_keys_than_capacity_is_clamped);
}
