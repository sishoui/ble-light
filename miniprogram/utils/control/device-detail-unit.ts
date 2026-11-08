/**
 * 设备详情页的视图模型与交互单元。纯函数。
 */
export interface StripSummary {
  index: number;
  ledCount: number;
  partCount: number;
}

export interface StripRowView {
  index: number;
  title: string;
  meta: string;
  navigable: boolean;
  muted: boolean;
}

export interface DeviceDetailView {
  title: string;
  eyebrow: string;
  statusText: string;
  powerOn: boolean;
  canOperate: boolean;
  showBrightness: boolean;
  brightnessPercent: number;
  sliderLeftPercent: number;
  brightnessText: string;
  retainNote: string;
  deviceNote: string;
  /** 离线且有过一次连接失败时，显示错误卡与重试入口 */
  showErrorCard: boolean;
  errorTitle: string;
  errorText: string;
  strips: StripRowView[];
}

export interface DeviceDetailInput {
  deviceName: string;
  connected: boolean;
  power: boolean;
  brightness: number;
  maxBrightness: number;
  /** 会话层记下的最近一次错误；null 表示没出错 */
  error?: string | null;
  strips: StripSummary[];
}

function clampPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)));
}

export function deviceDetailUnit(input: DeviceDetailInput): DeviceDetailView {
  const connected = input.connected;
  const powerOn = connected && input.power;
  const percent = clampPercent(input.brightness, input.maxBrightness);
  const stripTotal = input.strips.reduce((sum, s) => sum + s.ledCount, 0);

  return {
    title: input.deviceName,
    eyebrow: connected ? "已连接" : "未连接",
    statusText: connected ? (input.power ? "正在出光" : "已关闭") : "设备离线",
    powerOn,
    canOperate: connected,
    showBrightness: connected && input.power,
    brightnessPercent: percent,
    sliderLeftPercent: percent,
    brightnessText: `${percent}%`,
    retainNote: `亮度保留为 ${percent}%，开灯即恢复。`,
    deviceNote: `${stripTotal} 颗灯珠 · 亮度上限 ${input.maxBrightness}`,
    showErrorCard: !connected && !!input.error,
    errorTitle: "连接失败",
    errorText: input.error ?? "",
    strips: input.strips.map((s) => ({
      index: s.index,
      title: `灯链 ${s.index + 1}`,
      meta: s.ledCount > 0 ? `${s.ledCount} 颗 · ${s.partCount} 个部位` : "未配置灯珠",
      navigable: s.ledCount > 0,
      muted: s.ledCount === 0,
    })),
  };
}
