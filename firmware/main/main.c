/* 设备主程序：把 BLE / 存储 / 灯带接到设备内核上。
 *
 * 这一层只做翻译：内核产出的意图 → 真副作用。所有判断都在 device_core 里。
 */
#include <stdio.h>
#include <string.h>

#include "ble_link.h"
#include "device_core.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "led_strip_owner.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "protocol.h"
#include "protocol_gen.h"
#include "selftest.h"
#include "state_blob.h"

static const char *TAG = "main";

#define NVS_NAMESPACE "lumen"
#define NVS_KEY_STATE "state"
#define NVS_KEY_LAYOUT "layout"
#define NVS_KEY_SCENE0 "scene0"

static device_core_t s_core;
static uint8_t s_seq;                  /* 当前渲染批次用的 seq */
static uint8_t s_last_out_color[3];    /* 单色常亮的当前颜色 */

static uint32_t now_ms(void) {
    return (uint32_t)(esp_timer_get_time() / 1000);
}

/* ---------- 存储 ---------- */

static void load_state(void) {
    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &h) != ESP_OK) {
        ESP_LOGW(TAG, "no nvs namespace, defaults");
        return;
    }
    uint8_t blob[STATE_BLOB_BYTES];
    size_t len = sizeof(blob);
    const esp_err_t err = nvs_get_blob(h, NVS_KEY_STATE, blob, &len);
    nvs_close(h);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "state blob missing (%d)", err);
        return;
    }
    if (!lumen_state_blob_decode(blob, len, &s_core.state)) {
        ESP_LOGW(TAG, "state blob corrupt, defaults");
        return;
    }
    ESP_LOGI(TAG, "state restored: power=%u brightness=%u", s_core.state.power, s_core.state.brightness);
}

static bool save_state(void) {
    uint8_t blob[STATE_BLOB_BYTES];
    const size_t n = lumen_state_blob_encode(&s_core.state, blob, sizeof(blob));
    if (n == 0) return false;

    nvs_handle_t h;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &h) != ESP_OK) return false;
    const esp_err_t err = nvs_set_blob(h, NVS_KEY_STATE, blob, n);
    if (err == ESP_OK) nvs_commit(h);
    nvs_close(h);
    if (err != ESP_OK) ESP_LOGE(TAG, "state save failed (%d)", err);
    return err == ESP_OK;
}

static void report_storage_failure(uint8_t command) {
    uint8_t frame[16];
    const size_t n = lumen_encode_event(frame, sizeof(frame), 1 /* storage_failed */, command);
    if (n > 0) lumen_ble_notify(frame, n);
}

/* ---------- 通知 ---------- */

static void notify_state(uint8_t seq) {
    uint8_t payload[PROTO_STATE_BYTES];
    uint8_t blob[STATE_BLOB_BYTES];
    if (lumen_state_blob_encode(&s_core.state, blob, sizeof(blob)) == 0) return;
    memcpy(payload, blob + STATE_BLOB_HEADER_BYTES, PROTO_STATE_BYTES);

    uint8_t frame[PROTO_MAX_FRAME];
    const size_t n = lumen_encode_report(frame, sizeof(frame), RPT_STATE_REPORT, seq, payload, sizeof(payload));
    if (n > 0) lumen_ble_notify(frame, n);
}

/** 小程序连上后第一步读这个特征。布局与 StateReport 的 payload 完全相同。 */
static bool read_state_blob(uint8_t *buf, size_t cap) {
    if (cap < PROTO_STATE_BYTES) return false;
    uint8_t blob[STATE_BLOB_BYTES];
    if (lumen_state_blob_encode(&s_core.state, blob, sizeof(blob)) == 0) return false;
    memcpy(buf, blob + STATE_BLOB_HEADER_BYTES, PROTO_STATE_BYTES);
    return true;
}

static void notify_strip_config(uint8_t seq) {
    /* 8 × [strip_id, gpio, flags]；一条链一个 GPIO，flags bit0 = enabled */
    uint8_t payload[24];
    memset(payload, 0, sizeof(payload));
    for (int i = 0; i < PROTO_MAX_STRIPS; i++) {
        payload[i * 3 + 0] = (uint8_t)i;
        payload[i * 3 + 1] = (uint8_t)LED_STRIP_GPIO;
        payload[i * 3 + 2] = (uint8_t)(i < s_core.state.strip_count ? 1 : 0);
    }
    uint8_t frame[PROTO_MAX_FRAME];
    const size_t n = lumen_encode_report(frame, sizeof(frame), RPT_STRIP_CONFIG_REPORT, seq, payload, sizeof(payload));
    if (n > 0) lumen_ble_notify(frame, n);
}

static void notify_device_info(uint8_t seq) {
    uint8_t payload[15];
    memset(payload, 0, sizeof(payload));
    payload[0] = 1;                        /* fw_major */
    payload[1] = 0;                        /* fw_minor */
    payload[2] = 0;                        /* fw_patch */
    payload[3] = 0x01;                     /* hw_id lo */
    payload[4] = 0x00;                     /* hw_id hi */
    payload[5] = PROTO_MAX_LEDS;
    payload[6] = PROTO_MAX_STRIPS;
    payload[7] = PROTO_MAX_PARTS;
    payload[8] = PROTO_MAX_STEPS;
    payload[9] = PROTO_MAX_SCENES;
    payload[10] = PROTO_MAX_LAYERS;
    payload[11] = 0x01;                    /* caps: 支持单色 */
    payload[12] = 0x00;

    uint8_t frame[PROTO_MAX_FRAME];
    const size_t n = lumen_encode_report(frame, sizeof(frame), RPT_DEVICE_INFO_REPORT, seq, payload, sizeof(payload));
    if (n > 0) lumen_ble_notify(frame, n);
}

static void send_ack(uint8_t seq, uint8_t command, uint8_t result) {
    uint8_t frame[16];
    const size_t n = lumen_encode_ack(frame, sizeof(frame), seq, command, result);
    if (n > 0) lumen_ble_notify(frame, n);
}

/* ---------- 渲染 ---------- */

static void render_solid(void) {
    const lumen_rgb_t color = {
        .r = s_last_out_color[0],
        .g = s_last_out_color[1],
        .b = s_last_out_color[2],
    };
    const uint8_t brightness = s_core.state.power ? s_core.state.brightness : 0;
    lumen_rgb_t scaled = {
        .r = (uint8_t)(((uint16_t)color.r * brightness + 127) / 255),
        .g = (uint8_t)(((uint16_t)color.g * brightness + 127) / 255),
        .b = (uint8_t)(((uint16_t)color.b * brightness + 127) / 255),
    };
    for (int i = 0; i < s_core.state.strip_count && i < PROTO_MAX_STRIPS; i++) {
        if (s_core.state.led_count[i] == 0) continue;
        const bool strip_on = (s_core.state.strip_power_mask & (1u << i)) != 0;
        lumen_strip_fill((uint8_t)i, strip_on ? scaled : (lumen_rgb_t){ 0, 0, 0 });
    }
}

/* ---------- 自检 ---------- */

static void render_selftest(uint32_t t) {
    const int phase = device_core_selftest_phase(&s_core, t);
    const lumen_rgb_t color = lumen_selftest_color(phase);
    for (int i = 0; i < s_core.state.strip_count && i < PROTO_MAX_STRIPS; i++) {
        if (s_core.state.led_count[i] == 0) continue;
        lumen_strip_fill((uint8_t)i, color);
    }
}

/* ---------- 帧处理 ---------- */

static void handle_frame(const uint8_t *buf, size_t len) {
    lumen_frame_t frame;
    const uint8_t decoded = lumen_frame_decode(buf, len, &frame);
    if (decoded != RES_OK) {
        /* 帧本身坏了：没有 seq 可用，回 UnknownCommand 没有意义，只记日志 */
        ESP_LOGW(TAG, "bad frame (%u)", decoded);
        return;
    }

    lumen_cmd_t cmd = { .code = frame.command, .length = frame.length };
    memcpy(cmd.payload, frame.payload, frame.length);

    device_effects_t fx;
    const uint32_t t = now_ms();
    const uint8_t result = device_core_handle(&s_core, &cmd, t, &fx);

    /* ACK 必须先于任何异步事件发出 */
    send_ack(frame.seq, frame.command, result);

    if (result != RES_OK) {
        ESP_LOGI(TAG, "cmd=0x%02X seq=%u len=%u result=%u", frame.command, frame.seq, frame.length, result);
        return;
    }

    if (fx.notify_state) notify_state(frame.seq);
    if (fx.notify_strip_cfg) notify_strip_config(frame.seq);
    if (fx.notify_device) notify_device_info(frame.seq);

    if (fx.rebuild_strip) {
        if (!lumen_strip_rebuild(fx.rebuild_strip_id, s_core.state.led_count[fx.rebuild_strip_id])) {
            report_storage_failure(frame.command);
        }
    }

    for (int i = 0; i < fx.save_count; i++) {
        if (strcmp(fx.saves[i], NVS_KEY_STATE) == 0) {
            if (!save_state()) report_storage_failure(frame.command);
            else lumen_save_done(&s_core.saves, NVS_KEY_STATE);
        }
    }

    ESP_LOGI(TAG, "cmd=0x%02X seq=%u len=%u result=%u power=%u bright=%u",
             frame.command, frame.seq, frame.length, result, s_core.state.power, s_core.state.brightness);

    render_solid();
}

/* ---------- 主循环 ---------- */

void app_main(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        nvs_flash_erase();
        nvs_flash_init();
    }

    device_core_init(&s_core, now_ms());
    load_state();

    /* 默认单色：暖白，亮度按状态里的值 */
    s_last_out_color[0] = 255;
    s_last_out_color[1] = 180;
    s_last_out_color[2] = 120;

    lumen_strip_init(s_core.state.led_count, s_core.state.strip_count);

    /* 广播名取 BT MAC 末两字节（docs/protocol.md §1）；随机数每次上电都变，
     * 手机侧会把它当成另一台设备。 */
    uint8_t mac[6] = { 0 };
    char name[24];
    if (esp_read_mac(mac, ESP_MAC_BT) == ESP_OK) {
        snprintf(name, sizeof(name), "BleLight-%02X%02X", mac[4], mac[5]);
    } else {
        snprintf(name, sizeof(name), "BleLight-0000");
    }
    ESP_LOGI(TAG, "adv name=%s", name);
    if (lumen_ble_start(name, handle_frame, read_state_blob) != 0) {
        ESP_LOGE(TAG, "ble start failed");
    }

    render_solid();

    uint32_t last = 0;
    while (true) {
        const uint32_t t = now_ms();
        if (t - last < 20) {
            /* 让出 CPU：忙等会饿死 IDLE 任务，看门狗 5 秒就复位。 */
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        }
        last = t;

        if (device_core_selftest_tick(&s_core, t)) {
            render_solid();
        } else if (device_core_selftest_phase(&s_core, t) >= 0) {
            render_selftest(t);
        }

        const char *due[SAVE_MAX_KEYS];
        const int n = device_core_collect_saves(&s_core, t, due, SAVE_MAX_KEYS);
        for (int i = 0; i < n; i++) {
            if (strcmp(due[i], NVS_KEY_STATE) == 0) {
                if (save_state()) lumen_save_done(&s_core.saves, NVS_KEY_STATE);
            }
        }
    }
}
