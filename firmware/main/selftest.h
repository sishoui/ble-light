/* 自检状态机：红 → 绿 → 蓝 → 白各 500ms，覆盖整条灯链。
 *
 * 纯逻辑：给出「此刻该显示什么颜色」，推送是调用方的事。
 */
#ifndef LUMEN_SELFTEST_H
#define LUMEN_SELFTEST_H

#include <stdbool.h>

#include "led_strip_owner.h"

/** 第 phase 阶段（0-3）的颜色。phase 越界返回黑色。 */
lumen_rgb_t lumen_selftest_color(int phase);

#endif /* LUMEN_SELFTEST_H */
