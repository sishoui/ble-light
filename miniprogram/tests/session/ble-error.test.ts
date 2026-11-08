import { describe, it, expect } from "vitest";
import { explainBleError } from "../../utils/ble/transport";

describe("BLE 错误分诊", () => {
  it("蓝牙没开时让人去开蓝牙", () => {
    expect(explainBleError(10001, "")).toContain("蓝牙");
  });

  it("连接超时给出可执行的下一步", () => {
    const msg = explainBleError(10003, "");
    expect(msg).toContain("超时");
    expect(msg).toContain("重试");
  });

  it("断线错误说明会自动重连", () => {
    expect(explainBleError(10006, "")).toContain("重连");
  });

  it("未知错误码回落到原始信息，不吞掉", () => {
    expect(explainBleError(99999, "原始错误")).toBe("原始错误");
  });

  it("没有原始信息时也给一句话，不返回空串", () => {
    expect(explainBleError(99999, "")).not.toBe("");
  });

  it("每条错误文案都说是什么 + 怎么办", () => {
    for (const code of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008, 10009, 10012]) {
      const msg = explainBleError(code, "");
      expect(msg.length).toBeGreaterThan(6);
      expect(msg).not.toContain("操作失败");
    }
  });
});
