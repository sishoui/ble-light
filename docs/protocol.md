---
purpose: 协议契约。字节布局的唯一权威，文件名永不带版本号。
status: 草案
version: 1
---

# 协议

> **本文档的表格段由 `scripts/gen-protocol.mjs` 从 [`protocol.json`](protocol.json) 生成。**
> 唯一真相是 `protocol.json`，不要手改标记之间的内容。
>
> 改协议 = 改 `protocol.json` + 跑 `npm run gen` + 两端实现同一个 commit。
> 生成物：`firmware/main/protocol_gen.h`、`miniprogram/utils/protocol/constants.gen.ts`、
> `docs/protocol-vectors.json`、本文档的表格段。历史版本见 git log，不保留 `protocol-v*.md`。

## 1. 链路

| 角色 | UUID |
|---|---|
| Service | `6c756d65-6e00-4b1e-9a3c-000000000001` |
| RX（小程序写，`WRITE_NO_RSP`） | `...0002` |
| TX（设备 notify） | `...0003` |
| State（小程序读） | `...0004` |

广播名 `BleLight-XXXX`（BT MAC 末两字节）。**广播名不是身份**，`DeviceInfoReport` 的 `hw_id` 才是。

## 2. 帧

```
magic 0xA6 | version 0x01 | command | seq | length (u16 LE) | payload | crc16 (u16 LE)
```

- 帧长 = `8 + length`，payload ≤ 232，整帧 ≤ 240
- CRC16 = CCITT-FALSE（poly `0x1021`，init `0xFFFF`，不反转，无末尾异或）。`"123456789"` → `0x29B1`
- 设备只接受 `version 0x01`

## 3. 分片

每片 1 字节 ctrl：`bit7 FIRST`、`bit6 LAST`、`bit5..0` 序号。单分片 ctrl 恒 `0xC0`。重组超时 1000ms。

`chunk_capacity = min(mtu - 3, 180)`；单次写数据上限 = `chunk_capacity - 1`（下限 19）。

## 4. 上限

<!-- GENERATED:limits -->
| 常量 | 值 |
|---|---:|
| maxLeds | 100 |
| maxStrips | 8 |
| maxParts | 8 |
| maxPartSegs | 8 |
| maxSteps | 8 |
| maxScenes | 3 |
| maxLayers | 2 |
| nameBytes | 24 |
| stepMinMs | 100 |
| stepMaxMs | 60000 |
| layerLevelMax | 100 |
| layerBytes | 9 |
| stateBytes | 32 |
| layoutPartBytes | 29 |
| layoutReportBytes | 45 |
| sceneStepBytes | 24 |
| sceneNameBytes | 26 |
<!-- /GENERATED:limits -->

## 5. 命令

<!-- GENERATED:commands -->
| 码 | 名称 | 载荷字节 | 说明 |
|---|---|---:|---|
| `0x01` | `SetPower` | 1 | 整机开关 0/1 |
| `0x02` | `SetBrightness` | 1 | 0-255，按构建期上限钳位 |
| `0x05` | `QueryState` | 0 | ACK 后补 StateReport |
| `0x06` | `SetLedCount` | 3 | 1-100，异步重建句柄，ACK 可能延迟 |
| `0x07` | `SelfTest` | 0 | 红→绿→蓝→白各 500ms |
| `0x1B` | `SetStripPower` | 2 | 单链开关 |
| `0x1C` | `QueryStripConfig` | 0 | ACK 后补 StripConfigReport |
| `0x1D` | `QueryDeviceInfo` | 0 | ACK 后补 DeviceInfoReport |
| `0x20` | `LayoutWrite` | 2 | 声明部位数并清空该链 |
| `0x21` | `LayoutPart` | 29 | 部位头，name 固定 24 字节 |
| `0x22` | `LayoutSeg` | 5 | 闭区间灯珠段 |
| `0x23` | `LayoutCommit` | 0 | 整份校验并立即落盘 |
| `0x24` | `QueryLayout` | 1 | 逐部位报告 + LayoutListEnd |
| `0x25` | `ScenePart` | 6 | step_count 变化才清空步骤 |
| `0x26` | `SceneStep` | 24 | 单步增量写入 |
| `0x27` | `SceneName` | 26 | name 固定 24 字节 |
| `0x28` | `ActivateScene` | 1 | 硬切 + 全部播放头重置到第 1 步 |
| `0x29` | `QueryScene` | 1 | 逐部位、逐步骤报告 + SceneListEnd |
<!-- /GENERATED:commands -->

## 6. 报告

<!-- GENERATED:reports -->
| 码 | 名称 | 载荷字节 | 说明 |
|---|---|---:|---|
| `0x80` | `ACK` | 2 | seq 回显 |
| `0x81` | `Event` | 2 | seq 恒 0 |
| `0x82` | `StateReport` | 32 | 同 State 布局 |
| `0x87` | `StripConfigReport` | 24 | 8 × [strip_id, gpio, flags] |
| `0x88` | `DeviceInfoReport` | 15 | 版本 / hw_id / 各上限 / caps |
| `0x89` | `LayoutReport` | 45 | 单部位明细 |
| `0x8A` | `LayoutListEnd` | 2 | 多帧收尾 |
| `0x8B` | `ScenePartReport` | 6 | 同 ScenePart 载荷 |
| `0x8C` | `SceneStepReport` | 24 | 同 SceneStep 载荷 |
| `0x8D` | `SceneListEnd` | 26 | 多帧收尾，带场景名 |
<!-- /GENERATED:reports -->

## 7. 层

定宽 **9 字节**：`type(1) | param[7] | level(1)`。`level` 0–100 是本层母亮度，0 = 不出光。

<!-- GENERATED:effects -->
| type | 名称 | param[0..6] | 说明 |
|---|---|---|---|
| `0x00` | 静态 | hue / sat / 0 / 0 / 0 | 常亮 |
| `0x01` | 呼吸 | hue / sat / period_ms / floor_pct / wave_flags | 波形 bit1-2 |
| `0x02` | 彩虹 | hue / sat / period_ms / span / reverse_flag | 方向 bit0 |
| `0x03` | 流星 | hue / sat / period_ms / tail / comet_flags | 方向 / 实色 / 头数 |
| `0x04` | 爆闪 | hue / sat / period_ms / duty / 0 | flags 必须 0 |
| `0x05` | 心跳 | hue / sat / period_ms / pulse / double_flag | 双脉冲 bit0 |
| `0x06` | 熄灭 | 0 / 0 / 0 / 0 / 0 | 永不发光 |
| `0x07` | 随机闪烁 | hue / sat / period_ms / density / 0 | flags 必须 0 |
| `0xFF` | 空层 | 0 / 0 / 0 / 0 / 0 | 只能作叠加层 |
<!-- /GENERATED:effects -->

两层叠加规则：空层 → 覆盖；非空 → 按 `level` 相加合成。

## 8. 状态（32 字节）

```
0      power
1      brightness（已按 max_brightness 钳位）
2      max_brightness
3      strip_count
4      strip_power_mask
5      active_scene
6      layout_valid
7      reserved = 0
8..23  led_count[8]  (u16 LE)
24..31 part_count[8]
```

State 不含部位开关、播放位置、颜色摘要；明细走 `QueryLayout` / `QueryScene`。

## 9. 持久化

| 键 | 格式 | 大小 | 落盘 |
|---|---|---|---|
| `state` | `'LMEN'` + version 1 | 32 B | 变更后 500ms 防抖 |
| `layout` | `'LML1'` + version 1 | 4096 B 上限 | `LayoutCommit` 后立即 |
| `scene0/1/2` | `'LMS1'` + version 1 | 12288 B 上限 | 2 秒防抖 |

坏 blob 整份拒绝，设备回默认值。写失败异步上报 `Event 0x81`，ACK 已先发出。

## 10. 结果码

<!-- GENERATED:resultCodes -->
`0x00` OK / `0x01` InvalidParam / `0x02` UnknownCommand / `0x03` BadChecksum / `0x04` BadLength / `0x05` Busy / `0x06` StorageFailed / `0x07` UnsupportedVersion / `0x08` BadMagic / `0x09` InternalError
<!-- /GENERATED:resultCodes -->

校验顺序固定：命令字（`0x02`）→ 载荷长度（`0x04`）→ 载荷取值（`0x01`）。

## 11. seq

每条命令带自己的 seq（0–255 循环），ACK 回显。多帧报告共用同一个 seq，以 `LayoutListEnd` / `SceneListEnd` 收尾。`Event` 的 seq 恒 0。小程序一次只发一帧、等 ACK 再发下一帧。
