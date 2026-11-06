# 交付物 8：依赖、冲突与配置合并算法

实现：[`core/semver.mjs`](../core/semver.mjs)、[`core/resolver.mjs`](../core/resolver.mjs)、
[`core/config-merge.mjs`](../core/config-merge.mjs)、[`core/permissions.mjs`](../core/permissions.mjs)。
自动化测试：[`test/semver.test.mjs`](../test/semver.test.mjs)、[`test/resolver.test.mjs`](../test/resolver.test.mjs)、
[`test/config-merge.test.mjs`](../test/config-merge.test.mjs)（均实际执行，结果见 [EVIDENCE.md](../EVIDENCE.md)）。
数据类型见 [`contracts/types.ts`](../contracts/types.ts) 的 `ResolutionPlan` / `ConflictIssue` /
`HumanExplanation` / `ConfigSchema` / `MergedConfig` / `ConfigDiff` / `ProfileFile`。

## 11.1 共性纪律与复杂度

| 纪律 | 落地方式 | 静态检查 |
|---|---|---|
| 纯函数、可重入 | 四个模块只做计算，不写文件、不读时钟以外的外部状态 | B1：`core/**` 不 import `node:*` |
| 确定性 | 所有输出与输入数组顺序无关；tie-break 一律按 `id` 字典序 | `resolveLoadOrder` 的 `ready.sort()` |
| 不静默 | 冲突、无效值、缺失项必须逐条列出，不允许"挑一个能用的" | `partial` + `explanations` |
| 七态结果 | 成功 `ok`、部分成功 `partial`、拒绝 `denied`、降级 `degraded` | [`core/result.mjs`](../core/result.mjs) |
| 可解释 | 每个问题都能映射为人话标题 + 原因 + 可执行建议 | `explain()` |
| 不猜版本 | 版本判定只用 SemVer 范围与能力报告，不按客户端版本号盲猜 | [01](01-freeze-definition.md) §1.1 条件 3 |

| 算法 | 时间复杂度 | 空间复杂度 | 输出规模上界 |
|---|---|---|---|
| `satisfies` / `compare` | O(C)，C=比较符个数 | O(1) | 布尔 |
| `rankCandidates` | O(N log N) | O(N) | N=候选版本数 |
| `resolveLoadOrder`（Kahn） | O(V+E) | O(V+E) | V=启用模组数 |
| `detectConflicts` | O(V·D + Σ声明数) | O(V + 声明数) | 六类冲突去重后 |
| `computeEnableSet` | O(V·E) 不动点 | O(V) | 启用集合 |
| `merge` / `diff` / `migrate` | O(F·L)，F=字段数，L=层数(3) | O(F) | 字段数 |

## 11.2 SemVer 与候选版本排序（S05 / S06）

`parse` 产出 `{raw, major, minor, patch, prerelease, build}`；`compare` 按数值段比较，
**正式版大于同数值段的预发布版**，`build` 不参与优先级。
`satisfies` 支持的语法与实际断言（全部在 `test/semver.test.mjs` 执行）：

| 语法 | 示例 | 断言 |
|---|---|---|
| 空格 AND | `>=1.2.0 <2.0.0` | 区间内为真，边界外为假 |
| `\|\|` OR | `^1.0.0 \|\| ~2.1.0` | 任一分支满足即真 |
| 比较符 | `>=1.21.130` | 目标基线判定 |
| `^` / `~` / `*` | `^2.0.0`、`~1.1.0`、`*` | 上界与通配 |
| 预发布规则 | `1.2.0-beta.1` 对 `>=1.0.0` | **默认不匹配**（无预发布的范围不接收预发布版本） |

`rankCandidates(candidates, constraints)`：先按 `compare` 降序，再按 `constraints` 过滤兼容项，
不满足项**排后并给出原因**，不做静默丢弃；`highestSatisfying` 取首个兼容项；
`validateRange` 拒绝非法范围（用于 manifest 预检，见 S01）。
> 修复记录：初版 `satisfies` 把解析对象传给 `matchComparator`，导致 `compare` 抛
> `invalid semver: [object Object]`；改为 `matchComparator(v.raw, c)` 后全部用例通过。

## 11.3 依赖图与确定性拓扑排序（S07）

字段读取同时兼容 v1 与 v2 两种 manifest 形态：
`dependencies.requires ?? requires`（`optional` / `conflicts` / `breaks` / `provides` /
`resourceNamespaces` / `inputBindings` / `hudSlots` 同理）。这是 [14](14-version-migration.md) 兼容层的一部分。

`resolveLoadOrder(mods)` 的步骤（对应 `core/resolver.mjs` 第 34–76 行，**实际执行**）：

1. 以 `id` 建 `Map`，重复 ID 记 `E_DEP_DUPLICATE_ID`，无 ID 记 `unknown`。
2. 遍历硬依赖：目标不存在 → `E_DEP_MISSING`；`range` 不满足 → `E_DEP_VERSION`；
   否则加边 `dep → mod`，`indegree[mod] += 1`。
3. 可选依赖缺失只记 `E_DEP_OPTIONAL_MISSING`，**不产生边、不阻止加载**。
4. 初始 `ready` = 入度 0 的节点，按 `id` 字典序排序；每轮 `shift()` 后把后继入度减 1，
   新入度 0 者入队并重新排序。
5. `order.length !== byId.size` 时，剩余节点（排序后）作为 `cycle` 路径记 `E_DEP_CYCLE`。

**确定性来源**：初始队列与每次入队都 `sort()`，因此相同模组集合在任意输入顺序下产出同一 `order`。
测试 `S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序` 用乱序输入断言该性质。
环不被随机打破，只返回路径与"升级其中一项 / 临时禁用环上一项"的建议。

## 11.4 启用集合计算（S15）

`computeEnableSet(mods, requestedEnabled)`：

- **依赖自动启用**：不动点迭代，把已启用模组的硬依赖加入 `enabled`，直到集合不再变化。
- **阻止危险禁用**：对每个已启用模组，找出其他已启用且硬依赖它的模组；若该模组不在用户
  显式 `requestedEnabled` 中，则列入 `blocked` 并给出"被 X 依赖，禁用会破坏加载"。
- 输出 `{enabled: 排序数组, blocked}`；`resolve()` 把 `blocked` 转成 `E_DEP_HARD_CONFLICT` 问题。

这对应管理器 E 板块："禁用必须释放资源，不允许只隐藏按钮"——只有解析通过才会进入
[09](09-transactions-and-fsm.md) 的 `disable` 事务（该事务含 `COMMITTED → VERIFY` 与资源强制回收）。

## 11.5 六类冲突检测（S07 / S08）

`detectConflicts(mods)` 用 `pairKey(a,b)`（两端排序后拼接）配合 `seenPairs` 去重，
同一对模组在同一类冲突下只产出一条：

| # | 码 | 检测逻辑 | 不允许的做法 |
|---|---|---|---|
| 1 | `E_DEP_HARD_CONFLICT` | `conflicts[]` 与 `breaks[]` 命中且版本范围匹配 | 不静默忽略声明 |
| 2 | `E_DEP_SERVICE_CONFLICT` | 同一 `provides` 服务出现 ≥2 个实现 | **不随机挑选胜者**（测试 `S07 不静默挑选胜者` 断言必须返回冲突） |
| 3 | `E_NAMESPACE_COLLISION` | 同一 `resourceNamespaces` 被多个模组占用 | 不静默覆盖资源 |
| 4 | `E_DEP_KEY_CONFLICT` | 同一 `inputBindings` 被多个模组声明 | 不静默改键 |
| 5 | `E_DEP_HUD_CONFLICT` | 同一 `hudSlots` 被多个模组声明 | 不静默抢占插槽 |
| 6 | `E_DEP_DUPLICATE_ID` | 建图阶段重复稳定 ID | 不去重后丢弃来源记录 |

核心界面保护、插槽仲裁与按键可访问替代绑定在 [10](10-sandbox-and-trust.md) 与
[07](07-mod-manager-ia.md) 中给出界面层约束；算法层只负责**如实报告**，不做仲裁决定。

## 11.6 冲突解释（S08）

`explain(issue)` 是稳定的 `code → {title, why, suggestions[]}` 映射，覆盖
`MISSING / VERSION / OPTIONAL_MISSING / CYCLE / HARD_CONFLICT / SERVICE_CONFLICT /
NAMESPACE_COLLISION / KEY_CONFLICT / HUD_CONFLICT / DUPLICATE_ID` 十类，
未登记码回落到"无法启用 + 查看诊断报告"。

每条输出 `{code, modId, title, why, involved, suggestions}`。建议必须是**可执行动作**，例如：

| 码 | 标题 | 建议（实际断言内容） |
|---|---|---|
| `E_DEP_VERSION` | 依赖版本不匹配 | 在更新管理中查看兼容当前客户端的候选版本 / 回退到满足范围的版本 |
| `E_NAMESPACE_COLLISION` | 资源命名空间占用 | 改用不同命名空间 / 不允许静默覆盖资源 |
| `E_DEP_KEY_CONFLICT` | 按键绑定冲突 | 在配置中改键 / 提供可访问替代绑定 |

测试 `S08 explain：给出人话原因与可执行建议，不只是'不能启用'` 断言 `suggestions.length > 0`。

## 11.7 主解析入口与强制覆盖审计（S07）

`resolve(state, request)` 的八步（实际执行）：

1. 复制 `state.installed`，不修改调用方对象。
2. `request.install`：同 ID 存在 → `upgrade` 动作（记 from/to 版本）；否则 `install` 动作。
3. 计算请求启用集合：`request.enable` 覆盖默认，减去 `request.disable`。
4. `computeEnableSet` → `active` 子集。
5. `resolveLoadOrder(active)` + `detectConflicts(active)` + `blocked` 合并为 `allIssues`。
6. `forceOverrides`（按 `issue.code` 或 `modId`）把问题拆成 `resolvedIssues` 与 `forced`；
   每个 `forced` 生成审计条目 `{at, code, modId, detail, risk: "用户强制覆盖：已记录风险说明与回退点", rollbackPoint: "BACKUP"}`。
7. `blocking` = `resolvedIssues` 中除 `OPTIONAL_MISSING` 外的项。
8. 返回 `ResolutionPlan {order, enabled, actions, issues, forced, audit, ok, explanations}`：
   有阻塞 → `partial(plan, issues)`；无阻塞 → `ok(plan)`。

**强制覆盖不抹掉记录**：即使问题被移出阻塞集合，`plan.forced` 与 `plan.audit` 仍完整保留，
供 [07](07-mod-manager-ia.md) 的"风险说明 + 审计记录 + 回退"界面展示与事务回滚使用。
测试 `S07 resolve：安装新模组 + 强制覆盖必须产出审计与回退点` 断言该行为。

## 11.8 更新候选排序（S06）

`planUpdate(installed, candidates, constraints)`：

- 按 `compare` 降序；只保留 `higher === true`（高于当前版本）的候选。
- `compatible` 由 `constraints.loaderApiRange` 的 `satisfies` 判定（加载器/客户端范围过滤）。
- `majorChange`（`breaking === true`）或 `permissionIncrease`（新增权限集合非空）→
  `requiresSecondConfirm = true`，并给出 `reason`。
- 输出不含 `autoApply` 字段：[07](07-mod-manager-ia.md) 明确"自动更新默认关闭"。

与 `rankCandidates` 的分工：后者做通用排序与不兼容原因标注，前者叠加"重大更新 / 权限增加"
的**二次确认**判定。测试 `S06 planUpdate：重大更新与权限增加须二次确认` 实际执行。

## 11.9 分层配置合并（S09）

`merge(layers, schema)`，`LAYER_ORDER = ["global","world","player"]`（后者覆盖前者）：

1. 以 `schema.fields` 的 `default` 初始化 `values`；收集 `sensitive`（显式标记或键名命中
   `TOKEN_PATTERN = /(token|secret|api[_-]?key|password|bearer|credential|private[_-]?key)/i`）
   与 `requiresRestart`。
2. 按层序遍历每个键，`validateValue` 按 `type` 校验：
   `boolean` / `number`（有限数 + `min`/`max`）/ `string` / `enum`（`values` 成员）/
   `color`（长度 4 的有限数数组 `[r,g,b,a]`）/ `keybinding`（字符串）/ `file`
   （禁止 `..` 与绝对路径，即**受控资源路径**）。
3. 无效值**回落到该字段默认值**，并把 `{key, layer, value, reason, fallback}` 写入 `invalid`。
4. 敏感键命中 `TOKEN_PATTERN` 时把值替换为 `"***redacted***"`，值由密钥存储持有，
   **不写入普通配置**（对应错误码 `E_SENSITIVE_IN_CONFIG`）。
5. 返回 `MergedConfig {schemaVersion, values, invalid, sensitive, requiresRestart, layersApplied}`；
   `invalid.length > 0` → `partial(result, invalid)`。

测试实际断言：`S09 三层合并顺序：global < world < player，默认值补齐`、
`S09 无效值回落默认并逐条列出差异（部分成功）`、`S09 敏感项脱敏：令牌不写普通配置`。

## 11.10 Schema 差异与配置迁移（S10）

`diff(oldValues, oldSchema, newSchema)` 产出五组：

| 组 | 判定 |
|---|---|
| `added` | 新 Schema 有、旧 Schema 无 |
| `removed` | 旧 Schema 有、新 Schema 无（附 `lastValue`） |
| `changed` | `typeChanged` / `defaultChanged` / `enumChanged`（各自布尔标记） |
| `conflicts` | 旧值用**新 spec** 校验不通过，附 `reason` 与 `fallback` |
| `hasConflict` | `conflicts.length > 0` |

`migrate(oldValues, oldSchema, newSchema)`：先 `diff`，再以 `{global: oldValues}` 对新 Schema
执行 `merge`，产出 `{fromVersion, toVersion, kept, dropped, conflicts, values}`。
`dropped` 来自 `removed`，`conflicts` 逐条列出，**不静默丢弃**；有冲突 → `partial(report, conflicts)`。
管理器在模组升级时用这份报告展示"保留 / 移除 / 冲突回落"差异，见 [07](07-mod-manager-ia.md) F 板块。

## 11.11 配置集导出与导入（S19）

| 函数 | 行为 | 语义 |
|---|---|---|
| `exportProfile(profile, {includeModFiles=false})` | 默认只导出 `{schema:"bedrockloom.profile/v1", name, createdAt, mods:[{id,version,config}], includeModFiles:false}` | `ok`；**不默认导出许可证不允许再分发的模组文件** |
| 同上 `includeModFiles:true` | 返回 `degraded(body, "包含模组文件需逐项核对许可证", "仅导出 ID/版本/配置", {requiresLicenseCheck:true})` | 降级并要求逐项核对许可 |
| `importProfile(file, installed)` | 产出 `{missing, versionDiff, matched, total}` | 有缺失或版本差异 → `partial`，**不静默补齐** |

测试实际断言：`S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置`、
`S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐`。

## 11.12 算法 → 实现 → 测试映射

| 交付物条目 | 函数 | 测试文件 | 关键断言 |
|---|---|---|---|
| 依赖拓扑 / 版本范围 | `resolveLoadOrder` | `test/resolver.test.mjs` | 乱序输入同结果、缺依赖、版本不匹配、环路径 |
| 六类冲突 | `detectConflicts` | 同上 | 同名服务两实现必须冲突 |
| 启用集合 | `computeEnableSet` | 同上 | 依赖自动启用、阻止危险禁用 |
| 人话解释 | `explain` | 同上 | 建议非空且可执行 |
| 解析主入口 | `resolve` | 同上 | 强制覆盖产出审计与 `rollbackPoint` |
| 更新计划 | `planUpdate` | 同上 | 重大更新/权限增加二次确认 |
| SemVer | `parse`/`compare`/`satisfies`/`rankCandidates` | `test/semver.test.mjs` | AND/OR/`^`/`~`/`*`、预发布规则、降序 |
| 配置合并 | `merge` | `test/config-merge.test.mjs` | 三层顺序、无效回落、令牌脱敏 |
| 差异/迁移 | `diff`/`migrate` | 同上 | 新增/移除/类型变化/冲突不静默 |
| 配置集 | `exportProfile`/`importProfile` | 同上 | 默认不导出文件、差异逐条说明 |
| 权限判定 | `evaluate`/`reconfirm` | `test/permissions.test.mjs` | 分级、遥测默认拒绝、再确认 |

## 11.13 明确不做的算法行为

1. 不静默覆盖资源、不静默改键、不静默抢占 HUD 插槽。
2. 不为同名服务随机挑选胜者，也不按文件大小/安装时间隐式裁决。
3. 不依赖输入数组顺序、启动顺序或全局可变状态（B1 + [10](10-sandbox-and-trust.md) §10.2）。
4. 不把令牌、密钥、凭据写入普通配置。
5. 不按客户端版本号字符串盲猜能力；版本只用于 SemVer 范围匹配。
6. 不在冲突时自行删除或替换已安装模组；所有变更都通过 [09](09-transactions-and-fsm.md) 的事务执行。
