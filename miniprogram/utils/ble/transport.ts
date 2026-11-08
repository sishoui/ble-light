/**
 * wx BLE 传输层：会话层的真机实现。
 *
 * 只做「把 wx 回调包成 Promise」和错误文案翻译，不含业务语义。
 * 错误分诊放在这里，因为只有这一层知道 wx 的错误码。
 */
import type { Transport } from "../control/session";
import { GATT } from "../protocol/constants.gen";
import { bytesToBuffer, bufferToBytes } from "./buffer";

/** 微信 BLE 错误码 → 人话。文案规则见 docs/design.md §9。 */
export function explainBleError(code: number, fallback: string): string {
  switch (code) {
    case 10001:
      return "手机蓝牙未打开。打开蓝牙后重试。";
    case 10002:
      return "没有找到这台设备。确认设备已通电。";
    case 10003:
      return "连接超时。检查设备是否通电，然后重试。";
    case 10004:
      return "设备没有提供所需的服务。确认固件版本。";
    case 10005:
      return "设备已被占用。断开其它连接后重试。";
    case 10006:
      return "连接已断开。会自动重连三次。";
    case 10007:
      return "设备不支持这个操作。确认固件版本。";
    case 10008:
      return "系统繁忙。稍等片刻再试。";
    case 10009:
      return "系统版本过低，不支持蓝牙。";
    case 10012:
      return "连接超时。靠近设备后重试。";
    default:
      return fallback.trim().length > 0 ? fallback : "蓝牙操作没有成功。稍后重试。";
  }
}

/** 把 wx 回调式 API 包成 Promise；失败时抛带人话的错误。 */
function call<T>(fn: (opts: { success: (r: T) => void; fail: (e: { errCode?: number; errMsg?: string }) => void }) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn({
      success: resolve,
      fail: (e) => reject(new Error(explainBleError(e.errCode ?? 0, e.errMsg ?? "蓝牙操作失败"))),
    });
  });
}

export class WxBleTransport implements Transport {
  connected = false;
  onNotify: ((frame: Uint8Array) => void) | null = null;
  onDisconnect: (() => void) | null = null;

  private deviceId = "";
  private serviceId = GATT.service;
  private rxId = "";
  private txId = "";
  private stateId = "";
  /** wx 的监听是进程级的，只能注册一次；重连不能再挂一遍。 */
  private listenersBound = false;

  private bindListeners(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;

    wx.onBLEConnectionStateChange((res) => {
      if (res.deviceId === this.deviceId && !res.connected) {
        this.connected = false;
        this.onDisconnect?.();
      }
    });

    wx.onBLECharacteristicValueChange((res) => {
      if (res.characteristicId === this.txId) {
        this.onNotify?.(bufferToBytes(res.value));
      }
    });
  }

  async connect(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    await call((o) => wx.createBLEConnection({ deviceId, ...o }));
    this.bindListeners();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await call((o) => wx.closeBLEConnection({ deviceId: this.deviceId, ...o }));
    this.connected = false;
  }

  async negotiateMtu(requested: number): Promise<number> {
    const res = await call<{ mtu: number }>((o) =>
      wx.setBLEMTU({ deviceId: this.deviceId, mtu: requested, ...o }),
    );
    return res.mtu;
  }

  async discoverServices(): Promise<string[]> {
    const res = await call<{ services: Array<{ uuid: string }> }>((o) =>
      wx.getBLEDeviceServices({ deviceId: this.deviceId, ...o }),
    );
    return res.services.map((s) => s.uuid);
  }

  async discoverCharacteristics(): Promise<string[]> {
    const res = await call<{ characteristics: Array<{ uuid: string }> }>((o) =>
      wx.getBLEDeviceCharacteristics({ deviceId: this.deviceId, serviceId: this.serviceId, ...o }),
    );
    const uuids = res.characteristics.map((c) => c.uuid);
    this.rxId = pick(uuids, GATT.rx);
    this.txId = pick(uuids, GATT.tx);
    this.stateId = pick(uuids, GATT.state);
    return uuids;
  }

  async subscribe(): Promise<void> {
    await call((o) => wx.notifyBLECharacteristicValueChange({
      deviceId: this.deviceId,
      serviceId: this.serviceId,
      characteristicId: this.txId,
      state: true,
      ...o,
    }));
  }

  async readState(): Promise<Uint8Array> {
    const res = await call<{ value: ArrayBuffer }>((o) =>
      wx.readBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.stateId,
        ...o,
      }),
    );
    return bufferToBytes(res.value);
  }

  async write(frame: Uint8Array): Promise<void> {
    await call((o) => wx.writeBLECharacteristicValue({
      deviceId: this.deviceId,
      serviceId: this.serviceId,
      characteristicId: this.rxId,
      value: bytesToBuffer(frame),
      ...o,
    }));
  }
}

/** UUID 大小写与长短格式都可能不同，按后 8 位比较。 */
function pick(uuids: string[], want: string): string {
  const tail = want.slice(-12).toLowerCase();
  return uuids.find((u) => u.toLowerCase().endsWith(tail)) ?? want;
}

/** 扫描附近的灯控设备。返回设备 id 与广播名。 */
export function startScan(onFound: (d: { deviceId: string; name: string; rssi: number }) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.onBluetoothDeviceFound((res) => {
      for (const d of res.devices) {
        const name = (d.name || d.localName || "").trim();
        if (name.startsWith(GATT.advertisedNamePrefix)) {
          onFound({ deviceId: d.deviceId, name, rssi: d.RSSI ?? 0 });
        }
      }
    });
    wx.openBluetoothAdapter({
      success: () => {
        wx.startBluetoothDevicesDiscovery({
          allowDuplicatesKey: false,
          success: () => resolve(),
          fail: (e) => reject(new Error(explainBleError(e.errCode ?? 0, e.errMsg ?? "无法开始扫描"))),
        });
      },
      fail: (e) => reject(new Error(explainBleError(e.errCode ?? 0, e.errMsg ?? "蓝牙不可用"))),
    });
  });
}

export function stopScan(): void {
  wx.stopBluetoothDevicesDiscovery({});
}
