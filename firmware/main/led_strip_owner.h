/* 灯带句柄的唯一所有者。把像素推给 RMT。
 *
 * 句柄重建是异步的：改灯珠数时先回 ACK，重建完成后发 Event。
 */
#ifndef LUMEN_LED_STRIP_OWNER_H
#define LUMEN_LED_STRIP_OWNER_H

#include <stdbool.h>
#include <stdint.h>

#define LED_STRIP_GPIO 3
#define LED_STRIP_MAX 100

typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
} lumen_rgb_t;

/** 初始化所有灯链句柄。led_count[i] == 0 表示该链不存在。 */
void lumen_strip_init(const uint16_t *led_count, int strip_count);

/** 重建某条链的句柄。失败返回 false，旧句柄保持可用。 */
bool lumen_strip_rebuild(uint8_t strip_id, uint16_t led_count);

/** 推一帧到某条链。 */
bool lumen_strip_show(uint8_t strip_id, const lumen_rgb_t *pixels, uint16_t count);

/** 设置整条链为同一颜色。 */
void lumen_strip_fill(uint8_t strip_id, lumen_rgb_t color);

#endif /* LUMEN_LED_STRIP_OWNER_H */
