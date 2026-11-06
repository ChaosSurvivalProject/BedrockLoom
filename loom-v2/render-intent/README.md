# BedrockLoom v2.1.0 · Render-Intent Bus（渲染意图总线）

> **本扩展不深入渲染管线，只深入渲染意图。**
> 基岩版国际版 1.21.130 官方没有「渲染管线直连接口」。想扩展表现能力，不能假装有
> `render.drawTriangle()`；本模块只做一层**渲染意图抽象 + 外部合成**。

## 定调（先说不能做什么）

| 结论 | 说明 |
|---|---|
| 不碰 RenderDragon | 不修改 / 注入 / 重打包游戏二进制；不读私有内存、不依赖固定偏移、不 Hook 未公开函数 |
| 不声明游戏内绘制接口 | 没有 `render()`、`drawTriangle()`、`present()`、`setMaterial()`、`setRenderLayer()`，这些名字只作为**禁止声明的常量**出现在类型里 |
| 游戏内只产生数据 | `loom.render.*` 采集公开 Script API 状态 → 经平台侧桥接 → 意图总线 → 外部合成器出像素 |
| 外部合成器负责像素 | 浏览器 Canvas / WebGL / 透明窗口 / 第二屏，全部是**平台侧**画面，不是游戏帧缓冲 |
| 运行时动态纹理不可用 | `loom.pack.bindTexture` 只做**构建期**资源包生成；运行期替换已加载纹理一律 `Unavailable` |

**「不联网」的定义**：不访问任何外部域名或公网地址。`127.0.0.1` 回环是本机进程间通道，
与「离线可用」不冲突；`demo/overlay.html` 不启动任何服务也能播放内置合成演示。

## 三层能力域

| 层 | 含义 | 本仓库可达证据级别 | 对应项目状态 |
|---|---|---|---|
| `platform-side` | 外部进程 / 网页 / 透明窗口，可自由绘制自己的像素 | **E4**（自动化往返测试） | `Stable` / `BuildTimeOnly` |
| `in-game` | 只能通过 Script API + 资源包 + UI + 实体投影**产生数据或构建期资源** | **E2 上限**（官方文档 / 示例） | `Experimental` / `PlatformRestricted` |
| `custom-client` | 需正式授权的定制客户端；本仓库**不实现、默认关闭** | **E0** | `Unavailable` / `CustomClientOnly` |

## 模块标签 → 项目七态

本扩展内部用 `stable / beta / unsupported` 三个轻量标签（用户提示词要求），映射到
[`docs/01-freeze-definition.md`](../docs/01-freeze-definition.md) 冻结的七态：

| 模块标签 | 项目状态 | 证据级别上限 | 硬规则 |
|---|---|---|---|
| `stable` | `Stable`（或构建期 `BuildTimeOnly`） | E4 | **只能出现在 `platform-side`**；必须有自动化测试 |
| `beta` | `Experimental` / `PlatformRestricted` | E2 | **不得**标成项目 `Stable`；真机未验证必须写明 |
| `unsupported` | `Unavailable` | E0/E1 | 必须有非空审计理由；不得提供可调用实现 |

映射由 [`core/capability.mjs`](core/capability.mjs) 的 `LABEL_TO_PROJECT_STATUS` /
`LABEL_TO_EVIDENCE_CEILING` 与 [`capability-table.ts`](capability-table.ts) 双向冻结，
并由 `test/render-intent.test.mjs` 断言一致。

## 目录结构

```
render-intent/
├── README.md                       本文件
├── intent-types.ts                 类型冻结：七态结果、RenderIntent 联合、CameraFrame/
│                                   EntityBrief/ChunkSample、禁止接口常量
├── collector.ts                    loom.render.* 采集契约（只产生数据）
├── bus.ts                          文件 / SSE / WS 三条链路 + 平台侧桥接输入契约
├── compositor-api.ts               外部合成器契约（Canvas / overlay / 投影 / PNG）
├── pack-bridge.ts                  loom.pack.* 资源包投影契约（构建期）
├── capability-table.ts             32 行能力审计表（权威汇总）
├── core/                           【纯逻辑，无 node:*，浏览器可运行】
│   ├── intent.mjs                  意图 / 帧构造、校验、序列化、批量化
│   ├── capability.mjs              可运行能力表 + 表级自检
│   └── compositor.mjs              合成器状态机、批量绘制、2D 正交投影
├── runtime/                        【Node 侧，零第三方依赖】
│   ├── bus.mjs                     RFC6455 WS + SSE + 文件管道 + /intent POST
│   └── pack-bridge.mjs             构建期 PNG 绑定、公告板/光照资源定义
├── collector/behavior-pack-collector.js   行为包采集脚本（beta，未经真机验证）
├── demo/
│   ├── serve.mjs                   一键启动本机总线（仅绑定 127.0.0.1）
│   ├── overlay.html                单文件离线演示（WS→SSE→内置演示三级降级）
│   └── sample-intents.jsonl        5 条可导入的示例信封
├── docs/
│   ├── 00-design-freeze.md         设计原则冻结、硬事实表、证据口径
│   └── 14-render-intent.md         能力审计表 / 边界表 / 链路图 / 补充说明
└── test/                           （见 ../test/render-intent.test.mjs）
```

## 快速开始（零依赖，Node ≥ 22）

```bash
cd /workspace/loom-v2

# 1) 直接双击打开（无需任何服务，播放内置合成演示）
#    render-intent/demo/overlay.html

# 2) 启动本机实时总线，再刷新页面（自动优先连 WS）
node render-intent/demo/serve.mjs            # http://127.0.0.1:8787
# 自定义端口：node render-intent/demo/serve.mjs --port=9000
# 不注入演示帧：node render-intent/demo/serve.mjs --no-demo

# 3) 运行全部自动化测试与证据
node --test test/
node test/run-evidence.mjs
```

总线端点（均仅允许本机回环 Host）：`/health`、`/capabilities`、`/intents.jsonl`、
`/events`（SSE）、`/`（WS upgrade）、`/intent`（POST，供 BDS HTTP 桥接 / 本地工具）。

> **演示数据不是真机数据**：`serve.mjs` 与 `overlay.html` 默认注入的是 `synthetic-demo` 合成帧。
> 真机链路需由 `collector/behavior-pack-collector.js` 采集、经平台侧桥接器送入总线，
> 该链路在 1.21.130 客户端上**未经真机验证**，见 [`docs/14-render-intent.md`](docs/14-render-intent.md) §7。

## 与 v2.0 的关系

- **零覆盖**：`../mod` 40 个既有文件、`../core`、`../services`、`../contracts`、
  `../docs/00–17` 全部不改；本扩展只**新增** `render-intent/` 与 `docs/18-render-intent.md`。
- **口径不变**：v2.0 的 `Stable 20` 一个都不变，本扩展的 `stable` 是**模块内标签**，
  不冒充「游戏内渲染 API 进入 Stable」。见 [`../docs/18-render-intent.md`](../docs/18-render-intent.md)。
- **版本标记**：本模块整体 `@since 2.1.0`；变更只增不删，无 `@deprecated`。
