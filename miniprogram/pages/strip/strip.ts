/** 灯链详情页：只做视图与事件转发，逻辑在 strip-detail-unit。 */
import { stripDetailUnit } from "../../utils/control/strip-detail-unit";
import { getSession } from "../../utils/local/session-ref";
import { loadSavedDevices } from "../../utils/local/devices";

Page({
  data: {
    title: "",
    eyebrow: "",
    statusText: "",
    powerOn: false,
    parts: [] as ReturnType<typeof stripDetailUnit>["parts"],
    assignedText: "",
    stripIndex: 0,
    tabs: [
      { id: "devices", label: "设备", active: true },
      { id: "scenes", label: "场景", active: false },
      { id: "me", label: "我的", active: false },
    ],
  },

  onLoad(query: { stripIndex?: string; deviceId?: string }) {
    this.setData({ stripIndex: Number(query.stripIndex ?? 0) });
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const session = getSession();
    const st = session.state;
    const index = this.data.stripIndex;
    const saved = loadSavedDevices().find((d) => d.deviceId === st.deviceId);

    const vm = stripDetailUnit({
      stripIndex: index,
      deviceName: saved?.note.trim() || saved?.name || "设备",
      ledCount: st.ledCount[index] ?? 0,
      powerOn: st.power && st.connected,
      parts: [],
    });
    this.setData({ ...vm });
  },

  onBack() {
    wx.navigateBack({});
  },
});
