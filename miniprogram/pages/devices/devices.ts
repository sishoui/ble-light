/** 设备列表页：只做视图与事件转发，逻辑在 device-list-unit。 */
import { deviceListUnit } from "../../utils/control/device-list-unit";
import { loadSavedDevices } from "../../utils/local/devices";
import { getSession } from "../../utils/local/session-ref";
import { NATIVE_COLORS } from "../../utils/ui/theme";

Page({
  data: {
    theme: NATIVE_COLORS,
    cards: [] as ReturnType<typeof deviceListUnit>["cards"],
    empty: true,
    summary: "",
    menuOpen: false,
    tabs: [
      { id: "devices", label: "设备", active: true },
      { id: "scenes", label: "场景", active: false },
      { id: "me", label: "我的", active: false },
    ],
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const session = getSession();
    const vm = deviceListUnit({
      saved: loadSavedDevices(),
      connectedId: session.state.connected ? session.state.deviceId : null,
      power: session.state.power,
    });
    this.setData({ cards: vm.cards, empty: vm.empty, summary: vm.summary });
  },

  onToggleMenu() {
    this.setData({ menuOpen: !this.data.menuOpen });
  },

  onAddDevice() {
    this.setData({ menuOpen: false });
    wx.navigateTo({ url: "/pages/add-device/add-device" });
  },

  onOpenDevice(e: { currentTarget: { dataset: { id: string } } }) {
    wx.navigateTo({ url: `/pages/device/device?deviceId=${e.currentTarget.dataset.id}` });
  },

  onTogglePower(e: { currentTarget: { dataset: { id: string } }; detail: { value: boolean } }) {
    const session = getSession();
    const { id } = e.currentTarget.dataset;
    if (session.state.deviceId !== id) return;
    void session.setPower(e.detail.value).then(() => this.refresh());
  },

  /** 吃掉开关上的 tap，避免冒泡到整卡下钻。 */
  noop() {},
});
