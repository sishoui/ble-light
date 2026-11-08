/** 设备详情页：只做视图与事件转发，逻辑在 device-detail-unit。 */
import { deviceDetailUnit } from "../../utils/control/device-detail-unit";
import { brightnessDragUnit } from "../../utils/control/brightness-unit";
import { getSession } from "../../utils/local/session-ref";
import { loadSavedDevices } from "../../utils/local/devices";
import { NATIVE_COLORS } from "../../utils/ui/theme";

const drag = brightnessDragUnit({ max: 200 });

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
    drag.setMax(st.maxBrightness > 0 ? st.maxBrightness : 255);

    const saved = loadSavedDevices().find((d) => d.deviceId === this.data.deviceId);
    const deviceName = saved?.note.trim() || saved?.name || "设备";

    const vm = deviceDetailUnit({
      deviceName,
      connected: st.connected,
      power: st.power,
      brightness: st.brightness,
      maxBrightness: st.maxBrightness,
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

  onBrightnessChanging(e: { detail: { value: number } }) {
    const step = drag.onInput(e.detail.value, Date.now());
    this.setData({ brightnessPercent: step.value, sliderLeftPercent: step.value });
    if (step.send) void getSession().queueBrightness(step.value, Date.now());
  },

  onBrightnessChange(e: { detail: { value: number } }) {
    const step = drag.onRelease(e.detail.value);
    if (step.send) void getSession().flush().then(() => this.refresh());
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
