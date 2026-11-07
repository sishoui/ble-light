---
purpose: 协议契约。字节布局的唯一权威，文件名永不带版本号。
status: 草案
version: 1
---

# 协议

> 唯一真相。改任何字节 = 本文件 + `docs/protocol-vectors.json` + 两端实现同一个 commit。
> 历史版本见 git log，不保留 `protocol-v*.md`。

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

| 常量 | 值 | 常量 | 值 |
|---|---:|---|---:|
| 灯珠 / 链 | 100 | 步骤 / 部位 | 8 |
| 链 | 8 | 层 / 步 | 2 |
| 部位 / 链 | 8 | 场景 | 3 |
| 段 / 部位 | 8 | 名称字节 | 24 |
| 步长 | 100–60000 ms | 亮度上限 | 200（构建期） |

## 5. 命令

| 码 | 名称 | 载荷 | 说明 |
|---|---|---|---|
| `0x01` | `SetPower` | 1 | 整机开关 |
| `0x02` | `SetBrightness` | 1 | 0–255，按构建期上限钳位 |
| `0x05` | `QueryState` | 0 | ACK 后补 `StateReport` |
| `0x06` | `SetLedCount` | 3 | `strip_id, count_lo, count_hi` |
| `0x07` | `SelfTest` | 0 | 红→绿→蓝→白各 500ms |
| `0x1B` | `SetStripPower` | 2 | `strip_id, on` |
| `0x1C` | `QueryStripConfig` | 0 | ACK 后补 `StripConfigReport` |
| `0x1D` | `QueryDeviceInfo` | 0 | ACK 后补 `DeviceInfoReport` |
| `0x20` | `LayoutWrite` | 2 | `strip_id, part_count`，清空该链部位 |
| `0x21` | `LayoutPart` | 29 | `strip_id, part_id, name_len, name[24], seg_count, phase` |
| `0x22` | `LayoutSeg` | 5 | `strip_id, part_id, seg_id, start, end` |
| `0x23` | `LayoutCommit` | 0 | 整份校验并立即落盘 |
| `0x24` | `QueryLayout` | 1 | 逐部位报告 + `LayoutListEnd` |
| `0x25` | `ScenePart` | 6 | `scene_id, strip_id, part_id, step_count, loop, on` |
| `0x26` | `SceneStep` | 24 | `scene_id, strip_id, part_id, step_index, duration(u16), layer0[9], layer1[9]` |
| `0x27` | `SceneName` | 26 | `scene_id, name_len, name[24]` |
| `0x28` | `ActivateScene` | 1 | 硬切 + 全部部位播放头重置到第 1 步 |
| `0x29` | `QueryScene` | 1 | 逐部位、逐步骤报告 + `SceneListEnd` |

**退役码永不复用。** 收到未定义命令一律回 `0x02 UnknownCommand`。

## 6. 报告

| 码 | 名称 | 载荷 |
|---|---|---|
| `0x80` | `ACK` | 2：`[原命令字, 结果码]`，seq 回显 |
| `0x81` | `Event` | 2：`[event_code, detail]`，seq 恒 0 |
| `0x82` | `StateReport` | 32 |
| `0x87` | `StripConfigReport` | 24：8 × `[strip_id, gpio, flags]` |
| `0x88` | `DeviceInfoReport` | 15 |
| `0x89` | `LayoutReport` | 45 |
| `0x8A` | `LayoutListEnd` | 2：`[strip_id, part_mask]` |
| `0x8B` | `ScenePartReport` | 6 |
| `0x8C` | `SceneStepReport` | 24 |
| `0x8D` | `SceneListEnd` | 26：`[scene_id, name_len, name[24]]` |

## 7. 层

定宽 **9 字节**：`type(1) | param[7] | level(1)`。`level` 0–100 是本层母亮度，0 = 不出光。

| type | 名称 | param[0..1] | param[2..3] | param[4] | param[5] | param[6] |
|---|---|---|---|---|---|---|
| `0x00` | 静态 | hue | sat | 0 | 0 | 0 |
| `0x01` | 呼吸 | hue | sat | period_ms | 最低亮 % | 波形 flags |
| `0x02` | 彩虹 | hue | sat | period_ms | span | 方向 flags |
| `0x03` | 流星 | hue | sat | period_ms | tail | 方向/实色/头数 flags |
| `0x04` | 爆闪 | hue | sat | period_ms | duty | 0 |
| `0x05` | 心跳 | hue | sat | period_ms | pulse | 双脉冲 flag |
| `0x06` | 熄灭 | 0 | 0 | 0 | 0 | 0 |
| `0x07` | 随机闪烁 | hue | sat | period_ms | 同时亮比例 | 0 |
| `0xFF` | 空层 | 0 | 0 | 0 | 0 | 0 |

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

`0x00 OK` / `0x01 InvalidParam` / `0x02 UnknownCommand` / `0x03 BadChecksum` / `0x04 BadLength` / `0x05 Busy` / `0x06 StorageFailed` / `0x07 UnsupportedVersion` / `0x08 BadMagic` / `0x09 InternalError`

校验顺序固定：命令字（`0x02`）→ 载荷长度（`0x04`）→ 载荷取值（`0x01`）。

## 11. seq

每条命令带自己的 seq（0–255 循环），ACK 回显。多帧报告共用同一个 seq，以 `LayoutListEnd` / `SceneListEnd` 收尾。`Event` 的 seq 恒 0。小程序一次只发一帧、等 ACK 再发下一帧。
