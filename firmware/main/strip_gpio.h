/* 链号 → GPIO 的固定表。
 *
 * 单独成文件是为了能在宿主机上测：led_strip_owner.c 依赖 RMT 头文件，
 * 进不了宿主机测试，而这张表错了会让整条链接在错的脚上，很难查。
 */
#ifndef LUMEN_STRIP_GPIO_H
#define LUMEN_STRIP_GPIO_H

#include <stdint.h>

#include "protocol_gen.h"

/** 第 strip_id 条链用的 GPIO。越界返回 -1。 */
int lumen_strip_gpio(uint8_t strip_id);

#endif /* LUMEN_STRIP_GPIO_H */
