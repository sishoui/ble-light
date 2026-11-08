import { describe, it, expect } from "vitest";
import { percentToBrightness, brightnessToPercent } from "../../utils/control/brightness-unit";

describe("亮度百分比换算", () => {
  it("百分比换成设备值", () => {
    expect(percentToBrightness(75, 200)).toBe(150);
    expect(percentToBrightness(100, 255)).toBe(255);
    expect(percentToBrightness(0, 200)).toBe(0);
  });

  it("设备值换成百分比", () => {
    expect(brightnessToPercent(150, 200)).toBe(75);
    expect(brightnessToPercent(0, 200)).toBe(0);
    expect(brightnessToPercent(200, 200)).toBe(100);
  });

  it("往返换算回到原百分比", () => {
    for (const p of [0, 1, 25, 50, 75, 99, 100]) {
      expect(brightnessToPercent(percentToBrightness(p, 200), 200)).toBe(p);
    }
  });

  it("百分比超过 100 时钳到 100", () => {
    expect(percentToBrightness(150, 200)).toBe(200);
  });

  it("百分比为负时钳到 0", () => {
    expect(percentToBrightness(-20, 200)).toBe(0);
  });

  it("上限为 0 时不除零，也不产生 NaN", () => {
    expect(percentToBrightness(50, 0)).toBe(0);
    expect(brightnessToPercent(50, 0)).toBe(0);
    expect(Number.isFinite(percentToBrightness(50, 0))).toBe(true);
  });

  it("上限变化后按新上限换算", () => {
    expect(percentToBrightness(50, 100)).toBe(50);
    expect(percentToBrightness(50, 200)).toBe(100);
  });

  it("小数百分比四舍五入到整数值", () => {
    expect(percentToBrightness(33.3, 200)).toBe(67);
    expect(Number.isInteger(percentToBrightness(12.7, 255))).toBe(true);
  });
});
