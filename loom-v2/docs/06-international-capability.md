# 交付物 5：国际版 1.21.130 能力矩阵（含 E0–E5 证据级别）

## 6.1 复核基线

| 字段 | 值 | 来源 |
|---|---|---|
| 客户端版本 | **Minecraft 基岩版国际版 1.21.130**（"群骑纷争" / Mounts of Mayhem 首个正式版） | 官方 changelog、中文 Minecraft Wiki |
| 发布日期 | 2025-12-09 | 同上 |
| 协议版本 | 898 | 中文 Minecraft Wiki |
| 构建号（记录用） | Windows 39448925；Android 39263180/39263185；Switch 39263186；Windows/Xbox 平台版本 1.21.13004.0 | 中文 Minecraft Wiki |
| 目标发行形态 | `international`（非 Java、非网易、非定制客户端） | 项目定位 |
| 存档方式 | **未验证**（沙箱未运行真机；本地单人 / Realms / BDS 三种均未实测） | — |
| 测试日期 | **未运行（沙箱无 1.21.130 客户端）**；文档/changelog 核对日期 **2026-11-06** | — |
| 图形模式 | Vibrant Visuals（灵动视效）为 1.21.130 相关图形模式；具体设备启用状态 **未验证** | 官方 changelog 提及 |

### 官方来源清单（E1/E2 证据）

| 编号 | 来源 | 用途 |
|---|---|---|
| S1 | [Minecraft 1.21.130 Bedrock Changelog (minecraft.net, 2025-12-09)](https://www.minecraft.net/en-us/article/minecraft-1-21-130-bedrock-changelog) | 新增 `@minecraft/server-graphics` 的范围；`@minecraft/server` v2.4.0 相关转正；Vibrant Visuals 相关修复 |
| S2 | [中文 Minecraft Wiki：基岩版 1.21.130](https://zh.minecraft.wiki/w/%E5%9F%BA%E5%B2%A9%E7%89%881.21.130?variant=zh) | 版本号、发布日期、构建号、协议版本、平台版本 |
| S3 | [Microsoft Learn：Player 类](https://learn.microsoft.com/en-ie/minecraft/creator/scriptapi/minecraft/server/player) | `spawnParticle` / `playSound` / `onScreenDisplay` 等公开方法 |
| S4 | [Microsoft Learn：ScreenDisplay 类](https://learn.microsoft.com/en-za/minecraft/creator/scriptapi/minecraft/server/screendisplay) | `setActionBar` / `setTitle` / `setHudVisibility` / `hideAllExcept` 及官方 TS 示例 |
| S5 | [Microsoft Learn：Dimension / spawnParticle 官方示例](https://learn.microsoft.com/en-au/minecraft/creator/scriptapi/minecraft/server/dimension) | `MolangVariableMap` 注入 `variable.color` 的官方示例 |
| S6 | [Microsoft Learn：BiomeAtmospherics（@minecraft/server-graphics）](https://learn.microsoft.com/en-za/minecraft/creator/scriptapi/minecraft/server-graphics/biomeatmospherics?view=minecraft-bedrock-stable) | 大气散射参数 set/reset 的确切方法清单 |
| S7 | [Microsoft Learn：Vibrant Visuals 光照定制](https://learn.microsoft.com/en-ie/minecraft/creator/documents/vibrantvisuals/lightingcustomization) | `lighting/global.json`、`local_lighting/local_lighting.json`、`pbr/global.json` 资源格式；1.21.90 起逐生物群系规则 |
| S8 | [Microsoft Learn：大气效果资源格式](https://learn.microsoft.com/zh-hk/minecraft/creator/documents/vibrantvisuals/atmosphericscustomization) | `atmospherics/atmospherics.json` 的 schema 字段 |
| S9 | [Microsoft Learn：Bedrock Editor 的 Vibrant Visuals](https://learn.microsoft.com/en-in/minecraft/creator/documents/bedrockeditor/editorvibrantvisuals) | 编辑器可导出 Vibrant Visuals 资源包；色彩分级/色调映射/阴影/方向光参数 |
| S10 | [Microsoft Learn：1.20 创作者更新说明](https://learn.microsoft.com/zh-tw/minecraft/creator/documents/update1.20) | `@minecraft/server-ui` 表单（Modal/Message/Action）、`playSound`、`playMusic` 的公开历史 |

**第三方来源（不作为结论证据，仅用于发现线索）**：jaylydev.github.io/scriptapi-docs
（站点自述 *not affiliated with Microsoft or Mojang*），其 v1.21.130 归档页的
"Platform Differences"表标注 *as of Minecraft v26.30* —— **版本混用，本矩阵不引用该表**。

## 6.2 本矩阵的书写纪律

- 每行必须写全 `clientBuild / distribution / platform / worldStorage / testDate / evidenceLevel / evidenceDomain / status`。
- 未实测的一律写 **`未验证`**，不写"支持""应该可以""理论上"。
- E1/E2 只能得 `Experimental`；E3 最多 `Candidate`；E4+ 才可能 `Stable`。
- `in-game` 域在沙箱内证据上限为 **E2**（无真机、无官方自动截图/渲染测试通道）。
  因此本矩阵中**没有任何 `in-game` 条目进入 Stable/Candidate**。
- Java 版、网易版、26.x 的证据不用于国际版 1.21.130 结论。26.50 中
  `@minecraft/server-graphics` 升 1.0.0、`Player.fogSettings`、`DebugShape` 等属于**后续版本**，
  本矩阵标"1.21.130 未验证/不适用"，不计入。

## 6.3 能力矩阵

简写：`CB`=1.21.130 / international；`PL`=平台（官方 changelog 覆盖多平台，**具体设备未验证**）；
`WS`=存档方式（**未验证**）；`TD`=测试日期（**未运行（沙箱无客户端）；文档核对 2026-11-06**）。
所有行 `CB`/`PL`/`WS`/`TD` 默认值即上述简写，表内只在有差异时另注。

### A. 平台侧（管理器 / 包 / 依赖 / 事务 / 权限 / 诊断 / 迁移）

| # | 能力 | 证据级别 | 证据域 | 状态 | 证据 / 备注 |
|---|---|---|---|---|---|
| A1 | v2 manifest 校验与错误码 | **E4** | platform-side | **Stable** | `test/manifest-validator.test.mjs` 跨 v1/v2/损坏/边界 fixture 通过，见 EVIDENCE.md |
| A2 | 签名信封 + 文件清单全覆盖 | **E4** | platform-side | **Stable** | `test/signature-integrity.test.mjs`：含"替换未列文件被拒绝"负向用例 |
| A3 | SemVer 范围与候选版本排序 | **E4** | platform-side | **Stable** | `test/semver.test.mjs` |
| A4 | 依赖拓扑、软依赖、冲突解释 | **E4** | platform-side | **Stable** | `test/resolver.test.mjs`：环、缺依赖、命名空间/服务/按键/HUD 冲突 |
| A5 | 分层配置合并与迁移 | **E4** | platform-side | **Stable** | `test/config-merge.test.mjs` |
| A6 | 安装/升级/卸载/启停状态机与回滚 | **E4** | platform-side | **Stable** | `test/fsm.test.mjs` + `test/installation.test.mjs`（真实临时目录原子写入） |
| A7 | 权限分级、风险判定、再确认 | **E4** | platform-side | **Stable** | `test/permissions.test.mjs` |
| A8 | v1→v2 迁移与旧接口兼容 | **E4** | platform-side | **Stable** | `test/migration.test.mjs` + `test/compatibility.test.mjs`（校验和不变断言） |
| A9 | 脱敏诊断包与贡献度统计 | **E4** | platform-side | **Stable** | `test/compatibility.test.mjs` |
| A10 | 仓库索引增量/撤销解析 | **E4** | platform-side | **Stable** | `test/compatibility.test.mjs` |
| A11 | 能力报告解析（v1 schema + v2 可选字段） | **E4** | platform-side | **Stable** | `test/compatibility.test.mjs` |
| A12 | 七态结果语义与 `Disposable` 幂等 | **E4** | platform-side | **Stable** | `test/compatibility.test.mjs` |

> A 类全部 `CB=不适用（不依赖客户端）`，`E4` 指本仓库 `node --test` 跨 fixture 版本连续通过；
> **不表示**对 1.21.130 客户端渲染行为的证明。

### B. 游戏内：官方公开路径（`in-game`，E1/E2，均 `Experimental`）

| # | 能力 | 实际介入点 | 来源 | 级别 | 状态 | 未验证项 |
|---|---|---|---|---|---|---|
| B1 | 资源包静态 geometry / attachable / animation / controller | `ResourceBuild` + `ResourceLoad` | 既有 `mod/resource_pack/*`；官方附加包格式 | E1 | `Experimental` | 1.21.130 实际加载、黄金截图 |
| B2 | 预定义粒子模板（particle JSON） | `ResourceBuild` | 既有 `loom_spark.particle.json` | E1 | `Experimental` | 同上 |
| B3 | `Player.spawnParticle` 提交 | `SimulationSync`（对象提交） | S3/S5 | E2 | `Experimental` | 真机可见性、数量预算、清理 |
| B4 | 发射时注入 `MolangVariableMap`（模板变量） | `SimulationSync`（发射时绑定） | S5 官方示例 | E2 | `Experimental` | 变量白名单、资源模板是否声明对应变量 |
| B5 | `Player.playSound` + `sound_definitions` | `SimulationSync`（音频提交） | S3/S10 | E2 | `Experimental` | 3D 衰减、并发、失焦 |
| B6 | `ScreenDisplay.setActionBar` | `UiDraw`（屏幕文本） | S4 | E2 | `Experimental` | DPI、安全区、TTL 行为 |
| B7 | `ScreenDisplay.setTitle` / `updateSubtitle` | `UiDraw`（标题/副标题） | S4 官方 TS 示例 | E2 | `Experimental` | 与 HUD 层叠、焦点 |
| B8 | `ScreenDisplay.setHudVisibility` / `hideAllExcept` / `resetHudElementsVisibility` | `UiDraw`（HUD 元素可见性） | S4 | E2 | `Experimental` | 核心界面保护边界、玩家设置冲突 |
| B9 | `@minecraft/server-ui` 模态表单（Action/Message/ModalFormData） | `UiDraw`（模态弹窗） | S10 | E2 | `Experimental` | 是否为任意声明式 UI：否；焦点/导航能力未验证 |
| B10 | `world.afterEvents.itemUse` 等官方事件 | `SimulationSync`（输入事件） | 既有 `runtime.js`/`client_api.js`；官方事件模型 | E2 | `Experimental` | 键盘/手柄抽象、输入消费语义 |
| B11 | `Dimension.getEntities` / `getEntitiesFromRay` / `Entity.getEntitiesFromViewDirection` | `SimulationSync`（只读观察 / 命中） | S1（1.21.130 修复记录）、S3 | E2 | `Experimental` | 字段稳定性、频率、权限、会话隔离 |
| B12 | `@minecraft/server-graphics` 大气散射参数（Rayleigh/Mie/天空色/地平线混合 set+reset） | `PostProcess` **之前的环境参数设置**（引擎参数，非 pass） | S1、S6 | E2 | `Experimental` + `PlatformRestricted` | 1.21.130 是否需实验开关、Realms/BDS 限制、设备是否启用 Vibrant Visuals |
| B13 | `atmospherics/atmospherics.json` 资源定义 | `ResourceBuild` → `ResourceLoad`（引擎大气散射） | S8 | E1 | `BuildTimeOnly` | 覆盖顺序、逐生物群系映射、真机画面 |
| B14 | `lighting/global.json`（方向光/环境光/天空光）、`pbr/global.json` | `ResourceBuild` → `ResourceLoad`（引擎光照参数） | S7 | E1 | `BuildTimeOnly` + `PlatformRestricted` | 1.21.90 起不再覆盖原版逐生物群系光照；真机 |
| B15 | `local_lighting/local_lighting.json`（把点光颜色/类型绑定方块） | `ResourceBuild`（**静态资源绑定**） | S7 | E1 | `BuildTimeOnly` | 不是任意位置运行时点光；Vibrant Visuals 依赖 |
| B16 | Editor 导出 Vibrant Visuals 配置（含色彩分级/色调映射/阴影参数） | `ResourceBuild`（创作期生成资源） | S9 | E1 | `BuildTimeOnly` | 需 Editor；非运行时动态效果栈 |
| B17 | 官方 `Dynamic Properties` 持久化 | 非渲染（本地数据） | 官方 Script API 文档 | E1 | `Experimental` | 配额、迁移、损坏隔离、真机 |
| B18 | BLSP/1 表现请求安全校验 | 非渲染（协议边界） | 既有 `runtime.js` | E1 | `Experimental` | 断线/重连/撤销真机 |

### C. 游戏内：只能观察 / 不可访问（`Unavailable` 或 `CustomClientOnly`）

| # | 能力 | 判定 | 级别 | 状态 | 依据 |
|---|---|---|---|---|---|
| C1 | 自定义 Shader / 材质参数运行时覆盖 | 需 R3 扩展点 | E0 | `Unavailable` | 官方 1.21.130 无公开扩展；S1 的 graphics 模块范围仅大气散射 |
| C2 | 顶点/索引/法线/UV/骨骼权重的运行时几何提交与修改 | 需几何缓冲提交接口 | E0 | `Unavailable` | 同上 |
| C3 | 帧缓冲 / 全屏后处理 pass / 模糊 / 描边 / 景深 / 色差（真实后处理） | 需帧缓冲与 pass 注册 | E0 | `Unavailable` | 同上；资源包色彩分级 B16 只是静态参数 |
| C4 | 任意渲染层注册、透明排序控制、深度测试/混合控制 | 需排序器/层注册 | E0 | `Unavailable` | 引擎固定；既有 `RENDER_PATH_LEDGER.md` 已否定 |
| C5 | 每帧骨骼矩阵写入 / 实时 IK / 程序化骨骼 | 需每帧写入能力 | E0 | `Unavailable` | 只有预声明动画控制器/Molang |
| C6 | 运行时点光/聚光（任意位置、动态强度衰减） | 无运行时光照对象 | E0 | `Unavailable` | B15 只是静态方块绑定 |
| C7 | 原生相机 Hook、FOV/焦点/平滑控制权 | 无公开相机提交 | E0 | `Unavailable` | 既有 `CameraApi.pulse` 已标 `visualGuarantee: none` |
| C8 | 世界空间 UI / 实体附着 UI / billboard 通用绘制 | 无通用公开提交 | E0 | `Unavailable` | 既有 `WorldUiApi.mount` 显式返回 `false` |
| C9 | decal / 遮挡穿墙描边 / 可控高亮 | 无深度贴花/描边提交 | E0 | `Unavailable` | 既有台账已否定 |
| C10 | 动态纹理上传 / 纹理流送 / 运行时图集替换 | 无公开纹理上传句柄 | E0 | `Unavailable` | 同上 |
| C11 | 屏幕空间粒子发射器 / 运行时修改已提交粒子参数 | 无通用 screen-space emitter | E0 | `Unavailable` | B4 仅为发射时绑定 |
| C12 | 帧前/帧后回调、FramePresent 诊断与回收 | 无逐帧渲染回调 | E0 | `Unavailable` | 既有 `RENDER_AUDIT.md` §4.1 停机点 |
| C13 | 网易版能力等价实现 | 平台不同 | E0 | `CustomClientOnly` | 不复制/嵌入网易 SDK，适配器默认关闭 |
| C14 | 定制客户端 R2/R3 渲染扩展 | 需签名 SPI | E0 | `CustomClientOnly` | 既有 `RENDER_SPI.md` 草案；本仓库无实现 |

## 6.4 逐阶段结论速查（详见 [04](04-render-stage-contract.md)）

| 阶段 | 国际版 1.21.130 | 最强证据 |
|---|---|---|
| ResourceBuild | **间接影响**（可写资源） | B1/B2/B13/B14/B15/B16（E1/E2） |
| ResourceLoad | **间接影响**（游戏加载，平台不可控上传时机） | B1（E1） |
| SimulationSync | **间接影响**（提交粒子/音效/输入事件/只读观察） | B3/B5/B10/B11（E2） |
| SceneUpdate | **只能观察**（预设动画控制器由引擎更新） | B1（E1） |
| CullAndSort | **不可访问** | C4（E0） |
| GeometrySubmit | **不可访问** | C2（E0） |
| RenderLayer | **不可访问** | C4（E0） |
| PostProcess | **间接影响（仅参数）** / 自定义 pass **不可访问** | B12/B16（E1/E2） vs C3（E0） |
| UiDraw | **间接影响（受限）**：action bar / title / HUD 可见性 / 模态表单 | B6–B9（E2） |
| FramePresent | **不可访问** | C12（E0） |

## 6.5 正式授权路径（C 类升级的唯一途径）

1. 向 Mojang/Microsoft 或正式 SDK 所有方提交：最小可复现包、数据流与权限模型、性能/崩溃预算、
   隐私与供应链方案、平台覆盖、回滚与用户告知、自动化验收与兼容周期。
2. 取得**版本化公开文档 + 签名扩展点 + 官方测试通道**后，按 [01](01-freeze-definition.md) 重新评级：
   E2 → E3（真机最小工程）→ E4（自动测试跨版本）→ 方可讨论 `Stable`。
3. 正式授权只落在独立适配器与签名 SPI，不污染上层 API；国际版构建不包含授权代码。
4. 在证据到位前，仓库不得出现 DLL、注入器、Hook、私有符号、签名破解、Shader 替换器或二进制补丁。

## 6.6 明确写"未验证"的项目（汇总）

- 1.21.130 在 Windows / Android / iOS / Xbox / PlayStation / Switch 各设备上的实际可用性：**未验证**。
- 本地单人 / Realms / BDS 三种存档方式下的行为差异：**未验证**；第三方 v26.30 平台差异表不适用于本结论。
- `@minecraft/server-graphics` 在 1.21.130 是否需实验性开关、是否要求 `permissions.json` 手动启用：**未验证**。
- Vibrant Visuals 资源 JSON 的覆盖顺序、逐生物群系映射、与 Engine 内置默认值优先级：**未验证**。
- 所有画面结果（可见性、排序、遮挡、DPI、帧时间、清理）：**未验证**，需按 [13](13-testing-and-budgets.md) 真机验收。
- 1.21.130 上 `@minecraft/server` 的确切模块版本号：官方 changelog 显示多项 API 转入 **v2.4.0**（E1），
  页面未给出单独模块版本声明，故记为**推断，未完全验证**；既有包声明的 1.14.0 与目标基线存在版本差。
