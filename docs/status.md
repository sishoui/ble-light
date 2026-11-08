---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-08
---

# 状态

## 现在在哪

- 集成分支 **`spec-v1`**，`main` 尚未合并。
- **已完成并关闭**：#2 协议字段表、#3 固件 host 内核、#4 固件 BLE + 单色出光。
- **#5 已完成**：协议编解码、会话层、页面视图模型、wx BLE 传输层、
  四个页面（设备列表 / 设备详情 / 灯链详情 / 添加设备）。
- 视觉权威 **`docs/design.md` 是灰底柔光**；9 屏设计稿已确认并存档在 `docs/design/`。
- **开发者工具已跑通**：`project.config.json` 启用官方 TS 编译插件；
  扫描 → 列表 → 详情 → 开关 → 亮度 → 下钻全部验证过。
- 测试：固件 74 + 小程序 111，`npm run check` 通过（数字看 `npm run map`）。

## 下一步

- [ ] 真机验 #5 最后一条：拖动亮度不卡顿（工具里 `writeBLECharacteristicValue` 不支持，只能真机）。
- [ ] 合入 `spec-v1` 后关闭 #5。
- [ ] #13 部位划分（要出稿确认）→ #6 → #7 → #8 → #12。
- [ ] 「场景」「我的」两个 tab 页面尚未设计，等 #7 / #11 开工时出稿。

## 卡点

- 无。设计稿已确认。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md` 这类文件。规格住 issue #1。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支（`spec-v1` 是本次集成分支，收尾即合入 `main` 并删除）。
- **不手改生成物**：`protocol_gen.h`、`constants.gen.ts`、`protocol-vectors.json`、`protocol.md` 的表格段。
