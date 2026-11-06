# 交付物 4：渲染阶段合同与证据卡

本文件回答"介入的是资源、场景对象、帧前状态、渲染提交、UI 绘制还是其他明确阶段"。
**禁止**把"资源包里有模型"写成"控制渲染管线"；**禁止**把任何介入点写成"底层自动处理"。
每条 API 必须给出可执行/可观察的**实际介入点**。

## 4.1 阶段模型（十个阶段，输入/输出可验证）

| 阶段 | 定义 | 可观察输入 | 可观察输出 | 谁拥有控制权 |
|---|---|---|---|---|
| `ResourceBuild` | 创作期/打包期生成并校验资源定义 | 源文件、Schema、哈希、签名 | 已签名的 `.loompack` 内资源文件 | 模组/管理器 |
| `ResourceLoad` | 游戏导入包后异步加载、解析、上传 | 包内资源、manifest 依赖 | 资源加载日志、内容错误日志、内存占用 | **游戏客户端** |
| `SimulationSync` | 模组逻辑状态同步到表现层（tick/事件/提交请求） | 公开 Script API 调用、事件 | 对象提交记录、诊断计数 | 模组脚本 + 公开 API |
| `SceneUpdate` | 位置、骨骼、可见性、动画、LOD 更新 | 实体变换、动画控制器状态 | 场景对象状态 | **游戏客户端** |
| `CullAndSort` | 视锥/距离剔除、透明排序 | 相机、对象 bounds、材质 | 绘制候选集与顺序 | **游戏客户端** |
| `GeometrySubmit` | 几何与材质提交 | 顶点/索引/材质/纹理绑定 | GPU 提交 | **游戏客户端** |
| `RenderLayer` | 渲染层与覆盖关系 | 层定义、深度/混合状态 | 合成顺序 | **游戏客户端** |
| `PostProcess` | 全屏或相机后处理 | 颜色缓冲、参数 | 最终颜色 | **游戏客户端** |
| `UiDraw` | 屏幕 UI 与文字绘制 | UI 定义/文本/HUD 可见性 | 屏幕像素 | **游戏客户端** |
| `FramePresent` | 帧呈现后的诊断与回收 | 帧结束信号 | 帧时间、句柄回收 | **游戏客户端** |

## 4.2 国际版 1.21.130 逐阶段标注

标注只允许四个值：**直接控制 / 间接影响 / 只能观察 / 不可访问**。

| 阶段 | 标注 | 实际介入点（具体到资源或函数） | 证据 | 边界（能证明什么 / 不能证明什么） |
|---|---|---|---|---|
| `ResourceBuild` | **间接影响** | 管理器写入 `resource_pack/models/entity/*.geo.json`、`attachables/*`、`animations/*`、`animation_controllers/*`、`particles/*`、`sounds/*`、`ui/*`；Vibrant Visuals 的 `atmospherics/atmospherics.json`、`lighting/global.json`、`local_lighting/local_lighting.json`、`pbr/global.json` | 既有 40 文件中的资源；官方 S7/S8/S9（[06](06-international-capability.md)） | 能证明**资源定义被正确构建、校验、签名**；不能证明资源被加载、被绘制，更不能证明拥有管线控制权 |
| `ResourceLoad` | **间接影响** | 游戏读取 `manifest.json` 与包内资源；平台侧只能读取"内容日志/加载结果"这一**观察面**，无上传回调 | E1；真机加载日志未验证 | 能证明包可导入；不能控制解析顺序、上传时机、缓存失效、GPU 引用计数 |
| `SimulationSync` | **间接影响** | `Player.spawnParticle(effectName, location, molangVariables?)`、`Player.playSound(...)`、`world.afterEvents.itemUse.subscribe(...)`、`Dimension.getEntities/getEntitiesFromRay`、`Entity.getEntitiesFromViewDirection` | S3/S5/S10（E2 官方示例） | 能证明**请求已提交到公开 API**；不能证明画面可见、排序、稳定可见 |
| `SceneUpdate` | **只能观察** | 预声明 `animation_controllers/*` 与 Molang 表达式由引擎求值；脚本只能在 tick 采样实体公开快照 | E1；既有 `client_api.js` 的 `observe` | 无每帧骨骼写入；不得声称实时 IK、位置插值写回或 LOD 控制 |
| `CullAndSort` | **不可访问** | 无公开剔除/排序注册点 | 既有 `RENDER_PATH_LEDGER.md`；官方无对应模块（E0） | 只能按游戏默认行为观察，不得写"可控排序" |
| `GeometrySubmit` | **不可访问** | 无顶点/索引/材质运行时提交接口；geometry 为创作期静态资源 | E0 | 运行时修改已提交几何 = `Unavailable` |
| `RenderLayer` | **不可访问** | `render_controllers/*` 是**资源层材质/几何/纹理绑定描述**，不是渲染层注册 | E0 + 既有台账 | 不得把 render controller 名称当成"控制渲染层" |
| `PostProcess` | **间接影响（仅参数）** / 自定义 pass **不可访问** | `@minecraft/server-graphics` 的 `BiomeAtmospherics.setRayleighStrength / setSunMieStrength / setMoonMieStrength / setSunGlareShape / setSkyZenithColor / setSkyHorizonColor / setHorizonBlend*`（及对应 `reset*`）：改的是**引擎大气散射参数**；`atmospherics.json` 与 Editor 导出的色彩分级/色调映射/阴影配置为**静态资源参数** | S1/S6/S8/S9（E1/E2） | 能证明**参数被设置/导出**；不能证明创建自定义后处理 pass、帧缓冲访问、效果栈优先级或逐帧控制。且需 Vibrant Visuals、Beta、Realms 限制未验证 |
| `UiDraw` | **间接影响（受限）** | `ScreenDisplay.setActionBar / setTitle / updateSubtitle / setHudVisibility / hideAllExcept / resetHudElementsVisibility`；`@minecraft/server-ui` 的 `ActionFormData / MessageFormData / ModalFormData`；资源层 `ui/*.json` | S4/S10（E2 官方 TS 示例） | 能提交文本/标题/HUD 可见性/模态表单；**不是**任意声明式组件、世界空间 UI、数据绑定、焦点导航或核心界面保护。资源层 `ui/hud_screen.json` 是否被 1.21.130 加载 **未验证** |
| `FramePresent` | **不可访问** | 无逐帧渲染回调 / 帧结束信号 | E0；既有 `RENDER_AUDIT.md` §4.1 停机点 | 帧时间/句柄回收只能在平台侧按 tick 采样估算，不得称为 FramePresent 阶段控制 |

## 4.3 每条 API 的「实际介入点」表（禁止"底层自动处理"）

| API / 能力 | 介入阶段 | 介入类型 | 实际介入点（可点名） | 状态 |
|---|---|---|---|---|
| `ModelApi.register` | `ResourceBuild` | 间接影响 | 写 `ClientRegistry` 索引 + 指向 `resource_pack/models/entity/*.geo.json`；画面来自 `attachables/*.attachable.json` 的 `geometry.default` | `BuildTimeOnly` |
| `MaterialApi.register` | `ResourceBuild` | 间接影响 | 索引 + `attachable.description.materials.default` / `textures.default` | `BuildTimeOnly` |
| `AnimationApi.play` | `ResourceBuild`（描述）/ `SceneUpdate`（引擎执行） | 只能观察 | 返回播放描述；实际由 `animation_controllers/*` 的 `states/transitions` 与 Molang 求值 | `Experimental` |
| `ParticleApi.emit` | `SimulationSync` | 间接影响 | `Player.spawnParticle(effect, {x,y,z})`；可选 `MolangVariableMap.setColorRGB('variable.color',...)` | `Experimental` |
| `SoundApi.play` | `SimulationSync` | 间接影响 | `Player.playSound(sound, {location, volume, pitch})` + `sound_definitions.json` | `Experimental` |
| `ScreenUiApi.toast` | `UiDraw` | 间接影响 | `Player.onScreenDisplay.setActionBar(text)` | `Experimental` |
| `ScreenDisplay.setTitle`（新增建议） | `UiDraw` | 间接影响 | `Player.onScreenDisplay.setTitle(text, opts)` | `Experimental` |
| `HUD 可见性`（新增建议） | `UiDraw` | 间接影响 | `setHudVisibility / hideAllExcept / resetHudElementsVisibility` | `Experimental` |
| `Form UI`（新增建议） | `UiDraw` | 间接影响 | `ActionFormData / MessageFormData / ModalFormData.show(player)` | `Experimental` |
| `WorldUiApi.mount` | `UiDraw`（期望） | **不可访问** | 无公开提交点；旧实现显式返回 `false` 并诊断 | `Unavailable` |
| `InputApi.bind` | `SimulationSync` | 间接影响 | `world.afterEvents.itemUse.subscribe(handler)` → `ClientEventBus.emit("input")` | `Experimental` |
| `EntityApi.observe` | `SimulationSync` | 只能观察 | `Dimension.getEntities({location,maxDistance,type})` / `getEntitiesFromRay` | `Experimental` |
| `EntityApi.attach` | `SceneUpdate`（期望） | **不可访问** | 运行时挂点无绑定；仅预声明 `attachable` 生效 | `Unavailable` |
| `CameraApi.pulse` | `PostProcess`/`SceneUpdate`（期望） | **不可访问** | 只 `ClientEventBus.emit("camera", ...)`；`visualGuarantee: none` | `Unavailable` |
| `StorageApi` | 非渲染 | — | 平台侧内存 Map（旧）；官方 `Dynamic Properties`（候选） | `Experimental` |
| `CapabilityProbe.run` | 非渲染（探测） | 观察 | 读公开 API 存在性 + 适配器快照 → `CapabilityReport` | `Experimental`（解析层 `Stable`） |
| 环境/光照资源（新增建议） | `ResourceBuild` → `ResourceLoad` | 间接影响 | `atmospherics/atmospherics.json`、`lighting/global.json`、`local_lighting/local_lighting.json`、`pbr/global.json` | `BuildTimeOnly` + `PlatformRestricted` |
| 大气散射参数（新增建议） | `PostProcess` 之前的环境参数设置 | 间接影响 | `@minecraft/server-graphics` `BiomeAtmospherics.set*/reset*` | `Experimental` + `PlatformRestricted` |
| 自定义 Shader / 几何提交 / 渲染层 / 透明排序 / 帧回调 / 动态后处理 pass | 各对应阶段 | **不可访问** | 无公开介入点；实现需注入/私有内存/Hook | `Unavailable` / `CustomClientOnly` |
| 管理器 12 项 A 类服务 | 非渲染（平台侧） | — | `core/*.mjs` + `services/*.mjs`，纯 Node | `Stable` |

## 4.4 证据卡模板（每条 API 必须可填，不得留空；填不出即 `Unavailable`）

```yaml
evidenceCard:
  id: EC-xxx
  api: <接口名>
  platform: international
  clientBuild: 1.21.130
  distribution: international
  device: <具体设备 或 "未验证">
  worldStorage: <本地单人/Realms/BDS 或 "未验证">
  testDate: <日期 或 "未运行（沙箱无客户端）">
  stage: <十个阶段之一 或 "非渲染">
  intervention: <直接控制|间接影响|只能观察|不可访问>
  actualInterventionPoint: <具体函数 / 资源路径 / 文件；不能写"底层自动处理">
  inputBoundary: <参数范围、白名单、命名空间、预算>
  successCriterion: <可观察、可重复的判定>
  failureModes: [unsupported, denied, timeout, resource-exhausted, degraded, partial]
  disposal: <dispose + 句柄计数 + 触发点>
  perFrameCost: <预算常量；无逐帧成本则写"无（事件/构建期）">
  automatedTest: <test/ 中的用例路径 或 "无">
  manualAcceptance: <固定种子/设备/分辨率/截图步骤 与证据存放路径>
  evidenceLevel: E0..E5
  evidenceDomain: platform-side | in-game | custom-client
  status: <七态之一>
  sources: [S1..S10 或 仓库路径]
```

### EC-001 资源构建（平台侧，已自动化）

```yaml
evidenceCard:
  id: EC-001
  api: PackageBuildService.build / ManifestValidator.validate
  platform: international
  clientBuild: 1.21.130（目标基线；构建动作不依赖客户端）
  distribution: international
  device: 不适用（Node 22 环境）
  worldStorage: 不适用
  testDate: 2026-11-06（见 EVIDENCE.md 实际执行输出）
  stage: ResourceBuild
  intervention: 间接影响
  actualInterventionPoint: >-
    services/migrate-v1-to-v2.mjs 读取 ../mod/mod.json；
    core/manifest-validator.mjs 校验 schema=bedrockloom.mod/v2；
    schemas/mod-package.v2.schema.json 约束字段；
    services/signature.mjs 生成 signature.json；
    services/integrity.mjs 对 META/file-list.json 中每个文件计算 SHA-256
  inputBoundary: id 正则、version SemVer、路径不含 ..、单文件大小上限、文件清单全覆盖
  successCriterion: 校验返回 ok；验签通过；文件清单每个哈希匹配；未列文件为 0
  failureModes: [denied（签名不符）, unsupported（schema 版本）, resource-exhausted（超配额）, partial（部分文件损坏）]
  disposal: 临时目录在事务 ABORT/COMMIT 后统一清理，句柄计数归零
  perFrameCost: 无（构建期）
  automatedTest: test/manifest-validator.test.mjs, test/signature-integrity.test.mjs
  manualAcceptance: 无需人工；全部自动
  evidenceLevel: E4
  evidenceDomain: platform-side
  status: Stable
  sources: [schemas/mod-package.v2.schema.json, services/integrity.mjs]
```

### EC-002 粒子提交（游戏内，只有 E2，需真机补齐）

```yaml
evidenceCard:
  id: EC-002
  api: ParticleApi.emit
  platform: international
  clientBuild: 1.21.130
  distribution: international
  device: 未验证
  worldStorage: 未验证
  testDate: 未运行（沙箱无客户端）；文档核对 2026-11-06
  stage: SimulationSync
  intervention: 间接影响
  actualInterventionPoint: >-
    ../mod/behavior_pack/scripts/api/client_api.js 的
    ParticleApi.emit -> player.spawnParticle(effect, {x,y,z})；
    官方签名 Player.spawnParticle(effectName, location, molangVariables?)，
    示例见 S5（MolangVariableMap.setColorRGB）
  inputBoundary: effect 必须在 whitelist；position 三维有限数；count 1..32；距玩家 <= 64 格
  successCriterion: >-
    平台侧：返回 true 且诊断计数 +1（不表示画面可见）。
    画面侧：固定种子场景中记录 created/submitted，再按八个探针场景断言
    first_visible / stable_visible（尚未执行）
  failureModes: [unsupported（无公开 API）, denied（未白名单）, resource-exhausted（数量预算）, degraded（调用异常）]
  disposal: 无持久句柄；停止发射后 2 秒内活动发射记录归零（平台侧）；引擎侧生命周期不可控
  perFrameCost: 每次发射一次跨语言调用；预算见 RENDER_OPERATIONS.md（mobile-low 128 粒/秒）
  automatedTest: >-
    平台侧逻辑：test/compatibility.test.mjs 对既有 client_api.js 的输入边界做 mock 断言；
    画面侧：无自动截图通道
  manualAcceptance: >-
    见 13-testing-and-budgets.md 探针 S1/S4：固定种子/天气/时间/分辨率/画质，
    采集对象计数、帧时间、退出后句柄=0；证据存 evidence/manual/EC-002/
  evidenceLevel: E2
  evidenceDomain: in-game
  status: Experimental
  sources: [S3, S5, ../mod/behavior_pack/scripts/api/client_api.js]
```

### EC-003 大气散射参数（1.21.130 新增，被严格限定）

```yaml
evidenceCard:
  id: EC-003
  api: AtmosphereSettingsService（新增建议，未实现于游戏侧）
  platform: international
  clientBuild: 1.21.130
  distribution: international
  device: 未验证（需支持 Vibrant Visuals 的设备）
  worldStorage: 未验证（第三方 v26.30 表显示 Realms=no，但不可用于 1.21.130 结论）
  testDate: 未运行（沙箱无客户端）；文档核对 2026-11-06
  stage: PostProcess 之前的环境参数设置（引擎参数，非自定义 pass）
  intervention: 间接影响
  actualInterventionPoint: >-
    @minecraft/server-graphics 的 BiomeAtmospherics 实例方法：
    setRayleighStrength / setSunMieStrength / setMoonMieStrength /
    setSunGlareShape / setSkyZenithColor / setSkyHorizonColor /
    setHorizonBlend{Min,Start,MieStart,Max} 及对应 reset*；
    资源侧为 atmospherics/atmospherics.json 的 minecraft:atmosphere_settings
  inputBoundary: 官方参数范围（如 horizon blend [0,1]、Mie start [0,1.2]）；时间关键帧 0..1；color 为 RGB/HEX
  successCriterion: 调用返回且引擎参数被读取回一致值；官方未给出回读断言接口，真机需按 S8 场景截图对比
  failureModes: [unsupported（无 Vibrant Visuals / 模块未启用）, denied（permissions.json 未授予）, degraded（设备不支持）]
  disposal: reset* 恢复到资源包设定值；模组禁用必须逐个 reset，不允许残留
  perFrameCost: 设置型，无逐帧成本；禁止用它模拟逐帧后处理
  automatedTest: 无（需真机）；平台侧仅提供参数 Schema 校验
  manualAcceptance: 固定时间/天气/生物群系下切换参数并截图，中心/边缘/昼夜差异记录；证据存 evidence/manual/EC-003/
  evidenceLevel: E2
  evidenceDomain: in-game
  status: Experimental + PlatformRestricted
  sources: [S1, S6, S8, S9]
```

### EC-004 自定义后处理 pass（明确的否定结论）

```yaml
evidenceCard:
  id: EC-004
  api: PostProcessStack.submit / ShaderApi.replace
  platform: international
  clientBuild: 1.21.130
  distribution: international
  device: 不适用
  worldStorage: 不适用
  testDate: 2026-11-06（负向结论）
  stage: PostProcess
  intervention: 不可访问
  actualInterventionPoint: 无。S1 中 @minecraft/server-graphics 的范围仅大气散射参数；无帧缓冲/pass 注册
  inputBoundary: 不适用
  successCriterion: 不适用
  failureModes: [unsupported]
  disposal: 不适用
  perFrameCost: 不适用
  automatedTest: test/compatibility.test.mjs 断言仓库不存在 shader/inject/offset/sigscan 关键字
  manualAcceptance: 不适用（负向结论）
  evidenceLevel: E0
  evidenceDomain: in-game
  status: Unavailable（升级路径见 06-international-capability.md §6.5）
  sources: [S1, ../mod/docs/RENDER_AUDIT.md, ../mod/docs/RENDER_PATH_LEDGER.md]
```

## 4.5 阶段合同对上层 API 的约束

1. 任何声称"接入渲染管线"的接口，必须在 §4.3 表中有**具体介入点**且标注为 `直接控制` 或 `间接影响`；
   当前国际版 1.21.130 **没有任何 `直接控制` 条目**。
2. `间接影响` 接口必须同时声明：谁拥有执行权（游戏客户端）、平台能观察到什么、不能承诺什么。
3. 只能观察 / 不可访问的接口不得返回 `ok` 表示画面成功，必须返回 `unsupported` 或 `degraded` 并附 `reason`。
4. 创建类接口的状态机必须区分 `created / submitted / first_visible / stable_visible / degraded`；
   `ok`（平台侧契约完成）与 `stable_visible`（画面）不得混用。
5. 效果仲裁固定为：命名空间隔离 ID + `priority` + `exclusiveGroup` + 确定性 tie-break；
   超预算先拒绝新对象，再按远距/低优先级/透明/更新频率降级；不得依赖启动顺序。
6. 位置来源必须标注 `authoritative / local-predicted / sampled / unknown`；
   客户端命中结果不得当作多人权威操作。
