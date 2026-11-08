/**
 * 本机设备记录：只存「人和设备的对应关系」（备注名、设备号）。
 * 灯光配置的唯一权威是设备本身，这里不缓存——连上后按设备读回的值覆盖。
 */
import type { DeviceConfig, SavedDevice } from "../control/device-list-unit";
import { mergeSavedDevice } from "../control/device-list-unit";

const KEY = "ble-light.saved-devices";

export function loadSavedDevices(): SavedDevice[] {
  try {
    const raw = wx.getStorageSync(KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (d): d is SavedDevice =>
        typeof d?.deviceId === "string" &&
        typeof d?.name === "string" &&
        typeof d?.note === "string" &&
        Array.isArray(d?.ledCount),
    );
  } catch {
    return [];
  }
}

export function saveSavedDevices(list: SavedDevice[]): void {
  wx.setStorageSync(KEY, list);
}

/** 连上一台设备后记下它：保留备注，灯珠数用设备读回来的值。 */
export function rememberDevice(device: DeviceConfig): SavedDevice[] {
  const next = mergeSavedDevice(loadSavedDevices(), device);
  saveSavedDevices(next);
  return next;
}
