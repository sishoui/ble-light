/* 命令 reducer 接缝。(state, cmd) → (state', result, intents) 纯函数。
 *
 * 每个命令至少四条：合法改状态 / 越界回 InvalidParam 且状态不变 /
 * 长度错回 BadLength / 未定义码回 UnknownCommand。
 */
#include <string.h>

#include "command.h"
#include "test_harness.h"

static lumen_state_t default_state(void) {
    return lumen_state_default();
}

static lumen_cmd_t cmd1(uint8_t code, uint8_t a) {
    lumen_cmd_t c = { .code = code, .length = 1, .payload = { a } };
    return c;
}

static lumen_out_t apply(const lumen_state_t *st, const lumen_cmd_t *c, lumen_state_t *out_state) {
    lumen_out_t out;
    lumen_command_apply(st, c, out_state, &out);
    return out;
}

static int has_intent(const lumen_out_t *out, lumen_intent_kind_t kind) {
    for (int i = 0; i < out->intent_count; i++) {
        if (out->intents[i].kind == kind) return 1;
    }
    return 0;
}

/* ---------- 默认状态 ---------- */

RUN_TEST(default_state_is_power_off_brightness_kept) {
    lumen_state_t st = default_state();
    ASSERT_EQ_U8(st.power, 0);
    ASSERT_EQ_U8(st.max_brightness, 200);
    ASSERT_EQ_U8(st.brightness, 200);
}

/* ---------- SetPower ---------- */

RUN_TEST(set_power_on_changes_state_and_asks_save) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_POWER, 1);
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_EQ_U8(next.power, 1);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_SAVE_STATE));
}

RUN_TEST(set_power_off_keeps_brightness) {
    lumen_state_t st = default_state();
    st.power = 1;
    st.brightness = 33;
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_POWER, 0);
    apply(&st, &c, &next);
    ASSERT_EQ_U8(next.power, 0);
    ASSERT_EQ_U8(next.brightness, 33);
}

RUN_TEST(set_power_rejects_value_2) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_POWER, 2);
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
    ASSERT_EQ_U8(out.intent_count, 0);
}

RUN_TEST(set_power_rejects_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_POWER, .length = 2, .payload = { 1, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
}

/* ---------- SetBrightness ---------- */

RUN_TEST(set_brightness_clamps_to_max) {
    lumen_state_t st = default_state();
    st.max_brightness = 100;
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_BRIGHTNESS, 250);
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_EQ_U8(next.brightness, 100);
}

RUN_TEST(set_brightness_below_max_is_kept_as_is) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_BRIGHTNESS, 42);
    apply(&st, &c, &next);
    ASSERT_EQ_U8(next.brightness, 42);
}

RUN_TEST(set_brightness_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_BRIGHTNESS, .length = 0 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

/* ---------- SetLedCount ---------- */

RUN_TEST(set_led_count_accepts_1_to_100) {
    lumen_state_t st = default_state();
    st.strip_count = 2;
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 3, .payload = { 1, 64, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_EQ_U16(next.led_count[1], 64);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_REBUILD_STRIP));
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_SAVE_STATE));
}

RUN_TEST(set_led_count_rejects_zero) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 3, .payload = { 0, 0, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
    ASSERT_EQ_U8(out.intent_count, 0);
}

RUN_TEST(set_led_count_rejects_101) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 3, .payload = { 0, 101, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
}

RUN_TEST(set_led_count_rejects_strip_8) {
    lumen_state_t st = default_state();
    st.strip_count = 8;
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 3, .payload = { 8, 10, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
}

RUN_TEST(set_led_count_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 2, .payload = { 0, 64 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

/* ---------- QueryState ---------- */

RUN_TEST(query_state_asks_for_state_report) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_STATE, .length = 0 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_NOTIFY_STATE));
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
}

RUN_TEST(query_state_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_STATE, .length = 1, .payload = { 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

/* ---------- SelfTest ---------- */

RUN_TEST(self_test_asks_for_self_test) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SELF_TEST, .length = 0 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_SELF_TEST));
}

RUN_TEST(self_test_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SELF_TEST, .length = 1, .payload = { 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

/* ---------- 查询命令 ---------- */

RUN_TEST(query_strip_config_asks_for_report) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_STRIP_CONFIG, .length = 0 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_NOTIFY_STRIP_CFG));
}

RUN_TEST(query_device_info_asks_for_report) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_DEVICE_INFO, .length = 0 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_TRUE(has_intent(&out, LUMEN_INTENT_NOTIFY_DEVICE));
}

RUN_TEST(set_strip_power_toggles_mask) {
    lumen_state_t st = default_state();
    st.strip_count = 3;
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_STRIP_POWER, .length = 2, .payload = { 1, 1 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_OK);
    ASSERT_EQ_U8(next.strip_power_mask & 0x02, 0x02);
}

RUN_TEST(set_strip_power_off_clears_bit) {
    lumen_state_t st = default_state();
    st.strip_count = 3;
    st.strip_power_mask = 0x03;
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_STRIP_POWER, .length = 2, .payload = { 0, 0 } };
    apply(&st, &c, &next);
    ASSERT_EQ_U8(next.strip_power_mask & 0x01, 0);
    ASSERT_EQ_U8(next.strip_power_mask & 0x02, 0x02);
}

RUN_TEST(set_strip_power_rejects_out_of_range_strip) {
    lumen_state_t st = default_state();
    st.strip_count = 2;
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_STRIP_POWER, .length = 2, .payload = { 5, 1 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
}

RUN_TEST(set_strip_power_rejects_on_2) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_STRIP_POWER, .length = 2, .payload = { 0, 2 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
}

RUN_TEST(query_strip_config_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_STRIP_CONFIG, .length = 1, .payload = { 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

RUN_TEST(query_device_info_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_QUERY_DEVICE_INFO, .length = 1, .payload = { 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

RUN_TEST(set_strip_power_bad_length) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_STRIP_POWER, .length = 1, .payload = { 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
}

/* ---------- 校验顺序 ---------- */

RUN_TEST(set_led_count_too_long_and_out_of_range_is_bad_length) {
    /* 既超长（声明 4 字节）又越界（strip 9）。顺序要求先判长度。 */
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 4, .payload = { 9, 255, 0, 0 } };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
}

/* ---------- 未定义与退役码 ---------- */

RUN_TEST(cmd_length_over_max_payload_is_bad_length) {
    /* 长度字段本身越界：在任何命令分支之前就该被拦下 */
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = { .code = CMD_SET_POWER, .length = PROTO_MAX_PAYLOAD + 1 };
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_BAD_LENGTH);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
}

RUN_TEST(unknown_code_returns_unknown_command) {
    lumen_state_t st = default_state();
    lumen_state_t next;
    lumen_cmd_t c = cmd1(0x7F, 0);
    lumen_out_t out = apply(&st, &c, &next);
    ASSERT_EQ_U8(out.result, RES_UNKNOWN_COMMAND);
    ASSERT_TRUE(memcmp(&st, &next, sizeof(st)) == 0);
    ASSERT_EQ_U8(out.intent_count, 0);
}

RUN_TEST(retired_codes_return_unknown_command) {
    const uint8_t retired[] = { 0x03, 0x04, 0x10, 0x11, 0x12, 0x13, 0x1E };
    for (size_t i = 0; i < sizeof(retired); i++) {
        lumen_state_t st = default_state();
        lumen_state_t next;
        lumen_cmd_t c = cmd1(retired[i], 1);
        lumen_out_t out = apply(&st, &c, &next);
        ASSERT_EQ_U8(out.result, RES_UNKNOWN_COMMAND);
    }
}

/* ---------- 无副作用 ---------- */

RUN_TEST(reducer_does_not_touch_input_state) {
    lumen_state_t st = default_state();
    lumen_state_t before = st;
    lumen_state_t next;
    lumen_cmd_t c = cmd1(CMD_SET_POWER, 1);
    apply(&st, &c, &next);
    ASSERT_TRUE(memcmp(&st, &before, sizeof(st)) == 0);
}

RUN_TEST(reducer_is_deterministic) {
    lumen_state_t st = default_state();
    lumen_cmd_t c = { .code = CMD_SET_LED_COUNT, .length = 3, .payload = { 0, 30, 0 } };
    lumen_state_t a, b;
    lumen_out_t oa, ob;
    lumen_command_apply(&st, &c, &a, &oa);
    lumen_command_apply(&st, &c, &b, &ob);
    ASSERT_TRUE(memcmp(&a, &b, sizeof(a)) == 0);
    ASSERT_EQ_U8(oa.result, ob.result);
    ASSERT_EQ_U8(oa.intent_count, ob.intent_count);
}

EXPORT_TESTS(command) {
    RUN_CASE(default_state_is_power_off_brightness_kept);
    RUN_CASE(set_power_on_changes_state_and_asks_save);
    RUN_CASE(set_power_off_keeps_brightness);
    RUN_CASE(set_power_rejects_value_2);
    RUN_CASE(set_power_rejects_bad_length);
    RUN_CASE(set_brightness_clamps_to_max);
    RUN_CASE(set_brightness_below_max_is_kept_as_is);
    RUN_CASE(set_brightness_bad_length);
    RUN_CASE(set_led_count_accepts_1_to_100);
    RUN_CASE(set_led_count_rejects_zero);
    RUN_CASE(set_led_count_rejects_101);
    RUN_CASE(set_led_count_rejects_strip_8);
    RUN_CASE(set_led_count_bad_length);
    RUN_CASE(query_state_asks_for_state_report);
    RUN_CASE(query_state_bad_length);
    RUN_CASE(self_test_asks_for_self_test);
    RUN_CASE(self_test_bad_length);
    RUN_CASE(query_strip_config_asks_for_report);
    RUN_CASE(query_device_info_asks_for_report);
    RUN_CASE(set_strip_power_toggles_mask);
    RUN_CASE(set_strip_power_off_clears_bit);
    RUN_CASE(set_strip_power_rejects_out_of_range_strip);
    RUN_CASE(set_strip_power_rejects_on_2);
    RUN_CASE(query_strip_config_bad_length);
    RUN_CASE(query_device_info_bad_length);
    RUN_CASE(set_strip_power_bad_length);
    RUN_CASE(set_led_count_too_long_and_out_of_range_is_bad_length);
    RUN_CASE(cmd_length_over_max_payload_is_bad_length);
    RUN_CASE(unknown_code_returns_unknown_command);
    RUN_CASE(retired_codes_return_unknown_command);
    RUN_CASE(reducer_does_not_touch_input_state);
    RUN_CASE(reducer_is_deterministic);
}
