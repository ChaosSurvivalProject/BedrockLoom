# 14 类 API 逐项裁定（接口签名 / 能力等级 / 证据 / 是否进入 Stable）

字段固定 13 项，与用户要求一一对应。所有签名均为**提议签名**；标 `Unavailable` 者只在
`contracts/types.ts` 中登记为 `UnavailableCapability`，**不提供可调用实现**。
`Result` 为 [01](01-freeze-definition.md) §1.4 的七态结果类型。
统一标注：`clientBuild=1.21.130`、`distribution=international`、`device=未验证`、
`worldStorage=未验证`、`testDate=未运行（沙箱无客户端）；文档核对 2026-11-06`。
`in-game` 域证据上限 E2；`platform-side` 域可到 E4。

---

## 1. 渲染场景 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `PresentationScene.create(opts): Result<SceneHandle>`；`Layer.register(opts): Result<LayerHandle>`；`RenderGroup.batchUpdate(ops): Result<BatchReport>`；`PresentationObject.setTransform(h, t): Result<void>` |
| 能力等级 | **Unavailable**（国际版）；`CustomClientOnly`（定制客户端） |
| 平台版本 | 1.21.130 / international；无对应公开扩展点 |
| 实现路径 | 无。场景对象由游戏客户端在 `SceneUpdate` 内部维护；无创建/写入/剔除/排序接口 |
| 资源格式 | 仅有创作期 `attachables/*.attachable.json` 与 `render_controllers/*`（资源绑定描述，非场景对象） |
| 权限 | 不适用；即使声明 `presentation.local` 也不产生介入 |
| 线程模型 | 不适用（无逐帧回调；Script API 脚本运行于游戏主线程 tick） |
| 每帧成本 | 不适用 |
| 成功证据 | 无。负向探针：`test/compatibility.test.mjs` 断言仓库无 `inject/offset/sigscan/hook` 关键字 |
| 失败模式 | 恒返回 `unsupported`（附 `reason=no_public_scene_api`） |
| 回退 | 预声明 attachable 的静态挂点；无父子变换/插值/LOD/排序控制 |
| 清理 | 无句柄可创建，故无泄漏面；退出世界不做任何场景对象回收 |
| 测试 | 负向断言 + [04](04-render-stage-contract.md) EC-004 同模板 |
| 是否进入 Stable | **否**。原因：CullAndSort / GeometrySubmit / RenderLayer / SceneUpdate 写入均 E0 |

> 世界/视图/屏幕/Overlay 坐标空间、父子变换、骨骼挂点、位置旋转插值、可见性/距离/LOD/透明排序能力查询、
> 批量更新/脏标记/帧同步/对象池：在国际版全部无介入点。能力查询接口本身可做（平台侧返回全 `false` 的能力矩阵），
> 但那属于 [06](06-international-capability.md) 的能力报告，不是渲染控制 API，不重复计数。

---

## 2. 模型、几何与材质 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ModelRegistry.register(def): Result<ModelRef>`（BuildTimeOnly）；`Geometry.submit(h, buffer): Result<void>`（Unavailable）；`Material.setParam(h, k, v): Result<void>`（Unavailable） |
| 能力等级 | 静态模型/骨骼模型/预定义变体 = `BuildTimeOnly`；实例化/程序化几何/运行时修改 = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `core/manifest-validator.mjs` + `services/integrity.mjs` 校验并签名 `models/entity/*.geo.json`、`attachables/*`、`render_controllers/*`；游戏在 `ResourceLoad` 解析 |
| 资源格式 | geometry JSON（bones/cubes/uv）、attachable JSON、render controller JSON、PNG 贴图、`item_texture.json` |
| 权限 | `resource.read` + `resource.namespace:<ns>`；禁止跨命名空间覆盖 |
| 线程模型 | 构建期（Node 单线程）；加载期由游戏主线程，平台无回调 |
| 每帧成本 | 无（静态资源，游戏自有更新） |
| 成功证据 | 平台侧：校验 `ok`、签名通过、文件清单全覆盖（E4，见 EVIDENCE.md）；画面侧：未验证 |
| 失败模式 | `unsupported`（运行时改几何）、`denied`（命名空间冲突）、`resource-exhausted`（贴图超预算）、`partial`（部分资源损坏） |
| 回退 | 原版占位图标 / 预打包默认变体；运行时换装改用预声明 controller 变体（B01） |
| 清理 | `ResourceHandle` 表示平台索引；记录 `release-pending`；**不承诺 GPU 立即回收** |
| 测试 | `test/manifest-validator.test.mjs`、`test/signature-integrity.test.mjs`、资源 Schema 校验 |
| 是否进入 Stable | **仅注册/校验类进入 Stable（S01/S04）**；几何/材质运行时接口否 |

> 严格区分：**创作期生成资源**（可校验、可签名、可自动化）与**运行期修改已提交几何**（E0，Unavailable）。
> 顶点缓冲、索引、法线、UV、颜色、骨骼权重只在创作期 JSON 中存在；运行时无提交句柄。
> 材质参数、透明度、双面、深度测试、混合：资源层可声明静态值，运行时无覆盖接口。
> 纹理图集为 `item_texture.json`/`terrain_texture.json` 静态定义；纹理流送与动态上传 Unavailable。
> 模型合并/实例化/引用计数/异步卸载：平台侧可管理 `ResourceHandle` 引用计数，GPU 侧回收不可控。

---

## 3. 动画与骨骼 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `AnimationApi.play({target,clip,loop,blendMs}): AnimationDesc`（既有）；`Skeleton.writeBone(h,bone,matrix): Result<void>`（Unavailable） |
| 能力等级 | 片段/状态机/事件帧 = `BuildTimeOnly` + `Experimental`（控制器执行）；混合/遮罩/程序化骨骼/实时 IK = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `resource_pack/animations/*` + `animation_controllers/*` 的 `states/transitions` + Molang 表达式；引擎在 `SceneUpdate` 求值 |
| 资源格式 | animation JSON（关键帧、loop、animation_length）、animation controller JSON |
| 权限 | `presentation.local`；不改变权威实体状态 |
| 线程模型 | 引擎主线程求值；脚本只能 tick 采样，不参与每帧骨骼更新 |
| 每帧成本 | 脚本侧 0；引擎侧不可观测，标"未验证" |
| 成功证据 | 平台侧：资源 Schema 校验通过；画面侧：固定 clip 时间线黄金图 **未验证** |
| 失败模式 | `degraded`（`AnimationApi.play` 返回 `visualGuarantee: resource-controller-only`）、`unsupported`（骨骼写入） |
| 回退 | 单 clip / 静态模型 / 预设动画；**不声称实时 IK** |
| 清理 | 取消订阅、清播放描述；引擎侧动画状态由控制器管理 |
| 测试 | `test/compatibility.test.mjs` 对既有 `AnimationApi.play` 返回值做确定性断言；真机探针 S2 |
| 是否进入 Stable | **否**（E1，只能 Experimental） |

> 读取受支持骨骼变换：官方无公开骨骼矩阵读取接口 → Unavailable。写入允许控制的节点：无 → Unavailable。
> 多动画优先级与骨骼冲突仲裁：资源控制器内以 `states/transitions` 表达，平台无仲裁权；
> 平台侧只做**确定性 tie-break 说明**，不谎称控制引擎。
> 与实体移动/网络校正/音效/粒子同步：脚本可在同一 tick 发请求（B3/B5），但位置来源必须标
> `sampled`/`local-predicted`，不得冒充 `authoritative`。

---

## 4. 粒子与视觉特效 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ParticleApi.emit({player,effect,position,count,maxDistance,molang?}): boolean`（既有 + 建议扩展）；`Emitter.setParam(h,k,v): Result<void>`（Unavailable） |
| 能力等级 | 预设模板提交 = `Experimental`（E2）；发射时模板变量注入 = `Experimental`（E2）；运行时参数修改 = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `Player.spawnParticle(effectName, location, molangVariables?)`（[S3/S5](06-international-capability.md)）；模板来自 `particles/*.particle.json` |
| 资源格式 | particle effect JSON（`emitter_rate_instant`、`particle_lifetime_expression`、`appearance_billboard` 等） |
| 权限 | `presentation.local` + effect 白名单 |
| 线程模型 | 游戏主线程 tick；脚本在主线程调用，无逐帧回调 |
| 每帧成本 | 每次发射 1 次跨语言调用；预算 mobile-low 128 粒/秒、desktop 1024 粒/秒（既有 `RENDER_OPERATIONS.md`） |
| 成功证据 | 平台侧：`true` 且诊断计数 +1（**不代表可见**）；画面侧：探针 S1/S4 的 `first_visible/stable_visible` **未验证** |
| 失败模式 | `denied`（未白名单）、`unsupported`（无 API）、`resource-exhausted`（数量/距离预算）、`degraded`（调用异常） |
| 回退 | 无粒子 / 减少数量 / 低画质降级；模板不可用时返回 `degraded` |
| 清理 | 停止发射后活动记录归零（平台侧）；引擎粒子生命周期由引擎管理，平台无强制销毁句柄 |
| 测试 | `test/compatibility.test.mjs` 断言输入边界（白名单、距离、count 上限、重复销毁幂等）；真机探针 S4 |
| 是否进入 Stable | **否**（E2 上限，且画面未验证） |

> 三类严格分开：① **动态参数重新上传**（对已提交粒子改速度/颜色）→ Unavailable；
> ② **交换预定义变体**（切换打包好的 particle JSON）→ BuildTimeOnly/资源切换；
> ③ **发射时绑定模板变量**（`MolangVariableMap.setColorRGB('variable.color',...)`，官方示例）→ Experimental（E2）。
> 附着实体/骨骼、轨迹、条带、模型表面发射：无通用公开发射器 → Unavailable；
> 轨迹只能用有限粒子点按 tick 采样近似，标 `degraded` 且受预算限制。

---

## 5. 光照、阴影与环境 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `PointLight.create(opts): Result<LightHandle>`（Unavailable）；`AtmosphereSettingsService.set(biome, params): Result<void>`（`Experimental`+`PlatformRestricted`） |
| 能力等级 | 点光/聚光运行时对象 = **Unavailable**；环境光/雾/天空/体积/色彩分级 = `BuildTimeOnly`+`PlatformRestricted`（资源参数）；大气散射参数 = `Experimental`（E2） |
| 平台版本 | 1.21.130 / international，需 Vibrant Visuals（设备启用状态 **未验证**） |
| 实现路径 | 资源侧 `lighting/global.json`（方向光/环境/天空）、`local_lighting/local_lighting.json`（**静态方块点光绑定**）、`pbr/global.json`、`atmospherics/atmospherics.json`；脚本侧 `@minecraft/server-graphics` `BiomeAtmospherics.set*/reset*` |
| 资源格式 | 见上；官方 schema 见 [S7/S8/S9](06-international-capability.md)；Editor 可导出配置资源包 |
| 权限 | `graphics.settings`（新增权限项）；需用户确认"改变画面观感" |
| 线程模型 | 设置型，主线程调用；无逐帧回调 |
| 每帧成本 | 无逐帧成本（禁止用参数模拟逐帧后处理） |
| 成功证据 | 参数调用返回且（若官方提供回读）读回一致；画面侧昼夜/生物群系截图对比 **未验证** |
| 失败模式 | `unsupported`（无 Vibrant Visuals）、`denied`（未授予模块/permissions.json）、`degraded`（设备性能档）、`timeout` |
| 回退 | 不改光照；`reset*` 恢复到资源包设定值 |
| 清理 | 模组禁用必须逐个 `reset*`，禁止残留参数；句柄计数归零断言 |
| 测试 | 平台侧参数 Schema 校验；真机验收 EC-003 |
| 是否进入 Stable | **否**（E1/E2 + 平台限制未验证） |

> 逐项标注：方向光/环境光/天空光 = **静态资源参数**（原生引擎计算，创作者改参数）；
> 任意位置点光/聚光 = **不可用**（`local_lighting` 只是把光绑定方块类型，不是运行时对象）；
> 阴影/雾/体积/色调映射/色彩分级 = **静态烘焙到资源参数**（Editor 导出），非运行时效果栈；
> **禁止用粒子假光冒充场景光照**——本仓库不提供任何"用粒子模拟点光"的接口。

---

## 6. 相机与后处理 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `CameraApi.pulse(...)`（既有，`visualGuarantee:none`）；`PostProcessStack.push(effect): Result<EffectHandle>`（Unavailable） |
| 能力等级 | 位置/旋转偏移、抖动、FOV、焦点、平滑控制权 = **Unavailable**；真实后处理（模糊/描边/景深/色差/屏幕覆盖/颜色变换） = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | 无公开相机提交或帧缓冲/pass 注册；`CameraApi.pulse` 只 `ClientEventBus.emit("camera", ...)` |
| 资源格式 | 无（Vibrant Visuals 的色彩分级是静态环境参数，不是相机效果栈） |
| 权限 | 不适用 |
| 线程模型 | 不适用 |
| 每帧成本 | 不适用 |
| 成功证据 | 无。既有 `self_test.js` 断言 `pulse` 输出确定性且 `visualGuarantee:"none"` |
| 失败模式 | 恒 `degraded`/`no-op`；不得返回 `true` 声称画面抖动 |
| 回退 | no-op + 明确诊断 `no_public_camera_hook` |
| 清理 | 本地事件订阅取消；无画面副作用 |
| 测试 | `test/compatibility.test.mjs` 断言"调用返回但无画面承诺"；探针 S8 |
| 是否进入 Stable | **否**。原因：E0，需原生相机 Hook/帧缓冲，属硬门槛禁止 |

> 明确分类：真实后处理 = 不可用；UI 模拟 = 不可用（无通用屏幕覆盖层提交）；材质技巧 = 不可用；
> 静态环境参数（色彩分级/色调映射）= BuildTimeOnly 且非相机效果。**不允许只给枚举而不提供可重复视觉验收**：
> 本仓库不提供 `EffectKind` 枚举假装支持；只在 [13](13-testing-and-budgets.md) 给出
> "若未来授权到位"的视觉黄金验收步骤（固定种子/相机/分辨率/容差）。

---

## 7. UI 与 HUD API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ScreenUiApi.toast(...)`（既有）；`Hud.setElementVisibility(player, elements, visible): Result<void>`；`FormService.show(player, form): Result<FormResponse>` |
| 能力等级 | action bar / title / HUD 可见性 / 模态表单 = `Experimental`（E2）；声明式 UI / 数据绑定 / 组件库 / 世界空间 UI / 实体附着 UI = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `ScreenDisplay.setActionBar/setTitle/updateSubtitle/setHudVisibility/hideAllExcept/resetHudElementsVisibility`（[S4](06-international-capability.md)）；`@minecraft/server-ui` 表单（[S10](06-international-capability.md)） |
| 资源格式 | `ui/*.json` 资源层片段（**是否被 1.21.130 加载未验证**）；`texts/*.lang` 本地化 |
| 权限 | `ui.screen`；核心界面保护需运行时校验（不抢聊天/设置焦点） |
| 线程模型 | 主线程调用；表单响应异步回调 |
| 每帧成本 | 无逐帧成本；高频数据必须批量化，见下方测试指标 |
| 成功证据 | 平台侧：调用返回 + 文本长度/TTL 校验；画面侧：DPI/安全区/焦点/裁切 **未验证** |
| 失败模式 | `degraded`（`RawMessageError`/`InvalidEntityError`）、`denied`（权限）、`timeout`（表单无响应） |
| 回退 | 世界 UI → action bar；表单不可用 → 文本提示 |
| 清理 | `clearAll()`、取消表单订阅、退出世界清空 `active`，重复销毁幂等 |
| 测试 | `test/compatibility.test.mjs` 断言文本上限 96、TTL 上限 1200、重复清理幂等；真机探针 S7 |
| 是否进入 Stable | **否**（E2；画面/DPI/焦点未验证） |

> 高频数据更新批量化指标（可在真机按 [13](13-testing-and-budgets.md) 测）：
> 单模组每秒 UI 提交 ≤ 8 次、重建 ≤ 4 次（desktop 档），data binding 变更合并到单次 `setActionBar`；
> P95 提交耗时计入诊断。当前国际版无声明式组件库与自动布局，指标为**真机验收项**，不是已实现能力。
> DPI/安全区/桌面/触控/手柄/本地化/可访问性：平台侧可管理 `texts/*.lang` 与配置分层，
> 但屏幕适配由游戏控制 → 标未验证。HUD 插槽/层级/冲突仲裁/核心界面保护：
> 平台侧用 `ConflictResolver` 做**插槽登记与冲突解释**（Stable，S07/S08），
> 不谎称能强制接管游戏 HUD 层级。

---

## 8. 输入、交互与命中测试

| 字段 | 裁定 |
|---|---|
| 接口签名 | `InputApi.bind({id,key,itemType,onPress}): () => void`（既有）；`InputService.bindAbstract(opts): Result<BindingHandle>`；`HitTest.raycast(opts): Result<HitResult>` |
| 能力等级 | 官方物品/世界事件与只读视线命中 = `Experimental`（E2）；键盘/鼠标/触控/手柄抽象、组合键/长按/手势/输入消费与焦点 = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `world.afterEvents.itemUse` 等官方事件（既有 `runtime.js`）；`Dimension.getEntitiesFromRay` / `Entity.getEntitiesFromViewDirection`（[S1](06-international-capability.md) 修复记录） |
| 资源格式 | 无 |
| 权限 | `input.local`；命中结果不得作为多人权威操作 |
| 线程模型 | 主线程事件回调 |
| 每帧成本 | 事件驱动，无逐帧成本；`observe` 既有实现每 10 tick 采样，预算内 |
| 成功证据 | 平台侧：事件订阅/注销计数、重复订阅隔离；画面侧：焦点/手势 **未验证** |
| 失败模式 | `denied`（未声明权限）、`unsupported`（无低层输入 Hook）、`degraded`（事件不可用） |
| 回退 | 默认物品事件；无低层键盘绑定 |
| 清理 | `InputApi.clear()`、`ClientEventBus` 取消函数、世界切换后无重复触发 |
| 测试 | `test/compatibility.test.mjs` 断言重复订阅/注销/焦点隔离；真机探针 S7 |
| 是否进入 Stable | **否**（E2；低层输入 Unavailable） |

> 方块/实体/屏幕/自定义场景对象命中：官方 `getEntitiesFromRay`（E2）可读实体/方块命中；
> 屏幕命中与自定义场景对象命中无公开接口 → Unavailable。
> **不把客户端命中结果当作多人权威操作**：改变多人结果必须发起权威服务端请求。
> 按键冲突、可访问替代绑定、移动端布局 API：平台侧 `ConflictResolver` 与 `ConfigService`
> 提供登记与解释（Stable），但游戏内的实际替代绑定与布局由客户端控制 → 标未验证。

---

## 9. 世界表现与空间数据 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `WorldPresentation.draw(opts): Result<Handle>`（Unavailable）；`SpatialIndex.query(bounds): Result<SpatialSnapshot>`（platform-side，可 Stable） |
| 能力等级 | 范围/边界/路径/网格/线段/面/贴花/高亮/预览的**绘制** = **Unavailable**；地形贴合/遮挡/深度偏移/透明排序能力探测 = 只能观察/Unavailable；分块/缓存/LOD/流式更新的**平台侧数据管理** = `Stable`（platform-side） |
| 平台版本 | 1.21.130 / international |
| 实现路径 | 平台侧 `core/package-store.mjs` + `core/resolver.mjs` 管理空间数据索引与分块元数据；游戏侧无通用绘制提交点 |
| 资源格式 | 预置 ghost 模型（创作期）可近似方块预览；其余无 |
| 权限 | `world.read.local`；只读采样，不写世界 |
| 线程模型 | 平台侧 Node 单线程异步；游戏侧主线程 tick 采样 |
| 每帧成本 | 平台侧无逐帧成本；采样按预算（每 10 tick） |
| 成功证据 | 平台侧：分块查询、缓存命中、卸载清理断言（E4）；画面侧：探针 S6 的 100 点范围面 **未验证** |
| 失败模式 | `unsupported`（绘制）、`resource-exhausted`（对象数超预算）、`degraded`（大量对象转粒子/关闭） |
| 回退 | 文本坐标 / action bar / 关闭；不允许静默生成大量对象 |
| 清理 | 区块卸载、维度切换、世界重启时 `SpatialIndex.clear()` 强制回收，句柄计数归零 |
| 测试 | `test/resolver.test.mjs`、`test/compatibility.test.mjs`；真机探针 S6 |
| 是否进入 Stable | **仅平台侧 `SpatialIndex` 类进入 Stable**；绘制类否 |

> 贴花、穿墙高亮、可控深度偏移与透明排序：E0 Unavailable。
> 轨迹/范围面只能用有限粒子点近似，标 `degraded`，受对象与每帧预算约束。

---

## 10. 音频与表现同步

| 字段 | 裁定 |
|---|---|
| 接口签名 | `SoundApi.play({player,sound,position,volume,pitch}): boolean`（既有）；`AudioGroup.setPriority(...)`: `Result<void>`（Unavailable） |
| 能力等级 | 2D/3D 音效播放、音量/音调 = `Experimental`（E2）；循环/衰减/淡入淡出/组/优先级/并发控制 = **Unavailable** |
| 平台版本 | 1.21.130 / international |
| 实现路径 | `Player.playSound(sound, {location, volume, pitch})` + `sound_definitions.json`（[S3/S10](06-international-capability.md)） |
| 资源格式 | `sounds/sound_definitions.json`（category、sounds[]、volume、pitch） |
| 权限 | `audio.local` + 音效白名单 |
| 线程模型 | 主线程调用 |
| 每帧成本 | 每次播放 1 次跨语言调用，无逐帧成本 |
| 成功证据 | 平台侧：调用返回 + 距离/白名单校验；音频侧：3D 衰减/并发/失焦 **未验证** |
| 失败模式 | `denied`（未白名单）、`degraded`（播放异常）、`unsupported`（组/优先级控制） |
| 回退 | 无音效 / 降音量 |
| 清理 | 白名单清空；应用失焦时停止新播放请求（既有文档要求，真机未验证） |
| 测试 | `test/compatibility.test.mjs` 断言输入边界；真机验收见 [13](13-testing-and-budgets.md) |
| 是否进入 Stable | **否**（E2） |

> 与动画事件、粒子爆发、相机效果的**时钟同步**：脚本可在同一 tick 发请求（平台侧可保证调用顺序），
> 但引擎内实际音频/画面时序不可控 → 标"调用顺序可保证，画面/音频同步未验证"。
> 应用失焦、设备切换、权限不足：平台侧返回 `degraded`/`denied`；真机行为未验证。

---

## 11. 资源与数据流 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ResourceService.load(opts): Observable<Progress, Result<ResourceHandle>>`；`ResourceHandle.release(): void`；`RepositoryIndex.apply(delta): Result<IndexState>` |
| 能力等级 | 平台侧（包/索引/校验/缓存/原子写入）= **Stable**（E4）；游戏内资源上传时机/热重载 = `Experimental`（E1） |
| 平台版本 | 平台侧不依赖客户端；游戏侧 1.21.130 |
| 实现路径 | `core/manifest-validator.mjs`、`services/integrity.mjs`、`services/installation-service.mjs`、`schemas/repository-index.v2.schema.json` |
| 资源格式 | `.loompack`（zip）+ `META/file-list.json` + 仓库索引 JSON |
| 权限 | `resource.read:<ns>`；**不提供任意文件系统访问**，只有受控 `ResourceHandle` |
| 线程模型 | Node 单线程 + 异步 I/O；可取消（`AbortSignal`）、进度可观察 |
| 每帧成本 | 无（I/O 期） |
| 成功证据 | 原子写入、去重、引用计数、损坏恢复、磁盘/内存预算、验签全覆盖（E4，EVIDENCE.md） |
| 失败模式 | 七态齐全，含 `timeout`（下载/加载）、`resource-exhausted`（预算）、`partial`（部分资源损坏） |
| 回退 | 损坏恢复从备份/缓存重建；不可恢复进入安全模式 |
| 清理 | 原子写入临时目录 + 提交/回滚清理；`ResourceHandle` 引用计数，退出世界强制回收 |
| 测试 | `test/installation.test.mjs`、`test/signature-integrity.test.mjs`、`test/compatibility.test.mjs` |
| 是否进入 Stable | **是**（S01/S04/S14 等，platform-side E4） |

> 资源包合并/覆盖顺序/命名空间/指纹/依赖/迁移、模型/纹理/动画/UI/音效验证器、
> 缓存完整性/原子写入/损坏恢复/配额：全部在平台侧实现并可自动测试。
> 不提供任意文件系统访问：界面层只通过服务契约，见 [02](02-package-structure.md) B2/B7。

---

## 12. 客户端数据与持久化 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ConfigService.get(scope,id): Result<Config>；set(scope,id,patch): Result<Config>`；`StorageService.open(ns,version): Result<StorageHandle>`；`ProfileService.export/import` |
| 能力等级 | 平台侧配置/配置集/迁移/备份 = **Stable**（E4）；游戏内 `Dynamic Properties` 持久化 = `Experimental`（E1） |
| 平台版本 | 平台侧不依赖客户端；游戏侧 1.21.130 |
| 实现路径 | `core/config-merge.mjs`、`services/installation-service.mjs`（原子保存）、`schemas/transaction-log.v1.schema.json`；旧 `StorageApi` 保持内存兼容层不变 |
| 资源格式 | 配置 JSON（带 `schemaVersion`）、备份快照、配置集 `.loomprofile` |
| 权限 | `storage.mod:<ns>` / `storage.world:<ns>`；服务端不可写该命名空间；敏感项脱敏、令牌不写普通配置 |
| 线程模型 | 平台侧单线程 + 原子文件写入；游戏侧主线程 |
| 每帧成本 | 无 |
| 成功证据 | 原子保存、Schema 版本迁移、损坏隔离、云同步冲突检测、配额（E4，EVIDENCE.md） |
| 失败模式 | `denied`（越权写）、`resource-exhausted`（配额）、`partial`（迁移冲突需展示差异）、`timeout`（同步） |
| 回退 | 恢复默认 / 从备份回滚；冲突时展示差异不静默覆盖 |
| 清理 | 删除按配额与审计记录；`StorageHandle.dispose()` 幂等 |
| 测试 | `test/config-merge.test.mjs`、`test/compatibility.test.mjs` |
| 是否进入 Stable | **是**（S09/S10/S19，platform-side E4） |

> **多人权威数据不得伪装成本地事实**：本地配置只标 `scope=local`，任何来自服务器的值带 `source=remote`
> 与 `authoritative` 标记，不写入本地事实层。云同步冲突为 `partial` 并展示差异，不自动选胜者。

---

## 13. 模组间 API

| 字段 | 裁定 |
|---|---|
| 接口签名 | `ServiceRegistry.register(desc): Result<Handle>；discover(query): Result<ServiceRef[]>`；`EventBus.on(topic,handler,opts): Disposable`；`emit(topic,payload): Result<EventReport>` |
| 能力等级 | 平台侧（服务注册发现/扩展点/版本范围/软依赖/事件超时/错误隔离/调用链诊断）= **Stable**（E4）；游戏内跨模组脚本调用 = `Experimental`（E1） |
| 平台版本 | 平台侧不依赖客户端；游戏侧 1.21.130 |
| 实现路径 | `core/resolver.mjs`（版本范围/软依赖/拓扑）、`core/fsm.mjs`（事件超时与隔离）、`core/permissions.mjs`（权限委托）、`services/diagnostics.mjs`（调用链） |
| 资源格式 | 服务描述 JSON（带版本范围、能力声明） |
| 权限 | 每服务独立权限；**禁止直接读取其他模组内部文件或私有对象**（B4 边界规则） |
| 线程模型 | 同步事件有深度上限与超时；异步任务可 `AbortSignal` 取消 |
| 每帧成本 | 事件驱动；同步调用深度上限、每模组事件预算 |
| 成功证据 | 环检测、超时熔断、单模组异常不扩散、调用链诊断、故障计数与恢复（E4，EVIDENCE.md） |
| 失败模式 | `denied`（权限）、`timeout`（事件超时）、`degraded`（部分监听器失败 → `partial`）、`resource-exhausted` |
| 回退 | 软依赖缺失只生成诊断；同步失败隔离该模组，不影响加载器与其他模组 |
| 清理 | 所有 `on()` 返回取消函数；模组卸载强制取消订阅并释放共享实例引用 |
| 测试 | `test/resolver.test.mjs`、`test/fsm.test.mjs`、`test/permissions.test.mjs` |
| 是否进入 Stable | **是**（S07/S08/S16/S17/S18，platform-side E4） |

---

## 14. 可选网络表现协议（BLSP/1）

| 字段 | 裁定 |
|---|---|
| 接口签名 | `PresentationProtocol.handle(player, request): boolean`（既有 `main.js` 预留）；`ProtocolService.negotiate(caps): Result<Session>` |
| 能力等级 | 平台侧安全校验（白名单/版本/幂等/过期/预算/权限）= **Stable**（E4）；真实网络表现与跨端可见性 = `Experimental`（E1） |
| 平台版本 | 平台侧不依赖客户端；游戏侧 1.21.130 |
| 实现路径 | 既有 `runtime.js` 的 `acceptServerPresentation` 语义 + `core/fsm.mjs` 幂等 ID 去重 + 事务化创建/更新/销毁 |
| 资源格式 | BLSP/1 JSON 消息（`protocol/server_id/request_id/expires_at/budget/kind/payload`） |
| 权限 | 私有/公共表现区分；资源引用只能指向客户端已声明白名单 ID；限额与重连恢复 |
| 线程模型 | 主线程事件；异步请求可取消 |
| 每帧成本 | 每 tick 请求上限 16，不跨 tick 排队 |
| 成功证据 | 恶意包拒绝、重复 ID 幂等、过期拒绝、预算截断、断线不影响本地（E4 平台侧断言） |
| 失败模式 | `denied`/`timeout`/`resource-exhausted`/`degraded`（按类型过滤） |
| 回退 | 不支持 BLSP 时忽略远端表现，保留本地动画/粒子/音效/UI；**离线单人模式完全不依赖该模块** |
| 清理 | 断线/权限撤销/请求过期停止更新；`request_id` 缓存到期清理 |
| 测试 | `test/compatibility.test.mjs`、`test/fsm.test.mjs` |
| 是否进入 Stable | **平台侧校验部分是**（E4）；网络模块本身否（需真机） |

> 明确：网络不可用不得影响本地模组基本功能；服务端永远不能运行客户端脚本、写入本地存档、
> 发起任意 UI、改变客户端资源、授予玩法权限或绕过玩家设置（沿用既有 `PLATFORM.md` 安全模型）。

---

## 汇总：14 类的 Stable 判定

| 类别 | 进入 Stable 的部分 | 未进入 Stable 的部分 |
|---|---|---|
| 1 渲染场景 | 无 | 全部 |
| 2 模型几何材质 | 注册/校验/签名（S01/S04） | 运行时几何与材质 |
| 3 动画骨骼 | 无 | 全部 |
| 4 粒子特效 | 无 | 全部 |
| 5 光照环境 | 无 | 全部 |
| 6 相机后处理 | 无 | 全部 |
| 7 UI/HUD | 插槽冲突登记（S07/S08） | 绘制类全部 |
| 8 输入命中 | 冲突登记、只读命中（平台侧） | 低层输入抽象 |
| 9 世界表现 | 平台侧空间数据索引 | 绘制类全部 |
| 10 音频同步 | 无 | 全部 |
| 11 资源数据流 | 全部平台侧能力 | 游戏内上传/热重载 |
| 12 客户端数据持久化 | 全部平台侧能力 | 游戏内持久化 |
| 13 模组间 API | 全部平台侧能力 | 游戏内跨模组脚本调用 |
| 14 可选网络协议 | 平台侧安全校验 | 网络表现本身 |

**最终：Stable 20 个接口全部是 platform-side；14 类中没有任何"游戏内渲染介入"接口进入 Stable。**
详见 [17-final-answer.md](17-final-answer.md)。
