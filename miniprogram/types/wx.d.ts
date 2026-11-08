/**
 * 微信小程序全局 API 的最小声明。
 *
 * 只声明本项目用到的成员，避免引入体积巨大的官方类型包。
 * 新增 wx 调用时在这里补一条声明。
 */

interface WxSuccessCallback<T> {
  success?: (res: T) => void;
  fail?: (err: { errCode?: number; errMsg?: string }) => void;
}

interface WxDeviceFound {
  deviceId: string;
  name?: string;
  localName?: string;
  RSSI?: number;
}

declare const wx: {
  createBLEConnection(opts: WxSuccessCallback<unknown> & { deviceId: string }): void;
  closeBLEConnection(opts: WxSuccessCallback<unknown> & { deviceId: string }): void;
  setBLEMTU(opts: WxSuccessCallback<{ mtu: number }> & { deviceId: string; mtu: number }): void;
  getBLEDeviceServices(opts: WxSuccessCallback<{ services: Array<{ uuid: string }> }> & { deviceId: string }): void;
  getBLEDeviceCharacteristics(
    opts: WxSuccessCallback<{ characteristics: Array<{ uuid: string }> }> & { deviceId: string; serviceId: string },
  ): void;
  notifyBLECharacteristicValueChange(
    opts: WxSuccessCallback<unknown> & {
      deviceId: string;
      serviceId: string;
      characteristicId: string;
      state: boolean;
    },
  ): void;
  readBLECharacteristicValue(
    opts: WxSuccessCallback<{ value: ArrayBuffer }> & {
      deviceId: string;
      serviceId: string;
      characteristicId: string;
    },
  ): void;
  writeBLECharacteristicValue(
    opts: WxSuccessCallback<unknown> & {
      deviceId: string;
      serviceId: string;
      characteristicId: string;
      value: ArrayBuffer;
    },
  ): void;
  onBLEConnectionStateChange(cb: (res: { deviceId: string; connected: boolean }) => void): void;
  onBLECharacteristicValueChange(
    cb: (res: { deviceId: string; serviceId: string; characteristicId: string; value: ArrayBuffer }) => void,
  ): void;
  openBluetoothAdapter(opts: WxSuccessCallback<unknown>): void;
  startBluetoothDevicesDiscovery(
    opts: WxSuccessCallback<unknown> & { allowDuplicatesKey?: boolean },
  ): void;
  stopBluetoothDevicesDiscovery(opts: WxSuccessCallback<unknown>): void;
  onBluetoothDeviceFound(cb: (res: { devices: WxDeviceFound[] }) => void): void;
  navigateTo(opts: { url: string }): void;
  redirectTo(opts: { url: string }): void;
  navigateBack(opts: { delta?: number }): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
};

declare function getApp<T>(): T;

declare function Page<T extends Record<string, unknown>>(opts: T): void;

declare function App<T extends Record<string, unknown>>(opts: T): void;
