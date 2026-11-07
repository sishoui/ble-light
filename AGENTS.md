# ble-light · Agent 规则

## 开工前先读

1. [`docs/status.md`](docs/status.md) —— 现在在哪、下一步、**禁做**
2. [`GLOSSARY.md`](GLOSSARY.md) —— 用这里的词，不要造同义词
3. 要动协议就先读 [`docs/protocol.md`](docs/protocol.md)；要动测试先读 [`docs/testing.md`](docs/testing.md)

不要凭本文件推断进度。本文件只写**规则**，不写状态。

## 事实归属表

每个事实只有一个家。写文档前先查这张表，找不到家就说明你在发明新文档。

| 事实类型 | 唯一归属 |
|---|---|
| 协议字节、命令码、State 布局 | `docs/protocol.md` |
| 领域术语、不变量 | `GLOSSARY.md` |
| 为什么这么定 | `docs/adr/NNNN-*.md` |
| 当前进度 / 下一步 / 禁做 | `docs/status.md` |
| 测试分层、接缝、禁令 | `docs/testing.md` |
| 验收项与证据 | `docs/acceptance.md` |
| 怎么跑、怎么接线 | `README.md` |
| 每个模块干什么 | `docs/map.json`（面板读它） |

**文档之间只许指针，不许复述。** 同一事实出现在两处 = 缺陷。

## 硬规则

### 文档

- 文件名**不带版本号**。禁止 `protocol-v2.md`、`spec-final.md`、`xxx-old`、`handoff.md`、`pending-tasks.md`
- **作废即删除**，git 就是归档。看历史用 `git show <ref>:<path>`
- `docs/status.md` **≤60 行，每轮原地重写**，不追加历史段落
- 每份文档必须有 frontmatter：`purpose`（一句话职责）+ `status`
- 新增文档前先证明现有文档放不下。`docs/` 文件数封顶约 10 个

### 测试

- 只测**五个接缝**：协议编解码 / 命令 reducer / 渲染合成 / 会话层 / 页面处理器。**配方见 `docs/testing.md`**
- 三条禁令：**不读源码做断言**、**不 mock 自证**、**不拿 fixture 快照当行为测试**
- 测试与实现同 commit；**新增测试必须先看见它红**，PR 里贴变红输出
- 测试红了先问「行为变了吗」。行为没变就是接缝选错了，改接缝，**不删测试**
- 协议向量只有一份 `docs/protocol-vectors.json`，由生成器产出，固件与小程序共跑
- 页面文件里不许有可测逻辑：逻辑抽到 `utils/control/*-unit.ts`，页面只做转发

### 协议

- **唯一真相是 `docs/protocol.json`**。改协议只改它，然后 `npm run gen`
- 生成物四个，全部带 GENERATED 头，**不许手改**：`firmware/main/protocol_gen.h`、`miniprogram/utils/protocol/constants.gen.ts`、`docs/protocol-vectors.json`、`docs/protocol.md` 的表格段
- `npm run gen:check` 校验生成物与源一致，`map:check` 也会拦

### 代码

- 固件单向依赖：`ble_link → command → led_engine → led_render`，不许反向
- reducer 是纯函数，不碰 NVS / BLE / 硬件；副作用以 `intents` 返回
- 页面不直接碰传输层，只走 `session`

### 流程

- trunk-based：分支活不过 2 天，合完即删。**禁止长期 `integration/*` 分支**
- issue 只在 GitHub。`.scratch/` 整个 gitignore，只放一次性脚本，**永不成为权威**
- 证据按 claim 存，不按 run 存。测试报告是生成物，gitignore
- 发版打 tag（`v1.0.0`），版本身份不靠 commit message 和散文

## 项目管理面板

```bash
npm run gen       # 从 protocol.json 生成四个产物
npm run gen:check # 生成物与源是否一致
npm run map       # 扫描仓库 → docs/map.generated.json
npm run test      # 测生成器本身（20 个用例）
npm run check     # gen:check + map:check，提交前必跑
npm run panel     # http://localhost:5180
```

**每次改动后必须跑 `npm run check` 和 `npm run map`，并提交 `docs/map.generated.json`。** 面板里没有一个手抄的数字，全部来自这次扫描。

新增/删除/移动文件时：

- 如果是**新模块**（一个目录或一个核心源文件），在 `docs/map.json` 的 `modules` 里加一条，写清一句话职责和它属于哪个接缝
- 如果只是模块内部的文件变动，什么都不用做——扫描器会自己发现
- 如果是**新文档**，先加进 `docs/map.json` 的 `docsAllowed`，否则 `map:check` 报 `doc-not-declared`

`map:check` 会拦住这些情况：

| 检查 | 说明 |
|---|---|
| `doc-not-declared` | 文档没有家，说明它不该存在或该登记 |
| `doc-no-frontmatter` | 缺 `purpose` / `status` |
| `banned-doc-name` | 文件名命中 `handoff` / `protocol-v[0-9]` / `-old` 等 |
| `status-too-long` | `docs/status.md` 超过 60 行 |
| `seam-untested` | 某个接缝没有任何测试文件。**有产品代码后升为 error** |
| `generated-stale` | 生成物与 `protocol.json` 不一致 |
| `test-reads-source` | 测试读源码做断言 |
| `test-asserts-call` | 测试断言方法被调用 |
| `test-unseamed` | 测试不属于任何接缝 |
| `duplicate-title` | 两份文档标题重复，可能重复建设 |

`scripts/` 下的工具测试归 `tooling` 接缝，不适用「不读源码」禁令——它验的就是源码与生成物。

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `sishoui/ble-light`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
