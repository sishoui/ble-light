/** 设备详情页：只做视图与事件转发，逻辑在 device-detail-unit。 */
import { deviceDetailUnit } from "../../utils/control/device-detail-unit";
import { percentToBrightness } from "../../utils/control/brightness-unit";
import { getSession } from "../../utils/local/session-ref";
import { loadSavedDevices } from "../../utils/local/devices";
import { NATIVE_COLORS } from "../../utils/ui/theme";

Page({
  data: {
    theme: NATIVE_COLORS,
    title: "",
    eyebrow: "",
    statusText: "",
    powerOn: false,
    canOperate: false,
    showBrightness: false,
    brightnessPercent: 0,
    sliderLeftPercent: 0,
    brightnessText: "",
    retainNote: "",
    deviceNote: "",
    showErrorCard: false,
    errorTitle: "",
    errorText: "",
    strips: [] as ReturnType<typeof deviceDetailUnit>["strips"],
    deviceId: "",
    tabs: [
      { id: "devices", label: "设备", active: true },
      { id: "scenes", label: "场景", active: false },
      { id: "me", label: "我的", active: false },
    ],
  },

  onLoad(query: { deviceId?: string }) {
    this.setData({ deviceId: query.deviceId ?? "" });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const session = getSession();
    const st = session.state;

    const saved = loadSavedDevices().find((d) => d.deviceId === this.data.deviceId);
    const deviceName = saved?.note.trim() || saved?.name || "设备";

    const vm = deviceDetailUnit({
      deviceName,
      connected: st.connected,
      power: st.power,
      brightness: st.brightness,
      maxBrightness: st.maxBrightness,
      error: st.error,
      strips: st.ledCount.map((ledCount, index) => ({
        index,
        ledCount,
        partCount: st.partCount[index] ?? 0,
      })),
    });
    this.setData({ ...vm });
  },

  onTogglePower(e: { detail: { value: boolean } }) {
    void getSession()
      .setPower(e.detail.value)
      .then(() => this.refresh());
  },

  /** 拖动中：换算成设备值交给会话层节流（20Hz latest-wins 只有那一份实现）。 */
  onBrightnessChanging(e: { detail: { value: number } }) {
    const session = getSession();
    const percent = e.detail.value;
    this.setData({ brightnessPercent: percent, sliderLeftPercent: percent });
    session.queueBrightness(percentToBrightness(percent, session.state.maxBrightness), Date.now());
  },

  /** 松手：把挂起的值精确下发一次。 */
  onBrightnessChange(e: { detail: { value: number } }) {
    const session = getSession();
    const percent = e.detail.value;
    this.setData({ brightnessPercent: percent, sliderLeftPercent: percent });
    session.queueBrightness(percentToBrightness(percent, session.state.maxBrightness), Date.now());
    void session.flush().then(() => this.refresh());
  },

  onOpenStrip(e: { currentTarget: { dataset: { index: number } } }) {
    wx.navigateTo({
      url: `/pages/strip/strip?deviceId=${this.data.deviceId}&stripIndex=${e.currentTarget.dataset.index}`,
    });
  },

  onRetry() {
    const session = getSession();
    void session
      .connect(this.data.deviceId)
      .then(() => this.refresh())
      .catch(() => this.refresh());
  },

  onBack() {
    wx.navigateBack({});
  },
});
