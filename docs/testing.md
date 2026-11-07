---
purpose: 测试配方。五个接缝各自的写法、工具、文件位置、一个用例长什么样、什么算违规。
status: 生效
---

# 测试

五个接缝，三条禁令，六条纪律。**这份文档是配方，不是原则。**照着写就行。

> **接缝已经定过了，不要再问。** `tdd` 技能要求「测试前先写下接缝并与用户确认」——
> 这一步已在 `docs/adr/0003-five-seams.md` 完成，本节就是结论。
> 新票开工时直接用这五个接缝，不需要重新讨论。**只有当一张票需要第六个接缝时才回来问。**

## 0. 六条纪律

1. **测试与实现同 commit**，commit message 写行为，不写「加测试」。
2. **新增测试必须先看见它红。** PR 描述里贴一次变红的输出。没红过的测试不算测试。
3. **测试不许因为重构而删。** 红了先问「行为变了吗」；没变就是接缝选错了，改接缝。
4. **跨接缝不复用测试数据。** 需要同一份契约数据（协议字节）时，只能用生成出来的 `docs/protocol-vectors.json`。
5. **不测 getter、不测常量、不测框架。** 测行为。
6. **每个接缝至少一个测试文件。** 缺了 `npm run map:check` 会红——见 §7。

## 1. 接缝一：协议编解码（`protocol`）

**测什么**：帧、分片、CRC、命令 payload 的字节布局。

**唯一允许断言字节的地方。** 其他接缝不许出现 `payload[27]` 这种偏移量。

| 项 | 值 |
|---|---|
| 固件 | `firmware/test/test_protocol.c`，手写 `RUN_TEST` |
| 小程序 | `miniprogram/tests/protocol/*.test.ts`，vitest |
| 契约数据 | `docs/protocol-vectors.json`（由 `npm run gen` 生成） |

**两端跑同一份向量。** 向量里没有的东西不许手写进测试。

```c
/* firmware/test/test_protocol.c */
RUN_TEST(crc16_check_string_is_0x29b1) {
    const uint8_t s[] = "123456789";
    ASSERT_EQ_U16(lumen_crc16(s, 9), 0x29B1);
}
```

```ts
// miniprogram/tests/protocol/frame.test.ts
import vectors from "../../../docs/protocol-vectors.json";

it("向量里的每一帧都能编出同样的字节", () => {
  for (const v of vectors.vectors.filter((v) => v.kind === "frame")) {
    expect(encodeFrame(v).map(toHex).join(" ")).toBe(v.expect_hex);
  }
});
```

**违规长什么样**：

- 手写 hex：`expect(bytes).toEqual([0xa6, 0x01, ...])` —— 应该从向量取
- 第二份向量文件：`test-vectors-copy.json`
- 断言实现细节：`expect(framer._buffer.length)` 

**边界用例必测**：payload = 0 / 232 / 233（超限）；分片 ctrl 的单片 `0xC0`、多片 FIRST/LAST、序号回绕；重组超时 1000ms 丢弃。

## 2. 接缝二：命令 reducer（`reducer`）

**测什么**：`(state, cmd) → (state', result, intents)` 纯函数。

| 项 | 值 |
|---|---|
| 位置 | `firmware/test/test_command.c` |
| 要求 | **分支覆盖 100%**（它是状态机，漏一条就是一条命令行为未定义） |

reducer 是纯的：不读全局、不发 notify、不写 NVS。副作用以 `intents` 形式返回，由调用方执行。

```c
RUN_TEST(set_led_count_rejects_zero) {
    lumen_state_t st = lumen_state_default();
    lumen_cmd_t cmd = { .code = CMD_SET_LED_COUNT, .payload = {0, 0, 0}, .len = 3 };
    lumen_out_t out;
    lumen_command_apply(&st, &cmd, &out);
    ASSERT_EQ_U8(out.result, RES_INVALID_PARAM);
    ASSERT_EQ_U16(st.led_count[0], lumen_state_default().led_count[0]); /* 状态未变 */
    ASSERT_EQ_U8(out.intent_count, 0);
}
```

**每个命令至少四条**：合法输入改状态 / 越界回 `InvalidParam` 且状态不变 / 长度错回 `BadLength` / 未定义码回 `UnknownCommand`。

**校验顺序也是行为**：命令字 → 长度 → 取值。写一个「既超长又越界」的用例，断言回 `BadLength` 而不是 `InvalidParam`。

**违规长什么样**：

- reducer 里出现 `notify()` / `nvs_` / `printf` → 结构错，先改代码
- 断言读全局状态：`expect(getGlobalState())` —— 应该断言返回值

## 3. 接缝三：渲染合成（`render`）

**测什么**：`(layout, scene, playheads, t) → pixels`，像素就是产物。

| 项 | 值 |
|---|---|
| 位置 | `firmware/test/test_render.c` |
| 要求 | 每个灯效至少 3 个时间点 × 2 颗灯珠 |

**用公式断言，不用金文件。** 金文件的终点是「重录一遍让它绿」。

```c
RUN_TEST(breathing_reaches_peak_at_half_period) {
    lumen_scene_t scene = scene_with_breathing(PERIOD_MS);
    lumen_pixels_t px = render_at(&scene, PERIOD_MS / 2);
    /* 呼吸半周期到顶：亮度接近上限，色相保持 */
    ASSERT_TRUE(px.rgb[0].g > 200);
    ASSERT_TRUE(px.rgb[0].r < 40);
}
```

断言写的是**规格**：「半周期应该是峰值」这句话本身就是呼吸的定义。所以测试红了，要么代码错，要么规格错——两种都值得看。

**选点规则**：`t=0`（起点）、`t=T/2`（中点）、`t=T`（闭合）；跨步再测 `t=T+ε`（第 2 步开始）。边界参数单独一组：`period=0`（静止）、`level=0`（不出光）、`sat=0`（白）。

**整帧哈希只作辅助信号**：用来发现「没改代码但输出变了」，不作为主断言，红了不算测试失败，算调查线索。

**违规长什么样**：

- `expect(pixels).toEqual(golden_breathing_512.json)` —— 金文件
- `expect(render(...)).toMatchSnapshot()` —— 同一件事

## 4. 接缝四：会话层（`session`）

**测什么**：假传输下**设备收到了什么**。

| 项 | 值 |
|---|---|
| 位置 | `miniprogram/tests/session/*.test.ts` |
| 断言对象 | `transport.writes`（设备收到的帧），不是 `session` 的内部字段 |

```ts
it("点总闸关闭时，设备收到的 SetPower 载荷是 0", async () => {
  const t = new FakeTransport();
  const s = new ControlSession(t);
  await s.setPower(false);
  const frame = t.writes.find((w) => w.command === CMD.SetPower);
  expect(frame?.payload).toEqual([0]);
});
```

**需要覆盖的会话行为**：连接流水线顺序（MTU → services → 订阅 → 读 State）、1s/2s/4s 退避、20Hz latest-wins 不叠帧、错误码分诊（10006 回连 / 10008 重试一次 / 10001 等蓝牙）、写入串行化。

**违规长什么样**：

- `expect(writeSpy).toHaveBeenCalled()` —— 断言调用，不断言内容
- `expect(session["_pending"]).toEqual(...)` —— 断言私有字段
- 断言 mock 的 seed 等于自己：`expect(mock.state).toBe(mock.spec)`

## 5. 接缝五：页面（`page`）

**页面文件里不许有可测的逻辑。** 它只有 `Page({ data, onLoad, onTapX })` 这种转发。

所以这个接缝测的不是页面，是**从页面抽出来的纯函数**：

| 抽出来的 | 放哪 | 测什么 |
|---|---|---|
| 视图模型 | `miniprogram/utils/control/view-model.ts` | `(state, uiState) → 页面 data` 的纯映射 |
| 交互单元 | `miniprogram/utils/control/*-unit.ts` | `(event, state) → 动作列表` |

```ts
// 视图模型：纯函数，无 mock，无 fixture
it("设备离线时电源键显示为关闭态，且不显示亮度", () => {
  const vm = homeView({ connected: false, power: true, brightness: 128 });
  expect(vm.powerOn).toBe(false);
  expect(vm.showBrightness).toBe(false);
});
```

**页面本身只靠 `ui` 层兜底**（微信开发者工具 automator）：「点了有没有反应」「白屏没有」「设备收到没有」。这是唯一能验真实渲染的地方，也是唯一能验「事件绑定没断」的地方。

**违规长什么样**：

- 页面测试读 `page.data.durationMs === 3000` —— 那是演示数据，不是产品承诺
- 页面里写业务逻辑：`if (a > b) this.setData(...)` 出现在 `pages/`
- 用 `page-harness` 断言页面中间态 —— 应该断言设备收到什么，那是接缝四

## 6. 跑什么

| 命令 | 跑什么 | 需要 | 何时 |
|---|---|---|---|
| `npm test` | 固件 host 测试 + 协议生成物校验 | gcc + node | 每次改代码 |
| `npm run test:mp` | 小程序 vitest + tsc | node | 改小程序 |
| `npm run ui` | 开发者工具 automator | 微信开发者工具 + 自动化端口 | 改页面 |
| `npm run device` | 真机探针 | 真机 + bleak | 改传输层 / 发版前 |
| `npm run gen:check` | 生成物与 `protocol.json` 一致 | node | CI |

**真机探针产出的是证据，不是回归断言。** 结果填进 `docs/acceptance.md` 的对应行，不新建文档。

## 7. 门禁

`npm run map:check` 拦这些：

| 检查 | 判定 |
|---|---|
| 五个接缝各有 ≥1 个测试文件 | 缺一个就 error |
| 测试读源文件做断言 | error |
| 测试断言方法被调用 | error |
| 生成物与 `protocol.json` 不一致 | error |
| 文档没有家 / 缺 frontmatter / 文件名带版本号 | error |
| `docs/status.md` 超 60 行 | error |

覆盖率只设一个门槛：**`reducer` 分支覆盖 100%**。其余不设——覆盖率会奖励测 getter，与纪律 5 冲突。
