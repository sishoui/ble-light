/** 添加设备页：只做视图与事件转发，扫描状态在 discover-unit。 */
import { discoverView, deviceLabel } from "../../utils/control/discover-unit";
import { startScan, stopScan } from "../../utils/ble/transport";
import { rememberDevice } from "../../utils/local/devices";
import { getSession } from "../../utils/local/session-ref";

const EMPTY_AFTER_MS = 10_000;

Page({
  data: {
    devices: [] as ReturnType<typeof discoverView>["devices"],
    empty: true,
    showPermissionHint: false,
    scanning: false,
    scanButtonText: "开始扫描",
    statusText: "正在搜索…",
    statusKind: "on",
    countText: "0 台",
    connectingId: "",
    errorText: "",
    tabs: [
      { id: "devices", label: "设备", active: true },
      { id: "scenes", label: "场景", active: false },
      { id: "me", label: "我的", active: false },
    ],
  },

  found: [] as Array<{ deviceId: string; name: string; rssi: number }>,
  scanStartedAt: 0,
  tick: 0 as number | ReturnType<typeof setInterval>,

  onLoad() {
    this.startScanning();
  },

  onUnload() {
    this.stopTimer();
    stopScan();
  },

  startScanning() {
    this.found = [];
    this.scanStartedAt = Date.now();
    this.setData({ scanning: true, statusText: "正在搜索…", statusKind: "on" });
    this.render();

    void startScan((d) => {
      const at = this.found.findIndex((x) => x.deviceId === d.deviceId);
      if (at >= 0) this.found[at] = d;
      else this.found.push(d);
      this.render();
    }).catch((e: Error) => {
      this.setData({ scanning: false, statusText: "搜索已停止", statusKind: "off", errorText: e.message });
      this.render();
    });

    this.stopTimer();
    this.tick = setInterval(() => this.render(), 1000);
  },

  stopTimer() {
    if (typeof this.tick === "number") clearInterval(this.tick);
    this.tick = 0;
  },

  render() {
    const elapsed = this.data.scanning ? Date.now() - this.scanStartedAt : EMPTY_AFTER_MS;
    const vm = discoverView({
      devices: this.found,
      scanning: this.data.scanning,
      scanningForMs: elapsed,
      selectedId: null,
    });
    this.setData({
      devices: vm.devices.map((d) => ({ ...d, name: deviceLabel(d.name, d.deviceId) })),
      empty: vm.empty,
      showPermissionHint: vm.showPermissionHint,
      scanButtonText: vm.scanButtonText,
      countText: `${vm.devices.length} 台`,
    });
  },

  onStopScan() {
    stopScan();
    this.stopTimer();
    this.setData({ scanning: false, statusText: "搜索已停止", statusKind: "off" });
    this.render();
  },

  onRescan() {
    this.startScanning();
  },

  onPick(e: { currentTarget: { dataset: { id: string; name: string } } }) {
    const { id, name } = e.currentTarget.dataset;
    if (this.data.connectingId) return;
    this.setData({ connectingId: id });

    const session = getSession();
    void session
      .connect(id)
      .then(() => {
        rememberDevice({ deviceId: id, name });
        stopScan();
        this.stopTimer();
        wx.redirectTo({ url: `/pages/device/device?deviceId=${id}` });
      })
      .catch(() => {
        this.setData({ connectingId: "" });
      });
  },

  onBack() {
    wx.navigateBack({});
  },
});
