# 交付物 7：模组包格式 2.0、签名信封、仓库索引与事务日志 Schema

机器可校验的 Schema 位于 [`../schemas/`](../schemas/)；错误码见
[`schemas/validation-codes.md`](../schemas/validation-codes.md)；真实生成并复验的示例位于
[`../examples/`](../examples/)（由 `node services/build-example-pack.mjs` 生成）。

## 8.1 v2 manifest 字段总表（兼容旧包）

| 用户要求 | v2 字段 | 说明 |
|---|---|---|
| 身份 | `identity.id` | 稳定 ID，`^[a-z0-9][a-z0-9._-]{2,95}$`，永不随改名变化 |
| 用户可见名称 | `identity.name` | `I18nText`（如 `{en_US, zh_CN}`）或字符串；**与 ID 分离**，校验器拒绝二者相同 |
| 版本 | `version` | SemVer |
| 作者 | `identity.authors[]` | 至少 1 项 |
| 许可证 | `identity.license` + `identity.assetLicenses[]` | 代码与素材分别声明；缺一即 `E_LICENSE_MISSING` |
| 主页 / 源码 | `identity.homepage` / `identity.source` | URI |
| 加载器 API 范围 | `loader.apiRange` + `loader.minManagerVersion` | SemVer 范围，如 `>=2.0.0 <3.0.0` |
| 客户端版本 | `client.clientVersionRange` | **必须写明具体基线**，如 `>=1.21.130`；写 `1.21.x` 被 `E_CLIENT_RANGE` 拒绝 |
| 平台适配器 | `client.platformAdapters[]` | 国际版构建只允许 `["international"]`，含 netease/custom 被拒绝 |
| 能力映射 | `client.capabilityMap.{international,netease,custom}[]` | 只允许登记状态与证据；不得声称等价实现 |
| 模块版本 | `client.moduleVersions` | 迁移输出建议，`migration.requiresVerification=true` 时不得写回原生包 |
| 依赖 / 冲突 / 破坏 / 可选服务 | `dependencies.{requires,optional,conflicts,breaks,provides}` | 精确版本、范围、可选依赖 |
| 资源命名空间占用 | `dependencies.{resourceNamespaces,inputBindings,hudSlots}` | 供冲突检测 |
| 入口 | `entrypoints.client` | 必须是 `files/` 下的 `.js` |
| 资源 | `resources.{namespace,roots,packs}` | 命名空间与路径首段一致；禁止跨命名空间覆盖 |
| 权限 | `permissions[]` | `id / scope / risk / plainReason / technicalDetail` 双层描述 |
| 配置项 | `config.{schemaVersion,fields,defaults,layers,requiresRestart,sensitive}` | 令牌写入普通配置被拒绝 |
| 兼容性 | `compatibility.{minClientBuild,maxClientBuild,requiresExperiments,knownIssues,...}` | 已知问题与实验开关 |
| 签名 | `signature.{envelope,algorithm,keyId,signedBy,signedAt}` | 固定 `Ed25519` + `signature.json` |
| 来源 | `provenance.{sourceId,sourceKind,installedFrom,trustState,cachedAt}` | 实际来源唯一 |
| 内容哈希 / 文件清单 | `content.{fileList,hashAlgorithm,manifestHash,totalBytes,fingerprint}` | `manifestHash` 用 `manifestDigest()` 自洽计算 |
| 国际化 / 图标 / 素材许可 | `i18n.{defaultLocale,locales,changelog,screenshots,media,releaseDate,supportedVersions}`、`identity.icon`、`identity.assetLicenses` | 默认 `xx_XX` |
| 迁移 / 废弃 / 最低管理器 | `migration.{fromSchema,notes,requiresVerification}`、`compatibility.deprecatedSince / replacedBy / minManagerVersion` | 迁移说明记录五个真实审查发现 |
| 能力清单 | `capabilities[]` | 取代 v1 `api.classes[]`；带状态/证据级别/证据域 |
| 阶段合同 | `stageContracts[]` | 必须点名实际介入点，禁止"底层自动处理" |
| v1 兼容字段 | `api / render / protocol / features` | 允许存在，v2 校验器不依赖；迁移不写回旧文件 |

**完整 JSON Schema**：[`schemas/mod-package.v2.schema.json`](../schemas/mod-package.v2.schema.json)（draft 2020-12，`additionalProperties:false`）。
**真实示例**：[`examples/loom-blade.v2.manifest.json`](../examples/loom-blade.v2.manifest.json)（由旧 `../mod/mod.json` 迁移生成）。

## 8.2 校验错误码

完整错误码表（A–H 八类，含状态、可恢复性、建议）见
[`schemas/validation-codes.md`](../schemas/validation-codes.md)。核心几项：

| 码 | 触发 | 状态 |
|---|---|---|
| `E_MANIFEST_SCHEMA` | 不是 v2 / 是 v1（提示迁移） | `unsupported` |
| `E_CLIENT_RANGE` | 客户端版本写成 `1.21.x` | `platform-restricted` |
| `E_PLATFORM_ADAPTER` | 国际版构建含网易适配器 | `denied` |
| `E_CAPABILITY_MIXED_EVIDENCE` | in-game 能力标 Stable / Stable 缺 E4 | `denied` |
| `E_STAGE_POINT_EMPTY` | 介入点为空或写"底层自动处理" | `denied` |
| `E_SIG_MANIFEST_ONLY` | **只签 manifest 未签文件清单** | `denied` |
| `E_FILE_UNLISTED` | **存在未列入清单的文件** | `denied` |
| `E_FILE_HASH_MISMATCH` | 已列文件内容被替换 | `denied` |
| `E_FILE_MISSING` | 清单中文件缺失（可断点续传） | `partial` |
| `E_SENSITIVE_IN_CONFIG` | 令牌写入普通配置 | `denied` |

## 8.3 签名信封（关键：不能只保护 manifest）

Schema：[`schemas/signature-envelope.v1.schema.json`](../schemas/signature-envelope.v1.schema.json)。
实现：[`services/signature.mjs`](../services/signature.mjs) + [`services/integrity.mjs`](../services/integrity.mjs)。

```text
签名保护范围（固定的两项，顺序无关、缺一不可）
  protected[0] = canonical(manifest.json)         的 sha256 + 字节数
  protected[1] = canonical(META/file-list.json)    的 sha256 + 字节数
payloadHash = sha256( canonical(manifest) || LF || canonical(file-list) )
signature   = Ed25519_sign(payloadHash)
```

`META/file-list.json` 逐文件列出 `files/` 下**每一个**文件的 `{path, sha256, size, mode}`。
安装前置检查同时执行：

1. `verifyEnvelope`：校验 `protected` 恰好覆盖两项（只签 manifest → `E_SIG_MANIFEST_ONLY`）、
   `payloadHash`、密钥在信任存储且未撤销未过期、Ed25519 签名有效。
2. `verifyFileList`：逐文件哈希匹配；**任何未列入清单的实际文件 → `E_FILE_UNLISTED` 拒绝**；
   拒绝路径穿越、可执行文件模式、重复项、超预算；缺失文件返回 `partial` 可续传。

因此**替换、新增或删除未列文件都会失败**：替换已列文件 → 哈希不符；新增未列文件 → `E_FILE_UNLISTED`；
改 manifest → `E_SIG_PAYLOAD_HASH`；改文件清单 → `protected[1]` 摘要不符。
负向测试见 `test/signature-integrity.test.mjs`（4 个相关用例，全部实际执行通过，见 [EVIDENCE.md](../EVIDENCE.md)）。

**真实签名示例**：`examples/signature-envelope.example.json`（Ed25519）、
`examples/trust-store.example.json`（公钥）、`examples/demo-private-key.pem`（仅演示复验）、
`examples/META/file-list.json`（22 个文件）。

## 8.4 仓库索引格式（增量 / 分发 / 撤销）

Schema：[`schemas/repository-index.v2.schema.json`](../schemas/repository-index.v2.schema.json)。
示例：[`examples/repository-index.v2.json`](../examples/repository-index.v2.json)（含 `indexSignature`）。

| 机制 | 字段 | 规则 |
|---|---|---|
| 源身份 | `source.{id,kind,trust,priority,baseUrl,mirrors,signatureKeys}` | 数值小者优先；降权必须显示警告，不静默降级 |
| 签名密钥 | `signatureKeys[].{keyId,publicKey,fingerprint,validFrom,validUntil}` | 过期/撤销/未知均拒绝 |
| 增量索引 | `sequence` 单调递增、`baseSequence`、`delta` | 客户端按序号应用增量 |
| 文件分发 | `entries[].artifact.{path,sha256,size,resumeSupported}` | 支持断点续传与校验失败重试 |
| 撤销 | `entries[].action:"revoke"` 或 `revocations[]` | 必须给出 `reason` 与 `revokedAt`，可指定 `replacement` |
| 离线缓存 | `source.offlineCache.{cachedAt,staleAfterHours}` | 离线时清楚显示缓存时间，不冒充实时 |
| 全索引签名 | `indexSignature` | 对整个索引（不含本字段）Ed25519 签名，`verifyIndex()` 校验 |
| 多来源 | `entries[].sourceOfRecord` | 一个模组可多候选来源，安装记录必须明确唯一实际来源 |

## 8.5 事务日志 Schema

Schema：[`schemas/transaction-log.v1.schema.json`](../schemas/transaction-log.v1.schema.json)。
运行时产物：`services/installation-service.mjs` 写 `txlog.json`（真实临时目录，测试断言其结构）。

每条事务含 `txId / kind / modId / fromVersion / toVersion / state / createdAt / updatedAt /
cancelPoints[] / rollbackPoint / backupPath / stagingPath / error / events[]`。
`events[]` 记录 `{at, from, to, event, detail, canCancel}`，是崩溃恢复与审计的唯一依据。
状态枚举与恢复决策见 [09](09-transactions-and-fsm.md)。

## 8.6 与 v1 包的兼容

- v1 `bedrockloom.mod/v1` 不作为 v2 直接安装；`validate()` 返回 `E_MANIFEST_SCHEMA` 并提示迁移。
- `services/migrate-v1-to-v2.mjs` 只读 `../mod/mod.json` 与 `../mod/examples/mod.manifest.json`，
  单向生成 v2 manifest，**不写回旧目录**（测试断言 40 个既有文件字节级不变）。
- 旧 `api.classes[]` 的 14 个类全部映射到 `capabilities[]`（含 `Unavailable` 判定），
  旧 `render.target` 由十个 `stageContracts[]` 取代，旧 `protocol` / `features` 保留为兼容字段。
- 详细迁移与 `@since` / `@deprecated` / 适配器方案见 [14](14-version-migration.md)。
