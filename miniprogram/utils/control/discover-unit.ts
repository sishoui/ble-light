/**
 * 连接页的视图模型与交互单元。纯函数。
 */
export interface DiscoveredDevice {
  deviceId: string;
  name: string;
  rssi: number;
}

export interface DiscoverView {
  devices: Array<{ deviceId: string; name: string; rssi: number; selected: boolean }>;
  empty: boolean;
  /** 扫描超过 10 秒仍无结果 */
  showPermissionHint: boolean;
  scanning: boolean;
  scanButtonText: string;
}

export interface DiscoverInput {
  devices: DiscoveredDevice[];
  scanning: boolean;
  scanningForMs: number;
  selectedId: string | null;
}

/** 扫描 10 秒仍无结果 → 提示检查定位与蓝牙权限。 */
export const EMPTY_HINT_AFTER_MS = 10_000;

export function discoverView(input: DiscoverInput): DiscoverView {
  const devices = input.devices.map((d) => ({
    deviceId: d.deviceId,
    name: d.name,
    rssi: d.rssi,
    selected: d.deviceId === input.selectedId,
  }));

  const empty = devices.length === 0;
  return {
    devices,
    empty,
    showPermissionHint: empty && input.scanningForMs >= EMPTY_HINT_AFTER_MS,
    scanning: input.scanning,
    scanButtonText: input.scanning ? "停止扫描" : empty ? "开始扫描" : "重新扫描",
  };
}

/** 广播名展示：前缀用来区分自家设备。 */
export function deviceLabel(name: string, deviceId: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : `未命名设备 ${deviceId.slice(-4)}`;
}
