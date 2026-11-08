/**
 * wx BLE 传输层：会话层的真机实现。
 *
 * 只做「把 wx 回调包成 Promise」和错误文案翻译，不含业务语义。
 * 错误分诊放在这里，因为只有这一层知道 wx 的错误码。
 */
import type { Transport } from "../control/session";
import { GATT } from "../protocol/constants.gen";
import { chunkFrame } from "../protocol/chunk";
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
  /** 协商后的 MTU；决定单片能带多少数据。未协商时用 BLE 默认值。 */
  private mtu = 23;
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
    try {
      const res = await call<{ mtu: number }>((o) =>
        wx.setBLEMTU({ deviceId: this.deviceId, mtu: requested, ...o }),
      );
      this.mtu = res.mtu;
    } catch {
      /* 有些安卓机不支持协商，而小帧（≤20 字节）本来也不需要。
       * 退回默认 MTU 23，让连接继续；分片层会按实际 MTU 切片。 */
      this.mtu = 23;
    }
    return this.mtu;
  }

  async discoverServices(): Promise<string[]> {
    const res = await call<{ services: Array<{ uuid: string }> }>((o) =>
      wx.getBLEDeviceServices({ deviceId: this.deviceId, ...o }),
    );
    const uuids = res.services.map((s) => s.uuid);
    /* 用设备实际报上来的字符串，不要拿规格里的写死值：大小写与长短格式
     * 各家系统不一样，后续所有调用都必须带完全相同的 serviceId。 */
    this.serviceId = require_(uuids, GATT.service, "服务");
    return uuids;
  }

  async discoverCharacteristics(): Promise<string[]> {
    const res = await call<{ characteristics: Array<{ uuid: string }> }>((o) =>
      wx.getBLEDeviceCharacteristics({ deviceId: this.deviceId, serviceId: this.serviceId, ...o }),
    );
    const uuids = res.characteristics.map((c) => c.uuid);
    /* 找不到就抛错，不能退回规格里的 UUID：拿着设备上不存在的 UUID 去读写，
     * 只会换来一句看不懂的系统错误，把真正的原因（UUID 对不上）盖住。 */
    this.rxId = require_(uuids, GATT.rx, "写入");
    this.txId = require_(uuids, GATT.tx, "通知");
    this.stateId = require_(uuids, GATT.state, "状态");
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
    /* 必须分片：固件把每次写入的第一个字节当 ctrl（bit7 FIRST / bit6 LAST /
     * 低 6 位序号）。直接发裸帧的话，magic 0xA6 会被当成 ctrl 解析，
     * 设备一直等后续分片直到超时——帧被静默丢弃，灯永远不亮。 */
    for (const chunk of framesForWrite(frame, this.mtu)) {
      await call((o) => wx.writeBLECharacteristicValue({
        deviceId: this.deviceId,
        serviceId: this.serviceId,
        characteristicId: this.rxId,
        value: bytesToBuffer(chunk),
        ...o,
      }));
    }
  }
}

/** 单片可携带的数据字节：min(mtu-3, 180) - 1（给 ctrl 留 1 字节），下限 19。 */
export function chunkDataSize(mtu: number): number {
  const capacity = Math.min(mtu - 3, 180);
  return Math.max(capacity - 1, 19);
}

/**
 * 一次 write 实际要发出去的分片。
 *
 * 抽成纯函数是为了能直接断言：固件把每片首字节当 ctrl，
 * 拿裸帧去写会被当成不完整分片丢掉，而且没有任何报错。
 */
export function framesForWrite(frame: Uint8Array, mtu: number): Uint8Array[] {
  return chunkFrame(frame, chunkDataSize(mtu));
}

/** UUID 大小写与长短格式都可能不同，按后 12 位比较。 */
function findUuid(uuids: string[], want: string): string | null {
  const tail = want.slice(-12).toLowerCase();
  return uuids.find((u) => u.toLowerCase().endsWith(tail)) ?? null;
}

/** 缺少必需的特征就抛错，并说明缺哪个、设备实际提供了什么。 */
function require_(uuids: string[], want: string, role: string): string {
  const found = findUuid(uuids, want);
  if (found) return found;
  throw new Error(`设备上没有${role}特征（缺 ${want.slice(-12)}）。确认固件版本。`);
}

/** 扫描附近的灯控设备。返回设备 id 与广播名。
 *
 * 监听只注册一次：wx.onBluetoothDeviceFound 是进程级的，每次扫描都挂一个
 * 会让回调叠加，同一台设备被报多次、旧页面的回调也不会消失。 */
let scanHandlerBound = false;
let lastScanOnFound: ((d: { deviceId: string; name: string; rssi: number }) => void) | null = null;

export function startScan(onFound: (d: { deviceId: string; name: string; rssi: number }) => void): Promise<void> {
  lastScanOnFound = onFound;

  return new Promise((resolve, reject) => {
    if (!scanHandlerBound) {
      scanHandlerBound = true;
      wx.onBluetoothDeviceFound((res) => {
        if (lastScanOnFound === null) return;
        for (const d of res.devices) {
          const name = (d.name || d.localName || "").trim();
          if (name.startsWith(GATT.advertisedNamePrefix)) {
            lastScanOnFound({ deviceId: d.deviceId, name, rssi: d.RSSI ?? 0 });
          }
        }
      });
    }
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
  lastScanOnFound = null;
  wx.stopBluetoothDevicesDiscovery({});
}
