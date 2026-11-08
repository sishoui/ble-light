/* 链号 → GPIO 表。纯函数，宿主机可测。 */
#include "strip_gpio.h"

/* 一张表定死，改接线就改这里。
 *
 * 避开 GPIO11/12/13（VDD_SPI 与 flash）与 GPIO18/19（USB）。
 * GPIO8/9 是 strapping 脚、开发板常挂板载 LED，也不进这张表。 */
static const int g_strip_gpio[PROTO_MAX_STRIPS] = {
    3, 4, 5, 6, 7, 10, 20, 21,
};

int lumen_strip_gpio(uint8_t strip_id) {
    if (strip_id >= PROTO_MAX_STRIPS) return -1;
    return g_strip_gpio[strip_id];
}
