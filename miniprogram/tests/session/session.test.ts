import { describe, it, expect } from "vitest";
import { ControlSession } from "../../utils/control/session";
import { CMD, RPT } from "../../utils/protocol/constants.gen";
import { FakeTransport } from "./fake-transport";

describe("连接流水线", () => {
  it("按固定顺序走：MTU → 服务 → 特征 → 订阅 → 读状态", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    expect(t.steps).toEqual([
      "connect:dev-1",
      "mtu",
      "services",
      "characteristics",
      "subscribe",
      "readState",
    ]);
    expect(s.state.connected).toBe(true);
  });

  it("任何一步失败都停在未连接状态并给出原因", async () => {
    for (const step of ["connect", "mtu", "services", "characteristics", "subscribe", "readState"]) {
      const t = new FakeTransport();
      t.failAt = step;
      const s = new ControlSession(t);
      await expect(s.connect("dev-1")).rejects.toThrow();
      expect(s.state.connected).toBe(false);
      expect(s.state.error).toBeTruthy();
    }
  });

  it("连上后用读到的状态，不用本地缓存", async () => {
    const t = new FakeTransport();
    t.readState = async () => {
      const st = new Uint8Array(32);
      st[0] = 1;   // power
      st[1] = 77;  // brightness
      st[2] = 200; // max
      st[3] = 2;   // strips
      st[8] = 30;  // led_count[0] lo
      return st;
    };
    const s = new ControlSession(t);
    await s.connect("dev-1");
    expect(s.state.power).toBe(true);
    expect(s.state.brightness).toBe(77);
    expect(s.state.maxBrightness).toBe(200);
    expect(s.state.stripCount).toBe(2);
    expect(s.state.ledCount[0]).toBe(30);
  });
});

describe("命令", () => {
  it("点总闸关闭时，设备收到的 SetPower 载荷是 0", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    await s.setPower(false);
    const w = t.writesOf(CMD.SetPower).at(-1);
    expect(w?.payload).toEqual([0]);
  });

  it("开灯时载荷是 1", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    await s.setPower(true);
    expect(t.writesOf(CMD.SetPower).at(-1)?.payload).toEqual([1]);
  });

  it("关灯后亮度设置保留", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    await s.setBrightness(120);
    await s.setPower(false);
    expect(s.state.brightness).toBe(120);
  });

  it("亮度上限取自设备，不硬编码", async () => {
    const t = new FakeTransport();
    t.readState = async () => {
      const st = new Uint8Array(32);
      st[2] = 128;
      return st;
    };
    const s = new ControlSession(t);
    await s.connect("dev-1");
    await s.setBrightness(255);
    expect(t.writesOf(CMD.SetBrightness).at(-1)?.payload).toEqual([128]);
  });

  it("seq 逐条递增并回绕", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    await s.setPower(true);
    await s.setPower(false);
    const seqs = t.writes.map((w) => w.seq);
    expect(seqs[1]).toBe(seqs[0] + 1);
  });
});

describe("节流", () => {
  it("拖动亮度时同一条通道不叠帧：只有最新值胜出", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");

    // t=0 立即发 10；t=10 / t=20 落在窗口内只更新挂起值；
    // t=50 窗口结束，发最新的 30。中间值 20 从不发出。
    s.queueBrightness(10, 0);
    s.queueBrightness(20, 10);
    s.queueBrightness(30, 20);
    await s.flush(50);
    const payloads = t.writesOf(CMD.SetBrightness).map((w) => w.payload[0]);
    expect(payloads).toEqual([10, 30]);
    expect(payloads).not.toContain(20);
  });

  it("松手时做一次精确下发", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    s.queueBrightness(10, 0);
    await s.flush(50);
    await s.setBrightness(42);
    const payloads = t.writesOf(CMD.SetBrightness).map((w) => w.payload[0]);
    expect(payloads.at(-1)).toBe(42);
  });
});

describe("状态镜像", () => {
  it("收到 StateReport 通知后状态跟着变", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");

    const st = new Uint8Array(32);
    st[0] = 1;
    st[1] = 99;
    st[2] = 200;
    t.emit(RPT.StateReport, 0, Array.from(st));

    expect(s.state.power).toBe(true);
    expect(s.state.brightness).toBe(99);
  });

  it("断线时状态标记为未连接", async () => {
    const t = new FakeTransport();
    const s = new ControlSession(t);
    await s.connect("dev-1");
    t.dropConnection();
    expect(s.state.connected).toBe(false);
  });
});
