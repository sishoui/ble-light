/* 32 字节 State blob 编解码。解码失败整份拒绝，不半兼容。 */
#include "state_blob.h"

#include <string.h>

size_t lumen_state_blob_encode(const lumen_state_t *st, uint8_t *out, size_t cap) {
    if (cap < STATE_BLOB_BYTES) return 0;

    out[0] = (uint8_t)STATE_BLOB_MAGIC0;
    out[1] = (uint8_t)STATE_BLOB_MAGIC1;
    out[2] = (uint8_t)STATE_BLOB_MAGIC2;
    out[3] = (uint8_t)STATE_BLOB_MAGIC3;
    out[4] = STATE_BLOB_VERSION;

    uint8_t *p = out + STATE_BLOB_HEADER_BYTES;
    memset(p, 0, PROTO_STATE_BYTES);
    p[STATE_POWER_OFF] = st->power;
    p[STATE_BRIGHTNESS_OFF] = st->brightness;
    p[STATE_MAX_BRIGHTNESS_OFF] = st->max_brightness;
    p[STATE_STRIP_COUNT_OFF] = st->strip_count;
    p[STATE_STRIP_POWER_MASK_OFF] = st->strip_power_mask;
    p[STATE_ACTIVE_SCENE_OFF] = st->active_scene;
    p[STATE_LAYOUT_VALID_OFF] = st->layout_valid;
    for (int i = 0; i < (int)PROTO_MAX_STRIPS; i++) {
        const int at = STATE_LED_COUNT_OFF + i * STATE_LED_COUNT_ELEM_BYTES;
        p[at] = (uint8_t)(st->led_count[i] & 0xFF);
        p[at + 1] = (uint8_t)(st->led_count[i] >> 8);
        p[STATE_PART_COUNT_OFF + i] = st->part_count[i];
    }
    return STATE_BLOB_BYTES;
}

bool lumen_state_blob_decode(const uint8_t *blob, size_t len, lumen_state_t *st) {
    if (len != STATE_BLOB_BYTES) return false;
    if (blob[0] != (uint8_t)STATE_BLOB_MAGIC0 || blob[1] != (uint8_t)STATE_BLOB_MAGIC1 ||
        blob[2] != (uint8_t)STATE_BLOB_MAGIC2 || blob[3] != (uint8_t)STATE_BLOB_MAGIC3) {
        return false;
    }
    if (blob[4] != STATE_BLOB_VERSION) return false;

    const uint8_t *p = blob + STATE_BLOB_HEADER_BYTES;
    lumen_state_t tmp = lumen_state_default();
    tmp.power = p[STATE_POWER_OFF];
    tmp.brightness = p[STATE_BRIGHTNESS_OFF];
    tmp.max_brightness = p[STATE_MAX_BRIGHTNESS_OFF];
    tmp.strip_count = p[STATE_STRIP_COUNT_OFF];
    tmp.strip_power_mask = p[STATE_STRIP_POWER_MASK_OFF];
    tmp.active_scene = p[STATE_ACTIVE_SCENE_OFF];
    tmp.layout_valid = p[STATE_LAYOUT_VALID_OFF];
    for (int i = 0; i < (int)PROTO_MAX_STRIPS; i++) {
        const int at = STATE_LED_COUNT_OFF + i * STATE_LED_COUNT_ELEM_BYTES;
        tmp.led_count[i] = (uint16_t)(p[at] | ((uint16_t)p[at + 1] << 8));
        tmp.part_count[i] = p[STATE_PART_COUNT_OFF + i];
    }

    /* 取值域不合法也整份拒绝：半套数据比没有数据更难查 */
    if (tmp.power > 1) return false;
    if (tmp.strip_count > PROTO_MAX_STRIPS) return false;
    if (tmp.active_scene >= PROTO_MAX_SCENES) return false;
    if (tmp.layout_valid > 1) return false;
    for (int i = 0; i < (int)PROTO_MAX_STRIPS; i++) {
        if (tmp.led_count[i] > PROTO_MAX_LEDS) return false;
        if (tmp.part_count[i] > PROTO_MAX_PARTS) return false;
    }

    *st = tmp;
    return true;
}
