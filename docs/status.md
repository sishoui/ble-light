---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-09
---

# 状态

## 现在在哪

- **`spec-v1` 已 fast-forward 合入 `main` 并删除**（2026-11-09）。四个 `ticket/*` 分支与其 worktree 一并清掉。
- 已完成并关闭：#2 协议字段表、#3 固件 host 内核、#4 固件 BLE + 单色出光。
- **#5 真机全链路已打通**：扫描 → 连接 → 开灯 → 拖亮度，灯带实际出光。**票仍开着**。
- **#5 最后一条 AC「拖动亮度不卡顿」链路侧已过**（2026-11-09，见 `docs/acceptance.md` U4 记 `◐`）。
  **手机 UI 手感仍未验**——关 #5 押在那一步。
- **v2 四页设计稿已改完，等确认**：`docs/design/v2/`，字号按 rpx 表重算、离线状态改文字承载、tabBar 加图标。
- **Pixso 里 9 个画板已加 tabBar 图标**，删掉了 6 个旧稿（`3:*`）。

## 下一步

- [ ] **用户确认 v2 四页** → 存档进 `docs/design/`（序号 `-2`），再改代码
- [ ] **决定 v2 与 Pixso 怎么对齐**（见下「卡点」）
- [ ] 按确认稿改代码：固定标题栏、胶囊避让、返回按钮、空态按钮、错误态返回、离线 chip、禁用开关
- [ ] **手机真机确认拖动不卡顿** → 关 #5（其余 9 条 AC 已过）
- [ ] #13 部位划分（要出稿确认）→ #6 → #7 → #8 → #12
- [ ] 「场景」「我的」两个 tab 页尚未设计，等 #7 / #11 出稿

## 卡点

**v2 四页在仓库里，Pixso 里是旧的，两套没对齐。** 待用户三选一：

1. 把 v2 四页整体重建成 Pixso 画板（新建 4 个）
2. 只保留 tabBar 这件事已完成的改动，其余照旧
3. 以 Pixso 现有 9 个画板为准，反过来对齐仓库与代码

**另一个待答**：`docs/design.md` §2 页面底部留白还是 `160rpx`，
tabBar 已从 96rpx 涨到 128rpx，按新高度该改成 `192rpx`。等确认。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md`（`map:check` 直接拦）。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支（合完即删）。
- **不手改生成物**：`protocol_gen.h`、`constants.gen.ts`、`protocol-vectors.json`、`protocol.md` 的表格段。
- 不擦 flash（会清掉设备 NVS 里的配置）。
- **删除 Pixso 画板前必须问用户**；Pixso 读写交给子 agent（见 `AGENTS.md`）。
