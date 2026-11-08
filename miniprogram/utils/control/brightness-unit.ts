/**
 * 亮度拖动单元：20Hz latest-wins 单通道，松手精确下发。
 *
 * 页面只把滑块事件喂进来，拿 send/value 决定发不发。所有节流状态住在这里，
 * 不碰传输层——发不发由调用方执行。
 */

/** 两次下发之间至少 50ms（20Hz）。 */
export const THROTTLE_MS = 50;

export interface DragStep {
  send: boolean;
  value: number;
}

export class BrightnessDragUnit {
  private max: number;
  private lastSentAt = -Infinity;
  private pending: number | null = null;
  private current = 0;

  constructor(opts: { max: number }) {
    this.max = opts.max;
  }

  /** 当前显示值（拖动中实时变，松手后保持）。 */
  get value(): number {
    return this.current;
  }

  setMax(max: number): void {
    this.max = max;
    this.current = this.clamp(this.current);
    if (this.pending !== null) this.pending = this.clamp(this.pending);
  }

  /** 拖动中：50ms 内只发最新值，不排队不叠加。 */
  onInput(value: number, nowMs: number): DragStep {
    const v = this.clamp(value);
    this.current = v;
    this.pending = v;

    if (nowMs - this.lastSentAt >= THROTTLE_MS) {
      this.lastSentAt = nowMs;
      this.pending = null;
      return { send: true, value: v };
    }
    return { send: false, value: v };
  }

  /** 松手：把挂起的值精确下发一次；没有挂起值就不发。 */
  onRelease(value: number): DragStep {
    const v = this.clamp(value);
    this.current = v;
    if (this.pending === null) return { send: false, value: v };
    this.pending = null;
    return { send: true, value: v };
  }

  private clamp(value: number): number {
    return Math.min(Math.max(0, Math.round(value)), this.max);
  }
}

export function brightnessDragUnit(opts: { max: number }): BrightnessDragUnit {
  return new BrightnessDragUnit(opts);
}
