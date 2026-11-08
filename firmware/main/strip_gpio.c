/* 链号 → GPIO 表。纯函数，宿主机可测。 */
#include "strip_gpio.h"

/* 一张表定死，改接线就改这里。
 *
 * ESP32-C3 只有 22 个 GPIO，其中一堆有主：
 *   GPIO11 VDD_SPI、GPIO12/13 flash、GPIO18/19 USB —— 占了设备起不来
 *   GPIO20/21 是 UART0（CONFIG_ESP_CONSOLE_UART_NUM=0）—— 占了刷不完也看不到日志
 *   GPIO8/9 strapping，且多数开发板把 8 接了板载 LED
 * 剩下能从 0,1,2,3,4,5,6,7,10 里挑八颗。0/2 也是 strapping，
 * 但只在复位瞬间采样，运行时当普通输出用没有影响。 */
static const int g_strip_gpio[PROTO_MAX_STRIPS] = {
    3, 4, 5, 6, 7, 10, 0, 1,
};

int lumen_strip_gpio(uint8_t strip_id) {
    if (strip_id >= PROTO_MAX_STRIPS) return -1;
    return g_strip_gpio[strip_id];
}
