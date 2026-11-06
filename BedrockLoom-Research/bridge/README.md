# bridge · 本机 WS bridge 意图协议

> 本目录定义**平台侧 ↔ 游戏内**之间的意图信封形状与校验，**不提供任何游戏内直连实现**。

## 1. 必须先说清的硬事实

**Minecraft 基岩版客户端 Script API 没有 WebSocket 能力，也没有任意文件写入能力。**

因此用户目标里「游戏内 BP 框架 → 本机 WS bridge」**不能**写成「游戏内脚本直接连 `ws://127.0.0.1`」。主项目 v2.1 已把这当作硬事实记录（`../loom-v2/render-intent/docs/00-design-freeze.md`），本研究沿用，不倒退。

可行的合规链路只能是：

```
游戏内 Script API 采状态（B）
   ├─ 方案 1：写出到平台侧可读的渠道（需作者本机桥接，未经真机验证）
   ├─ 方案 2：BDS 侧 @minecraft/server-net 转发（可选模块，非单人必需）
   └─ 方案 3：外部采集器/调试通道（本机私有研究）
                    ▼
[C 平台侧] 本机 WS / 文件管道（仅 127.0.0.1）→ 外部合成器
```

**所有跨进程方案都标注「未经真机验证」**；本仓库只实现平台侧的信封校验，不声称游戏内已连通。

## 2. 协议内容

| 项 | 值 |
| --- | --- |
| 传输 | 本机 WS / SSE / 文件管道（由主项目 `render-intent/runtime/bus.mjs` 提供，仅 127.0.0.1） |
| 编码 | UTF-8 JSON，一行一个信封（JSONL） |
| 意图种类 | `hud` / `world-anchor` / `texture-push` / `overlay` / `camera-frame` / `entity-frame` |
| 结果语义 | 七态 `ok / partial / unsupported / denied / timeout / resource-exhausted / degraded` |
| 上限 | 单信封 `256 KiB`；超限 `resource-exhausted` |
| 内容安全 | 拒绝 `<script`、`javascript:`、`on*=` 等危险 HTML 片段（`denied`） |
| 不承载 | 不传令牌、不传账号、不传多人权威操作、不传任何游戏资源样本 |

`bridge/protocol.mjs` 提供 `makeEnvelope()` / `validateEnvelope()` / `toWire()` / `fromWire()`，纯逻辑、可测，不依赖 `node:*`。

## 3. 三层归属

| 部分 | 层 |
| --- | --- |
| 信封定义与校验、平台侧总线 | C（可公开仓库层） |
| 游戏内采集脚本 | B（合规层，[`../ingame/`](../ingame/README.md)） |
| 「游戏内直连 WS」这一说法 | **不成立**，明确否定 |
| 任何进程内转发/注入 | A 层，**不实现** |

## 4. 相关

- [`../ingame/ws-bridge-protocol.js`](../ingame/ws-bridge-protocol.js)：游戏内协议常量与否定声明
- 主项目已验证实现：`../loom-v2/render-intent/runtime/bus.mjs`
- [docs/07 研究笔记](../docs/07-research-notes.md)
