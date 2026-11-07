/* gamma 表与亮度乘算。
 *
 * gamma 表在首次使用时算一次，不占 flash。255 项 × 1 字节。
 */
#include "gamma.h"

#include <math.h>
#include <stdbool.h>

static uint8_t s_table[256];
static bool s_ready = false;

static void build_table(void) {
    if (s_ready) return;
    for (int i = 0; i < 256; i++) {
        const double x = (double)i / 255.0;
        const double y = pow(x, 2.2);
        const long v = (long)(y * 255.0 + 0.5);
        s_table[i] = (uint8_t)(v > 255 ? 255 : v);
    }
    s_ready = true;
}

uint8_t lumen_gamma(uint8_t v) {
    build_table();
    return s_table[v];
}

uint8_t lumen_scale_brightness(uint8_t v, uint8_t brightness) {
    return (uint8_t)(((uint32_t)v * (uint32_t)brightness + 127u) / 255u);
}
