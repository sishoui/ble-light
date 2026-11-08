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
| 颜色、字号、间距、动效、文案 | `docs/design.md` |
| 已确认的设计稿 | `docs/design/` |
| 怎么跑、怎么接线 | `README.md` |
| 每个模块干什么 | `docs/map.json`（面板读它） |

**文档之间只许指针，不许复述。** 同一事实出现在两处 = 缺陷。

## 设计流程（动 UI 之前必做）

**触发条件**：新增页面、改页面布局结构、改交互流程、新增控件类型。
**不触发**：改文案、改颜色值、修不影响结构的 bug。

### 三步

1. **在 Pixso 里出设计稿**
   - 只画**结构与关键态**：区块划分与层级、空态 / 加载 / 错误 / 选中四种态
   - 颜色标注用 `docs/design.md` 的变量名，**不标 hex**
   - 不画像素级细节（rpx 换算与字体渲染差异会让设计稿好看真机不对）

2. **等确认**
   - 交付时说明：Pixso 节点 id、覆盖了哪些态、哪些地方偏离了 `docs/design.md` 及原因
   - **没听到「确认」两个字就不许写页面代码。** 不许「先写着，反正是草稿」

3. **确认后存档**
   - 截图 + 节点记录落进 `docs/design/<页面>-<用途>.md`，格式见 `docs/design/README.md`
   - 同目录放同名 png
   - 设计变更时**新增**一份带序号的记录，不覆盖旧的

### 谁来做

**Pixso 的读写一律交给子 agent，主 agent 不直接调 Pixso 工具。**

理由：Pixso 的返回很占地方（一次截图几十 KB base64，每次探图层树又是几 KB）。
让它待在主上下文里，会把真正要记住的东西挤掉——设计规范、用户的确认、还差哪一步。

分工：

| 角色 | 做什么 |
|---|---|
| 主 agent | 定改什么；读 `docs/design.md` 换算出精确数值；确认稿；看图验收；存档 |
| 子 agent | 连 MCP、读图层树、建改画板、截图上盘、报回证据 |

**交给子 agent 的必须是从 `docs/design.md` 换算好的数字，不是「照这稿子做」。**
它没读过规范，也没有用户确认；给它留余地，它就自己发明尺寸。

**子 agent 回来必须交证据**：画板 id、改动的图层数、截图路径。
主 agent 看过图才算完成——子 agent 说「改好了」不算。

**删除画板、重排页面结构留在主 agent。** 子 agent 只报告能删什么，不动手。

### 为什么存档

Pixso 是本地桌面服务（`127.0.0.1:3667`），关掉 Pixso、换机器、重启就读不到。
**仓库是唯一可追溯的地方**，所以确认过的稿必须有一份在 `docs/design/`。

### 视觉的唯一权威是 `docs/design.md`

页面样式**必须**引用它定义的 CSS 变量，禁止 hex 与字号硬编码。
偏差要写进记录，不许默默偏离。

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
- **样式不写 hex、不写字号**：一律用 `docs/design.md` 定义的变量与字号表

### 流程

- trunk-based：分支活不过 2 天，合完即删。**禁止长期 `integration/*` 分支**
- issue 只在 GitHub。`.scratch/` 整个 gitignore，只放一次性脚本，**永不成为权威**
- 证据按 claim 存，不按 run 存。测试报告是生成物，gitignore
- 发版打 tag（`v1.0.0`），版本身份不靠 commit message 和散文

## 项目管理面板

```bash
npm run sync      # 一条命令做完所有重生成（gen + map）
npm run gen       # 从 protocol.json 生成四个产物
npm run gen:check # 生成物与源是否一致
npm run map       # 扫描仓库 + 拉 GitHub 任务 → docs/map.generated.json
npm run test      # 测生成器本身
npm run check     # gen:check + map:check，提交前必跑
npm run panel     # http://localhost:5180
```

### 收尾清单（每个任务都必须做）

**「任务完成」的定义包含更新面板。** 没同步就等于没完成。

1. 跑 `npm run sync`
2. 跑 `npm run test` 和 `npm run check`，全绿
3. 提交 `docs/map.generated.json`
4. 如果动了 issue 状态（关闭、标记阻塞解除），再跑一次 `npm run map` 让任务图跟上
5. **如果动了 UI**：设计稿已确认并存进 `docs/design/`，否则回去补

`npm run check` 会拦住忘记同步：面板数据落后时它退 1，并指出**具体是哪个文件变了**，例如
`面板数据落后：改动 scripts/markdown.mjs。跑 npm run sync`。

面板里没有一个手抄的数字——文件、文档、测试、迭代、任务全部来自扫描与 GitHub API。

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
| `panel-stale` | 面板数据落后于仓库，会指出具体变动的文件 |
| `style-hardcoded-color` | 页面样式中写死 hex 或 rgba，必须走设计变量 |
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
