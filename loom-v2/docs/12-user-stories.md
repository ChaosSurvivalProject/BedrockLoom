# 交付物 12：二十个关键用户故事

覆盖用户要求的安装、更新、冲突、离线、损坏、权限、回退、诊断、配置集等场景。
每个故事都给出**可判定的结果状态**（七态之一，见 [01](01-freeze-definition.md) §1.4）、
**失败与回退**、以及**证据**（实现文件 + 实际执行的测试用例）。
界面流程见 [07](07-mod-manager-ia.md)，事务状态见 [09](09-transactions-and-fsm.md)。

> "证据"列中的测试名均来自 `test/*.test.mjs` 的真实用例，执行结果见 [EVIDENCE.md](../EVIDENCE.md)。
> 凡涉及游戏内画面的故事，一律标注 `in-game / 未验证`，不把平台侧通过写成画面通过。

---

### US-01 首次从本地文件安装一个模组

- **角色/目标**：普通玩家，双击一个 `.loompack` 后能安全装好，不需要懂命令行。
- **前置**：包为 `bedrockloom.mod/v2`，含 `manifest.json` / `signature.json` / `META/file-list.json`。
- **流程**：选择来源 → PRECHECK（签名信封 → 文件清单全覆盖 → manifest → 依赖 → 冲突 → 平台 → 权限）
  → 用户确认（增量/替换/取消）→ 原子安装 `INIT…DONE` → 记录实际来源与可撤销操作。
- **结果**：`ok`，`InstallResult {txId, modId, installedPath, backupCreated}`；首次安装 `backupCreated=false`。
- **失败/回退**：任一预检失败 → `denied` + 具体错误码；写入阶段失败 → `ABORTING → ABORTED`，
  清理暂存目录，目标目录保持安装前状态。
- **证据**：`services/installation-service.mjs`；`test/installation.test.mjs`
  `S14 真实原子安装：文件写入、状态 DONE、事务日志落盘`。

### US-02 从拖拽、模组目录、剪贴板导入，且重复文件可去重

- **角色/目标**：玩家从论坛拿到一堆包，想一次导入并避免重复占用磁盘。
- **流程**：四种入口归一为同一 `SourceDescriptor`；按内容 SHA-256 去重；
  `E_FILE_MISSING` 时按 `artifact.resumeSupported` 断点续传；安装记录写 `sourceOfRecord`。
- **结果**：`ok` 或 `partial`（部分包待续传时逐项列出，不回滚已成功项）。
- **失败/回退**：重复文件不静默覆盖；同一稳定 ID 已有安装 → 转 `upgrade` 流程而非静默替换。
- **证据**：`core/package-store.mjs`、`schemas/repository-index.v2.schema.json`；
  `test/signature-integrity.test.mjs` `S04 清单中文件缺失 -> partial + E_FILE_MISSING（可断点续传补齐）`。

### US-03 发现"只签了 manifest"的包

- **角色/目标**：玩家/审核者，确认签名保护范围是否覆盖全部文件。
- **流程**：PRECHECK 读 `signature.json` 的 `protected[]`；要求**恰好两项**
  （`manifest.json`、`META/file-list.json`）。
- **结果**：`denied`，错误码 `E_SIG_MANIFEST_ONLY`；界面明确"只签了 manifest，未签文件清单"。
- **失败/回退**：不进入 STAGING，不写任何目标目录文件。
- **证据**：`services/signature.mjs`、`schemas/signature-envelope.v1.schema.json`；
  `test/signature-integrity.test.mjs` `S03 硬门槛：只签 manifest 而不签文件清单 -> E_SIG_MANIFEST_ONLY`。

### US-04 包内被塞进未列文件或已列文件被替换

- **角色/目标**：玩家导入被篡改的包，平台必须拒绝而不是"装上去再说"。
- **流程**：`verifyFileList()` 先算 `files/` 实际文件集合与清单集合的差集，再逐文件比对 SHA-256。
- **结果**：新增未列文件 → `denied / E_FILE_UNLISTED`；替换已列文件 → `denied / E_FILE_HASH_MISMATCH`；
  改 manifest → `E_SIG_PAYLOAD_HASH`；路径穿越或重复项 → `denied`。
- **失败/回退**：全部拒绝安装；已下载缓存标记为损坏，允许按仓库索引重新下载（重试上限 3 次）。
- **证据**：`services/integrity.mjs`；`test/signature-integrity.test.mjs`
  `S04 关键负面用例：替换/新增未列文件被拒绝（签名不能只保护 manifest）`、
  `S04 已列文件内容被替换 -> E_FILE_HASH_MISMATCH`、`S04 路径穿越与重复项被拒绝`。

### US-05 安装中途取消或磁盘写满

- **角色/目标**：玩家点"取消"，或设备空间不足；不能留下半安装状态。
- **流程**：可取消点仅 `INIT/PRECHECK/STAGING/BACKUP/COMMIT_PENDING`；`COMMITTED` 后拒绝取消并解释原因。
  磁盘满由 `E_TX_DISK_FULL` 触发 `fail → ABORTING → ABORTED`。
- **结果**：取消 → `partial` + 回滚；磁盘满 → `resource-exhausted`，返回"清空间后重试"的恢复条件。
- **失败/回退**：清理暂存目录；有备份则从备份恢复；不做重试风暴。
- **证据**：`core/fsm.mjs`、`services/installation-service.mjs`；
  `test/fsm.test.mjs` `S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消`、
  `test/installation.test.mjs` `S14 磁盘满故障：自动回滚，不留下半安装状态`、
  `S14 用户取消：可取消点生效，返回 partial 并回滚`。

### US-06 提交点关机，重启后自动恢复

- **角色/目标**：安装到一半断电，重新打开游戏不能变成"打不开"。
- **流程**：`COMMIT_PENDING` 写恢复 marker；重启后 `recoverPending()` 读 marker 与 `txlog.json`：
  有备份 → `ROLLBACK_FROM_BACKUP`；无备份且提交未完成 → `REPLAY_COMMIT`（完成那一次 `rename`）；
  无备份且状态不可判定 → `ENTER_SAFE_MODE`，全部模组停用并隔离上次失败模组。
- **结果**：`ok`，目标状态 `DONE` 或 `ABORTED` 或 `SAFE_MODE`；安全模式必须列出被隔离模组与原因。
- **失败/回退**：`crash` 不伪装成功（`RECOVERY_REQUIRED`），也不立即回滚丢弃 marker。
- **证据**：`test/fsm.test.mjs` `S12 crash 进入 RECOVERY_REQUIRED，不伪装成功`、
  `S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式`；
  `test/installation.test.mjs` `S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装`、
  `S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态`。

### US-07 从不可信源安装时的警告

- **角色/目标**：玩家添加了一个未知社区源，平台不能悄悄把它降级成可信源。
- **流程**：`SourceDescriptor.trust` 为 `untrusted / revoked` 时 `PermissionService.evaluate` 返回 `deny`
  并显示警告；`indexSignature` 校验、`sequence` 单调、`revocations[]` 逐条核对。
- **结果**：`denied` + 可见警告；**不静默降级**。
- **失败/回退**：未知/撤销/过期密钥分别返回 `E_SIG_KEY_UNKNOWN / E_SIG_KEY_REVOKED / E_SIG_KEY_EXPIRED`。
- **证据**：`core/permissions.mjs`、`services/signature.mjs`；
  `test/signature-integrity.test.mjs` `S03 未知密钥 / 已撤销密钥 / 无效签名均拒绝`；
  `test/permissions.test.mjs` `S16 源不可信必须警告，不允许静默降级`。

### US-08 检查更新，且离线时准确显示缓存信息

- **角色/目标**：玩家在没网的环境里查看更新，不能看到伪装成实时的旧数据。
- **流程**：`rankCandidates` 按 SemVer 降序 + 加载器/客户端范围过滤；
  离线读 `source.offlineCache.{cachedAt, staleAfterHours}`。
- **结果**：`ok`（有兼容候选）或 `degraded`（离线，附 `reason` 与缓存时间）；本地模组基本功能不受影响。
- **失败/回退**：自动更新默认关闭；后台更新不替换正在使用文件。
- **证据**：`core/semver.mjs`、`core/resolver.mjs`、`schemas/repository-index.v2.schema.json`；
  `test/semver.test.mjs` `S06 rankCandidates：兼容候选降序，不满足项排后且给出原因`；
  `test/compatibility.test.mjs` `S10 仓库索引与撤销机制可解析，来源唯一性可追溯`。

### US-09 重大更新或新增权限的二次确认

- **角色/目标**：玩家不被"一键更新"悄悄拿走新权限或引入破坏性变更。
- **流程**：`planUpdate` 计算 `majorChange`、`permissionIncrease`；二者任一为真 → `requiresSecondConfirm=true`，
  界面展示差异（含新增权限的通俗说明 + 技术实现说明）。
- **结果**：确认前保持当前版本；确认后才进入 `upgrade` 事务（必有 BACKUP）。
- **失败/回退**：取消 → 保持旧版本；更新失败 → 从 BACKUP 回滚并保留可迁移配置。
- **证据**：`core/resolver.mjs`；`test/resolver.test.mjs` `S06 planUpdate：重大更新与权限增加须二次确认`。

### US-10 批量更新中部分失败

- **角色/目标**：一次更新 4 个模组，第 3 个校验失败；成功的不能被连坐回滚。
- **流程**：每个模组独立事务；批次汇总为 `partial`，逐项列出失败子项与错误码。
- **结果**：`partial`；已成功项保留，失败项回滚，不重试风暴。
- **失败/回退**：校验失败重试上限 3 次；超限隔离损坏资源并给出 `E_FILE_HASH_MISMATCH`。
- **证据**：[01](01-freeze-definition.md) §1.4 `partial` 语义；
  `test/config-merge.test.mjs` `S09 无效值回落默认并逐条列出差异（部分成功）`；
  [09](09-transactions-and-fsm.md) §9.3 故障恢复表。

### US-11 回退版本与跳过版本

- **角色/目标**：新版本有 bug，玩家想回到上一个可用版本并不再被提示该版本。
- **流程**：`planUpdate` 保留历史候选；`skip` 写入本地偏好；`rollback` 通过 `upgrade` 事务从备份恢复。
- **结果**：`ok`；事务日志记录 `fromVersion/toVersion` 与 `rollbackPoint: "BACKUP"`。
- **失败/回退**：无可用备份时拒绝并说明，不留下半版本状态。
- **证据**：`core/fsm.mjs`、`services/installation-service.mjs`；
  `test/installation.test.mjs` `S14 升级：更新前备份，提交后新版本生效`、`S14 手动回滚与签名预检集成`。

### US-12 启用一个带依赖的模组，且加载顺序确定

- **角色/目标**：玩家启用模组 A，A 依赖 B；B 必须自动启用，顺序不因安装先后而变。
- **流程**：`computeEnableSet` 不动点补全依赖 → `resolveLoadOrder` Kahn + 字典序 tie-break。
- **结果**：`ok`，`ResolutionPlan.order` 中依赖在前；输入乱序结果不变。
- **失败/回退**：若 B 被其他已启用模组依赖却被请求禁用 → `blocked` + `E_DEP_HARD_CONFLICT`，
  给出"被 X 依赖，禁用会破坏加载"；禁用通过后才执行资源强制回收，不允许只隐藏按钮。
- **证据**：`test/resolver.test.mjs` `S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序`、
  `S15 computeEnableSet：依赖自动启用，阻止危险禁用`。

### US-13 六个模组互相冲突，需要知道"为什么不能启用"

- **角色/目标**：玩家看到红色冲突提示，要能自己动手解决，而不是只看到"冲突"。
- **流程**：`detectConflicts` 检测硬冲突 / 服务实现 / 资源命名空间 / 按键 / HUD 插槽 / 重复 ID；
  `explain()` 输出标题、原因、涉及模组与可执行建议。
- **结果**：`partial(plan, issues)`；`explanations[]` 每条建议非空。
- **失败/回退**：不静默覆盖资源、不随机挑选胜者；建议包含"改名命名空间 / 改键 / 二选一 / 更换插槽"。
- **证据**：`test/resolver.test.mjs` `S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD`、
  `S07 不静默挑选胜者：同名服务两个实现必须返回冲突`、
  `S08 explain：给出人话原因与可执行建议，不只是'不能启用'`。

### US-14 玩家坚持强制覆盖冲突

- **角色/目标**：玩家理解风险后仍要启用；平台必须留痕并给退路。
- **流程**：`forceOverrides`（按错误码或 modId）拆分 `resolvedIssues` 与 `forced`；
  每条 `forced` 生成审计 `{at, code, modId, detail, risk, rollbackPoint:"BACKUP"}`；
  界面先展示风险说明，要求用户显式确认。
- **结果**：`ok(plan)`（阻塞集合为空），但 `plan.forced` / `plan.audit` **完整保留**，不抹掉记录。
- **失败/回退**：审计条目中的 `rollbackPoint` 指向 BACKUP；后续出问题可回滚最近变更。
- **证据**：`test/resolver.test.mjs` `S07 resolve：安装新模组 + 强制覆盖必须产出审计与回退点`；
  [10](10-sandbox-and-trust.md) §10.5 "用户强制覆盖仍属用户决定，已记录风险"。

### US-15 上次启动崩溃的模组被自动隔离

- **角色/目标**：玩家不想每次启动都因同一个模组崩溃。
- **流程**：故障计数 → 熔断（`circuit-open`）→ 隔离 → 安全模式；`recover()` 在无备份且状态不可判定时
  `ENTER_SAFE_MODE`，全部模组停用并隔离上次导致启动失败的模组。
- **结果**：`ok` 且 `safeMode=true`，列出被隔离模组与原因；不反复崩溃。
- **失败/回退**：恢复需用户显式操作或自动恢复策略；核心界面由宿主渲染，不受模组故障影响。
- **证据**：`test/fsm.test.mjs` `S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式`；
  [10](10-sandbox-and-trust.md) §10.2 故障状态机。

### US-16 安装时看懂权限，且高风险项不被"继续"掩盖

- **角色/目标**：玩家看到"访问账号身份 / 加载原生模块"这类权限时能得到充分警示。
- **流程**：`PERMISSION_CATALOG` 每项含 `plain`（通俗）+ `technical`（技术实现）双层描述；
  `evaluate()` 按 `low/medium/high/critical` 分级；`critical` 需强化确认；
  `telemetry.collect` 除非**单独、明确、可撤销**同意，否则 `deny`。
- **结果**：`allow` / `deny` / `reconfirm` / `degrade` 四态之一；`TrustSummary` 可查签名、作者、
  来源、审计、已知问题、许可证、供应链状态。
- **失败/回退**：未声明权限 → `E_PERMISSION_UNDECLARED`；撤销后相关能力立即停止。
- **证据**：`test/permissions.test.mjs` `S16 高风险权限必须强化确认，不能用普通'继续'掩盖`、
  `S16 遥测默认拒绝：除非单独、明确、可撤销同意`、
  `S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链`。

### US-17 模组升级后新增权限，需要重新确认

- **角色/目标**：已装模组更新后想联网；玩家必须被再次询问，不能沿用旧同意。
- **流程**：`reconfirm(modId, added)` 产出可撤销 `ConsentRecord` 与审计；
  离线时 `network.presentation` 自动 `degrade` 且不影响本地模组基本功能。
- **结果**：`ok`（同意）/ `deny`（拒绝）/ `degrade`（离线）；`revoke()` 生效后能力停止。
- **失败/回退**：拒绝时不阻断模组其他本地能力。
- **证据**：`test/permissions.test.mjs`
  `S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地`、
  `S17 reconfirm 产出可撤销同意记录与审计；revoke 生效`。

### US-18 按全局/存档/玩家改配置，且不会把令牌写进配置文件

- **角色/目标**：玩家调粒子数量与颜色，同时担心密钥泄露。
- **流程**：`merge()` 按 `global < world < player` 合并；无效值回落默认并列出差异；
  命中 `TOKEN_PATTERN` 的键替换为 `"***redacted***"`；`requiresRestart` 标记重启项。
- **结果**：`ok`（全有效）/ `partial`（含无效值清单）；`MergedConfig.sensitive` 列出脱敏键。
- **失败/回退**：恢复默认值、导入导出配置；`E_SENSITIVE_IN_CONFIG` 在 manifest 预检阶段即被拒绝。
- **证据**：`test/config-merge.test.mjs` `S09 三层合并顺序：global < world < player，默认值补齐`、
  `S09 无效值回落默认并逐条列出差异（部分成功）`、`S09 敏感项脱敏：令牌不写普通配置`；
  `test/manifest-validator.test.mjs` `S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝`。

### US-19 模组升级后配置差异可见，并导出一套玩法预设到另一台设备

- **角色/目标**：玩家升级模组不想丢设置；换设备导入配置集时要知道缺了什么。
- **流程**：`diff()` / `migrate()` 展示 `added / removed / changed / conflicts`，冲突回落新默认并逐条列出；
  `exportProfile` 默认只导出 ID/版本/配置；`importProfile` 逐条列出 `missing / versionDiff / matched`。
- **结果**：迁移有冲突 → `partial`；配置集导入有差异 → `partial`；无差异 → `ok`。
- **失败/回退**：**不静默补齐缺失模组、不静默丢弃旧值**；请求包含模组文件时返回 `degraded` 并标记
  `requiresLicenseCheck`，逐项核对许可证。
- **证据**：`test/config-merge.test.mjs` `S10 diff：新增/移除/类型变化/当前值冲突`、
  `S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃`、
  `S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置`、
  `S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐`。

### US-20 出问题后一键复制脱敏诊断包并修复

- **角色/目标**：玩家遇到加载失败，想给作者发报告，又不想泄露聊天/账号/坐标。
- **流程**：`DiagnosticsService.collect()` 采集启动阶段、依赖结果、资源错误、崩溃、降级；
  排除 `chat/message/account/xuid/playerId/ip/address/token/secret/password/coord/position/…`；
  按模组贡献度（帧时间/内存/对象数/错误）分类为**模组 bug / 适配器限制 / 官方客户端限制 / 网络问题**；
  修复动作：验证资源、清缓存、恢复默认、回滚最近变更。
- **结果**：`ok` 生成 `RedactedBundle`；无法自动恢复 → 安全模式 + 原因说明。
- **失败/回退**：诊断包只在本地生成、由玩家主动复制；不默认上传已安装模组或游玩数据；不收集遥测。
- **证据**：`services/diagnostics.mjs`；`test/compatibility.test.mjs`
  `S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测`、
  `S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题`。

---

## 12.1 覆盖矩阵

| 用户要求场景 | 覆盖故事 |
|---|---|
| 安装 / 导入 / 去重 / 断点续传 | US-01、US-02 |
| 签名 / 篡改 / 损坏 | US-03、US-04、US-20 |
| 取消 / 磁盘满 / 崩溃恢复 | US-05、US-06 |
| 离线 / 不可信源 | US-07、US-08 |
| 更新 / 重大更新 / 批量部分成功 / 回退 / 跳过 | US-09、US-10、US-11 |
| 启用顺序 / 冲突 / 强制覆盖 / 安全模式 | US-12、US-13、US-14、US-15 |
| 权限 / 再确认 / 撤销 / 遥测 | US-16、US-17 |
| 配置 / 迁移 / 配置集 | US-18、US-19 |
| 诊断 / 修复 / 脱敏 | US-20 |

## 12.2 未纳入本批故事的范围（如实标注）

- 所有**游戏内画面结果**（可见性、排序、遮挡、DPI、帧时间、清理）的真机验证：`in-game / 未验证`，
  步骤与证据存放路径见 [13](13-testing-and-budgets.md)，本批故事只覆盖平台侧可自动验证的行为。
- 网易版与定制客户端的实际运行：接口预留，默认关闭，见 [10](10-sandbox-and-trust.md) §10.6。
- 多人权威操作：客户端命中结果不视为权威，见 [04](04-render-stage-contract.md) §4.5。
