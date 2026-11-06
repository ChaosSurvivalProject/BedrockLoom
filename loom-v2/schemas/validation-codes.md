# 校验错误码（v2 manifest / 签名 / 完整性 / 安装 / 依赖 / 权限）

所有错误都返回 [01-freeze-definition.md](../docs/01-freeze-definition.md) §1.4 的七态之一，
并带 `code`、`message`、`field`（若有）、`recoverable`、`suggestion`。错误码稳定，不随版本重命名；
新增只能追加。

## A. Manifest 结构（E_MANIFEST_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_MANIFEST_SCHEMA` | `unsupported` | `schema` 不是 `bedrockloom.mod/v2` 或不是 v1 兼容输入 | 是 | 用迁移脚本转换 |
| `E_MANIFEST_MISSING_FIELD` | `unsupported` | 必填字段缺失 | 是 | 补全字段 |
| `E_MANIFEST_UNKNOWN_FIELD` | `unsupported` | 出现 `additionalProperties:false` 之外的字段 | 是 | 移除或升 schema |
| `E_ID_FORMAT` | `denied` | 稳定 ID 不符合 `^[a-z0-9][a-z0-9._-]{2,95}$` | 是 | 使用小写点分 ID |
| `E_ID_NAME_COUPLED` | `denied` | `identity.name` 与 `identity.id` 相同（未分离稳定 ID 与可见名） | 是 | 名称用可本地化文本 |
| `E_VERSION_SEMVER` | `unsupported` | 版本不是 SemVer | 是 | 改用 x.y.z |
| `E_LOADER_RANGE` | `unsupported` | `loader.apiRange` 为空或非法 | 是 | 填写范围 |
| `E_MANAGER_VERSION` | `unsupported` | 当前管理器低于 `loader.minManagerVersion` | 是 | 升级管理器 |
| `E_CLIENT_RANGE` | `platform-restricted` | `clientVersionRange` 未写明具体基线（如 `1.21.x`） | 是 | 写明 `>=1.21.130` |
| `E_PLATFORM_ADAPTER` | `denied` | `platformAdapters` 含未启用适配器（netease/custom）却未标 `CustomClientOnly` | 是 | 关闭适配器或改标注 |
| `E_CAPABILITY_MIXED_EVIDENCE` | `denied` | 把 `in-game` 能力标为 `E4`/`Stable` 但无证据域平台侧依据 | 是 | 按证据域重标 |
| `E_STAGE_POINT_EMPTY` | `denied` | `stageContracts[].actualInterventionPoint` 为空或写成"底层自动处理" | 是 | 点名函数/资源路径 |
| `E_NAMESPACE_MISMATCH` | `denied` | `resources.namespace` 与 `resources.roots` 首段不一致 | 是 | 统一命名空间 |
| `E_NAMESPACE_COLLISION` | `denied` | 两个模组声明同一 `resourceNamespaces` | 否 | 由用户显式裁决，见 G 类 |
| `E_PERMISSION_UNDECLARED` | `denied` | 使用了未在 `permissions[]` 声明的能力 | 是 | 声明并重新确认 |
| `E_PERMISSION_SCOPE` | `denied` | 权限 `scope` 与 `risk` 组合非法（如 `account` + `low`） | 是 | 提升风险等级 |
| `E_SENSITIVE_IN_CONFIG` | `denied` | 疑似令牌写入普通配置（`config.defaults` 命中敏感模式） | 是 | 移入密钥存储 |
| `E_I18N_LOCALE` | `unsupported` | `defaultLocale` 格式非 `xx_XX` | 是 | 修正 |
| `E_LICENSE_MISSING` | `denied` | 缺 `identity.license` 或 `assetLicenses` 覆盖到素材文件 | 是 | 补充许可 |
| `E_COMPAT_RANGE` | `unsupported` | `compatibility.min/maxClientBuild` 与 `clientVersionRange` 冲突 | 是 | 对齐 |

## B. 签名信封（E_SIG_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_SIG_MISSING` | `denied` | 缺 `signature.json` | 否 | 从可信源重新下载 |
| `E_SIG_ALGORITHM` | `denied` | 算法不是 Ed25519 | 否 | 拒绝 |
| `E_SIG_KEY_UNKNOWN` | `denied` | `keyId` 不在信任存储 | 否 | 检查源身份与密钥 |
| `E_SIG_KEY_REVOKED` | `denied` | 密钥已撤销 | 否 | 拒绝并提示撤销原因 |
| `E_SIG_KEY_EXPIRED` | `denied` | 密钥过期 | 否 | 更新源密钥 |
| `E_SIG_PAYLOAD_HASH` | `denied` | `payloadHash` 与规范化对象不匹配 | 否 | 拒绝 |
| `E_SIG_INVALID` | `denied` | 签名验证失败 | 否 | 拒绝 |
| `E_SIG_PROTECTED_INCOMPLETE` | `denied` | `protected` 未同时覆盖 `manifest.json` 与 `META/file-list.json` | 否 | 拒绝 |
| `E_SIG_MANIFEST_ONLY` | `denied` | **只签了 manifest 而未签文件清单**（用户明确禁止） | 否 | 拒绝 |

## C. 文件清单完整性（E_FILE_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_FILE_LIST_MISSING` | `denied` | 缺 `META/file-list.json` | 否 | 拒绝 |
| `E_FILE_HASH_MISMATCH` | `denied` | 某文件内容哈希与清单不符 | 否 | 重新下载，校验失败重试 |
| `E_FILE_UNLISTED` | `denied` | **存在未列入清单的文件**（替换/新增未列文件） | 否 | 拒绝；这是签名不能只保护 manifest 的关键断言 |
| `E_FILE_MISSING` | `partial` | 清单中某文件缺失 | 是 | 断点续传补齐 |
| `E_FILE_PATH_TRAVERSAL` | `denied` | 路径含 `..` 或绝对路径 | 否 | 拒绝 |
| `E_FILE_SIZE` | `resource-exhausted` | 单文件/总大小超预算 | 是 | 清理空间或提高配额 |
| `E_FILE_MODE` | `denied` | 出现可执行脚本或符号链接 | 否 | 拒绝 |
| `E_FILE_DUPLICATE` | `partial` | 清单内重复路径 | 是 | 去重 |

## D. 依赖与冲突（E_DEP_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_DEP_MISSING` | `unsupported` | 硬依赖缺失 | 是 | 安装依赖或取消 |
| `E_DEP_VERSION` | `unsupported` | 依赖版本不满足范围 | 是 | 列出兼容候选版本 |
| `E_DEP_OPTIONAL_MISSING` | `partial` | 可选依赖缺失（只诊断） | 是 | 可继续 |
| `E_DEP_CYCLE` | `unsupported` | 依赖环 | 是 | 给出环路径 |
| `E_DEP_HARD_CONFLICT` | `denied` | `conflicts`/`breaks` 命中 | 否 | 给出"为什么不能启用" |
| `E_DEP_SERVICE_CONFLICT` | `denied` | 同一服务多个实现且无显式裁决 | 否 | 用户强制覆盖需审计+回退 |
| `E_DEP_KEY_CONFLICT` | `denied` | 按键绑定冲突 | 是 | 提供可访问替代绑定 |
| `E_DEP_HUD_CONFLICT` | `denied` | HUD 插槽冲突 | 是 | 换插槽或关闭其一 |
| `E_DEP_DUPLICATE_ID` | `partial` | 重复模组 ID | 是 | 去重并标明实际来源 |

## E. 安装 / 事务（E_TX_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_TX_DISK_FULL` | `resource-exhausted` | 磁盘不足 | 是 | 自动回滚；清空间后重试 |
| `E_TX_PERMISSION` | `denied` | 目录不可写 | 是 | 自动回滚；检查权限 |
| `E_TX_FILE_BUSY` | `timeout` | 目标文件被占用（不直接替换正在使用文件） | 是 | 延后提交或安全模式 |
| `E_TX_CANCELLED` | `partial` | 用户取消 | 是 | 回滚到 BEGIN 前状态 |
| `E_TX_NETWORK` | `timeout` | 下载中断 | 是 | 断点续传 |
| `E_TX_HASH_RETRY` | `partial` | 校验失败重试（上限 3 次） | 是 | 超过上限回滚 |
| `E_TX_CRASH_RECOVERY` | `partial` | 崩溃后检测到 `COMMIT_PENDING` | 是 | 按事务日志重放或从备份回滚 |
| `E_TX_SAFE_MODE` | `degraded` | 无法自动恢复，进入安全模式 | 是 | 明确解释原因并隔离上次失败模组 |

## F. 权限与信任（E_PERM_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_PERM_NEW_AT_RUNTIME` | `denied` | 运行时新增权限未重新确认 | 是 | 触发二次确认 |
| `E_PERM_HIGH_RISK` | `denied` | 高风险权限（`account`/`native`/`network`）未走强化确认 | 是 | 不能用"继续"掩盖 |
| `E_PERM_REVOKED` | `denied` | 用户已撤销该权限 | 否 | 停止相关能力 |
| `E_PERM_SOURCE_UNTRUSTED` | `denied` | 源不可信（不静默降级） | 是 | 显示警告，需显式信任 |
| `E_PERM_TELEMETRY` | `denied` | 试图在未单独同意下收集遥测 | 否 | 默认不收集 |

## G. 配置（E_CFG_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_CFG_SCHEMA_VERSION` | `unsupported` | 配置 Schema 版本不兼容 | 是 | 走迁移并展示差异 |
| `E_CFG_INVALID_VALUE` | `partial` | 值类型/范围/枚举不合法 | 是 | 回落默认值并列出差异 |
| `E_CFG_MIGRATION_CONFLICT` | `partial` | 升级后配置冲突 | 是 | 展示差异由用户选择 |
| `E_CFG_RESTART_REQUIRED` | `partial` | 该项需重启 | 是 | 明确提示，不热应用 |
| `E_CFG_QUOTA` | `resource-exhausted` | 配置/存档超配额 | 是 | 清理或提高配额 |
| `E_CFG_CORRUPT` | `partial` | 配置文件损坏 | 是 | 隔离损坏文件，从备份恢复 |

## H. 平台能力（E_CAP_*）

| 码 | 状态 | 含义 | 可恢复 | 建议 |
|---|---|---|---|---|
| `E_CAP_UNAVAILABLE` | `unsupported` | 国际版公开客户端无该能力 | 否 | 返回 `unsupported` + 正式授权路径 |
| `E_CAP_RESTRICTED` | `degraded` | 需 Vibrant Visuals / 非 Realms / 特定设备 | 是 | 探测后降级 |
| `E_CAP_ADAPTER_OFF` | `unsupported` | 适配器默认关闭 | 是 | 用户开启并选择合法本地 SDK |
| `E_CAP_PROBE_UNKNOWN` | `degraded` | 能力探测返回 `unknown` | 是 | 不猜版本，等待下次探测 |

## 结果语义映射

`denied` → 审计记录 + 用户可读原因；`unsupported` → 降级映射且不重试；
`timeout` / `resource-exhausted` → 不重试风暴，返回恢复条件；
`partial` → 逐项列出失败子项，不回滚已成功项；`degraded` → 必须附 `reason` 与 `fallback`。
