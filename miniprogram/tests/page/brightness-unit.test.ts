import { describe, it, expect } from "vitest";
import { brightnessDragUnit } from "../../utils/control/brightness-unit";

describe("亮度拖动单元", () => {
  it("拖动中按 20Hz 节流，同一时刻只保留最新值", () => {
    const u = brightnessDragUnit({ max: 200 });
    const out = [];
    // 0ms 首发，20ms 被吞，40ms 被吞，50ms 放行最新值
    for (const [value, now] of [
      [10, 0],
      [20, 20],
      [30, 40],
      [40, 50],
    ] as const) {
      out.push(u.onInput(value, now));
    }
    expect(out).toEqual([
      { send: true, value: 10 },
      { send: false, value: 20 },
      { send: false, value: 30 },
      { send: true, value: 40 },
    ]);
  });

  it("最新值胜出：被节流吞掉的值不会补发", () => {
    const u = brightnessDragUnit({ max: 200 });
    u.onInput(10, 0);
    u.onInput(20, 10);
    u.onInput(30, 20);
    expect(u.onInput(40, 50)).toEqual({ send: true, value: 40 });
    expect(u.onInput(40, 51)).toEqual({ send: false, value: 40 });
  });

  it("松手一定做一次精确下发", () => {
    const u = brightnessDragUnit({ max: 200 });
    u.onInput(10, 0);
    u.onInput(80, 10);
    expect(u.onRelease(80)).toEqual({ send: true, value: 80 });
  });

  it("松手时没有挂起值就不发", () => {
    const u = brightnessDragUnit({ max: 200 });
    u.onInput(10, 0);
    u.onRelease(10);
    expect(u.onRelease(10)).toEqual({ send: false, value: 10 });
  });

  it("超过设备上限时钳到上限", () => {
    const u = brightnessDragUnit({ max: 128 });
    expect(u.onInput(255, 0)).toEqual({ send: true, value: 128 });
  });

  it("负值钳到 0", () => {
    const u = brightnessDragUnit({ max: 200 });
    expect(u.onInput(-5, 0)).toEqual({ send: true, value: 0 });
  });

  it("小数四舍五入", () => {
    const u = brightnessDragUnit({ max: 200 });
    expect(u.onInput(12.6, 0)).toEqual({ send: true, value: 13 });
  });

  it("换设备上限变化后按新上限钳", () => {
    const u = brightnessDragUnit({ max: 200 });
    u.onInput(150, 0);
    u.setMax(100);
    expect(u.onInput(150, 100)).toEqual({ send: true, value: 100 });
  });

  it("显示值随拖动更新，松手后保持", () => {
    const u = brightnessDragUnit({ max: 200 });
    u.onInput(90, 0);
    expect(u.value).toBe(90);
    u.onRelease(90);
    expect(u.value).toBe(90);
  });
});
