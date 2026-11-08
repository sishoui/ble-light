/**
 * 亮度百分比换算。纯函数。
 *
 * 滑块是 0–100 的百分比，设备要的是 0–maxBrightness 的绝对值。
 * 节流不在这里——归会话层（docs/testing.md §4「20Hz latest-wins」），
 * 否则同一个规则会有两份实现。
 */

/** 百分比 → 设备亮度值。四舍五入并钳在 [0, max]。 */
export function percentToBrightness(percent: number, max: number): number {
  const safeMax = max > 0 ? max : 0;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round((clamped / 100) * safeMax);
}

/** 设备亮度值 → 百分比。max 为 0 时返回 0，不除零。 */
export function brightnessToPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}
