/** 小程序入口：只初始化会话，不含业务逻辑。 */
import { ControlSession } from "./utils/control/session";
import { WxBleTransport } from "./utils/ble/transport";
import { loadSavedDevices } from "./utils/local/devices";

const transport = new WxBleTransport();

App({
  globalData: {
    session: new ControlSession(transport),
    savedDevices: [] as ReturnType<typeof loadSavedDevices>,
  },

  onLaunch() {
    this.globalData.savedDevices = loadSavedDevices();
  },
});
