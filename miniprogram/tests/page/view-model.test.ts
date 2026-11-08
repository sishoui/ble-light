import { describe, it, expect } from "vitest";
import { deviceView } from "../../utils/control/view-model";
import { discoverView, deviceLabel } from "../../utils/control/discover-unit";
import type { SessionState } from "../../utils/control/session";

function state(over: Partial<SessionState> = {}): SessionState {
  return {
    connected: true,
    connecting: false,
    error: null,
    deviceId: null,
    power: false,
    brightness: 100,
    maxBrightness: 200,
    stripCount: 2,
    stripPowerMask: 0,
    ledCount: [30, 0, 0, 0, 0, 0, 0, 0],
    partCount: [0, 0, 0, 0, 0, 0, 0, 0],
    ...over,
  };
}

describe("设备页视图模型", () => {
  it("设备离线时电源键显示为关闭态，且不显示亮度", () => {
    const vm = deviceView(state({ connected: false, power: true, brightness: 128 }));
    expect(vm.powerOn).toBe(false);
    expect(vm.showBrightness).toBe(false);
  });

  it("连上且开着才显示亮度区", () => {
    const vm = deviceView(state({ connected: true, power: true }));
    expect(vm.showBrightness).toBe(true);
  });

  it("关灯时亮度区收起但数值仍保留", () => {
    const vm = deviceView(state({ connected: true, power: false, brightness: 120 }));
    expect(vm.showBrightness).toBe(false);
    expect(vm.brightness).toBe(120);
  });

  it("亮度文本带上限，上限来自设备", () => {
    const vm = deviceView(state({ brightness: 120, maxBrightness: 180 }));
    expect(vm.brightnessText).toBe("120 / 180");
    expect(vm.brightnessMax).toBe(180);
  });

  it("亮度超过设备上限时显示被钳到上限", () => {
    const vm = deviceView(state({ brightness: 255, maxBrightness: 128 }));
    expect(vm.brightness).toBe(128);
  });

  it("连接中时显示正在连接且不能操作", () => {
    const vm = deviceView(state({ connected: false, connecting: true }));
    expect(vm.statusText).toBe("正在连接");
    expect(vm.canOperate).toBe(false);
  });

  it("连接失败时给出原因和下一步", () => {
    const vm = deviceView(state({ connected: false, error: "连接超时" }));
    expect(vm.statusText).toBe("未连接");
    expect(vm.hint).toContain("连接超时");
    expect(vm.hint).toContain("重试");
  });

  it("未连接时提示回扫描列表", () => {
    const vm = deviceView(state({ connected: false }));
    expect(vm.hint).toContain("扫描");
  });

  it("设备没有灯链时提示先设灯珠数", () => {
    const vm = deviceView(state({ stripCount: 0 }));
    expect(vm.hint).toContain("灯珠");
  });

  it("已配置灯珠的链数按非零计数", () => {
    const vm = deviceView(state({ ledCount: [30, 64, 0, 0, 0, 0, 0, 0] }));
    expect(vm.configuredStrips).toBe(2);
  });

  it("上限为 0 时回落到 255，不会除零", () => {
    const vm = deviceView(state({ maxBrightness: 0, brightness: 50 }));
    expect(vm.brightnessMax).toBe(255);
  });
});

describe("连接页视图模型", () => {
  it("扫到设备时列出广播名", () => {
    const vm = discoverView({
      devices: [{ deviceId: "aa", name: "BleLight-1234", rssi: -50 }],
      scanning: false,
      scanningForMs: 0,
      selectedId: null,
    });
    expect(vm.devices[0].name).toBe("BleLight-1234");
    expect(vm.empty).toBe(false);
  });

  it("扫描 10 秒仍无结果时提示检查权限", () => {
    const vm = discoverView({ devices: [], scanning: true, scanningForMs: 10_000, selectedId: null });
    expect(vm.showPermissionHint).toBe(true);
  });

  it("不到 10 秒不提示", () => {
    const vm = discoverView({ devices: [], scanning: true, scanningForMs: 9_999, selectedId: null });
    expect(vm.showPermissionHint).toBe(false);
  });

  it("有结果时不提示权限", () => {
    const vm = discoverView({
      devices: [{ deviceId: "aa", name: "x", rssi: -1 }],
      scanning: true,
      scanningForMs: 20_000,
      selectedId: null,
    });
    expect(vm.showPermissionHint).toBe(false);
  });

  it("扫描中按钮文案是停止扫描", () => {
    const vm = discoverView({ devices: [], scanning: true, scanningForMs: 0, selectedId: null });
    expect(vm.scanButtonText).toBe("停止扫描");
  });

  it("选中的设备被标记", () => {
    const vm = discoverView({
      devices: [
        { deviceId: "a", name: "A", rssi: -1 },
        { deviceId: "b", name: "B", rssi: -2 },
      ],
      scanning: false,
      scanningForMs: 0,
      selectedId: "b",
    });
    expect(vm.devices.map((d) => d.selected)).toEqual([false, true]);
  });

  it("没有广播名时用设备号后四位兜底", () => {
    expect(deviceLabel("  ", "AB:CD:EF:12")).toBe("未命名设备 F:12");
  });
});
