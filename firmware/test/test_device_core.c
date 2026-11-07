/* 设备内核：命令 → 状态 + 意图，自检状态机。
 *
 * 它不属于五个接缝中的任何一个（它是 reducer 的调用方），
 * 所以测试放在 reducer 接缝的同一目录下，按行为断言。
 */
#include <string.h>

#include "device_core.h"
#include "test_harness.h"

static lumen_cmd_t cmd(uint8_t code, const uint8_t *payload, uint16_t len) {
    lumen_cmd_t c = { .code = code, .length = len };
    if (len > 0) memcpy(c.payload, payload, len);
    return c;
}

static lumen_cmd_t cmd1(uint8_t code, uint8_t a) {
    return cmd(code, &a, 1);
}

/* ---------- 接上 reducer ---------- */

RUN_TEST(core_starts_from_default_state) {
    device_core_t dev;
    device_core_init(&dev, 0);
    ASSERT_EQ_U8(dev.state.power, 0);
    ASSERT_EQ_U8(dev.state.max_brightness, 200);
    ASSERT_EQ_U8(dev.selftest, DEVICE_SELFTEST_IDLE);
}

RUN_TEST(core_set_power_reports_effects) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t c = cmd1(CMD_SET_POWER, 1);
    ASSERT_EQ_U8(device_core_handle(&dev, &c, 0, &fx), RES_OK);
    ASSERT_EQ_U8(dev.state.power, 1);
    /* 500ms 防抖还没到，这一帧不该存 */
    ASSERT_EQ_U8(fx.save_count, 0);
}

RUN_TEST(core_state_save_arrives_after_500ms) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t c = cmd1(CMD_SET_POWER, 1);
    device_core_handle(&dev, &c, 0, &fx);

    const char *due[4];
    ASSERT_EQ_U8(device_core_collect_saves(&dev, 499, due, 4), 0);
    ASSERT_EQ_U8(device_core_collect_saves(&dev, 500, due, 4), 1);
    ASSERT_EQ_STR(due[0], "state");
}

RUN_TEST(core_query_state_wants_state_report) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t c = cmd(CMD_QUERY_STATE, NULL, 0);
    ASSERT_EQ_U8(device_core_handle(&dev, &c, 0, &fx), RES_OK);
    ASSERT_TRUE(fx.notify_state);
}

RUN_TEST(core_set_led_count_asks_for_rebuild) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const uint8_t payload[3] = { 2, 50, 0 };
    const lumen_cmd_t c = cmd(CMD_SET_LED_COUNT, payload, 3);
    ASSERT_EQ_U8(device_core_handle(&dev, &c, 0, &fx), RES_OK);
    ASSERT_TRUE(fx.rebuild_strip);
    ASSERT_EQ_U8(fx.rebuild_strip_id, 2);
    ASSERT_EQ_U16(dev.state.led_count[2], 50);
}

RUN_TEST(core_invalid_command_changes_nothing) {
    device_core_t dev;
    device_core_init(&dev, 0);
    const lumen_state_t before = dev.state;
    device_effects_t fx;
    const lumen_cmd_t c = cmd1(CMD_SET_POWER, 7);
    ASSERT_EQ_U8(device_core_handle(&dev, &c, 0, &fx), RES_INVALID_PARAM);
    ASSERT_TRUE(memcmp(&before, &dev.state, sizeof(before)) == 0);
    ASSERT_FALSE(fx.notify_state);
    ASSERT_EQ_U8(fx.save_count, 0);
}

/* ---------- 自检 ---------- */

RUN_TEST(selftest_runs_four_phases_of_500ms) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t c = cmd(CMD_SELF_TEST, NULL, 0);
    device_core_handle(&dev, &c, 0, &fx);
    ASSERT_TRUE(fx.start_selftest);

    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 0), 0);
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 499), 0);
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 500), 1);
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 1000), 2);
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 1500), 3);
}

RUN_TEST(selftest_ends_after_two_seconds) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t c = cmd(CMD_SELF_TEST, NULL, 0);
    device_core_handle(&dev, &c, 0, &fx);

    ASSERT_FALSE(device_core_selftest_tick(&dev, 1999));
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 1999), 3);
    ASSERT_TRUE(device_core_selftest_tick(&dev, 2000));
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 2000), -1);
}

RUN_TEST(selftest_interrupted_by_state_change) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t st = cmd(CMD_SELF_TEST, NULL, 0);
    device_core_handle(&dev, &st, 0, &fx);
    ASSERT_EQ_U8(dev.selftest, DEVICE_SELFTEST_RUNNING);

    const lumen_cmd_t power = cmd1(CMD_SET_POWER, 1);
    device_core_handle(&dev, &power, 100, &fx);
    ASSERT_EQ_U8(dev.selftest, DEVICE_SELFTEST_IDLE);
    ASSERT_EQ_U8(device_core_selftest_phase(&dev, 100), -1);
}

RUN_TEST(selftest_not_interrupted_by_query) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t st = cmd(CMD_SELF_TEST, NULL, 0);
    device_core_handle(&dev, &st, 0, &fx);

    const lumen_cmd_t q = cmd(CMD_QUERY_STATE, NULL, 0);
    device_core_handle(&dev, &q, 100, &fx);
    ASSERT_EQ_U8(dev.selftest, DEVICE_SELFTEST_RUNNING);
}

RUN_TEST(selftest_not_interrupted_by_invalid_command) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const lumen_cmd_t st = cmd(CMD_SELF_TEST, NULL, 0);
    device_core_handle(&dev, &st, 0, &fx);

    const lumen_cmd_t bad = cmd1(CMD_SET_BRIGHTNESS, 0);
    (void)cmd1(CMD_SET_POWER, 1);
    /* 长度错：状态没变，自检不该断 */
    const lumen_cmd_t wrong_len = { .code = CMD_SET_POWER, .length = 0 };
    device_core_handle(&dev, &wrong_len, 100, &fx);
    (void)bad;
    ASSERT_EQ_U8(dev.selftest, DEVICE_SELFTEST_RUNNING);
}

/* ---------- 状态变更打断自检的同时也要存 ---------- */

RUN_TEST(core_strip_power_updates_mask_and_saves) {
    device_core_t dev;
    device_core_init(&dev, 0);
    device_effects_t fx;
    const uint8_t payload[2] = { 1, 1 };
    const lumen_cmd_t c = cmd(CMD_SET_STRIP_POWER, payload, 2);
    ASSERT_EQ_U8(device_core_handle(&dev, &c, 0, &fx), RES_OK);
    ASSERT_EQ_U8(dev.state.strip_power_mask & 0x02, 0x02);

    const char *due[4];
    ASSERT_EQ_U8(device_core_collect_saves(&dev, 500, due, 4), 1);
}

RUN_TEST(core_brightness_clamped_and_saved) {
    device_core_t dev;
    device_core_init(&dev, 0);
    dev.state.max_brightness = 100;
    device_effects_t fx;
    const lumen_cmd_t c = cmd1(CMD_SET_BRIGHTNESS, 250);
    device_core_handle(&dev, &c, 0, &fx);
    ASSERT_EQ_U8(dev.state.brightness, 100);
}

EXPORT_TESTS(device_core) {
    RUN_CASE(core_starts_from_default_state);
    RUN_CASE(core_set_power_reports_effects);
    RUN_CASE(core_state_save_arrives_after_500ms);
    RUN_CASE(core_query_state_wants_state_report);
    RUN_CASE(core_set_led_count_asks_for_rebuild);
    RUN_CASE(core_invalid_command_changes_nothing);
    RUN_CASE(selftest_runs_four_phases_of_500ms);
    RUN_CASE(selftest_ends_after_two_seconds);
    RUN_CASE(selftest_interrupted_by_state_change);
    RUN_CASE(selftest_not_interrupted_by_query);
    RUN_CASE(selftest_not_interrupted_by_invalid_command);
    RUN_CASE(core_strip_power_updates_mask_and_saves);
    RUN_CASE(core_brightness_clamped_and_saved);
}
