# 交付物 1：对现有文件的影响清单（保留 / 新增 / 弃用 / 迁移，零覆盖）

审查对象：`../mod`（Bedrock Loom v1.1），40 个文件、约 1571 行。审查日期 2026-11-06。

## 1.1 结论

- **保留（40/40）**：全部既有文件字节级不变，不覆盖、不重命名、不删除、不重排目录。
- **新增（46 个）**：全部位于 `loom-v2/`，模块名独立，不占用既有路径。
- **弃用（0 个文件被改）**：弃用是**外部标注**，通过 `loom-v2/` 的兼容层与文档完成；旧文件本身不含 `@deprecated` 修改。
- **迁移**：`services/migrate-v1-to-v2.mjs` 真实读取旧 `mod.json`，产出 v2 manifest；不写回旧目录。

### 既有文件校验基线（用于验收"没被覆盖"）

| 文件 | SHA-256 |
|---|---|
| `mod.json` | `b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48` |
| `docs/RENDER_AUDIT.md` | `3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390` |
| `behavior_pack/scripts/api/client_api.js` | 保留不变，v2 通过 `compat` 层包装，不在原文件追加导出 |

> 验收命令：`sha256sum ../mod/mod.json ../mod/docs/RENDER_AUDIT.md`，与表中一致即证明零覆盖。

## 1.2 逐文件影响清单

| 既有路径 | 处置 | 说明 |
|---|---|---|
| `README.md` | 保留 | v1.1 入口文档继续有效；v2 入口为 `loom-v2/README.md`，两者不互相覆盖 |
| `mod.json` | 保留 + **迁移输入** | schema `bedrockloom.mod/v1`；作为 `migrate-v1-to-v2.mjs` 的输入 |
| `.gitignore` | 保留 | 不变 |
| `examples/mod.manifest.json` | 保留 + **迁移输入** | v1 示例 manifest 作为兼容测试 fixture |
| `behavior_pack/manifest.json` | 保留 + **标注版本差** | 见 §1.3 发现 ① |
| `behavior_pack/scripts/main.js` | 保留 | 14 类 API 的调用样例，v2 不改动 |
| `behavior_pack/scripts/runtime.js` | 保留 | 生命周期 + BLSP/1 安全校验，v2 复用其语义 |
| `behavior_pack/scripts/api/client_api.js` | 保留 + **兼容包装** | 14 个类的公开构造函数/方法签名冻结；v2 只新增 `compat/v1-adapter` 描述，不改此文件 |
| `behavior_pack/scripts/api/capability_probe.js` | 保留 + **枚举映射** | `CapabilityStatus` 7 值映射到 v2 七态，见 [14](14-version-migration.md) |
| `behavior_pack/scripts/api/self_test.js` | 保留 | v1 自检继续可运行；v2 测试独立放在 `loom-v2/test/` |
| `platform/international/adapter.js` | 保留 + **能力补充** | `detect()` 返回的固定布尔快照不改；v2 在外部增加能力报告解析层 |
| `platform/netease/adapter.js` | 保留 | 空实现与 `enabled:false` 保持不变；v2 只增加契约测试，见 [10](10-sandbox-and-trust.md) |
| `behavior_pack/items/loom_blade.json`、`recipes/loom_blade.json` | 保留 | 示例内容 |
| `resource_pack/manifest.json` | 保留 | 原生资源包 manifest |
| `resource_pack/models/entity/loom_blade.geo.json` | 保留 | 静态 geometry（创作期资源） |
| `resource_pack/attachables/loom_blade.attachable.json` | 保留 | 预声明挂点 |
| `resource_pack/animations/*`、`animation_controllers/*` | 保留 | 预声明动画与状态机 |
| `resource_pack/render_controllers/*` | 保留 | 预声明渲染控制器（资源层，非管线控制） |
| `resource_pack/particles/loom_spark.particle.json` | 保留 | 预定义粒子模板 |
| `resource_pack/sounds/sound_definitions.json` | 保留 | 音效定义 |
| `resource_pack/ui/hud_screen.json` | 保留 | 资源层 UI 片段，**未验证**是否被 1.21.130 加载 |
| `resource_pack/texts/*` | 保留 | 本地化 |
| `resource_pack/textures/*`（含 `items/loom_blade.png`） | 保留 | 贴图与图集 |
| `docs/PLATFORM.md` | 保留 | 运行时分层与生命周期，v2 沿用 |
| `docs/API.md` | 保留 | 14 类 API 契约，v2 冻结其签名 |
| `docs/MANIFEST.md` | 保留 + **扩展** | v1 manifest 规范；v2 包格式见 [08](08-package-format-2.md)，不改此文 |
| `docs/PROTOCOL.md` | 保留 | BLSP/1，v2 沿用并补 §14 的可选网络表现协议 |
| `docs/RENDER_AUDIT.md` | 保留 + **补充结论** | 见 §1.3 发现 ②；不修改原文 |
| `docs/CAPABILITY_MATRIX.md` | 保留 + **矩阵重算** | v2 [06](06-international-capability.md) 按 1.21.130 重算 |
| `docs/CAPABILITY_PROBE.md` | 保留 | 报告 Schema；v2 增加证据域字段 |
| `docs/PROBE_SCENARIOS.md` | 保留 | 八个探针场景，v2 [13](13-testing-and-budgets.md) 沿用并补真机步骤 |
| `docs/RENDER_OPERATIONS.md` | 保留 | 预算表，v2 在 `core/` 固化为常量 |
| `docs/RENDER_PATH_LEDGER.md` | 保留 | 路径台账，v2 [04](04-render-stage-contract.md) 逐阶段对照 |
| `docs/RENDER_SPI.md` | 保留 | 定制客户端 SPI 草案，v2 只做契约测试预留 |

## 1.3 审查中发现的五个真实问题（只记录，不改旧文件）

**① 版本基线不一致（确定）**
旧 `behavior_pack/manifest.json` 声明 `@minecraft/server` **1.14.0**、`min_engine_version` **1.21.0**；
目标基线为 **1.21.130**。官方 1.21.130 changelog 显示多个 API 从 beta 转入 `@minecraft/server` **v2.4.0**。
旧包未声明 `@minecraft/server-ui`、`@minecraft/server-graphics`，也未声明 `capabilities`。
→ 迁移脚本输出 `moduleVersions` 建议并标注 `requiresVerification`；不擅自重写原生 manifest。

**② `RENDER_AUDIT.md` 的"未发现官方公开证据"需要补注（确定）**
官方 1.21.130 changelog 原文：
`Added new module @minecraft/server-graphics to change graphics and rendering settings. The current set of APIs are associated with Atmospheric Scattering parameters in Vibrant Visuals`。
即目标版本**存在**官方公开图形模块。但它是设置级参数（Rayleigh/Mie/天空颜色/地平线混合，见官方
`BiomeAtmospherics` 类），**不提供**帧回调、几何/材质提交、渲染层、帧缓冲或自定义后处理 pass。
既有 R2/R3 结论仍成立，但"未发现官方公开图形模块"这一表述在 1.21.130 上不准确。
→ 本仓库在 [06](06-international-capability.md) 与 [17](17-final-answer.md) 补注，原文保留。

**③ `ParticleApi.emit` 未使用官方支持的 `MolangVariableMap`（确定，来自官方示例）**
官方 `Player.spawnParticle(effectName, location, molangVariables?)` 允许发射时注入模板变量
（示例 `molang.setColorRGB('variable.color', ...)`）。旧实现只传 location。
→ 这是"发射时绑定预定义变量"，**不是**运行时修改已提交粒子。v2 在 [05](05-api-adjudication.md) 的
粒子裁定里把它列为可增强的 `Experimental` 路径，并严格区分三类：动态参数重新上传（Unavailable）、
交换预定义变体（资源层）、发射时注入模板变量（E2）。

**④ `StorageApi` 是内存 Map，退出即丢失（旧文档已如实标注）**
官方存在 `Dynamic Properties`（世界/实体动态属性）持久化路径（E1/E2）。
→ v2 只在 [05](05-api-adjudication.md) 登记为 `Experimental` 候选，不修改 `client_api.js`；
真机持久化验证列入 [13](13-testing-and-budgets.md)。

**⑤ 第三方版本归档页存在版本混用陷阱（确定）**
`jaylydev.github.io/scriptapi-docs/1.21.130/` 的"Platform Differences"表标注
*as of Minecraft v26.30*，且站点声明 *not affiliated with Microsoft or Mojang*。
→ 该表**不作为 1.21.130 证据**；`@minecraft/server-graphics` 的平台限制条目标"未验证"，
只引用官方 1.21.130 changelog 的模块新增事实。

## 1.4 弃用标注（外部，不编辑旧文件）

| 旧接口/表述 | 处置 | 兼容方式 | 迁移 |
|---|---|---|---|
| `mod.json` 的 `schema: bedrockloom.mod/v1` | 标注 `@deprecated(since=v2)`，仍可安装 | `services/migrate-v1-to-v2.mjs` 读取并转换 | 生成 `bedrockloom.mod/v2` |
| `api.version: "1.1"` / `classes[]` 数组 | 标注 `@deprecated(since=v2)` | v2 用 `capabilities[]` + `apiRange`；兼容层保留 `classes[]` 读取 | 映射表见 [14](14-version-migration.md) |
| `render.target: "R0"` / `R1-candidate` 字符串 | 标注 `@deprecated(since=v2)` | v2 用 `stageContracts[]` + `evidence[]` | R0–R3 保留为等级标签 |
| `CameraApi.pulse` 被称作"相机抖动" | 标注语义修正 | 旧方法保留、行为不变；v2 文档明确 `visualGuarantee: none` | 调用方按 [05](05-api-adjudication.md) 检查返回值 |
| `WorldUiApi.mount` 位于 `classes[]` 稳定清单 | 标注 `Unavailable` | 旧方法仍返回 `false` + 诊断，行为不变 | 调用方改为读取 `unsupported` 结果 |
| `StorageApi` 被称作"本地存档" | 标注语义修正 | 旧方法保留 | 需持久化的调用方走新增 `StorageService`（platform-side） |

## 1.5 迁移不变量

1. 旧包可被 v2 管理器读取、校验、安装；转换是**单向生成新文件**，不写回 `../mod`。
2. 旧 API 的类名、构造参数、返回结构全部冻结；v2 新增接口一律新名字，不重载旧签名。
3. 任何破坏性变更必须同时具备 `@since`、外部 `@deprecated` 标注、旧接口适配器、迁移脚本四件套。
4. 迁移失败不删除旧包、不产生半写入状态，返回 `partial` 并列出逐项原因。

自动化验证：`test/migration.test.mjs`、`test/compatibility.test.mjs`，结果见 [EVIDENCE.md](../EVIDENCE.md)。
