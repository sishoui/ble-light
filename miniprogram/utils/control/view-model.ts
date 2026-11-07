/**
 * 视图模型：会话状态 → 页面 data 的纯映射。
 *
 * 无 mock、无 fixture、无副作用。页面只调这个函数然后 setData。
 */
import type { SessionState } from "./session";

export interface DeviceView {
  /** 离线时电源键显示为关闭，避免「设备没了但界面还亮着」 */
  powerOn: boolean;
  /** 离线时不显示亮度区 */
  showBrightness: boolean;
  brightness: number;
  brightnessText: string;
  /** 滑块上限取自设备 */
  brightnessMax: number;
  statusText: string;
  /** 需要用户动手时给的提示；空串表示没有 */
  hint: string;
  canOperate: boolean;
  stripCount: number;
  /** 已配置灯珠的链数 */
  configuredStrips: number;
}

const BRIGHTNESS_MAX = 255;

export function deviceView(state: SessionState): DeviceView {
  const connected = state.connected;
  const powerOn = connected && state.power;
  const max = state.maxBrightness > 0 ? state.maxBrightness : BRIGHTNESS_MAX;

  return {
    powerOn,
    showBrightness: connected && powerOn,
    brightness: clamp(state.brightness, 0, max),
    brightnessText: `${clamp(state.brightness, 0, max)} / ${max}`,
    brightnessMax: max,
    statusText: statusTextOf(state),
    hint: hintOf(state),
    canOperate: connected,
    stripCount: state.stripCount,
    configuredStrips: state.ledCount.filter((n) => n > 0).length,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function statusTextOf(state: SessionState): string {
  if (state.connecting) return "正在连接";
  if (state.error) return "未连接";
  if (state.connected) return "已连接";
  return "未连接";
}

function hintOf(state: SessionState): string {
  if (state.connecting) return "";
  if (state.error) return `${state.error}。检查设备是否通电，然后重试。`;
  if (!state.connected) return "还没有连接设备。返回扫描列表选一台。";
  if (state.stripCount === 0) return "设备没有配置灯链。先设置灯珠数量。";
  return "";
}
