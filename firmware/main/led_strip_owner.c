/* 灯带句柄的唯一所有者。
 *
 * 只有这个文件碰 RMT / led_strip。别处一律通过它。
 * 句柄按链惰性创建；重建时先建新的，成功后再换，失败保留旧的。
 */
#include "led_strip_owner.h"

#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "led_strip.h"
#include "protocol_gen.h"

static const char *TAG = "strip";

typedef struct {
    led_strip_handle_t handle;
    uint16_t count;
} strip_slot_t;

static strip_slot_t s_strips[PROTO_MAX_STRIPS];

static esp_err_t create_handle(uint16_t count, led_strip_handle_t *out) {
    led_strip_config_t cfg = {
        .strip_gpio_num = LED_STRIP_GPIO,
        .max_leds = count,
        .led_model = LED_MODEL_WS2812,
        .color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB,
        .flags.invert_out = false,
    };
    led_strip_rmt_config_t rmt = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10 * 1000 * 1000,
#ifdef CONFIG_LED_STRIP_RMT_BACKEND
        .mem_block_symbols = 64,
        .flags.with_dma = false,
#endif
    };
    return led_strip_new_rmt_device(&cfg, &rmt, out);
}

void lumen_strip_init(const uint16_t *led_count, int strip_count) {
    memset(s_strips, 0, sizeof(s_strips));
    for (int i = 0; i < strip_count && i < 8; i++) {
        if (led_count[i] == 0) continue;
        led_strip_handle_t h = NULL;
        if (create_handle(led_count[i], &h) == ESP_OK) {
            s_strips[i].handle = h;
            s_strips[i].count = led_count[i];
            led_strip_clear(h);
        } else {
            ESP_LOGE(TAG, "strip %d create failed", i);
        }
    }
}

bool lumen_strip_rebuild(uint8_t strip_id, uint16_t led_count) {
    if (strip_id >= 8 || led_count == 0) return false;

    led_strip_handle_t fresh = NULL;
    if (create_handle(led_count, &fresh) != ESP_OK) {
        ESP_LOGE(TAG, "strip %u rebuild failed", strip_id);
        return false;
    }
    if (s_strips[strip_id].handle != NULL) {
        led_strip_del(s_strips[strip_id].handle);
    }
    s_strips[strip_id].handle = fresh;
    s_strips[strip_id].count = led_count;
    led_strip_clear(fresh);
    return true;
}

bool lumen_strip_show(uint8_t strip_id, const lumen_rgb_t *pixels, uint16_t count) {
    if (strip_id >= 8) return false;
    strip_slot_t *s = &s_strips[strip_id];
    if (s->handle == NULL) return false;
    const uint16_t n = count < s->count ? count : s->count;
    for (uint16_t i = 0; i < n; i++) {
        led_strip_set_pixel(s->handle, i, pixels[i].r, pixels[i].g, pixels[i].b);
    }
    return led_strip_refresh(s->handle) == ESP_OK;
}

void lumen_strip_fill(uint8_t strip_id, lumen_rgb_t color) {
    if (strip_id >= 8) return;
    strip_slot_t *s = &s_strips[strip_id];
    if (s->handle == NULL) return;
    for (uint16_t i = 0; i < s->count; i++) {
        led_strip_set_pixel(s->handle, i, color.r, color.g, color.b);
    }
    led_strip_refresh(s->handle);
}
