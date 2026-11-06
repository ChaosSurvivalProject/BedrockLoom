# 交付物 3：Stable / Candidate / Experimental / Unavailable API 总表

判定法见 [01-freeze-definition.md](01-freeze-definition.md)，证据见 [EVIDENCE.md](../EVIDENCE.md) 与 [06](06-international-capability.md)。
**总计数：Stable 20、Candidate 0、Experimental 20、BuildTimeOnly 6、PlatformRestricted 2、
CustomClientOnly 2、Unavailable 14。**

> `Candidate = 0` 是刻意结论：E3（最小工程在目标客户端跑通）需要真实 1.21.130 客户端，
> 本沙箱不具备，因此没有任何接口可以声称达到 E3。真机验收步骤见 [13](13-testing-and-budgets.md)，
> 补齐后按 [01](01-freeze-definition.md) §1.1 重新评级，无需改代码结构。

## 3.1 Stable（20 个，全部 `platform-side` / E4）

这 20 个是**本次唯一可承诺的接口**。它们不介入渲染，属于模组管理器与包/依赖/事务/权限/诊断/迁移层。
九个核心服务是这些接口的分组容器（见 [contracts/services.ts](../contracts/services.ts)），
不额外增加承诺面数量。

| # | 接口签名 | 所属服务 | 证据级别/域 | 自动化测试 |
|---|---|---|---|---|
| S01 | `ManifestValidator.validate(manifest: unknown): Result<ValidatedManifest, ValidationError[]>` | `ModRepositoryService` | E4 / platform-side | `test/manifest-validator.test.mjs` |
| S02 | `SignatureEnvelope.sign(payload, privateKey, keyId): SignatureEnvelope` | `InstallationService` | E4 / platform-side | `test/signature-integrity.test.mjs` |
| S03 | `SignatureEnvelope.verify(pack, trustStore): Result<VerifiedPack>` | `InstallationService` | E4 / platform-side | 同上 |
| S04 | `IntegrityChecker.verifyFileList(pack): Result<FileListReport>`（**拒绝未列文件**） | `InstallationService` | E4 / platform-side | 同上（含替换未列文件的负向用例） |
| S05 | `Semver.satisfies(version, range): boolean` | `DependencyResolver` / `UpdateService` | E4 / platform-side | `test/semver.test.mjs` |
| S06 | `Semver.rankCandidates(candidates, constraints): RankedVersion[]` | `UpdateService` | E4 / platform-side | 同上 |
| S07 | `DependencyResolver.resolve(state, request): Result<ResolutionPlan>` | `DependencyResolver` | E4 / platform-side | `test/resolver.test.mjs` |
| S08 | `DependencyResolver.explain(issue): HumanExplanation` | `DependencyResolver` | E4 / platform-side | 同上（冲突原因与可执行建议断言） |
| S09 | `ConfigMerge.merge(layers, schema): Result<MergedConfig>` | `ConfigService` | E4 / platform-side | `test/config-merge.test.mjs` |
| S10 | `ConfigMerge.diff(oldValues, newSchema, oldSchema): ConfigDiff` | `ConfigService` | E4 / platform-side | 同上 |
| S11 | `TransactionFSM.begin(kind, plan): Transaction` | 事务层 | E4 / platform-side | `test/fsm.test.mjs` |
| S12 | `TransactionFSM.transition(tx, event): Result<TxState>`（含 `cancel` / `rollback`） | 事务层 | E4 / platform-side | 同上 |
| S13 | `TransactionFSM.recover(log): RecoveryPlan`（崩溃恢复） | 事务层 | E4 / platform-side | 同上（含中断点注入） |
| S14 | `InstallationService.install(pack, options): Observable<Progress, InstallResult>`（原子、可取消） | `InstallationService` | E4 / platform-side | `test/installation.test.mjs`（真实临时目录） |
| S15 | `ModRuntimeController.setEnabled(id, scope, enabled): Result<RuntimeState>` | `ModRuntimeController` | E4 / platform-side | `test/fsm.test.mjs` |
| S16 | `PermissionService.evaluate(request): PermissionDecision` | `PermissionService` | E4 / platform-side | `test/permissions.test.mjs` |
| S17 | `PermissionService.reconfirm(modId, added): Result<ConsentRecord>` | `PermissionService` | E4 / platform-side | 同上 |
| S18 | `DiagnosticsService.collect(options): RedactedBundle` | `DiagnosticsService` | E4 / platform-side | `test/compatibility.test.mjs` |
| S19 | `ProfileService.export(profile, options): Result<ProfileFile>` | `ProfileService` | E4 / platform-side | `test/compatibility.test.mjs` |
| S20 | `V1CompatAdapter.toV2(v1Manifest): V2Manifest` | 迁移层 | E4 / platform-side | `test/migration.test.mjs`（真实读取 `../mod/mod.json`） |

**共同满足的十条**（逐条见 [01](01-freeze-definition.md) §1.1）：平台版本标注为"不依赖客户端"、
零私有符号、能力探测不适用（纯逻辑）、示例在测试中实际执行、七态结果、幂等 `dispose`、
自动测试、预算常量与错误隔离、兼容性测试连续通过、EVIDENCE.md 记录执行。

## 3.2 Candidate（0 个）

无。原因与补齐路径见上方引文。**不为了数量把 E2 拔高成 E3。**

## 3.3 Experimental（20 个，`in-game` / E1–E2）

全部默认关闭或需显式启用；画面结果一律 **未验证**，真机验收步骤见 [13](13-testing-and-budgets.md)。

| # | 接口 / 能力 | 介入阶段 | 证据 | 来源 |
|---|---|---|---|---|
| X01 | `ModelApi.register` → 静态 geometry 注册 | ResourceBuild | E1 | 既有 `client_api.js` |
| X02 | `MaterialApi.register` → 材质/贴图注册 | ResourceBuild | E1 | 同上 |
| X03 | `AnimationApi.play` → 播放描述（控制器执行） | SceneUpdate（只能观察） | E1 | 同上 |
| X04 | `ParticleApi.emit` → `Player.spawnParticle` | SimulationSync | E2 | [S3/S5](06-international-capability.md) |
| X05 | 发射时注入 `MolangVariableMap` 模板变量 | SimulationSync | E2 | [S5](06-international-capability.md) |
| X06 | `SoundApi.play` → `Player.playSound` | SimulationSync | E2 | [S3/S10](06-international-capability.md) |
| X07 | `ScreenUiApi.toast` → `ScreenDisplay.setActionBar` | UiDraw | E2 | [S4](06-international-capability.md) |
| X08 | `setTitle` / `updateSubtitle` | UiDraw | E2 | [S4](06-international-capability.md) |
| X09 | `setHudVisibility` / `hideAllExcept` / `resetHudElementsVisibility` | UiDraw | E2 | [S4](06-international-capability.md) |
| X10 | `ActionFormData` / `MessageFormData` / `ModalFormData` 模态表单 | UiDraw | E2 | [S10](06-international-capability.md) |
| X11 | `InputApi.bind` → `world.afterEvents.itemUse` | SimulationSync | E2 | 既有 `runtime.js` + 官方事件模型 |
| X12 | `EntityApi.observe` → `Dimension.getEntities` / `getEntitiesFromRay` | SimulationSync（只读观察） | E2 | [S1/S3](06-international-capability.md) |
| X13 | `StorageApi` / 官方 `Dynamic Properties` 持久化 | 非渲染 | E1 | 官方 Script API 文档 |
| X14 | `CapabilityProbe.run`（游戏侧探测） | 非渲染（探测） | E2 | 既有 `capability_probe.js` |
| X15 | BLSP/1 表现请求安全校验 | 非渲染（协议边界） | E1 | 既有 `runtime.js` |
| X16 | `@minecraft/server-graphics` 大气散射 set/reset | 环境参数设置（PostProcess 之前） | E2 | [S1/S6](06-international-capability.md) |
| X17 | 资源层 `ui/*.json` HUD 片段（是否加载未验证） | UiDraw | E1 | 既有 `hud_screen.json` |
| X18 | 预定义动画控制器 / Molang 表达式 | SceneUpdate（只能观察） | E1 | 既有 `animation_controllers/*` |
| X19 | 预定义粒子模板 / 音效定义 | ResourceBuild | E1 | 既有 `particles/*`、`sounds/*` |
| X20 | 资源热重载 / 能力报告缓存失效 | ResourceLoad | E1 | 既有 `CAPABILITY_PROBE.md` |

## 3.4 BuildTimeOnly（6 个，资源格式，运行时调用返回 `unsupported`）

| # | 资源格式 | 阶段 | 证据 | 备注 |
|---|---|---|---|---|
| B01 | `models/entity/*.geo.json` + `attachables/*.attachable.json` + `render_controllers/*` | ResourceBuild | E1 | 静态几何/挂点/材质绑定；非管线控制 |
| B02 | `animations/*` + `animation_controllers/*` | ResourceBuild | E1 | 预设动画与状态机 |
| B03 | `particles/*.particle.json` + `sounds/sound_definitions.json` | ResourceBuild | E1 | 预定义模板 |
| B04 | `atmospherics/atmospherics.json` | ResourceBuild | E1 | [S8](06-international-capability.md)；引擎大气散射参数 |
| B05 | `lighting/global.json` + `pbr/global.json` | ResourceBuild | E1 | [S7](06-international-capability.md)；1.21.90 起逐生物群系规则 |
| B06 | `local_lighting/local_lighting.json` + Editor 导出的色彩分级/色调映射/阴影配置 | ResourceBuild | E1 | [S7/S9](06-international-capability.md)；**静态方块绑定**，非运行时点光 |

## 3.5 PlatformRestricted（2 个）

| # | 接口 | 限制 | 证据 |
|---|---|---|---|
| P01 | `AtmosphereSettingsService`（X16 的服务化封装） | 需 Vibrant Visuals、需 Beta 模块启用、Realms/BDS 限制 **未验证**、设备能力未验证 | [S1/S6](06-international-capability.md) |
| P02 | Vibrant Visuals 资源包（B04–B06） | 仅启用该图形模式的客户端生效；覆盖顺序与逐生物群系映射未验证 | [S7/S8/S9](06-international-capability.md) |

## 3.6 CustomClientOnly（2 个，国际版构建不包含实现）

| # | 接口 | 前置条件 |
|---|---|---|
| CC01 | 网易适配器 SPI（`enabled:false`，契约测试） | 用户开启 + 选择合法本地 SDK；不复制/嵌入 SDK 或游戏文件 |
| CC02 | 签名 Render Extension SPI v0（帧阶段/几何/材质/Shader/相机/后处理） | 客户端所有者正式授权 + 签名清单 + ABI + 崩溃隔离，见既有 `RENDER_SPI.md` |

## 3.7 Unavailable（14 个，合格结论）

| # | 接口 / 能力 | 期望阶段 | 判定依据 | 正式授权路径 |
|---|---|---|---|---|
| U01 | `ShaderApi.replace` / 自定义 Shader | GeometrySubmit / PostProcess | E0 | [06](06-international-capability.md) §6.5 |
| U02 | 运行时顶点/索引/法线/UV/骨骼权重提交与修改 | GeometrySubmit | E0 | 同上 |
| U03 | 帧缓冲 / 全屏后处理 pass（模糊、描边、景深、色差） | PostProcess | E0 | 同上 |
| U04 | `RenderLayer.register` / 透明排序 / 深度测试 / 混合控制 | RenderLayer / CullAndSort | E0 | 同上 |
| U05 | 每帧骨骼矩阵写入 / 实时 IK / 程序化骨骼 | SceneUpdate | E0 | 同上 |
| U06 | 运行时点光/聚光（任意位置、动态衰减） | PostProcess / SceneUpdate | E0 | 同上 |
| U07 | 原生相机 Hook / FOV / 焦点 / 平滑控制权 | SceneUpdate / PostProcess | E0 | 同上 |
| U08 | `WorldUiApi.mount` 世界空间 UI / 实体附着 UI / billboard | UiDraw | E0 | 同上 |
| U09 | decal / 遮挡穿墙描边 / 可控高亮 | PostProcess / GeometrySubmit | E0 | 同上 |
| U10 | 动态纹理上传 / 纹理流送 / 运行时图集替换 | ResourceLoad / GeometrySubmit | E0 | 同上 |
| U11 | 屏幕空间粒子发射器 / 运行时修改已提交粒子参数 | SimulationSync / UiDraw | E0 | 同上 |
| U12 | 帧前/帧后回调、FramePresent 诊断与回收 | FramePresent | E0 | 同上 |
| U13 | 网易版能力等价实现 | 全部 | 平台不同，不推断 | 需正式 SDK 与书面能力 |
| U14 | 定制客户端 R2/R3 原生管线控制 | 全部 | 需签名 SPI | 需客户端所有者授权 |

> U01–U14 的接口在 `contracts/types.ts` 中**只作为 `UnavailableCapability` 枚举存在**，
> 用于在管理器里向用户解释"为什么灰掉"，不提供可调用实现。这是把"不可用"做成一等公民，
> 而不是留一个返回 `true` 的假方法。

## 3.8 状态迁移规则

- `Unavailable → Experimental` 的唯一条件：出现版本化官方文档或签名扩展点（E1/E2）。
- `Experimental → Candidate`：真实 1.21.130 最小工程跑通（E3）。
- `Candidate → Stable`：自动测试跨版本通过（E4）。
- 任何 `Stable` 接口的破坏性变更：外部 `@deprecated` 标注 + 旧接口适配器 + 迁移脚本，见 [14](14-version-migration.md)。
