/**
 * 设备列表页的视图模型与交互单元。纯函数。
 */
export interface SavedDevice {
  deviceId: string;
  /** 设备广播名 */
  name: string;
  /** 本机备注名，空串表示没起过 */
  note: string;
  ledCount: number[];
  stripCount: number;
}

export interface DeviceCardView {
  deviceId: string;
  title: string;
  meta: string;
  online: boolean;
  powerOn: boolean;
  configured: boolean;
}

export interface DeviceListView {
  cards: DeviceCardView[];
  empty: boolean;
  summary: string;
}

export interface DeviceListInput {
  saved: SavedDevice[];
  /** 当前已连接的那台；null 表示没连任何设备 */
  connectedId: string | null;
  power: boolean;
}

/** 已配置灯珠的链数（灯珠数 > 0 才算配置过）。 */
export function configuredStripCount(ledCount: number[]): number {
  return ledCount.filter((n) => n > 0).length;
}

export function deviceListUnit(input: DeviceListInput): DeviceListView {
  const cards = input.saved.map((d) => {
    const configured = configuredStripCount(d.ledCount);
    const online = d.deviceId === input.connectedId;
    return {
      deviceId: d.deviceId,
      title: d.note.trim().length > 0 ? d.note.trim() : d.name,
      meta: configured > 0 ? `${configured} 条灯链` : "未配置",
      online,
      powerOn: online && input.power,
      configured: configured > 0,
    };
  });

  const onlineCount = cards.filter((c) => c.online).length;
  const summary =
    onlineCount > 0
      ? `已保存 ${cards.length} 台 · ${onlineCount} 台在线`
      : `已保存 ${cards.length} 台`;

  return { cards, empty: cards.length === 0, summary };
}

/** 连接后拿到的设备配置。 */
export interface DeviceConfig {
  deviceId: string;
  name: string;
  ledCount: number[];
  stripCount: number;
}

/**
 * 把一台设备并进本机记录。
 *
 * 已有记录保留备注名（备注是人的数据，设备不知道），
 * 灯珠数与链数一律用设备读回来的值覆盖——设备才是配置的唯一权威。
 */
export function mergeSavedDevice(saved: SavedDevice[], device: DeviceConfig): SavedDevice[] {
  const at = saved.findIndex((d) => d.deviceId === device.deviceId);
  const next = saved.slice();

  if (at >= 0) {
    next[at] = {
      ...next[at],
      name: device.name,
      ledCount: device.ledCount.slice(),
      stripCount: device.stripCount,
    };
  } else {
    next.push({
      deviceId: device.deviceId,
      name: device.name,
      note: "",
      ledCount: device.ledCount.slice(),
      stripCount: device.stripCount,
    });
  }
  return next;
}
