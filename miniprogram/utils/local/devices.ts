/**
 * 本机设备记录：只存「人和设备的对应关系」（备注名、设备号、上次看到的配置）。
 * 灯光配置的唯一权威是设备本身，这里不缓存。
 */
import type { SavedDevice } from "../control/device-list-unit";

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

/** 连上一台设备后记下它（同 deviceId 覆盖，保留已有备注）。 */
export function rememberDevice(device: { deviceId: string; name: string }): SavedDevice[] {
  const list = loadSavedDevices();
  const at = list.findIndex((d) => d.deviceId === device.deviceId);
  if (at >= 0) {
    list[at] = { ...list[at], name: device.name };
  } else {
    list.push({
      deviceId: device.deviceId,
      name: device.name,
      note: "",
      ledCount: new Array(8).fill(0),
      stripCount: 0,
    });
  }
  saveSavedDevices(list);
  return list;
}
