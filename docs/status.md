---
purpose: 当前状态。唯一允许写「现在在哪 / 下一步」的地方，原地重写，不追加历史。
status: 生效
updated: 2026-11-07
---

# 状态

## 现在在哪

- 仓库刚建立。治理文档与项目管理面板已就位。
- **没有任何产品代码**：`firmware/`、`miniprogram/` 尚未创建。
- 协议只定了信封与命令表（`docs/protocol.md`），payload 逐字节待定。
- 领域模型沿用 lumen v5，见 `docs/adr/0001-domain-model.md`。

## 下一步

- [ ] `/to-spec`：把领域模型与协议草案写成规格
- [ ] `/to-tickets`：拆成 tracer-bullet 票
- [ ] 第一张票：协议编解码 + 一条链 / 一个部位 / 一步 / 一层的 walking skeleton
- [ ] 硬件基线复核：C3FH4 + 8 链 × 100 颗 + 灯带独立 5V 只共地

## 卡点

- 无。

## 禁做

- 不建 `docs/handoff.md`、`docs/pending-tasks.md`、`*-spec.md`、`protocol-v2.md` 这类文件。
- 不在文档里手抄测试数字，只放指针或让 `npm run map` 生成。
- 不在 `.scratch/` 里维护票，issue 只在 GitHub。
- v1 不引后端，没有 `server/`。
- 不建长期 `integration/*` 分支。
