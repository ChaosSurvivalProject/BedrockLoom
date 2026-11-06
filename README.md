# Bedrock Loom v2.1.0

**面向 Minecraft 基岩版国际版 1.21.130 的零侵入式模组平台扩展 + 合规渲染意图层。**

> **v2.1.0 定调**：基岩版 1.21.130 官方没有「渲染管线直连接口」。本版本新增
> **Render-Intent Bus（渲染意图总线）**——不假装有 `render.drawTriangle()`，只做
> 「渲染意图抽象 + 外部合成」：游戏内采状态、平台侧出像素。
> **本扩展不深入渲染管线，只深入渲染意图。** 详见 [`loom-v2/render-intent/README.md`](loom-v2/render-intent/README.md)。

本仓库是对既有项目 **Bedrock Loom v1.1** 的审查与扩展，不是从零重写：既有 40 个源文件保持零修改，所有新增内容放在 `loom-v2/`。项目不修改、不破解、不重打包、不注入国际版游戏二进制；不绕过签名、版权保护、平台沙箱或审核；不 Hook 未公开函数、不读私有内存、不依赖固定偏移。

> **一句话结论**：本仓库可兑现的是 **20 个平台侧 `Stable` 接口**（模组包、签名、完整性、依赖、事务、权限、诊断、迁移）；**没有任何一个游戏内渲染接口进入 `Stable`**。国际版 1.21.130 的公开能力中，渲染相关介入最深只到「提交请求」与「设置引擎参数」，且全部属于**间接影响**；当前**没有任何一个渲染阶段可被直接控制**。

---

## 下载（已构建好的生成物）

**最新版 v2.1.0**：

| 文件 | 内容 | 直链 |
| --- | --- | --- |
| `BedrockLoom-v2.1.0-complete.zip` | 完整交付包：既有 `mod/` 基线 + v2.0 全部内容 + **v2.1 渲染意图层**（契约/核心/总线/演示页/文档） | [下载](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.1.0/BedrockLoom-v2.1.0-complete.zip) |
| `BedrockLoom-RenderIntent-overlay.html` | **单文件离线外部合成器演示**：双击即可打开，Canvas 小地图 + 监控屏 + 能力边界表，WS→SSE→内置演示三级降级，无 CDN、无 `fetch` | [下载](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.1.0/BedrockLoom-RenderIntent-overlay.html) |
| `BedrockLoom-v2.1.0-EVIDENCE.md` | 11 文件 / 116 用例 / 116 通过 + `tsc --noEmit` 通过的证据报告 | [下载](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.1.0/BedrockLoom-v2.1.0-EVIDENCE.md) |

历史版本 v2.0.0：[完整包](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.0.0/BedrockLoom-v2.0.0-complete.zip) ·
[离线图形模组管理器](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.0.0/BedrockLoom-ModManager-offline.html) ·
[证据报告](https://github.com/ChaosSurvivalProject/BedrockLoom/releases/download/v2.0.0/BedrockLoom-v2.0.0-EVIDENCE.md)。
全部版本见 [Releases](https://github.com/ChaosSurvivalProject/BedrockLoom/releases)。

---

## 1. 这是什么，不是什么

| 是 | 不是 |
| --- | --- |
| 对既有 v1.1 项目的能力审计与版本化扩展 | Java 版 Fabric / Forge 的基岩版移植 |
| 一套可判定的「可用 API」冻结定义与证据评级 | 渲染管线接管层或自定义 Shader 框架 |
| 产品级离线图形模组管理器的设计与可运行原型 | 网易中国版 SDK 封装或游戏文件分发 |
| 模组包格式 2.0、签名完整性、事务与崩溃恢复 | 外挂、注入器、内存读写工具 |
| 明确写出「做不到什么」的能力清单 | 用「理论上 / 未来可能 / 类似 Java 版」填充的规划文档 |

单人模式**不依赖** PURPUR 或任何外部服务器；网络表现协议是可选模块，离线不可用时不影响本地模组基本功能。

## 2. 基线与不可协商的边界

| 项 | 值 |
| --- | --- |
| 目标客户端 | Minecraft 基岩版**国际版** `1.21.130`（2025-12-09 发布，协议 898） |
| 目标平台 | 国际版公开客户端；不把 Java 版、网易版、26.x 版本证据用于本版本结论 |
| 官方新增能力 | `@minecraft/server-graphics`，**当前仅** Vibrant Visuals 大气散射参数（`BiomeAtmospherics` 的 `setRayleighStrength` / `setSunMieStrength` / `setMoonMieStrength` / `setSkyZenithColor` / `reset*`） |
| 明确否定 | 自定义 Shader、运行时几何/材质提交、帧缓冲后处理、透明排序、RenderLayer、每帧骨骼写入、原生相机 Hook、动态纹理上传、FramePresent 回调 |
| 网易 / 定制客户端 | 只做接口预留：默认关闭，不复制/下载/嵌入 SDK 或游戏文件，国际版构建不含网易代码 |

第三方站点上标注「as of v26.30」的平台差异表**不**作为 1.21.130 的证据。逐条来源见 [`loom-v2/docs/06-international-capability.md`](loom-v2/docs/06-international-capability.md) 的 S1–S10 表。

## 3. 三条核心结论

1. **`Stable` 只有 20 个，且全部是平台侧接口。** 它们不涉及游戏内渲染；`Candidate = 0` 是刻意结论，因为 `Candidate` 需要 E3（目标客户端最小工程跑通），本仓库环境无法产生该证据。
2. **真正介入渲染的只有五处，全部是「间接影响」**：资源定义写入（`ResourceBuild`）、游戏加载资源（`ResourceLoad`）、`Player.spawnParticle` / `playSound` / 事件与只读观察（`SimulationSync`）、`ScreenDisplay.*` 与表单（`UiDraw`）、`@minecraft/server-graphics` 大气散射参数设置（`PostProcess` **之前**的引擎参数，非自定义 pass）。`SceneUpdate` 只能观察；`CullAndSort`、`GeometrySubmit`、`RenderLayer`、自定义后处理、`FramePresent` **不可访问**。
3. **证据分域**：平台侧可达 E4（80/80 自动化测试 + 类型检查 + 真实原子安装 + 负向签名用例）；游戏内画面侧只有 E1/E2 官方文档证据，明确标注**未验证**。调用返回 `ok` 只表示平台侧契约完成，**不等于画面可见**。

## 4. API 状态总表

| 状态 | 数量 | 含义 |
| --- | ---: | --- |
| `Stable` | 20 | 十条冻结条件全部满足 + 证据 ≥ E4，且均为 `platform-side` |
| `Candidate` | 0 | 需 E3（真机最小工程跑通），当前无该证据 |
| `Experimental` | 20 | 仅 E1/E2 文档或官方示例证据 |
| `BuildTimeOnly` | 6 | 仅构建期可用（Schema、迁移、静态扫描） |
| `PlatformRestricted` | 2 | 受平台/发行渠道限制 |
| `CustomClientOnly` | 2 | 仅正式授权的定制客户端可实现 |
| `Unavailable` | 14 | **合格结论**：国际版公开客户端无实现路径，附正式授权路径 |

完整编号与签名见 [`loom-v2/docs/03-api-status-table.md`](loom-v2/docs/03-api-status-table.md)；14 类 API 逐项裁定（接口签名、能力等级、实现路径、每帧成本、成功/失败模式、清理、测试、是否进 Stable）见 [`loom-v2/docs/05-api-adjudication.md`](loom-v2/docs/05-api-adjudication.md)。

## 5. 渲染阶段合同（十阶段速览）

| 阶段 | 国际版 1.21.130 介入等级 | 实际介入点 |
| --- | --- | --- |
| `ResourceBuild` | 间接影响 | 资源包 geometry / attachable / animation / particle / sound 的**构建期静态定义** |
| `ResourceLoad` | 间接影响 | 游戏客户端异步加载、解析、上传资源包 |
| `SimulationSync` | 间接影响 | 公开 Script API 提交：`Player.spawnParticle`、`Player.playSound`、事件与只读观察 |
| `SceneUpdate` | 只能观察 | 无每帧位置/骨骼/可见性写入接口 |
| `CullAndSort` | 不可访问 | 无剔除、距离、透明排序控制 |
| `GeometrySubmit` | 不可访问 | 无运行时顶点/材质提交 |
| `RenderLayer` | 不可访问 | 无渲染层与覆盖关系定义 |
| `PostProcess` | **不可访问**（仅其之前的参数） | `@minecraft/server-graphics` 设置大气散射引擎参数，**不是**自定义全屏 pass |
| `UiDraw` | 间接影响 | `ScreenDisplay.setActionBar` / `setTitle`、表单 UI |
| `FramePresent` | 不可访问 | 无帧呈现回调 |

逐阶段合同与 EC-001～EC-004 证据卡见 [`loom-v2/docs/04-render-stage-contract.md`](loom-v2/docs/04-render-stage-contract.md)。**「资源包里有模型」属于 L1 静态定义，不等于控制渲染管线。**

## 6. 证据与评级

| 级别 | 含义 | 允许的最高状态 |
| --- | --- | --- |
| E0 | 已否定 | `Unavailable` |
| E1 | 仅文档 | `Experimental` |
| E2 | 官方示例 | `Experimental` |
| E3 | 目标客户端最小工程已跑通 | `Candidate` |
| E4 | 自动测试跨版本通过 | `Stable` |
| E5 | 多设备 / 多版本长期通过 | `Stable` |

证据域分 `platform-side` / `in-game` / `custom-client`，互不混用。定义与七态结果语义（`ok / partial / unsupported / denied / timeout / resource-exhausted / degraded`）见 [`loom-v2/docs/01-freeze-definition.md`](loom-v2/docs/01-freeze-definition.md)。

## 7. 仓库结构

```
BedrockLoom/
├── README.md                 本文件：项目介绍、结论、下载与复现
├── LICENSE                   MIT
├── .gitignore
├── mod/                     【既有 v1.1，40 文件，零修改】
│   ├── mod.json
│   ├── behavior_pack/scripts/api/    14 类客户端 API、能力探针、自检
│   ├── platform/international/      国际版适配器
│   ├── platform/netease/            网易适配器（接口预留）
│   ├── resource_pack/               模型 / 材质 / 粒子 / 音效示例
│   └── docs/                        RENDER_AUDIT.md 等既有文档
└── loom-v2/                 【本次新增】
    ├── core/                纯逻辑（无 fs / crypto / process）：SemVer、FSM、
    │                       Resolver、ConfigMerge、Permissions、Validator、Store
    ├── services/           Node 侧：签名、完整性、原子安装、诊断、迁移、示例生成
    ├── contracts/          TypeScript 契约（types.ts / services.ts / tsconfig.json）
    ├── schemas/            4 份 JSON Schema + 校验错误码表
    ├── manager/index.html  离线图形管理器原型（11 个板块，单文件自包含）
    ├── render-intent/      【v2.1.0 新增】渲染意图总线 + 外部合成器
    │   ├── *.ts            6 个 TypeScript 契约（含 32 行能力审计表）
    │   ├── core/           纯逻辑：意图校验 / 能力表 / 合成器投影
    │   ├── runtime/        零依赖本机总线：WS + SSE + 文件管道
    │   ├── collector/      行为包采集脚本（beta，未经真机验证）
    │   ├── demo/           serve.mjs + 单文件 overlay.html + 示例数据
    │   └── docs/           设计冻结 + 能力审计表
    ├── docs/00 ~ 18        18 项交付物 + v2.1 补充说明
    ├── test/               11 个测试文件 / 116 个用例 + 证据生成器
    ├── examples/           由脚本真实生成并复验的示例产物
    └── EVIDENCE.md         自动化证据报告
```

模块边界与 B1–B7 静态检查规则见 [`loom-v2/docs/02-package-structure.md`](loom-v2/docs/02-package-structure.md)。界面层只持有服务契约，**不得直接操作文件系统**。

## 8. 快速开始与复现

要求 **Node.js ≥ 22**（使用 `node:test`、`node:crypto` Ed25519）。无需安装依赖即可运行核心测试；TypeScript 契约检查通过 `npx` 拉取编译器，也可全局安装 `typescript`。

```bash
git clone https://github.com/ChaosSurvivalProject/BedrockLoom.git
cd BedrockLoom/loom-v2

node --test test/                       # 11 文件 / 116 用例 / 116 通过 / 0 失败
node services/migrate-v1-to-v2.mjs      # 只读 ../mod/mod.json，单向生成 v2 manifest
node services/build-example-pack.mjs    # 生成并签名完整示例包
node test/run-evidence.mjs              # 重跑测试 + tsc --noEmit + 刷新 EVIDENCE.md
node render-intent/demo/serve.mjs       # 启动本机意图总线（仅 127.0.0.1）
```

离线图形管理器：直接用浏览器打开 `loom-v2/manager/index.html`，或在 Releases 下载单文件版本；它不发起任何网络请求。
渲染意图层演示：直接用浏览器打开 `loom-v2/render-intent/demo/overlay.html`（**无需启动任何服务**即可播放内置合成演示），
或先运行 `serve.mjs` 让页面自动连本机 WS/SSE 实时源。

**迁移是单向的**：`migrate-v1-to-v2.mjs` 绝不写回 `../mod`。测试中用 SHA-256 断言两个既有基线文件（`mod/mod.json`、`mod/docs/RENDER_AUDIT.md`）保持不变。

## 9. 模组包格式 2.0 与签名

签名**不能只保护 manifest**。信封 `signature.json` 的 `protected` 固定恰好两项：`manifest.json` 与 `META/file-list.json`；文件清单逐文件列出 `files/` 下每个文件的 SHA-256 与字节数。

```
payloadHash = sha256( canonical(manifest) || LF || canonical(file-list) )
signature   = Ed25519_sign(payloadHash)
```

- 新增未列文件 → `E_FILE_UNLISTED`，拒绝安装；
- 替换已列文件 → `E_FILE_HASH_MISMATCH`，拒绝安装；
- 路径穿越、只签 manifest → 拒绝。

负向用例见 `loom-v2/test/signature-integrity.test.mjs`。Schema 与错误码见 [`loom-v2/docs/08-package-format-2.md`](loom-v2/docs/08-package-format-2.md) 与 [`loom-v2/schemas/`](loom-v2/schemas/)。

## 10. 事务与崩溃恢复

```
INIT → PRECHECK → STAGING → BACKUP → COMMIT_PENDING
     → COMMITTED → VERIFY → DONE
```

取消点固定为 `INIT … COMMIT_PENDING`，回滚点为 `BACKUP`；`COMMIT_PENDING` marker 支持关机/崩溃后 `REPLAY_COMMIT` 或 `ROLLBACK_FROM_BACKUP`。覆盖安装、升级、卸载、启用、禁用、依赖修复、资源加载、世界进入/退出、适配器切换十个流程。见 [`loom-v2/docs/09-transactions-and-fsm.md`](loom-v2/docs/09-transactions-and-fsm.md)。

## 11. 18 项交付物索引

| # | 交付物 | 文件 |
| ---: | --- | --- |
| 1 | 对现有文件的影响清单（保留 / 新增 / 弃用 / 迁移） | [`docs/00-impact-and-migration.md`](loom-v2/docs/00-impact-and-migration.md) |
| 2 | 完整包结构与模块边界 | [`docs/02-package-structure.md`](loom-v2/docs/02-package-structure.md) |
| 3 | API 状态总表 | [`docs/03-api-status-table.md`](loom-v2/docs/03-api-status-table.md) |
| 4 | 渲染阶段合同与证据卡 | [`docs/04-render-stage-contract.md`](loom-v2/docs/04-render-stage-contract.md) |
| 5 | 国际版能力矩阵（含「未验证」） | [`docs/06-international-capability.md`](loom-v2/docs/06-international-capability.md) |
| 6 | 管理器信息架构、页面流程与交互状态 | [`docs/07-mod-manager-ia.md`](loom-v2/docs/07-mod-manager-ia.md) |
| 7 | 包格式 / 签名 / 仓库索引 / 事务日志 Schema | [`docs/08-package-format-2.md`](loom-v2/docs/08-package-format-2.md)、[`schemas/`](loom-v2/schemas/) |
| 8 | 依赖、冲突与配置合并算法 | [`docs/11-algorithms.md`](loom-v2/docs/11-algorithms.md) |
| 9 | 权限模型、信任中心与威胁模型 | [`docs/10-sandbox-and-trust.md`](loom-v2/docs/10-sandbox-and-trust.md) |
| 10 | 核心服务 TypeScript 接口与数据类型 | [`contracts/types.ts`](loom-v2/contracts/types.ts)、[`contracts/services.ts`](loom-v2/contracts/services.ts) |
| 11 | 状态机与故障恢复表 | [`docs/09-transactions-and-fsm.md`](loom-v2/docs/09-transactions-and-fsm.md) |
| 12 | 20 个关键用户故事 | [`docs/12-user-stories.md`](loom-v2/docs/12-user-stories.md) |
| 13 | 自动测试 / 真机验收 / 视觉黄金测试清单 | [`docs/13-testing-and-budgets.md`](loom-v2/docs/13-testing-and-budgets.md) |
| 14 | 性能预算 / 低设备降级 / 泄漏检测 | [`docs/13-testing-and-budgets.md`](loom-v2/docs/13-testing-and-budgets.md) |
| 15 | 旧 API 兼容与版本迁移方案 | [`docs/14-version-migration.md`](loom-v2/docs/14-version-migration.md) |
| 16 | v1 明确「不做」清单 | [`docs/15-v1-non-goals.md`](loom-v2/docs/15-v1-non-goals.md) |
| 17 | 可承诺 / 不可承诺能力清单 | [`docs/16-commitments.md`](loom-v2/docs/16-commitments.md) |
| 18 | 最终回答：哪些 API 真正介入渲染 | [`docs/17-final-answer.md`](loom-v2/docs/17-final-answer.md) |

14 类 API 逐项裁定另见 [`docs/05-api-adjudication.md`](loom-v2/docs/05-api-adjudication.md)，冻结定义见 [`docs/01-freeze-definition.md`](loom-v2/docs/01-freeze-definition.md)。

## 12. 仍未验证（未冒充完成）

- 真机 1.21.130 在各设备、各发行平台、各存档方式下的画面结果；
- 视觉黄金测试与容差基线；
- `@minecraft/server-graphics` 实验开关、Realms / BDS 下的行为限制；
- `@minecraft/server` 确切模块版本；
- 游戏内 E3 / E4 / E5 证据。

补齐路径见 [`loom-v2/docs/13-testing-and-budgets.md`](loom-v2/docs/13-testing-and-budgets.md) 的 S1–S8 探针、`acceptanceRecord.yaml` 与人工验收步骤；补齐后按 [`docs/01-freeze-definition.md`](loom-v2/docs/01-freeze-definition.md) §1.1 重新评级，**无需改动代码结构**。

## 13. 安全、隐私与演示密钥

- 不收集遥测，除非获得单独、明确、可撤销的同意；诊断包默认脱敏（聊天、账号、XUID、IP、令牌、坐标、世界名、绝对路径等）。
- 原生扩展默认拒绝；脚本超时、事件超时、同步调用深度、异步取消、故障计数 / 熔断 / 隔离 / 恢复见 [`docs/10-sandbox-and-trust.md`](loom-v2/docs/10-sandbox-and-trust.md)。
- **演示签名私钥不入库**：`loom-v2/examples/demo-private-key.pem` 已加入 `.gitignore`，Release 完整包中同样不含它。运行 `node services/build-example-pack.mjs` 会自动生成新密钥并重新签名示例；验证示例只需 `examples/trust-store.example.json` 中的公钥。该文件**仅用于演示复验，绝不可用于真实发布**。真实发布必须使用离线保管的密钥与撤销列表。
- 仓库中不含任何访问令牌、账号凭据或私有游戏文件。

## 14. v2.1.0 渲染意图层（Render-Intent Bus）

> **本扩展不深入渲染管线，只深入渲染意图。**

### 为什么这样设计

1.21.130 国际版官方**没有**渲染管线直连接口。想扩展表现能力，不能假装有 `render.drawTriangle()`。
v2.1.0 只做三件事：**游戏内采状态 → 平台侧本地总线 → 外部合成器出像素**。

```
[游戏内 in-game / beta]                [平台侧 platform-side / stable]
Script API 只读采集  ──数据写出──▶  桥接器 → bus(file/SSE/WS, 127.0.0.1)
（camera/entities/chunk）  （非实时）  → 外部合成器 Canvas/WebGL/透明窗口
   ❌ 无 WS / 无文件写入              → 小地图 / HUD / 监控屏（本页像素）
   ❌ 无 FOV / 包围盒 / 视锥          → 可选 loom.pack.bindTexture（仅构建期）
[custom-client] 默认关闭，不实现；injectPresent / 帧缓冲读取 = Unavailable
```

### 三条硬事实（不回避）

| # | 事实 | 结论 |
| --- | --- | --- |
| 1 | 客户端 Script API 无 WebSocket / 任意文件写入 / localhost 网络访问 | 「游戏内每 10 tick 直连本地 WS」在单人客户端**不成立**，必须由平台侧桥接；该链路**未经真机验证** |
| 2 | FOV / near / far / 实体包围盒 / 视锥无公开读取接口 | 采集帧恒 `null` / `Unavailable`；用猜测值填充被判 `denied`；小地图是 2D **正交投影**，不是游戏视锥 |
| 3 | `@minecraft/server-graphics` 仅 Vibrant Visuals 大气散射参数；Deferred/PBR/点光源/体积雾/色调映射/SSR 是实验性资源包配置 | 全部标 `beta`，`runtimeEffect=false`，需实验开关且不承诺跨设备；不是运行时光照 API |

### 模块标签与证据

模块内用 `stable / beta / unsupported` 三个轻量标签，映射到项目七态：

| 标签 | 项目状态 | 证据上限 | 硬规则 |
| --- | --- | --- | --- |
| `stable` | `Stable` / `BuildTimeOnly` | E4 | 只能 `platform-side`；必须有自动化测试 |
| `beta` | `Experimental` / `PlatformRestricted` | E2 | 不得标项目 `Stable`；写明未经真机验证 |
| `unsupported` | `Unavailable` | E0/E1 | 必须有审计理由；不提供可调用实现 |

32 行能力审计表见 [`loom-v2/render-intent/docs/14-render-intent.md`](loom-v2/render-intent/docs/14-render-intent.md)：
`stable 13 / beta 10 / unsupported 9`，TS 契约表与 JS 可运行表**逐行一致**（测试断言）。
其中 `stable` 条目全部是 `platform-side`（文件管道、SSE、WS、意图提交、Canvas 合成、构建期资源生成）。

### 与 v2.0 的关系（口径不变）

- **零覆盖**：`mod/` 40 文件、`core/`、`services/`、`contracts/`、`schemas/`、`manager/`、`docs/00–17` 全部不改；纯新增 `render-intent/` 与 `docs/18-render-intent.md`。
- **`Stable 20` 不变**：本层 `stable` 是模块内标签，独立登记，**不并入** `docs/03` 的项目级 API 状态总表；不新增任何「游戏内渲染介入」的 `Stable` 接口。
- **十阶段合同不变**：`ResourceBuild` 新增的介入点是「平台侧生成公开资源包文件」，仍为**间接影响**，不升级为「直接控制」。
- **版本化**：整体 `@since 2.1.0`，无 `@deprecated`、无需旧接口适配器或迁移脚本。

### 可运行入口

```bash
cd BedrockLoom/loom-v2
node render-intent/demo/serve.mjs        # 本机总线：/health /capabilities /intents.jsonl /events /intent
# 浏览器打开 render-intent/demo/overlay.html —— 不启动服务也能播放内置合成演示
```

演示页与 `serve.mjs` 默认注入 `synthetic-demo` **合成数据，非真机采集**；页面顶部固定展示边界声明。
自动化测试覆盖意图/帧校验、能力表双表一致、文件与本地总线往返、真实 WS 回放、合成器投影、
资源包构建期绑定、演示页内联脚本**实际执行**（vm + DOM stub）与静态负向扫描，见
[`loom-v2/EVIDENCE.md`](loom-v2/EVIDENCE.md) §4.1。

## 15. 许可证与免责

本项目采用 [MIT License](LICENSE)。

Minecraft、Mojang、Microsoft 及相关商标归其各自所有者所有。本项目**不是**官方产品，未经 Mojang / Microsoft 认可或授权；不包含、不修改、不重分发国际版游戏二进制、网易 SDK 或任何游戏文件。任何试图通过二进制注入、私有内存读取、Hook 未公开函数、绕过签名 / 沙箱 / 审核来实现本仓库标记为 `Unavailable` 能力的做法，**不属于本项目范围，且被明确拒绝**。

## 16. 参考

官方 changelog、Microsoft Learn Script API 文档、Minecraft Wiki 等逐条来源与核对日期，见 [`loom-v2/docs/06-international-capability.md`](loom-v2/docs/06-international-capability.md) 的 S1–S10 来源表。本仓库不引用 Java 版或网易版证据来支撑国际版结论。
