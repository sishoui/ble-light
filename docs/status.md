---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-08
---

# 状态

## 现在在哪

- 集成分支 **`spec-v1`**，`main` 尚未合并，领先 42 个提交。
- **已完成并关闭**：#2 协议字段表、#3 固件 host 内核、#4 固件 BLE + 单色出光。
- **#5 已打通真机**：扫描 → 连接 → 开灯 → 拖亮度全链路验证通过，灯带实际出光。
- **v2 设计稿已出**（4 页 SVG），在 `docs/design/v2/`，**待用户确认**。

## 下一步

- [ ] 用户确认 v2 四页设计稿 → 粘进 Pixso 建 4 块新画板 → 存档进 `docs/design/`
- [ ] 按确认稿改代码：固定标题栏、胶囊避让、返回按钮、空态按钮、错误态返回
- [ ] 真机复验 #5 后合 `spec-v1` → `main`，关 #5，删分支
- [ ] #13 部位划分（要出稿确认）→ #6 → #7 → #8 → #12
- [ ] 「场景」「我的」两个 tab 页面尚未设计，等 #7 / #11 开工时出稿

## 卡点

- v2 设计稿等确认。确认后即可进代码。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md` 这类文件。规格住 issue #1。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支（`spec-v1` 是本次集成分支，收尾即合入 `main` 并删除）。
- **不手改生成物**：`protocol_gen.h`、`constants.gen.ts`、`protocol-vectors.json`、`protocol.md` 的表格段。
- 不擦 flash（会清掉设备 NVS 里的配置）。
