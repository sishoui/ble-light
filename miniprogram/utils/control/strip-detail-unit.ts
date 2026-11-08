/**
 * 灯链详情页的视图模型。纯函数。
 */
export interface Seg {
  start: number;
  end: number;
}

export interface PartSummary {
  name: string;
  segs: Seg[];
  /** 当前生效的灯效描述，如「呼吸 · 焦糖」 */
  effect: string;
}

export interface PartRowView {
  name: string;
  meta: string;
  unassigned: boolean;
  color: "assigned" | "unassigned";
}

export interface StripDetailView {
  title: string;
  eyebrow: string;
  statusText: string;
  deviceNote: string;
  parts: PartRowView[];
  assignedCount: number;
  totalCount: number;
  assignedText: string;
}

export interface StripDetailInput {
  stripIndex: number;
  deviceName: string;
  ledCount: number;
  powerOn: boolean;
  parts: PartSummary[];
}

function ranges(segs: Seg[]): string {
  return segs.map((s) => (s.start === s.end ? `${s.start}` : `${s.start}–${s.end}`)).join("、");
}

function coveredMask(parts: PartSummary[], total: number): boolean[] {
  const mask = new Array(total).fill(false);
  for (const p of parts) {
    for (const s of p.segs) {
      for (let i = s.start; i <= s.end && i < total; i++) {
        if (i >= 0) mask[i] = true;
      }
    }
  }
  return mask;
}

/** 把连续未覆盖的灯珠合成若干区间。 */
function uncoveredSegs(mask: boolean[]): Seg[] {
  const out: Seg[] = [];
  let start = -1;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] && start < 0) start = i;
    if (mask[i] && start >= 0) {
      out.push({ start, end: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) out.push({ start, end: mask.length - 1 });
  return out;
}

export function stripDetailUnit(input: StripDetailInput): StripDetailView {
  const parts: PartRowView[] = input.parts.map((p) => ({
    name: p.name,
    meta: `灯珠 ${ranges(p.segs)} · ${p.effect}`,
    unassigned: false,
    color: "assigned" as const,
  }));

  const mask = coveredMask(input.parts, input.ledCount);
  const gaps = uncoveredSegs(mask);
  if (gaps.length > 0) {
    parts.push({
      name: "未分配",
      meta: `灯珠 ${ranges(gaps)} · 恒黑`,
      unassigned: true,
      color: "unassigned",
    });
  }

  const assignedCount = mask.filter(Boolean).length;

  return {
    title: `灯链 ${input.stripIndex + 1}`,
    eyebrow: `灯链 ${input.stripIndex + 1} · ${input.deviceName}`,
    statusText: input.powerOn ? "已启用" : "已关闭",
    deviceNote: `${input.ledCount} 颗灯珠 · ${input.parts.length} 个部位已分配`,
    parts,
    assignedCount,
    totalCount: input.ledCount,
    assignedText: `${assignedCount} / ${input.ledCount}`,
  };
}
