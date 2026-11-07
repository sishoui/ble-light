---
purpose: 测试分层、五个接缝、三条禁令。定义「测什么」与「在哪测」。
status: 生效
---

# 测试

## 只测五个接缝

模型可以换，接缝不换。测试挂在接缝上，就不会因为重构而失去意义。

| # | 接缝 | 测什么 | 在哪 | 禁止 |
|---|---|---|---|---|
| 1 | **协议编解码** | 帧、分片、CRC、命令 payload 的字节布局 | `miniprogram/utils/protocol/`、`firmware/main/protocol.c` | 第二份向量；手写 hex |
| 2 | **命令 reducer** | 纯函数 `(state, cmd) → (state', result, intents)` | `firmware/main/command.c` | 在 reducer 里读全局、发 notify、写 NVS |
| 3 | **渲染合成** | 纯函数 `(layout, scene, playheads, t) → pixels` | `firmware/main/led_render.c` | 快照 UI 中间态 |
| 4 | **会话层** | 假传输下设备**收到了什么** | `miniprogram/utils/control/session` | `expect(spy).toHaveBeenCalled` |
| 5 | **页面处理器** | 页面 + 假会话下**用户看得见的结果** | `miniprogram/pages/*/*.ts` | 断言 `page.data` 私有字段；断言源码文本 |

不属于这五个接缝的代码，不为它单写测试——它的行为会经由某个接缝体现。

## 三条禁令

1. **禁止读源文件做断言。** `expect(source).not.toContain("buildEffectPanel(")` 这类：重构就红，行为坏了反而绿。
2. **禁止 mock 自证。** 断言 `mock.state === mock.spec` 是在测假货，不是在测产品。
3. **禁止 fixture 快照当行为测试。** 演示设备的出厂值不是产品承诺。

测试红了先问「行为变了吗」。行为没变就是接缝选错了，改接缝，**不删测试**。

## 协议向量只有一份

`docs/protocol-vectors.json` 由 `scripts/gen-vectors.mjs` 从 `docs/protocol.md` 的表格生成，固件与小程序**共用同一份**。改字节布局 = 协议文档 + 向量 + 两端实现同一个 commit。

## 跑什么

| 层 | 命令 | 需要 | 什么时候跑 |
|---|---|---|---|
| `unit` | `npm test` | Node | 每次改代码 |
| `firmware` | `firmware/test/run-tests.cmd` | gcc + node | 改固件或协议 |
| `ui` | `npm run ui` | 微信开发者工具 + 自动化端口 | 改页面 |
| `device` | `npm run device` | 真机 + bleak | 改传输层或发版前 |

真机探针产出的是**一次性证据**，不是回归断言；结果写进 `docs/acceptance.md` 的对应行，不新建文档。
