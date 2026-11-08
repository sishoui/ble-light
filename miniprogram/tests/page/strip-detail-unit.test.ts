import { describe, it, expect } from "vitest";
import { stripDetailUnit } from "../../utils/control/strip-detail-unit";

describe("灯链详情单元", () => {
  const base = {
    stripIndex: 0,
    deviceName: "客厅照明",
    ledCount: 30,
    powerOn: true,
    parts: [
      { name: "书架上层", segs: [{ start: 0, end: 9 }], effect: "静态 · 暖白" },
      { name: "书架中层", segs: [{ start: 10, end: 19 }], effect: "呼吸 · 焦糖" },
      { name: "书架下层", segs: [{ start: 20, end: 27 }], effect: "流星 · 冷白" },
    ],
  };

  it("把部位段折算成可读的灯珠区间", () => {
    const vm = stripDetailUnit(base);
    expect(vm.parts[0].meta).toBe("灯珠 0–9 · 静态 · 暖白");
  });

  it("多段部位列出全部区间", () => {
    const vm = stripDetailUnit({
      ...base,
      parts: [{ name: "跳段", segs: [{ start: 0, end: 4 }, { start: 10, end: 14 }], effect: "静态" }],
    });
    expect(vm.parts[0].meta).toContain("0–4");
    expect(vm.parts[0].meta).toContain("10–14");
  });

  it("未覆盖的灯珠合成一条未分配行", () => {
    const vm = stripDetailUnit(base);
    const unassigned = vm.parts.find((p) => p.unassigned);
    expect(unassigned?.meta).toBe("灯珠 28–29 · 恒黑");
  });

  it("全部覆盖时没有未分配行", () => {
    const vm = stripDetailUnit({
      ...base,
      parts: [{ name: "全段", segs: [{ start: 0, end: 29 }], effect: "静态" }],
    });
    expect(vm.parts.some((p) => p.unassigned)).toBe(false);
  });

  it("统计已划分灯珠数与总数", () => {
    const vm = stripDetailUnit(base);
    expect(vm.assignedCount).toBe(28);
    expect(vm.totalCount).toBe(30);
    expect(vm.assignedText).toBe("28 / 30");
  });

  it("没有部位时整条链都是未分配", () => {
    const vm = stripDetailUnit({ ...base, parts: [] });
    expect(vm.parts).toHaveLength(1);
    expect(vm.parts[0].unassigned).toBe(true);
    expect(vm.assignedCount).toBe(0);
  });

  it("灯珠数为 0 时不产生未分配行", () => {
    const vm = stripDetailUnit({ ...base, ledCount: 0, parts: [] });
    expect(vm.parts).toEqual([]);
  });

  it("标题带设备名作为来源提示", () => {
    const vm = stripDetailUnit(base);
    expect(vm.eyebrow).toBe("灯链 1 · 客厅照明");
    expect(vm.title).toBe("灯链 1");
  });

  it("关灯时状态文案是已关闭", () => {
    const vm = stripDetailUnit({ ...base, powerOn: false });
    expect(vm.statusText).toBe("已关闭");
  });
});
