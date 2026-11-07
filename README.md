# ble-light

微信小程序通过 BLE 直连控制 ESP32-C3FH4 驱动的 WS2812B 灯带。手机 ↔ 设备直连，无云控链路。

## 状态

产品代码尚未开始。当前在把领域模型与协议钉死，见 [`docs/status.md`](docs/status.md)。

## 目录

```
ble-light/
  firmware/       ESP-IDF v6.1 + NimBLE（待建）
  miniprogram/    微信小程序原生 + TypeScript（待建）
  docs/           协议、状态、测试、验收、ADR
  scripts/        生成器与探针
  panel/          项目管理面板（Vue 3）
```

## 文档地图

| 想知道 | 去哪 |
|---|---|
| 当前进度、下一步、禁做 | [`docs/status.md`](docs/status.md) |
| 协议字节、命令码、状态布局 | [`docs/protocol.md`](docs/protocol.md) |
| 领域术语与不变量 | [`GLOSSARY.md`](GLOSSARY.md) |
| 测什么、在哪测 | [`docs/testing.md`](docs/testing.md) |
| 验收项与证据 | [`docs/acceptance.md`](docs/acceptance.md) |
| 为什么这么定 | [`docs/adr/`](docs/adr/) |
| 每个文件干什么 | `npm run panel` |

## 项目管理面板

```bash
npm run setup     # 装面板依赖（一次）
npm run map       # 扫描仓库，生成 docs/map.generated.json
npm run panel     # 打开 http://localhost:5180
```

面板显示每次迭代改了什么、有哪些文档、哪些测试、哪些文件、它们各自干什么。**全部数据由 `scripts/map.mjs` 扫描生成，不手写。**

## 硬件基线

- ESP32-C3FH4，ESP-IDF v6.1
- 最多 8 条灯链，每条 1–100 颗 WS2812B，通道顺序 GRB，数据脚 GPIO3
- **灯带必须独立 5V 供电，只与开发板共地**
- 3.3V 直驱 5V 灯带不达标（VIH=3.5V），74AHCT125 必须在 BOM 里
- 电流预算按亮度上限 200 算：64 颗满白实测约 3.8A，折算到 200 约 3.0A
