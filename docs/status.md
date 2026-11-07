---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-08
---

# 状态

## 现在在哪

- 集成分支 **`spec-v1`**，`main` 尚未合并。12 个提交。
- **已完成并关闭**：#2 协议字段表、#3 固件 host 内核、#4 固件 BLE + 单色出光。
- **#5 前半已合入 `spec-v1`**：协议编解码、会话层、页面视图模型。
  **页面文件尚未写**——设计稿未确认。
- 测试：固件 + 工具 + 小程序三套全绿，`npm run check` 通过（数字看 `npm run map`）。
- 固件交叉编译可出固件（`npm run build:firmware`，ESP-IDF v6.1 / esp32c3）。
- 视觉权威 **`docs/design.md` 已换成暖调家居风**（米白 + 深棕 + 焦糖），`app.wxss` 同步。

## 下一步

- [ ] **设计稿确认**：Pixso 6 屏——设备页 `3:596` / `3:642` / `3:672` / `3:697`，
      连接页 `3:721` / `3:758`。确认后截图存档进 `docs/design/`，再写页面代码。
- [ ] 写 `miniprogram/pages/`：连接页、设备页，页面只做转发。
- [ ] 合入 `spec-v1` 后关闭 #5。
- [ ] 然后 #13 部位划分（同样要先出稿确认）→ #6 → #7 → #8 → #12。

## 卡点

- **设计稿未确认**：`AGENTS.md` 规定没听到「确认」不许写页面代码。
  #5 / #13 / #6 / #7 / #9 / #10 / #11 都卡在这一关。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md` 这类文件。规格住 issue #1。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支（`spec-v1` 是本次集成分支，收尾即合入 `main` 并删除）。
- **不手改生成物**：`protocol_gen.h`、`constants.gen.ts`、`protocol-vectors.json`、`protocol.md` 的表格段。
