/* 自检颜色表。 */
#include "selftest.h"

static const lumen_rgb_t COLORS[4] = {
    { .r = 255, .g = 0, .b = 0 },    /* 红 */
    { .r = 0, .g = 255, .b = 0 },    /* 绿 */
    { .r = 0, .g = 0, .b = 255 },    /* 蓝 */
    { .r = 255, .g = 255, .b = 255 }, /* 白 */
};

lumen_rgb_t lumen_selftest_color(int phase) {
    if (phase < 0 || phase >= 4) {
        const lumen_rgb_t black = { .r = 0, .g = 0, .b = 0 };
        return black;
    }
    return COLORS[phase];
}
