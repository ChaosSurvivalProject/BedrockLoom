# 设计原则冻结 · Render-Intent Bus

`@since 2.1.0` · 目标基线：Minecraft 基岩版**国际版 1.21.130** · 核对日期 2026-11-06

本文件是渲染意图层的**冻结口径**。任何后续扩展若与本文件冲突，以本文件与
[`../docs/01-freeze-definition.md`](../../docs/01-freeze-definition.md) 的冻结定义为准，
并以真实可验证的平台能力为最高优先级。

---

## 1. 设计原则（六条，不可协商）

| # | 原则 | 可判定形式 |
|---|---|---|
| P1 | **用「渲染意图（RenderIntent）」代替「渲染调用」** | 本模块对外只提交四种意图 `hud / texture-push / world-anchor / overlay`；源码中不存在任何游戏内绘制函数。`intent.mjs` 的 `INTENT_TYPES` 冻结为这四项。 |
| P2 | **游戏内只产生数据，不画像素** | `loom.render.*` 全部返回 `CollectorFrame`，字段只含公开状态；`collector/behavior-pack-collector.js` 不写帧缓冲、不调用渲染阶段。`validateFrame` 拒绝任何 `bounds` 非 null、拒绝 `fovDegrees/near/far` 非 null 的帧。 |
| P3 | **外部合成器负责最终像素** | 绘制只发生在 `platform-side` 的 Canvas / WebGL / 窗口；`compositor.drawFrame(drawFn)` 的 `drawFn` 由宿主注入，core 层不接触任何游戏帧缓冲。 |
| P4 | **三层严格分离，不混用证据** | `platform-side / in-game / custom-client` 是证据域，互不替代。`stable` 标签**只允许**出现在 `platform-side`（`auditCapabilityTable` 硬校验）。 |
| P5 | **不可读字段不伪造** | FOV、near、far、实体包围盒、视锥官方无公开读取接口 → 恒为 `null` / `Unavailable`；用猜测值填充一律返回 `denied`（`E_RI_CAM_UNREADABLE`、`E_RI_FRAME_BOUNDS`）。 |
| P6 | **不用含糊措辞代替证据** | 不写「理论上 / 未来可能 / 应该可以 / 类似 Java 版 / 后续引擎自动实现」；每条能力标注标签、证据级别、审计理由、是否真机验证。 |

**一句话定位**：BedrockLoom 不做「基岩版光影框架」，而是
**「基岩版外部渲染意图总线 + 合规投影层」**。本扩展**不深入渲染管线，只深入渲染意图**。

---

## 2. 三层能力域与证据口径

沿用 v2.0 的 E0–E5 评级，只有 E4 及以上可进入项目 `Stable`：

| 层 | 允许做什么 | 禁止做什么 | 本仓库证据上限 | 允许的项目状态 |
|---|---|---|---|---|
| `platform-side` | 读写本机文件、起 127.0.0.1 回环服务、Canvas/WebGL 绘制、PNG 编解码、生成资源包内容 | 把像素写进游戏帧缓冲、Hook Present、改写游戏资源并绕过校验 | **E4**（自动化往返测试可达） | `Stable`、`BuildTimeOnly` |
| `in-game` | 读 `Player.location` / `getViewDirection()` / `getRotation()`、`Dimension.getEntities()` / `getBlock()`、`World.setDynamicProperty()`；构建期资源定义 | 直连 WS / 写任意文件 / 共享内存；读私有内存；运行时上传纹理 | **E2**（官方文档与示例） | `Experimental`、`PlatformRestricted` |
| `custom-client` | 仅登记接口预留，默认关闭 | 本仓库不实现；不复制/下载/嵌入任何 SDK 或游戏文件 | **E0** | `Unavailable`、`CustomClientOnly` |

> 与 v2.0 一致：`Candidate = 0`。`Candidate` 需要 E3（目标客户端最小工程跑通），
> 本仓库环境无真实 1.21.130 客户端，无法产生该证据。渲染意图层**不新增**任何 E3+ 结论。

---

## 3. 模块标签 → 项目七态（冻结映射）

| 模块标签 | 项目状态 | 证据级别上限 | 硬校验规则 |
|---|---|---|---|
| `stable` | `Stable`；构建期能力为 `BuildTimeOnly` | E4 | 只能出现在 `platform-side`；必须有自动化测试；不得声称游戏内画面效果 |
| `beta` | `Experimental`；仅服务端可用的为 `PlatformRestricted` | E2 | 不得标成项目 `Stable`；必须写明「未经真机验证」 |
| `unsupported` | `Unavailable` | E0（否定）/ E1（仅文档） | 必须有非空审计理由；不得提供可调用实现；不得进入国际版 `Stable` |

代码锚点：

- [`core/capability.mjs`](../core/capability.mjs)：`LABEL_TO_PROJECT_STATUS`、`LABEL_TO_EVIDENCE_CEILING`、`auditCapabilityTable()`。
- [`capability-table.ts`](../capability-table.ts)：TypeScript 侧同一映射 + 32 行权威能力表。
- [`test/render-intent.test.mjs`](../../test/render-intent.test.mjs)：断言两份表 id 集合、标签、状态一致。

七态结果语义直接复用 [`core/result.mjs`](../../core/result.mjs)，**不另起一套**：

```
ok / partial / unsupported / denied / timeout / resource-exhausted / degraded
```

本层的典型用法：`degraded`（FOV 不可读、正交投影非游戏视锥）、`resource-exhausted`
（实体数 / payload 字节超预算）、`denied`（非法槽位、危险 HTML、路径穿越）、
`unsupported`（运行时纹理替换、游戏内直连 WS）、`timeout`（绘制回调超 16ms 预算）。

---

## 4. 硬事实表（1.21.130 国际版，不得回避）

| # | 事实 | 证据 | 对设计的影响 |
|---|---|---|---|
| H1 | 官方没有「渲染管线直连接口」，无 `render()` / `drawTriangle()` / `present()` | 官方 Script API 模块清单（[`../../docs/06-international-capability.md`](../../docs/06-international-capability.md) S1–S10） | 所有几何/渲染层/后处理/帧呈现能力一律 `Unavailable` |
| H2 | `@minecraft/server-graphics` 在 1.21.130 新增，但**当前仅** Vibrant Visuals 大气散射参数 | 1.21.130 官方 changelog | 它是**设置级参数**，不是帧阶段回调；不构成本层的渲染介入能力 |
| H3 | 客户端 Script API **没有** WebSocket / 任意文件写入 / localhost 网络访问 | 官方 `@minecraft/server` 模块能力范围 | 「游戏内每 10 tick 直连本地 WS」在单人客户端**不成立**；必须由平台侧桥接 |
| H4 | 可读：`Player.location`、`getViewDirection()`、`getRotation()`、`Dimension.getEntities()`、`getBlock()`、`World.setDynamicProperty()` | 官方 Script API 文档（E2） | 采集契约只使用这些公开接口 |
| H5 | 不可读：FOV、near、far、实体包围盒、视锥 | 同上，无对应公开接口 | 恒为 `null` / `Unavailable`；`playerView()` 判 `Unavailable`（E0） |
| H6 | 无运行时纹理上传 / 材质替换接口 | 同上 | `runtimeTextureSwap`、`writeMaterialBin` 判 `Unavailable`；`bindTexture` 只能 `BuildTimeOnly` |
| H7 | `@minecraft/server-net` 属 **BDS 服务端**模块 | 官方文档标注 | `bus.bds-http` 只能 `PlatformRestricted`，不适用于国际版客户端单人模式 |
| H8 | Deferred Technical Preview / Vibrant Visuals 的 PBR、点光源、体积雾、色调映射、SSR 是**实验性资源包配置**，非公开 Script API | 官方实验功能说明 | 全部标 `beta`，`runtimeEffect=false`，需实验开关且**不承诺跨设备**；不得用粒子假光冒充场景光照 |

> 禁止把 Java 版、网易中国版、26.x 版本或第三方「as of v26.30」平台差异表用于 1.21.130 结论。

---

## 5. 不可协商的合规边界

沿用原始验收硬门槛，本层逐条核对：

| 门槛 | 本层处理 |
|---|---|
| 修改 / 注入游戏二进制 | 不出现；静态负向扫描覆盖 |
| 读取私有内存 / 固定偏移 | 不出现；`bridge.private-memory` 明确登记 `Unavailable` |
| Hook 未公开函数 | 不出现；`compositor.injectPresent`、`FramePresent` 注入明确 `Unavailable` |
| 绕过签名 / 沙箱 / 资源校验 / 审核 | 不出现；`bindTexture` 只生成公开资源包格式文件 |
| 依赖某版本偶然行为 | 不依赖；所有字段走校验器，超预算显式报错 |
| 无法自动测试且无可重复人工证据 | `beta` 项全部给出 `../../docs/13-testing-and-budgets.md` 的 S1–S8 人工验收步骤与 `acceptanceRecord.yaml` 字段 |
| 只在 Java / 网易存在却写成国际版支持 | 不出现；H3/H7 已排除 |

---

## 6. 与 v2.0 冻结口径的兼容性声明

1. **零覆盖**：`../../mod`（40 文件）、`../../core`、`../../services`、`../../contracts`、
   `../../docs/00–17` 全部字节级不改；本层只新增文件。
2. **`Stable 20` 不变**：本层 `stable` 是模块内标签，**不新增**任何号称「游戏内渲染介入」的
   项目 `Stable` 接口。v2.0 的 API 状态总表（[`../../docs/03-api-status-table.md`](../../docs/03-api-status-table.md)）继续有效。
3. **阶段合同不变**：[`../../docs/04-render-stage-contract.md`](../../docs/04-render-stage-contract.md) 的十阶段结论不变；
   本层新增的 `ResourceBuild` 介入点是**平台侧生成公开资源包文件**，仍是「间接影响」，
   不升级为「直接控制」。
4. **版本化**：本层整体 `@since 2.1.0`；无 `@deprecated`，无旧接口适配器需求（纯新增）。
5. **证据不混用**：平台侧 E4 测试**不用于**证明任何游戏内画面结果；画面侧仍为 E1/E2 / 未验证。

---

## 7. 本层明确「未验证」（不冒充完成）

- 真实 1.21.130 客户端上 `collector/behavior-pack-collector.js` 是否能稳定写入并读出 dynamic property、其确切容量上限。
- `World.setDynamicProperty` → 平台侧桥接 → 总线 的端到端时延与丢帧率。
- BDS `@minecraft/server-net` 转发链路（`bus.bds-http`）在 1.21.130 的实际可用性。
- 公告板实体、Deferred / Vibrant Visuals 资源参数在游戏内的**画面结果**、实验开关要求、Realms / BDS 限制、跨设备一致性。
- 所有视觉黄金测试、帧时间 / 内存 / 对象数贡献度。

补齐路径见 [`../../docs/13-testing-and-budgets.md`](../../docs/13-testing-and-budgets.md)。补齐后按
[`../../docs/01-freeze-definition.md`](../../docs/01-freeze-definition.md) §1.1 重新评级，**无需改动代码结构**。
