import { describe, it, expect } from "vitest";
import { deviceListUnit, mergeSavedDevice } from "../../utils/control/device-list-unit";
import { deviceDetailUnit } from "../../utils/control/device-detail-unit";

describe("设备列表单元", () => {
  const saved = [
    { deviceId: "aa", name: "BleLight-3F2A", note: "客厅照明", ledCount: [30, 24, 0, 0, 0, 0, 0, 0], stripCount: 3 },
    { deviceId: "bb", name: "BleLight-91C0", note: "书房灯带", ledCount: [24, 0, 0, 0, 0, 0, 0, 0], stripCount: 1 },
  ];

  it("没有已保存设备时是空态", () => {
    const vm = deviceListUnit({ saved: [], connectedId: null, power: false });
    expect(vm.empty).toBe(true);
    expect(vm.cards).toEqual([]);
  });

  it("有设备时按备注名显示，没有备注用广播名", () => {
    const vm = deviceListUnit({
      saved: [saved[0], { ...saved[1], note: "" }],
      connectedId: null,
      power: false,
    });
    expect(vm.cards[0].title).toBe("客厅照明");
    expect(vm.cards[1].title).toBe("BleLight-91C0");
  });

  it("只有当前连接的那台显示在线，其余是离线", () => {
    const vm = deviceListUnit({ saved, connectedId: "aa", power: true });
    expect(vm.cards[0].online).toBe(true);
    expect(vm.cards[1].online).toBe(false);
  });

  it("离线设备的开关显示为关，即使它上次是开的", () => {
    const vm = deviceListUnit({ saved, connectedId: "bb", power: true });
    expect(vm.cards[0].powerOn).toBe(false);
    expect(vm.cards[1].powerOn).toBe(true);
  });

  it("已配置灯珠的链数写进元信息", () => {
    const vm = deviceListUnit({ saved, connectedId: null, power: false });
    expect(vm.cards[0].meta).toBe("2 条灯链");
  });

  it("未配置任何灯珠的设备标为未配置", () => {
    const vm = deviceListUnit({
      saved: [{ ...saved[1], ledCount: new Array(8).fill(0) }],
      connectedId: null,
      power: false,
    });
    expect(vm.cards[0].meta).toBe("未配置");
    expect(vm.cards[0].configured).toBe(false);
  });

  it("摘要统计总数与在线数", () => {
    const vm = deviceListUnit({ saved, connectedId: "aa", power: false });
    expect(vm.summary).toBe("已保存 2 台 · 1 台在线");
  });

  it("没有在线设备时摘要只报总数", () => {
    const vm = deviceListUnit({ saved, connectedId: null, power: false });
    expect(vm.summary).toBe("已保存 2 台");
  });
});

describe("连接后合并本机记录", () => {
  const config = {
    deviceId: "aa",
    name: "BleLight-3F2A",
    ledCount: [30, 24, 0, 0, 0, 0, 0, 0],
    stripCount: 3,
  };

  it("新设备入列时带上设备读回来的灯珠数", () => {
    const next = mergeSavedDevice([], config);
    expect(next).toHaveLength(1);
    expect(next[0].ledCount[0]).toBe(30);
    expect(next[0].stripCount).toBe(3);
  });

  it("新设备默认没有备注名", () => {
    expect(mergeSavedDevice([], config)[0].note).toBe("");
  });

  it("已有记录保留备注名，不被设备广播名覆盖", () => {
    const existing = [{ ...config, note: "客厅照明" }];
    const next = mergeSavedDevice(existing, { ...config, name: "BleLight-XXXX" });
    expect(next[0].note).toBe("客厅照明");
    expect(next[0].name).toBe("BleLight-XXXX");
  });

  it("灯珠数一律用设备的值覆盖，不用本机旧值", () => {
    const existing = [{ ...config, note: "", ledCount: [99, 0, 0, 0, 0, 0, 0, 0] }];
    const next = mergeSavedDevice(existing, config);
    expect(next[0].ledCount[0]).toBe(30);
  });

  it("同设备重复连接不会产生重复条目", () => {
    const once = mergeSavedDevice([], config);
    const twice = mergeSavedDevice(once, config);
    expect(twice).toHaveLength(1);
  });

  it("不修改传入的数组", () => {
    const saved = [{ ...config, note: "客厅" }];
    const copy = JSON.parse(JSON.stringify(saved));
    mergeSavedDevice(saved, config);
    expect(saved).toEqual(copy);
  });

  it("连上后再看列表，已配置的链数是对的", () => {
    const next = mergeSavedDevice([], config);
    const vm = deviceListUnit({ saved: next, connectedId: "aa", power: true });
    expect(vm.cards[0].meta).toBe("2 条灯链");
    expect(vm.cards[0].configured).toBe(true);
  });
});

describe("设备详情单元", () => {
  const base = {
    deviceName: "客厅照明",
    connected: true,
    power: true,
    brightness: 150,
    maxBrightness: 200,
    stripCount: 3,
    strips: [
      { index: 0, ledCount: 30, partCount: 4 },
      { index: 1, ledCount: 24, partCount: 3 },
      { index: 2, ledCount: 0, partCount: 0 },
    ],
  };

  it("连接正常时显示亮度区", () => {
    const vm = deviceDetailUnit(base);
    expect(vm.showBrightness).toBe(true);
    expect(vm.brightnessPercent).toBe(75);
  });

  it("关灯时亮度区收起但保留数值", () => {
    const vm = deviceDetailUnit({ ...base, power: false });
    expect(vm.showBrightness).toBe(false);
    expect(vm.retainNote).toContain("75%");
  });

  it("离线时开关禁用且亮度区收起", () => {
    const vm = deviceDetailUnit({ ...base, connected: false });
    expect(vm.powerOn).toBe(false);
    expect(vm.showBrightness).toBe(false);
    expect(vm.canOperate).toBe(false);
  });

  it("灯链行标出灯珠数与部位数", () => {
    const vm = deviceDetailUnit(base);
    expect(vm.strips[0].meta).toBe("30 颗 · 4 个部位");
    expect(vm.strips[2].meta).toBe("未配置灯珠");
  });

  it("未配置的灯链行不可下钻", () => {
    const vm = deviceDetailUnit(base);
    expect(vm.strips[0].navigable).toBe(true);
    expect(vm.strips[2].navigable).toBe(false);
  });

  it("只列设备启用的链：1 条链的设备不显示 7 行「未配置」", () => {
    /* 设备只声明 1 条链时，ledCount 里剩下的 7 项是占位，
     * 显示出来就是纯噪声，用户会以为设备有 8 条坏掉的灯链。 */
    const eight = Array.from({ length: 8 }, (_, index) => ({
      index,
      ledCount: index === 0 ? 20 : 0,
      partCount: 0,
    }));
    const vm = deviceDetailUnit({ ...base, stripCount: 1, strips: eight });
    expect(vm.strips).toHaveLength(1);
    expect(vm.strips[0].meta).toBe("20 颗 · 0 个部位");
    expect(vm.deviceNote).toContain("20 颗灯珠");
  });

  it("启用的链即使没配灯珠也列出来，好让用户知道要设置", () => {
    const two = [
      { index: 0, ledCount: 0, partCount: 0 },
      { index: 1, ledCount: 0, partCount: 0 },
      { index: 2, ledCount: 0, partCount: 0 },
    ];
    const vm = deviceDetailUnit({ ...base, stripCount: 2, strips: two });
    expect(vm.strips).toHaveLength(2);
    expect(vm.strips[0].meta).toBe("未配置灯珠");
  });

  it("亮度百分比不会超过 100", () => {
    const vm = deviceDetailUnit({ ...base, brightness: 255, maxBrightness: 200 });
    expect(vm.brightnessPercent).toBe(100);
  });

  it("上限为 0 时不除零", () => {
    const vm = deviceDetailUnit({ ...base, maxBrightness: 0 });
    expect(Number.isFinite(vm.brightnessPercent)).toBe(true);
  });

  it("滑块位置与百分比一致", () => {
    const vm = deviceDetailUnit({ ...base, brightness: 50, maxBrightness: 200 });
    expect(vm.brightnessPercent).toBe(25);
    expect(vm.sliderLeftPercent).toBe(25);
  });

  it("状态文案随开关变化", () => {
    expect(deviceDetailUnit(base).statusText).toBe("正在出光");
    expect(deviceDetailUnit({ ...base, power: false }).statusText).toBe("已关闭");
    expect(deviceDetailUnit({ ...base, connected: false }).statusText).toBe("设备离线");
  });

  it("元信息汇总灯珠总数与亮度上限", () => {
    const vm = deviceDetailUnit(base);
    expect(vm.deviceNote).toBe("54 颗灯珠 · 亮度上限 200");
  });

  it("连不上且有过错误时显示错误卡与原因", () => {
    const vm = deviceDetailUnit({ ...base, connected: false, error: "连接超时。检查设备是否通电，然后重试。" });
    expect(vm.showErrorCard).toBe(true);
    expect(vm.errorText).toContain("连接超时");
  });

  it("没连上但还没试过时不显示错误卡", () => {
    const vm = deviceDetailUnit({ ...base, connected: false, error: null });
    expect(vm.showErrorCard).toBe(false);
  });

  it("已连接时不显示错误卡", () => {
    const vm = deviceDetailUnit({ ...base, error: "旧的错误" });
    expect(vm.showErrorCard).toBe(false);
  });
});
