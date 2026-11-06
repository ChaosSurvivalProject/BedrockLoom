# v2.1.0 补充说明 · 渲染意图层（Render-Intent Bus）

`@since 2.1.0` · 对 `docs/00–17` 的**补充**，不是修订 · 基线仍为 Minecraft 基岩版国际版 **1.21.130**

> **本扩展不深入渲染管线，只深入渲染意图。**

## 1. 本次扩展是什么

用户定调：基岩版 1.21.130 官方**没有**「渲染管线直连接口」。想扩展表现能力，不能假装有
`render.drawTriangle()`。因此 v2.1.0 新增一层**渲染意图抽象 + 外部合成**：

```
游戏内（in-game）只采状态 → 平台侧桥接 → 意图总线（file/SSE/WS, 127.0.0.1）
→ 外部合成器（Canvas/WebGL/透明窗口）出像素 → 可选：构建期回写资源包纹理
```

它**不是**光影框架、**不是** RenderDragon 接管层、**不是**自定义 Shader 平台。
完整设计见 [`render-intent/docs/00-design-freeze.md`](../render-intent/docs/00-design-freeze.md)，
能力审计表见 [`render-intent/docs/14-render-intent.md`](../render-intent/docs/14-render-intent.md)。

## 2. 对既有文档的六条明确补充（不改变原结论）

| # | 主文档 | 补充内容 | 原结论是否改变 |
|---|---|---|---|
| 1 | `docs/04-render-stage-contract.md` | 新增的 `ResourceBuild` 介入点是「**平台侧生成公开资源包文件**（PNG + `texture_list.json`）」，等级仍为**间接影响**；不升级为「直接控制」 | **不变**：十阶段逐阶段标注、EC-001～EC-004 证据卡全部有效 |
| 2 | `docs/03-api-status-table.md` | v2.0 的 `Stable 20 / Candidate 0 / Experimental 20 / BuildTimeOnly 6 / PlatformRestricted 2 / CustomClientOnly 2 / Unavailable 14` **一个都不变**。本层 `stable` 是**模块内标签**（`stable/beta/unsupported`），单独登记在 `render-intent/capability-table.ts`，**不并入** `docs/03` | **不变** |
| 3 | `docs/06-international-capability.md` | `@minecraft/server-graphics` 仍**只**覆盖 Vibrant Visuals 大气散射参数；Deferred Technical Preview / PBR / 点光源 / 体积雾 / 色调映射 / SSR 是**实验性资源包配置**，`beta`、`runtimeEffect=false`、需实验开关、不承诺跨设备 | **不变** |
| 4 | `docs/17-final-answer.md` | 「哪些 API 真正介入渲染」的最终回答不变：最深到 L2/L3（提交请求与引擎参数设置），全部间接影响；本层新增的 `platform-side` 合成**不属于游戏内渲染介入** | **不变** |
| 5 | `docs/01-freeze-definition.md` | 七态结果语义直接复用 `core/result.mjs`，不另起一套；`Candidate = 0` 仍成立（E3 需真机最小工程，本仓库无该证据） | **不变** |
| 6 | `docs/13-testing-and-budgets.md` | 新增 `render-intent` 的自动化测试与演示页执行验证；画面侧仍未验证，补齐仍走 S1–S8 探针与视觉黄金测试 | **不变** |

## 3. 必须写清的三条硬事实（容易被包装成夸大结论）

1. **客户端 Script API 没有 WebSocket / 任意文件写入 / localhost 网络访问能力。**
   所以「游戏内脚本每 10 tick 直连本地 WS」在国际版单人客户端上**不成立**。
   真实链路是 `collector/behavior-pack-collector.js` 用 `World.setDynamicProperty()` 写出，
   再由**平台侧桥接器**送入总线。该链路在 1.21.130 客户端上**未经真机验证**。
2. **FOV、near、far、实体包围盒、视锥官方无公开读取接口。**
   采集帧里恒为 `null` / `Unavailable`；用猜测值填充会被 `validateFrame` 判 `denied`。
   `projectMinimap` 是 2D **正交投影**，明确标注「不是游戏视锥」，返回 `degraded`。
3. **演示数据是合成数据。** `demo/serve.mjs` 与 `demo/overlay.html` 默认播放
   `source: "synthetic-demo"` 的合成帧，**不是真机采集**。页面顶部固定展示边界声明，
   不得在文档或截图中包装成游戏内画面。

**「不联网」定义**：不访问任何外部域名或公网地址。`127.0.0.1` 回环是本机进程间通道，
与「离线可用」不冲突；`overlay.html` 不启动任何服务也能播放内置演示。

## 4. 能力标签映射（模块内 → 项目七态）

| 模块标签 | 项目状态 | 证据上限 | 硬规则 |
|---|---|---|---|
| `stable` | `Stable` / `BuildTimeOnly` | E4 | 只能 `platform-side`；必须有自动化测试 |
| `beta` | `Experimental` / `PlatformRestricted` | E2 | 不得标项目 `Stable`；写明未经真机验证 |
| `unsupported` | `Unavailable` | E0/E1 | 必须有审计理由；不提供可调用实现 |

能力表 32 行：`stable 13 / beta 10 / unsupported 9`。
其中 `RI-I05`、`RI-C04`、`RI-C05`、`RI-CP05`、`RI-CP06`、`RI-P04`、`RI-P05` 等明确为
`Unavailable`（E0），对应「直接画三角形 / 视锥 / 游戏内直连 / FramePresent 注入 /
帧缓冲读取 / 运行时纹理替换 / 改写 material.bin」。

## 5. 版本化与零覆盖

- **纯新增**：`render-intent/`（契约 6 个 `.ts`、core 3 个 `.mjs`、runtime 2 个 `.mjs`、
  采集脚本、演示页、示例数据、2 份文档、README）、`docs/18-render-intent.md`、
  `test/render-intent.test.mjs`。
- **零覆盖**：`../mod` 40 个既有文件、`core/`、`services/`、`contracts/`、
  `schemas/`、`manager/`、`docs/00–17`、`EVIDENCE.md` 生成逻辑均不改动语义；
  `contracts/tsconfig.json` 仅**追加** include 项。
- **无破坏性变更**：不需要 `@deprecated`、不需要旧接口适配器、不需要迁移脚本。
  本层整体 `@since 2.1.0`。
- **交付状态**：18 项原始交付物仍为 18/18；本层是第 19 项**附加扩展**，不重编号。

## 6. 可运行入口与证据

```bash
cd /workspace/loom-v2
# 单文件离线演示（直接双击，无需服务）
#   render-intent/demo/overlay.html
# 本机实时总线
node render-intent/demo/serve.mjs
# 全量测试与证据
node --test test/
node test/run-evidence.mjs
```

`test/render-intent.test.mjs` 覆盖：意图/帧校验、危险内容拒绝、不可读字段拒绝、
能力表双表一致性、文件/SSE/WS 总线往返、合成器投影与批量化、资源包构建期绑定、
演示页内联脚本实际执行、静态负向扫描（无注入/Hook 实现、无外部 CDN/fetch）。

## 7. 仍未验证（沿用原口径，不冒充完成）

真机 1.21.130 的 dynamic property 容量与端到端时延、BDS `@minecraft/server-net` 转发、
公告板实体与 Deferred / Vibrant Visuals 资源的画面结果、实验开关与 Realms/BDS 限制、
各设备一致性、视觉黄金测试、帧时间/内存/对象数贡献度、游戏内 E3/E4/E5 证据。
补齐路径见 [`docs/13-testing-and-budgets.md`](13-testing-and-budgets.md)，补齐后按
[`docs/01-freeze-definition.md`](01-freeze-definition.md) §1.1 重新评级，**无需改动代码结构**。
