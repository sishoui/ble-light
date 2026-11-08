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
