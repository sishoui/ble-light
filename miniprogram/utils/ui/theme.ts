/**
 * 原生控件颜色。
 *
 * switch / slider 这类原生组件的属性只接受字面色值，读不到 CSS 变量，
 * 所以在这里留一份唯一副本。值与 docs/design.md 的变量一致：
 *   accent   = --accent   #2F6BFF
 *   track    = --surface-nested #EDF0F4
 * 改设计时必须同时改 docs/design.md、app.wxss 和这里。
 */
export const NATIVE_COLORS = {
  accent: "#2F6BFF",
  track: "#EDF0F4",
} as const;
