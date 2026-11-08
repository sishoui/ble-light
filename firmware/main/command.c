/* 命令 reducer：纯函数，副作用只以意图返回。 */
#include "command.h"

#include <string.h>

#define BRIGHTNESS_DEFAULT 200u
#define MAX_LED_COUNT PROTO_MAX_LEDS
#define MIN_LED_COUNT 1u

/* 出厂默认拓扑：两条 20 颗 WS2812B 的灯带，分别接 GPIO3 与 GPIO4
 * （引脚表在 led_strip_owner.c）。灯珠数为 0 的链在渲染里被跳过，
 * 设备看起来就像「接了却没反应」。 */
#define DEFAULT_STRIP_COUNT 2u
#define DEFAULT_LED_COUNT 20u

lumen_state_t lumen_state_default(void) {
    lumen_state_t st;
    memset(&st, 0, sizeof(st));
    st.power = 0;
    st.max_brightness = BRIGHTNESS_DEFAULT;
    st.brightness = BRIGHTNESS_DEFAULT;
    st.strip_count = DEFAULT_STRIP_COUNT;
    st.strip_power_mask = 0;
    st.active_scene = 0;
    st.layout_valid = 0;
    for (int i = 0; i < (int)PROTO_MAX_STRIPS; i++) {
        st.led_count[i] = i < (int)DEFAULT_STRIP_COUNT ? DEFAULT_LED_COUNT : 0;
        st.part_count[i] = 0;
    }
    return st;
}

static void add_intent(lumen_out_t *out, lumen_intent_kind_t kind, uint8_t arg) {
    out->intents[out->intent_count].kind = kind;
    out->intents[out->intent_count].arg = arg;
    out->intent_count++;
}

static void reject(lumen_out_t *out, uint8_t result) {
    out->result = result;
    out->intent_count = 0;
}

static uint8_t expect_len(const lumen_cmd_t *cmd, uint16_t want) {
    return cmd->length == want ? RES_OK : RES_BAD_LENGTH;
}

void lumen_command_apply(const lumen_state_t *state, const lumen_cmd_t *cmd,
                         lumen_state_t *next, lumen_out_t *out) {
    /* 校验顺序固定：命令字 → 载荷长度 → 载荷取值。
     * 先拷状态，任何失败路径都保持 next == state。 */
    *next = *state;
    out->result = RES_OK;
    out->intent_count = 0;

    if (cmd->length > PROTO_MAX_PAYLOAD) {
        reject(out, RES_BAD_LENGTH);
        return;
    }

    switch (cmd->code) {
    case CMD_SET_POWER: {
        if (expect_len(cmd, 1) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        const uint8_t v = cmd->payload[0];
        if (v > 1) { reject(out, RES_INVALID_PARAM); return; }
        next->power = v;
        add_intent(out, LUMEN_INTENT_SAVE_STATE, 0);
        return;
    }

    case CMD_SET_BRIGHTNESS: {
        if (expect_len(cmd, 1) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        uint8_t v = cmd->payload[0];
        if (v > next->max_brightness) v = next->max_brightness;
        next->brightness = v;
        add_intent(out, LUMEN_INTENT_SAVE_STATE, 0);
        return;
    }

    case CMD_QUERY_STATE: {
        if (expect_len(cmd, 0) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        add_intent(out, LUMEN_INTENT_NOTIFY_STATE, 0);
        return;
    }

    case CMD_SET_LED_COUNT: {
        if (expect_len(cmd, 3) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        const uint8_t strip = cmd->payload[0];
        const uint16_t count = (uint16_t)(cmd->payload[1] | ((uint16_t)cmd->payload[2] << 8));
        if (strip >= next->strip_count) { reject(out, RES_INVALID_PARAM); return; }
        if (count < MIN_LED_COUNT || count > MAX_LED_COUNT) { reject(out, RES_INVALID_PARAM); return; }
        next->led_count[strip] = count;
        add_intent(out, LUMEN_INTENT_REBUILD_STRIP, strip);
        add_intent(out, LUMEN_INTENT_SAVE_STATE, 0);
        return;
    }

    case CMD_SELF_TEST: {
        if (expect_len(cmd, 0) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        add_intent(out, LUMEN_INTENT_SELF_TEST, 0);
        return;
    }

    case CMD_SET_STRIP_POWER: {
        if (expect_len(cmd, 2) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        const uint8_t strip = cmd->payload[0];
        const uint8_t on = cmd->payload[1];
        if (strip >= next->strip_count) { reject(out, RES_INVALID_PARAM); return; }
        if (on > 1) { reject(out, RES_INVALID_PARAM); return; }
        if (on) {
            next->strip_power_mask |= (uint8_t)(1u << strip);
        } else {
            next->strip_power_mask &= (uint8_t)~(1u << strip);
        }
        add_intent(out, LUMEN_INTENT_SAVE_STATE, 0);
        return;
    }

    case CMD_QUERY_STRIP_CONFIG: {
        if (expect_len(cmd, 0) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        add_intent(out, LUMEN_INTENT_NOTIFY_STRIP_CFG, 0);
        return;
    }

    case CMD_QUERY_DEVICE_INFO: {
        if (expect_len(cmd, 0) != RES_OK) { reject(out, RES_BAD_LENGTH); return; }
        add_intent(out, LUMEN_INTENT_NOTIFY_DEVICE, 0);
        return;
    }

    default:
        /* 未定义码与退役码一律回 UnknownCommand */
        reject(out, RES_UNKNOWN_COMMAND);
        return;
    }
}
