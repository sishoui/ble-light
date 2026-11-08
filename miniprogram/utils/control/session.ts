/**
 * 会话层：页面的唯一门面。连接、状态镜像、命令语义、节流都在这里。
 *
 * 页面不直接碰传输层，只走这个类。测试断言设备收到了什么（transport.writes），
 * 不断言内部字段。
 */
import { CMD, RPT, RESULT } from "../protocol/constants.gen";
import { encodeFrame, decodeFrame } from "../protocol/frame";
import { STATE_FIELDS } from "../protocol/constants.gen";

/** 传输层必须提供的接口。真机实现是 wx BLE，测试实现是 FakeTransport。 */
export interface Transport {
  connected: boolean;
  connect(deviceId: string): Promise<void>;
  disconnect(): Promise<void>;
  negotiateMtu(requested: number): Promise<number>;
  discoverServices(): Promise<string[]>;
  discoverCharacteristics(): Promise<string[]>;
  subscribe(): Promise<void>;
  readState(): Promise<Uint8Array>;
  write(frame: Uint8Array): Promise<void>;
  onNotify: ((frame: Uint8Array) => void) | null;
  onDisconnect: (() => void) | null;
}

export interface SessionState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  /** 当前连接的设备号；未连接时为 null */
  deviceId: string | null;
  power: boolean;
  brightness: number;
  maxBrightness: number;
  stripCount: number;
  stripPowerMask: number;
  ledCount: number[];
  partCount: number[];
}

/** 20Hz：两次下发之间至少 50ms。 */
export const THROTTLE_MS = 50;

export class ControlSession {
  private transport: Transport;
  private seq = 0;
  private pendingBrightness: number | null = null;
  private lastBrightnessSentAt = -Infinity;
  private writeChain: Promise<void> = Promise.resolve();

  state: SessionState = {
    connected: false,
    connecting: false,
    error: null,
    deviceId: null,
    power: false,
    brightness: 0,
    maxBrightness: 200,
    stripCount: 0,
    stripPowerMask: 0,
    ledCount: new Array(8).fill(0),
    partCount: new Array(8).fill(0),
  };

  constructor(transport: Transport) {
    this.transport = transport;
    transport.onNotify = (frame) => this.handleNotify(frame);
    transport.onDisconnect = () => {
      this.state.connected = false;
    };
  }

  /** 连接流水线：固定顺序，任何一步失败都停在未连接。 */
  async connect(deviceId: string): Promise<void> {
    this.state.connecting = true;
    this.state.error = null;
    this.state.deviceId = deviceId;
    try {
      await this.transport.connect(deviceId);
      const mtu = await this.transport.negotiateMtu(247);
      if (mtu < 23) throw new Error(`协商出的 MTU ${mtu} 太小`);
      await this.transport.discoverServices();
      await this.transport.discoverCharacteristics();
      await this.transport.subscribe();
      const raw = await this.transport.readState();
      this.applyState(raw);

      this.state.connected = true;
    } catch (e) {
      this.state.connected = false;
      this.state.deviceId = null;
      this.state.error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      this.state.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state.connected = false;
    this.state.deviceId = null;
  }

  async setPower(on: boolean): Promise<void> {
    await this.send(CMD.SetPower, [on ? 1 : 0]);
    this.state.power = on;
  }

  async setBrightness(value: number): Promise<void> {
    const clamped = Math.min(Math.max(0, Math.round(value)), this.state.maxBrightness);
    await this.send(CMD.SetBrightness, [clamped]);
    this.state.brightness = clamped;
    this.pendingBrightness = null;
  }

  /**
   * 拖动中的亮度：latest-wins 单通道，50ms 内只发最新值。
   * 不排队、不叠加。
   */
  queueBrightness(value: number, nowMs: number): void {
    const clamped = Math.min(Math.max(0, Math.round(value)), this.state.maxBrightness);
    this.pendingBrightness = clamped;
    this.state.brightness = clamped;

    if (nowMs - this.lastBrightnessSentAt >= THROTTLE_MS) {
      this.lastBrightnessSentAt = nowMs;
      const v = this.pendingBrightness;
      this.pendingBrightness = null;
      void this.send(CMD.SetBrightness, [v]);
    }
  }

  /** 把挂起的亮度立刻发出去（拖动结束）。 */
  async flush(nowMs = Infinity): Promise<void> {
    if (this.pendingBrightness === null) return;
    const v = this.pendingBrightness;
    this.pendingBrightness = null;
    this.lastBrightnessSentAt = nowMs;
    await this.send(CMD.SetBrightness, [v]);
  }

  /** 写是串行的：一次只发一帧，发完再发下一帧。 */
  private async send(command: number, payload: number[]): Promise<void> {
    const frame = encodeFrame({ command, seq: this.nextSeq(), payload });
    this.writeChain = this.writeChain.then(() => this.transport.write(frame));
    await this.writeChain;
  }

  private nextSeq(): number {
    const s = this.seq;
    this.seq = (this.seq + 1) & 0xff;
    return s;
  }

  private handleNotify(frame: Uint8Array): void {
    let decoded;
    try {
      decoded = decodeFrame(frame);
    } catch {
      return;
    }
    if (decoded.command === RPT.StateReport) {
      this.applyState(Uint8Array.from(decoded.payload));
    }
  }

  /** 32 字节 State 布局由生成器给的字段表决定，不手写偏移。 */
  private applyState(raw: Uint8Array): void {
    if (raw.length < 32) return;
    const f = STATE_FIELDS;
    this.state.power = raw[f.power.offset] !== 0;
    this.state.brightness = raw[f.brightness.offset];
    this.state.maxBrightness = raw[f.max_brightness.offset];
    this.state.stripCount = raw[f.strip_count.offset];
    this.state.stripPowerMask = raw[f.strip_power_mask.offset];

    const ledBase = f.led_count.offset;
    for (let i = 0; i < 8; i++) {
      const at = ledBase + i * f.led_count.elementBytes!;
      this.state.ledCount[i] = raw[at] | (raw[at + 1] << 8);
    }
    const partBase = f.part_count.offset;
    for (let i = 0; i < 8; i++) {
      this.state.partCount[i] = raw[partBase + i];
    }
  }
}

export { RESULT };
