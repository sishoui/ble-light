/**
 * 假传输：记录设备收到了什么，可以脚本化响应。
 * 会话层的测试只断言这里的内容，不看会话内部。
 */
import { encodeFrame, decodeFrame } from "../../utils/protocol/frame";

export interface Write {
  frame: Uint8Array;
  command: number;
  seq: number;
  payload: number[];
  /** 设备侧解出来的字节，方便断言 */
  hex: string;
}

export type Handler = (cmd: number, payload: number[]) => void;

export class FakeTransport {
  writes: Write[] = [];
  connected = false;
  mtu = 23;
  /** 连接流水线里每一步的记录，用于断言顺序 */
  steps: string[] = [];
  /** 让某一步失败；null 表示成功 */
  failAt: string | null = null;
  /** 模拟断线回调 */
  onDisconnect: (() => void) | null = null;
  /** 模拟通知回调 */
  onNotify: ((frame: Uint8Array) => void) | null = null;

  async connect(deviceId: string): Promise<void> {
    this.steps.push(`connect:${deviceId}`);
    if (this.failAt === "connect") throw new Error("connect failed");
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.steps.push("disconnect");
    this.connected = false;
  }

  async negotiateMtu(requested: number): Promise<number> {
    this.steps.push("mtu");
    if (this.failAt === "mtu") throw new Error("mtu failed");
    this.mtu = requested;
    return this.mtu;
  }

  async discoverServices(): Promise<string[]> {
    this.steps.push("services");
    if (this.failAt === "services") throw new Error("services failed");
    return ["6c756d65-6e00-4b1e-9a3c-000000000001"];
  }

  async discoverCharacteristics(): Promise<string[]> {
    this.steps.push("characteristics");
    if (this.failAt === "characteristics") throw new Error("chars failed");
    return ["rx", "tx", "state"];
  }

  async subscribe(): Promise<void> {
    this.steps.push("subscribe");
    if (this.failAt === "subscribe") throw new Error("subscribe failed");
  }

  async readState(): Promise<Uint8Array> {
    this.steps.push("readState");
    if (this.failAt === "readState") throw new Error("read failed");
    return FakeTransport.defaultState();
  }

  /** 一台设备的出厂状态：亮度上限 200，一条链 30 颗。真机不会全零。 */
  static defaultState(): Uint8Array {
    const st = new Uint8Array(32);
    st[2] = 200;  // max_brightness
    st[3] = 1;    // strip_count
    st[8] = 30;   // led_count[0] lo
    return st;
  }

  async write(frame: Uint8Array): Promise<void> {
    const dec = decodeFrame(frame);
    this.writes.push({
      frame,
      command: dec.command,
      seq: dec.seq,
      payload: dec.payload,
      hex: Array.from(frame, (b) => b.toString(16).padStart(2, "0")).join(" "),
    });
  }

  /** 测试辅助：模拟设备发来一帧通知。 */
  emit(command: number, seq: number, payload: number[]): void {
    const frame = encodeFrame({ command, seq, payload });
    this.onNotify?.(frame);
  }

  /** 测试辅助：模拟断线。 */
  dropConnection(): void {
    this.connected = false;
    this.onDisconnect?.();
  }

  /** 最后一条写的载荷。 */
  lastPayload(): number[] | undefined {
    return this.writes.at(-1)?.payload;
  }

  /** 某个命令的所有写入。 */
  writesOf(command: number): Write[] {
    return this.writes.filter((w) => w.command === command);
  }
}
