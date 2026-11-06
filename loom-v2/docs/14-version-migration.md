# 交付物 15：旧 API 兼容与版本迁移方案

审查对象：[`../../mod/mod.json`](../../mod/mod.json)（`bedrockloom.mod/v1`，Bedrock Loom v1.1）与
[`../../mod/examples/mod.manifest.json`](../../mod/examples/mod.manifest.json)（v1 示例 fixture）。
实现：[`services/migrate-v1-to-v2.mjs`](../services/migrate-v1-to-v2.mjs)、
[`core/manifest-validator.mjs`](../core/manifest-validator.mjs)、
[`services/integrity.mjs`](../services/integrity.mjs)。
验证：`test/migration.test.mjs`、`test/compatibility.test.mjs`（实际执行，见 [EVIDENCE.md](../EVIDENCE.md)）。
字段规范见 [08](08-package-format-2.md)，影响清单见 [00](00-impact-and-migration.md)。

## 14.1 兼容原则

1. **零覆盖**：`../mod` 下 40 个既有文件字节级不变。迁移脚本只 `readFile`，产物只写 `loom-v2/examples/`。
2. **旧签名冻结**：14 个类的类名、构造参数、返回结构不改、不删、不重载。v2 新增接口一律用新名字。
3. **破坏性变更四件套**（缺一不做变更）：
   `@since` 标注 → 外部 `@deprecated(since=v2)` 标注 → 旧接口适配器 → 迁移脚本。
   旧文件本身不写 `@deprecated`（那是编辑用户代码），标注只存在于 `loom-v2/` 文档与适配层。
4. **单向生成**：v1 → v2 是生成新文件，不是就地升级；失败不删旧包、不产生半写入状态。
5. **能力以真实证据为准**：与旧表述冲突时保留旧文件、在 [00](00-impact-and-migration.md) 记录发现，
   并按 [01](01-freeze-definition.md) 重新评级，而不是改旧文件让文档"自洽"。

## 14.2 旧 API 冻结清单（14 类）

`client_api.js` 的 14 个类签名保持不变；v2 只通过 `CLASS_MAP` 把每个类登记为 v2 `capabilities[]` 条目
（含状态、证据级别、证据域、介入阶段）。这是**描述层映射**，不调用、不包装、不改写旧实现。

| v1 类 | v2 capability.id | 状态 | 证据级别 / 域 | 介入阶段 |
|---|---|---|---|---|
| `ClientEventBus` | `event-bus` | `Stable` | E4 / platform-side | 非渲染 |
| `PermissionGate` | `permission-gate` | `Stable` | E4 / platform-side | 非渲染 |
| `ModelApi` | `model-registry` | `BuildTimeOnly` | E1 / in-game | `ResourceBuild` |
| `MaterialApi` | `material-registry` | `BuildTimeOnly` | E1 / in-game | `ResourceBuild` |
| `AnimationApi` | `animation-controller` | `Experimental` | E1 / in-game | `SceneUpdate` |
| `ParticleApi` | `particle-submit` | `Experimental` | E2 / in-game | `SimulationSync` |
| `SoundApi` | `sound-submit` | `Experimental` | E2 / in-game | `SimulationSync` |
| `ScreenUiApi` | `screen-ui` | `Experimental` | E2 / in-game | `UiDraw` |
| `WorldUiApi` | `world-ui` | **`Unavailable`** | E0 / in-game | `UiDraw` |
| `InputApi` | `input-events` | `Experimental` | E2 / in-game | `SimulationSync` |
| `CameraApi` | `camera-effect` | **`Unavailable`** | E0 / in-game | `PostProcess` |
| `EntityApi` | `entity-observation` | `Experimental` | E2 / in-game | `SimulationSync` |
| `StorageApi` | `local-storage` | `Experimental` | E1 / in-game | 非渲染 |
| `CapabilityProbe` | `capability-probe` | `Experimental` | E2 / in-game | 非渲染 |

未登记的类按 `Experimental / E1 / in-game` 兜底，并在迁移说明中列出。
测试 `S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类` 断言覆盖完整。

**语义修正但不改行为**（[00](00-impact-and-migration.md) §1.4）：

| 旧表述 | v2 结论 | 旧实现 |
|---|---|---|
| `CameraApi.pulse` 被称作"相机抖动" | `visualGuarantee: none`，`Unavailable` | 方法保留，行为不变 |
| `WorldUiApi.mount` 列入稳定清单 | `Unavailable`，返回 `false` + 诊断 | 方法保留 |
| `StorageApi` 被称作"本地存档" | 内存 Map，退出即丢失；持久化另走 `StorageService` | 方法保留 |

## 14.3 v1 manifest → v2 字段映射（完整）

输入为旧 `mod.json` 的 13 个顶层字段，输出为 [08](08-package-format-2.md) §8.1 的 v2 字段。

| v1 字段 | v2 字段 | 转换规则 |
|---|---|---|
| `schema: bedrockloom.mod/v1` | `schema: bedrockloom.mod/v2` | 常量替换；v1 直接作为 v2 安装时被 `E_MANIFEST_SCHEMA` 拒绝并提示迁移 |
| `id` | `identity.id` | 稳定 ID 原样保留，永不随改名变化 |
| `name` | `identity.name.{en_US, zh_CN}` | 与 ID 分离；v2 校验器拒绝 ID 与名称相同 |
| — | `identity.description / authors / license / homepage / source / icon / assetLicenses` | 新增，必填项在示例包中给出真实值（素材许可注明"示例值，替换时须核对"） |
| `version` | `version` | SemVer 原样 |
| `loader.range` | `loader.apiRange` + `loader.minManagerVersion: "2.0.0"` | 保留旧范围值；见 §14.6 核对项 |
| `entrypoints.client` | `entrypoints.client` | 加 `files/` 前缀，必须指向 `files/` 下 `.js` |
| `dependencies.bedrockloom` | `dependencies.requires[]` | 结构化为 `{id, range, reason}`；新增 `optional / conflicts / breaks / provides / resourceNamespaces / inputBindings / hudSlots` |
| `resources.namespace / roots` | `resources.{namespace, roots, packs}` | 命名空间不变，`roots` 加 `files/` 前缀 |
| `permissions[]` | `permissions[]` | 见 §14.5 |
| `api.version / api.classes[]` | `capabilities[]` + 兼容字段 `api` | 14 类映射（§14.2）；v2 校验器不依赖 `api` 字段，但允许其存在 |
| `render.target` / `render.*` | `stageContracts[]`（十项） + 兼容字段 `render` | R0–R3 **保留为等级标签**，不再作为能力判定；每项必须点名 `actualInterventionPoint` |
| `protocol.accept / server_requests` | 兼容字段 `protocol` + 可选网络表现协议登记 | v2 校验器不依赖 |
| `features.netease: false` | `client.platformAdapters: ["international"]` | 国际版构建只允许 `international`；含 netease/custom 被 `E_PLATFORM_ADAPTER` 拒绝 |
| — | `client.{clientVersionRange, moduleVersions, capabilityMap, graphicsMode}` | 新增；`clientVersionRange` 必须写具体基线 `>=1.21.130`，写 `1.21.x` 被拒 |
| — | `config.{schemaVersion, schema, defaults, layers, requiresRestart, sensitive}` | 新增，见 [11](11-algorithms.md) §11.9 |
| — | `signature.{envelope, algorithm, keyId, ...}` | 固定 `Ed25519` + `signature.json` |
| — | `content.{fileList, hashAlgorithm, manifestHash, totalBytes, fingerprint}` | `manifestHash` 由 `manifestDigest()` 计算 |
| — | `provenance.{sourceId, sourceKind, installedFrom, trustState, cachedAt}` | 记录 `../mod/mod.json（v1 迁移，只读）` |
| — | `compatibility.{minClientBuild, requiresExperiments, knownIssues, minManagerVersion}` | 已知问题与未验证项如实列出 |
| — | `migration.{fromSchema, notes, requiresVerification}` | 五个真实审查发现（[00](00-impact-and-migration.md) §1.3） |
| — | `i18n.{defaultLocale, locales, changelog, screenshots, media, releaseDate, supportedVersions}` | 新增 |
| — | `capabilities[]` 追加 `manifest-validation` | `Stable / E4 / platform-side`，来源 `test/manifest-validator.test.mjs` |
| — | `client.capabilityMap.international[]` | 6 项：粒子/屏幕 UI/大气散射为 `Experimental`，Shader/几何更新/帧缓冲为 `Unavailable` |

**v2 校验器对兼容字段的态度**：`api / render / protocol / features` 允许存在但不参与判定；
这样旧包经迁移后既保留原信息，又不会让旧 `render.target: "R0"` 字符串绕过十阶段合同。
测试 `S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2` 断言该边界。

## 14.4 状态枚举映射（双维度）

v1 [`capability_probe.js`](../../mod/behavior_pack/scripts/api/capability_probe.js) 的
`CAPABILITY_STATUS` 有 7 个值：`supported / unsupported / unknown / experimental /
platform-dependent / degraded / permission-required`。v2 把它们分到**两个不同维度**，
避免把"能力报告枚举"和"接口承诺等级"混为一谈：

| v1 CAPABILITY_STATUS | v2 `CapabilityDecl.status`（七种 API 状态） | v2 `Result.status`（调用结果七态） | 说明 |
|---|---|---|---|
| `supported` | **不直接映射为 `Stable`**；按 [01](01-freeze-definition.md) 用证据重新评级 | `ok`（仅表示平台侧契约完成） | v1 的 `supported` 不等于 v2 `Stable`；画面可见性仍需 B/C 层证据 |
| `experimental` | `Experimental` | `ok` / `degraded` | 需显式启用，默认关闭 |
| `degraded` | `Experimental`（附降级说明） | `degraded`（必须带 `reason` + `fallback`） | 不得用 `ok` 掩盖降级 |
| `platform-dependent` | `PlatformRestricted` | `unsupported` / `degraded` | 探测缺失时自动降级，不报警为故障 |
| `permission-required` | `Experimental`（需权限） | `denied`（未授予时）/`reconfirm` | 走 `PermissionService.evaluate()` |
| `unsupported` | `Unavailable` | `unsupported` | 附正式授权路径，不得伪装成 `ok` |
| `unknown` | `Experimental`（标 `未验证`） | `unsupported` / `degraded` | 不猜版本、不推断平台差异 |

`RENDER_CAPABILITIES` 的 15 个条目与 `R0–R3` 等级全部**保留为等级标签**；
`CapabilityReport` 沿用 `bedrockloom.capability-report/v1`，v2 只以**可选字段**追加
`evidenceDomain` / `evidenceLevel`，旧解析器不受影响（[02](02-package-structure.md) §2.6）。

## 14.5 权限声明映射

`mapPermissions()` 按 `:` 拆分旧声明（如 `storage.world:example.loom_blade`），
取 `base` 查 [`core/permissions.mjs`](../core/permissions.mjs) 的 `PERMISSION_CATALOG`：

| 输入 v1 | 输出 v2 |
|---|---|
| `presentation.local` | `{id:"presentation.local", scope:"local", risk:"low", plainReason, technicalDetail}` |
| `storage.world:example.loom_blade` | 同上 `storage.world`，`technicalDetail` 追加"旧声明带命名空间 example.loom_blade" |
| `input.local` | `input.local` / `medium` |
| `entity.observe.local` | `entity.observe.local` / `medium` |
| 未登记的权限 | **跳过并在 `migration.notes` 记录**，不猜测、不静默授予 |
| 全部为空 | 补 `presentation.local` 最小集 |

v1 的"权限字符串"升级为 v2 的**通俗说明 + 技术实现说明双层描述**，用于
[07](07-mod-manager-ia.md) H 板块与 [10](10-sandbox-and-trust.md) §10.3。
测试 `S20 权限映射：带命名空间的旧声明映射到 v2 目录项` 实际执行。

## 14.6 迁移脚本行为

`toV2(v1, options)`（纯函数）：

- 输入不是 `bedrockloom.mod/v1` 或 `v2` → `fail(Status.UNSUPPORTED, "E_MANIFEST_SCHEMA", ...)`，
  附 `{recoverable:true}`；输入已是 v2 → 返回 `ok` 副本，不重复转换。
- 生成 `capabilities[]`、`stageContracts[]`（十项，含每个阶段的 `actualInterventionPoint`）、
  `internationalCaps`（6 项）、`MIGRATION_NOTES`（5 个真实发现 + 兼容说明）。
- `undefinedFields(manifest)` 删除 `undefined` 字段，避免序列化出空键。
- `manifest.content.manifestHash = manifestDigest(manifest)`：`manifestDigest()` 先复制并删掉
  `content.manifestHash` 再求 SHA-256，避免自引用循环（[08](08-package-format-2.md) §8.1）。

`migrateCli()`（真实文件操作）：

```text
readFile ../mod/mod.json
readFile ../mod/examples/mod.manifest.json
  → toV2 各一次 → 校验均为 ok
  → mkdir loom-v2/examples/
  → writeFile loom-v2/examples/loom-blade.v2.manifest.json
  → 返回 {written, inputs, id, version, manifestHash, notes, oldFilesUntouched:true}
```

**零覆盖验收**：`test/migration.test.mjs` 的
`S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）` 断言
`mod.json` SHA-256 仍为 `b4a0541c…c48`、`docs/RENDER_AUDIT.md` 仍为 `3b22b0f…d90`。

**`requiresVerification: true` 标记**（发布前必须由发布者核对，脚本不擅自改写）：

| 项 | 原因 |
|---|---|
| `client.moduleVersions["@minecraft/server"]` | 旧包声明 1.14.0，changelog 显示 1.21.130 多项 API 转入 v2.4.0，页面未给单独模块版本声明 |
| `loader.apiRange` | 保留 v1 的 `>=1.0.0 <2.0.0`，而 `minManagerVersion` 为 `2.0.0`；改变旧范围属于破坏性变更，须发布者确认 |
| `compatibility.requiresExperiments` | `@minecraft/server-graphics` 在 1.21.130 是否需实验开关未验证 |
| `compatibility.knownIssues` | 资源层 `ui/hud_screen.json` 是否被 1.21.130 加载未验证 |
| `identity.assetLicenses / icon` | 示例值，替换正式素材时须逐项核对许可 |

## 14.7 破坏性变更流程（v2 → 未来版本同样适用）

| 步骤 | 动作 | 落地物 |
|---|---|---|
| 1 | 新增接口标 `@since`，不改旧签名 | 新增文件，不编辑 `../mod` |
| 2 | 旧接口外部标 `@deprecated(since=vX)`，保留可调用 | 本文档 §14.2 / [00](00-impact-and-migration.md) §1.4 |
| 3 | 提供旧接口适配器 | `services/migrate-v1-to-v2.mjs` 的 `toV2()` / `CLASS_MAP` / `mapPermissions()` |
| 4 | 提供迁移脚本（只读输入、单向产出） | `migrateCli()` |
| 5 | 迁移说明记录真实差异与未验证项 | `migration.notes` + `requiresVerification` |
| 6 | 兼容测试连续通过 | `test/migration.test.mjs`、`test/compatibility.test.mjs` |
| 7 | 失败可回退 | 事务 `ABORTING → ABORTED`；旧包不删除 |

**禁止**：直接编辑旧文件、静默替换字段、把旧枚举值改名、把旧 `render.target` 字符串解释为能力判定、
在旧包上写 `@deprecated` 注释。

## 14.8 兼容性测试矩阵

| Fixture / 场景 | 期望 | 测试 |
|---|---|---|
| 真实 `../mod/mod.json` | 迁移为合法 v2，14 类全覆盖 | `S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest` |
| `../mod/examples/mod.manifest.json` | 同样可迁移 | `S20 v1 示例 manifest 同样可迁移（兼容 fixture）` |
| v1 manifest 直接当 v2 安装 | `E_MANIFEST_SCHEMA`，提示迁移，不静默 | `S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2` |
| 迁移产物 | 通过全部 v2 校验 | `S01 真实迁移产出的 v2 manifest 通过全部校验` |
| 客户端版本写 `1.21.x` | `E_CLIENT_RANGE` 拒绝 | `S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器` |
| 国际版构建含网易适配器 | `E_PLATFORM_ADAPTER` 拒绝 | 同上 |
| in-game 能力标 `Stable` | `E_CAPABILITY_MIXED_EVIDENCE` 拒绝 | `S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side` |
| 介入点写"底层自动处理" | `E_STAGE_POINT_EMPTY` 拒绝 | `S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述` |
| 签名只保护 manifest | `E_SIG_MANIFEST_ONLY` 拒绝 | `test/signature-integrity.test.mjs` |
| 损坏包 / 冲突包 / 跨版本范围 | 逐项结构化错误，连续通过 | `test/compatibility.test.mjs` |
| 既有 40 文件 | 字节级不变 | `S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在` |

## 14.9 迁移失败语义

| 情况 | 结果 | 用户可见 |
|---|---|---|
| 输入不是 v1/v2 | `unsupported` + `E_MANIFEST_SCHEMA` + `recoverable:true` | 提示先按 §14.6 转换 |
| 输入文件读不到 | `denied` + 具体路径与错误信息 | 不删除任何已安装包 |
| 部分字段无法映射 | `partial`，逐项列出原因（如未登记权限被跳过） | 差异清单 + 建议 |
| 写出过程失败 | 事务回滚，旧包保持可用 | 不产生半写入状态 |
| 迁移后校验失败 | 不提交到模组库，返回错误码清单 | 不静默当成已安装 |

任何情况下都不写回 `../mod`。

## 14.10 v2 → v3 的接口演进预留

- 数据契约用 `schema` 字段带版本：`bedrockloom.mod/v2`、`bedrockloom.repo-index/v2`、
  `bedrockloom.txlog/v1`、`bedrockloom.profile/v1`、`bedrockloom.capability-report/v1`。
- 新版本以**可选字段**追加，旧解析器不受影响；已有字段不改语义、不删。
- 新增能力一律新 ID，不复用旧类名；旧 14 类签名继续冻结。
- 破坏性变更仍走 §14.7 的七步流程。
- 状态迁移规则（[03](03-api-status-table.md) §3.8）：`Unavailable → Experimental → Candidate → Stable`
  的唯一条件是**新增证据**，不是新增措辞。
