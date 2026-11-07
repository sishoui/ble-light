---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-07
---

# 状态

## 现在在哪

- 治理文档与项目管理面板已就位（`docs/` 10 份封顶，五次提交）。
- **测试工艺已定稿**：五个接缝的配方写在 `docs/testing.md`，照着写即可。
- 协议有了机器可读的唯一真相 `docs/protocol.json`，四类生成物已落地。
- **仍无产品代码**：`firmware/main/*.c`、`miniprogram/utils/` 尚未开始。
- 接缝门禁已有测试覆盖：`npm test` 20 个用例，全绿。

## 下一步

- [ ] `/to-spec`：把领域模型与协议写成规格
- [ ] `/to-tickets`：拆成 tracer-bullet 票
- [ ] 第一张票：协议编解码 walking skeleton（向量驱动的两端实现）
- [ ] 硬件基线复核：C3FH4 + 8 链 × 100 颗 + 灯带独立 5V 只共地

## 卡点

- 无。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md` 这类文件。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支。
- **不手改生成物**：`protocol_gen.h`、`constants.gen.ts`、`protocol-vectors.json`、`protocol.md` 的表格段。
