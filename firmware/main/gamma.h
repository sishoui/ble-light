/* gamma 表与亮度乘算。纯函数，可宿主机测。 */
#ifndef LUMEN_GAMMA_H
#define LUMEN_GAMMA_H

#include <stdint.h>

/** gamma 2.2 表：输入 0-255 → 输出 0-255。 */
uint8_t lumen_gamma(uint8_t v);

/** 整帧亮度乘算：level 0-255。 */
uint8_t lumen_scale_brightness(uint8_t v, uint8_t brightness);

#endif /* LUMEN_GAMMA_H */
