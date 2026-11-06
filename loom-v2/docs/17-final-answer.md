# 交付物 18：最终回答 —— 哪些 API 真正介入渲染、介入到哪一层、如何证明

基线：**Minecraft 基岩版国际版 1.21.130**（2025-12-09，协议 898）。
判定法：[01](01-freeze-definition.md)；阶段合同：[04](04-render-stage-contract.md)；
能力矩阵：[06](06-international-capability.md)；14 类逐项裁定：[05](05-api-adjudication.md)；
执行证据：[EVIDENCE.md](../EVIDENCE.md)。

## 17.1 一句话结论

**在国际版 1.21.130 的公开客户端上，没有任何 API "直接控制"渲染管线。**
真正介入渲染的只有 **资源构建（ResourceBuild）、资源加载（ResourceLoad）、表现提交（SimulationSync）、
受限 UI 绘制（UiDraw）以及 PostProcess 之前的引擎环境参数设置**，且全部是**间接影响**级别；
`SceneUpdate` 只能观察；`CullAndSort` / `GeometrySubmit` / `RenderLayer` / 自定义 `PostProcess` pass /
`FramePresent` 五个阶段**不可访问**。

本次交付的 **20 个 `Stable` 接口全部是平台侧（模组管理器 / 包 / 依赖 / 事务 / 权限 / 诊断 / 迁移），
没有一个介入游戏内渲染**。这不是回避，而是把"能自动验证的东西"和"必须真机验收的东西"分开。

## 17.2 十个渲染阶段的逐阶段结论

标注只允许四个值：**直接控制 / 间接影响 / 只能观察 / 不可访问**。执行权一栏写明谁真正拥有控制权。

| 阶段 | 国际版 1.21.130 标注 | 实际介入点（可点名） | 执行权 | 最强证据 / 状态 |
|---|---|---|---|---|
| `ResourceBuild` | **间接影响** | 构建并签名 `resource_pack/models/entity/*.geo.json`、`attachables/*`、`animations/*`、`animation_controllers/*`、`particles/*`、`sounds/*`、`ui/*`；Vibrant Visuals 的 `atmospherics/atmospherics.json`、`lighting/global.json`、`local_lighting/local_lighting.json`、`pbr/global.json` | 模组/管理器 | E1/E2 · `BuildTimeOnly`；平台侧构建为 E4 |
| `ResourceLoad` | **间接影响** | 游戏读取 `behavior_pack/manifest.json` / `resource_pack/manifest.json` 并加载资源；平台侧只能读"内容日志/加载结果"这一观察面，**无上传回调** | **游戏客户端** | E1 · 真机加载日志未验证 |
| `SimulationSync` | **间接影响** | `Player.spawnParticle(effectName, location, molangVariables?)`、`Player.playSound(...)`、`world.afterEvents.itemUse.subscribe(...)`、`Dimension.getEntities / getEntitiesFromRay` | 模组脚本 + 公开 API | E2 · `Experimental` |
| `SceneUpdate` | **只能观察** | 预声明 `animation_controllers/*` 与 Molang 表达式由引擎求值；脚本只能按 tick 采样实体公开快照 | **游戏客户端** | E1 · 无每帧骨骼写入 |
| `CullAndSort` | **不可访问** | 无公开剔除 / 透明排序注册点 | **游戏客户端** | E0 · `Unavailable` |
| `GeometrySubmit` | **不可访问** | 无顶点/索引/材质运行时提交接口；geometry 是创作期静态资源 | **游戏客户端** | E0 · `Unavailable` |
| `RenderLayer` | **不可访问** | `render_controllers/*` 是资源层材质/几何/纹理绑定描述，**不是渲染层注册** | **游戏客户端** | E0 · `Unavailable` |
| `PostProcess` | **间接影响（仅参数）** / 自定义 pass **不可访问** | `@minecraft/server-graphics` 的 `BiomeAtmospherics.setRayleighStrength / setSunMieStrength / setMoonMieStrength / setSunGlareShape / setSkyZenithColor / setSkyHorizonColor / setHorizonBlend*`（及对应 `reset*`）；资源侧为静态 `atmospherics.json` / Editor 导出的色彩分级配置 | **游戏客户端** | E1/E2 · `Experimental` + `PlatformRestricted` |
| `UiDraw` | **间接影响（受限）** | `ScreenDisplay.setActionBar / setTitle / updateSubtitle / setHudVisibility / hideAllExcept / resetHudElementsVisibility`；`@minecraft/server-ui` 的 `ActionFormData / MessageFormData / ModalFormData`；资源层 `ui/*.json` | **游戏客户端** | E2 · `Experimental` |
| `FramePresent` | **不可访问** | 无逐帧渲染回调 / 帧结束信号；帧时间只能在平台侧按 tick 采样估算 | **游戏客户端** | E0 · `Unavailable` |

**当前国际版 1.21.130 没有任何 `直接控制` 条目。** 完整表见 [04](04-render-stage-contract.md) §4.2，
每条 API 的介入点表见 §4.3（禁止写成"底层自动处理"）。

## 17.3 "真正介入渲染"的 API 清单

以下清单是**全部**；清单之外的渲染能力一律是 `Unavailable` 或 `CustomClientOnly`。

| 介入点 | 能力 / 调用 | 阶段 | 介入类型 | 状态 |
|---|---|---|---|---|
| 资源定义写入 | `ModelApi.register` / `MaterialApi.register` → geometry、attachable、材质/纹理绑定 | `ResourceBuild` | 间接影响 | `BuildTimeOnly` |
| 预定义资源 | `animations/*`、`animation_controllers/*`、`particles/*`、`sounds/sound_definitions.json` | `ResourceBuild` → `ResourceLoad` | 间接影响 | `BuildTimeOnly` / `Experimental` |
| 引擎环境资源 | `atmospherics.json`、`lighting/global.json`、`local_lighting/local_lighting.json`、`pbr/global.json`、Editor 导出配置 | `ResourceBuild` → `ResourceLoad` | 间接影响 | `BuildTimeOnly` + `PlatformRestricted` |
| 引擎大气散射参数 | `@minecraft/server-graphics` `BiomeAtmospherics.set*/reset*` | PostProcess **之前的环境参数设置** | 间接影响 | `Experimental` + `PlatformRestricted` |
| 粒子提交 | `Player.spawnParticle`（可注入 `MolangVariableMap` 模板变量） | `SimulationSync` | 间接影响 | `Experimental` |
| 音效提交 | `Player.playSound` + `sound_definitions.json` | `SimulationSync` | 间接影响 | `Experimental` |
| 输入事件 / 只读观察 | `world.afterEvents.itemUse`、`Dimension.getEntities` / `getEntitiesFromRay` | `SimulationSync` | 间接影响 / 只能观察 | `Experimental` |
| 屏幕文本与 HUD | `ScreenDisplay.setActionBar / setTitle / setHudVisibility / hideAllExcept / resetHudElementsVisibility` | `UiDraw` | 间接影响（受限） | `Experimental` |
| 模态表单 | `ActionFormData / MessageFormData / ModalFormData` | `UiDraw` | 间接影响（受限） | `Experimental` |
| 预设动画执行 | `animation_controllers/*` 的 `states/transitions` 与 Molang 求值 | `SceneUpdate` | **只能观察** | `Experimental` |

**`Stable` 20 个接口（S01–S20）不在此表中**：它们属于模组管理器、包格式、签名、依赖、
事务、配置、权限、诊断、迁移，全部标注"非渲染 / platform-side"。
清单见 [03](03-api-status-table.md) §3.1 与 [16](16-commitments.md) §16.2。

## 17.4 介入到哪一层

用一个可验证的分层模型回答"介入深度"，而不是笼统说"接入渲染管线"：

| 层 | 内容 | 国际版 1.21.130 是否可达 | 说明 |
|---|---|---|---|
| **L0 平台侧包与索引层** | manifest 校验、签名、文件清单、依赖拓扑、事务日志、诊断 | **可达（E4 / `Stable`）** | 纯 Node，不触碰游戏二进制；**不介入渲染** |
| **L1 资源定义层** | geometry / attachable / animation / particle / sound / atmospherics / lighting / ui JSON 的构建、校验、签名 | **可达（间接影响）** | 能证明"资源定义被正确构建与校验"，**不能证明**被加载或绘制 |
| **L2 公开 API 提交层** | `spawnParticle` / `playSound` / `ScreenDisplay.*` / 表单 / 事件订阅 / 只读实体观察 | **可达（间接影响）** | 能证明"请求已提交到公开 API"，**不能证明**画面可见、排序或稳定可见 |
| **L3 引擎参数设置层** | `BiomeAtmospherics.set*/reset*` 大气散射参数；静态 Vibrant Visuals 资源参数 | **可达（间接影响，受限）** | 能证明"参数被设置/导出"，**不能证明**创建自定义 pass、帧缓冲访问、效果栈优先级或逐帧控制 |
| **L4 场景 / 几何 / 渲染层** | 每帧骨骼与变换写入、几何与材质 GPU 提交、渲染层与透明排序、剔除控制 | **不可访问** | 无公开介入点；实现需二进制修改 / 私有内存 / Hook → `Unavailable` |
| **L5 帧缓冲与呈现层** | 全屏后处理 pass、FramePresent 回调与帧后回收 | **不可访问** | 同上；平台侧帧时间只是按 tick 采样估算 |

**结论**：介入最深只到 **L2（公开 API 提交）与 L3（引擎参数设置）**，执行权始终归游戏客户端；
平台自身可达的 L0 不介入渲染。**从未到达几何提交、渲染层、排序、后处理 pass 或帧呈现。**

三个必须分开的边界：

1. **"资源包里有模型" ≠ "控制渲染管线"**：那是 L1 静态定义，由引擎在 `ResourceLoad` 读取。
2. **"调用成功" ≠ "画面可见"**：`ok` 只表示平台侧契约完成；画面另用
   `created / submitted / first_visible / stable_visible / degraded` 子状态（[01](01-freeze-definition.md) §1.4）。
3. **"发射时注入模板变量" ≠ "运行时修改已提交粒子"**：前者是 E2 的 `MolangVariableMap` 绑定，
   后者 `Unavailable`（[04](04-render-stage-contract.md) EC-002）。

## 17.5 如何证明

### 17.5.1 已经证明的（平台侧，E4，可复现）

| 证明对象 | 手段 | 结果 |
|---|---|---|
| 包格式、签名覆盖全部文件、未列文件拒绝 | `node --test test/` | 10 文件 / 80 用例 / 80 通过 / 0 失败 |
| 依赖拓扑、六类冲突、配置合并、权限、事务、原子安装与崩溃恢复 | 同上（真实临时目录、故障注入、取消点） | 见 [EVIDENCE.md](../EVIDENCE.md) TAP 原始输出 |
| 旧文件零覆盖 | SHA-256 断言 | `mod.json` `b4a0541c…c48`、`RENDER_AUDIT.md` `3b22b0f…d90` 不变 |
| TypeScript 契约 | `tsc --noEmit -p contracts/tsconfig.json` | 通过 |
| 无注入 / Hook / 私有偏移实现 | `test/compatibility.test.mjs` B4 负向探针 | 通过 |

复现命令：

```bash
cd /workspace/loom-v2
node services/migrate-v1-to-v2.mjs       # 只读旧 mod.json，生成 v2 manifest
node services/build-example-pack.mjs     # 生成并签名完整示例包
node --test test/*.test.mjs              # 自动化测试
node test/run-evidence.mjs               # 汇总为 EVIDENCE.md（含 tsc --noEmit）
sha256sum ../mod/mod.json ../mod/docs/RENDER_AUDIT.md
```

证据卡 **EC-001**（资源构建，E4 / platform-side / `Stable`）证明的是"资源定义被正确构建、校验、签名"，
**不是**"资源被绘制"。详见 [04](04-render-stage-contract.md) §4.4。

### 17.5.2 只有文档级证据、画面未验证的（游戏内，E1/E2）

`ParticleApi.emit` 等所有 `in-game` 能力只到 E1（官方文档/changelog）或 E2（官方示例），
`testDate` 一律记为 **`未运行（沙箱无客户端）`**。证据卡 **EC-002**（粒子提交，E2）、
**EC-003**（大气散射参数，E2）都明确写出：

- 平台侧能证明"请求已提交 / 参数已设置"；
- 画面侧需要固定种子场景中记录 `created/submitted`，再断言 `first_visible/stable_visible`；
- 该步骤**尚未执行**。

补齐步骤：[13](13-testing-and-budgets.md) §13.3 的八个探针场景 S1–S8、§13.3.3 的 M1–M8 额外项、
§13.4 的视觉黄金测试（结构化区域容差 + `diff.json`）、§13.3.1 的 `acceptanceRecord.yaml` 模板
（必须写 `clientBuild / distribution / platform / worldStorage / testDate / source`）。

### 17.5.3 明确否定的（E0）

证据卡 **EC-004**（自定义后处理 pass）给出负向结论：S1 中 `@minecraft/server-graphics` 的范围
仅大气散射参数，无帧缓冲 / pass 注册；`actualInterventionPoint: 无`。
`test/compatibility.test.mjs` 的 B4 断言仓库不存在对应实现关键字。
14 项 `Unavailable` 逐项见 [03](03-api-status-table.md) §3.7，正式授权路径见
[06](06-international-capability.md) §6.5。

### 17.5.4 证据等级与状态的关系

| 域 | 本仓库上限 | 结果 |
|---|---|---|
| `platform-side` | E4 | 20 个 `Stable` |
| `in-game` | E2 | 20 个 `Experimental`，`Candidate = 0` |
| `custom-client` | E0 | 2 个 `CustomClientOnly` |

E3 需要真实 1.21.130 最小工程跑通，E4 需要自动测试跨版本通过，E5 需要多设备/多版本长期通过。
**补齐证据后按 [01](01-freeze-definition.md) §1.1 重新评级，无需修改代码结构。**

## 17.6 1.21.130 特有结论（避免两个方向的误判）

官方 1.21.130 changelog 原文明确新增：

> Added new module `@minecraft/server-graphics` to change graphics and rendering settings.
> The current set of APIs are associated with Atmospheric Scattering parameters in Vibrant Visuals.

因此：

- **不能说**"国际版 1.21.130 没有任何官方公开图形 API" —— 该表述在目标版本上不准确；
  既有 [`../../mod/docs/RENDER_AUDIT.md`](../../mod/docs/RENDER_AUDIT.md) 的这一句需在 v2 文档中补注，
  **原文保留不修改**（[00](00-impact-and-migration.md) §1.3 发现 ②）。
- **也不能说**"因此可以自定义 Shader / 后处理 / 渲染层" —— 该模块只提供
  `BiomeAtmospherics` 的 set/reset 大气散射**设置级参数**，不是帧阶段回调、几何提交、渲染层或 pass。
- 既有 R2/R3 的否定结论**仍成立**。
- 第三方 `jaylydev` v1.21.130 归档页的 "Platform Differences" 表标注 *as of v26.30*，
  **不用于 1.21.130 结论**；Realms/BDS 限制、设备启用状态一律写 `未验证`。
- 26.50 中 `server-graphics` 升 1.0.0、`Player.fogSettings`、`DebugShape` 等属于**后续版本**，
  本基线标"1.21.130 未验证/不适用"。

## 17.7 不能写的话（反例对照）

| 反例（禁止） | 正确写法 |
|---|---|
| "本平台已接入渲染管线" | "在 `ResourceBuild` 写入资源定义，在 `SimulationSync` 提交公开 API 请求；执行权归游戏客户端" |
| "资源包里有模型，所以能控制几何提交" | "geometry 是创作期静态资源；运行时几何提交 `Unavailable`" |
| "调用 `spawnParticle` 成功即粒子可见" | "`ok` 表示请求已提交；`first_visible / stable_visible` 未验证，需 S4 探针" |
| "类似 Java 版可实现自定义 Shader" | "国际版 1.21.130 无公开扩展点 → `Unavailable`，授权路径见 06 §6.5" |
| "后续引擎会自动实现后处理" | "当前 E0；重新评估的唯一条件是版本化公开文档 + 签名扩展点 + 官方测试通道" |
| "跨平台一致支持" | "Windows/Android/iOS/Xbox/PlayStation/Switch 均未验证" |
| "render_controllers 就是渲染层控制" | "资源层材质/几何/纹理绑定描述，非渲染层注册" |
| "底层自动处理" | 点名具体函数或资源路径（[04](04-render-stage-contract.md) §4.3） |

## 17.8 验收硬门槛逐条核对

| # | 硬门槛 | 本仓库核对结果 |
|---|---|---|
| 1 | 修改或注入游戏二进制 | 无；`test/compatibility.test.mjs` B4 负向探针扫描禁止关键字 |
| 2 | 读取私有内存或依赖固定偏移 | 无；[01](01-freeze-definition.md) 条件 2 出现 `offset/sigscan/patch/inject` 即否决 |
| 3 | Hook 未公开函数 | 无；相关能力全部 `Unavailable` / `CustomClientOnly` |
| 4 | 绕过签名、沙箱、资源校验或平台审核 | 无；签名覆盖 `manifest.json` + `META/file-list.json` + 逐文件哈希，未列文件 `E_FILE_UNLISTED` |
| 5 | 依赖某个版本偶然行为 | 无；能力探测缓存键含 `clientBuild + adapterBuild + resourceFingerprint + graphicsBackend + quality` |
| 6 | 无法自动测试且没有可重复人工证据 | 平台侧 80 用例自动通过；游戏内一律标 `Experimental` 或 `Unavailable`，并给出 S1–S8 / 视觉黄金 / `acceptanceRecord` 可重复步骤与证据路径 |
| 7 | 只在 Java 版、网易版存在，却被写成国际版支持 | 已排除；v26.30 平台差异表、Java 版证据、26.50 新 API 均不用于本基线；网易适配器默认关闭且 `E_PLATFORM_ADAPTER` 拒绝 |

**凡只能通过上表任一方式实现的能力，一律标 `Unavailable` 或 `CustomClientOnly`，
不进入国际版 `Stable`。**

## 17.9 交付状态

- 既有 `../mod` **40 个文件字节级不变**；本次新增内容全部位于 `loom-v2/`。
- 18 项交付物全部落地：影响清单 [00](00-impact-and-migration.md) → 最终回答本文；
  索引见 [`README.md`](../README.md)。
- 可运行代码：`core/` 8 个模块、`services/` 6 个服务、`contracts/` 2 个 TS 契约、
  `schemas/` 4 个 JSON Schema + 错误码表、`manager/index.html` 离线图形管理器、
  `test/` 10 个测试文件 + 证据汇总脚本、`examples/` 真实生成并复验的示例包。
- 自动化证据：**80/80 通过**，`tsc --noEmit` 通过，[EVIDENCE.md](../EVIDENCE.md) 记录实际输出。
- 未验证项全部如实列出：真机、各设备、各存档方式、全部画面结果、视觉黄金测试、E3/E4/E5。

## 17.10 收尾

用户要求"宁可 `Stable` 只有二十个接口，也不要两百个无法兑现的接口"。本次交付即按此执行：

- `Stable` **20** 个，全部是能自动验证的平台侧契约；
- `Candidate` **0** 个（不把 E2 拔高成 E3）；
- `Unavailable` **14** 个，是正式结论而非占位；
- 真正介入渲染的接口全部标为"间接影响 / 只能观察"，并写清**谁拥有执行权**；
- 任何画面结果都没有被写成"已验证"。

需要把 `in-game` 能力推进到 `Candidate` / `Stable`，唯一途径是按
[13](13-testing-and-budgets.md) 在真实 1.21.130 客户端上补齐 E3/E4 证据，
而不是修改本仓库的措辞。
