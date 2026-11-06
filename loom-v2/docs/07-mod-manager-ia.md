# 交付物 6：模组管理器信息架构、页面流程与交互状态

管理器是平台**一等模块**，不是命令行列表。实现形态：`manager/index.html`（单文件、离线、自包含、
无网络请求、界面层不直接操作文件系统），通过 `contracts/services.ts` 的九个服务契约与后端交互。

## 7.1 信息架构（11 个板块）

```text
Bedrock Loom 模组管理器
├── 模组库           已安装/内置/外部导入/可更新/禁用/损坏/不兼容/被屏蔽
│   ├── 卡片网格     截图占位、名称、稳定 ID、版本、分类、标签、大小、来源、状态
│   ├── 工具栏       搜索 / 状态筛选 / 排序 / 仅收藏 / 本地分组
│   └── 详情抽屉     作者、版本、许可证、主页/源码、依赖、权限、能力、平台、大小、
│                    截图、说明链接、变更日志、发布日期、支持版本、阶段合同、实际来源
├── 安装与导入       4 步向导（选择来源 → 预检 → 用户确认 → 原子安装）
├── 源与仓库         官方/社区/企业私有源；身份、密钥、优先级、镜像、离线缓存、索引与撤销
├── 更新管理         候选版本排序、批量、跳过、回退、二次确认、备份、自动更新默认关闭
├── 启用与运行顺序   全局/存档/单人多人、拓扑排序、安全模式、故障隔离
├── 配置管理         自动生成界面、分层、搜索、默认值、恢复、导入导出、迁移差异
├── 依赖与冲突       为什么不能启用 + 可执行建议 + 强制覆盖审计
├── 权限与信任中心   双层描述、分级、再确认、撤销、签名/来源/审计/许可证/供应链
├── 诊断与修复       脱敏诊断包、贡献度、问题分类、一键修复、回滚最近变更
├── 配置文件集       保存/导出/导入、跨设备差异、玩法预设、许可证约束
└── 能力矩阵         十阶段合同、证据域 E0–E5、API 状态总表、未验证项
```

**不默认上传玩家已安装模组或游玩数据**；诊断包只在本地生成、由用户主动复制。

## 7.2 数据模型（对应 `contracts/types.ts`）

| 实体 | 关键字段 | 约束 |
|---|---|---|
| `ModRecord` | `id`（稳定 ID）、`name`（可见名）、`version`、`state`、`actualSource`、`permissions`、`capabilities`、`contribution` | ID 永不随改名变化；一个模组可多候选来源，安装记录来源唯一 |
| `ManifestV2` | `identity / loader / client / dependencies / entrypoints / resources / permissions / capabilities / stageContracts / signature / content / provenance / migration` | 见 [08](08-package-format-2.md) |
| `SourceDescriptor` | `id / kind / trust / priority / signatureKeys / mirrors / offlineCache` | 不可信时警告，不静默降级 |
| `Transaction` | `txId / kind / state / cancelPoints / rollbackPoint / backupPath / events[]` | 见 [09](09-transactions-and-fsm.md) |
| `ConfigSchema/MergedConfig` | `schemaVersion / fields / layers / sensitive / requiresRestart` | 令牌不写普通配置 |
| `ProfileFile` | `name / mods[{id,version,config}] / includeModFiles` | 默认不导出模组文件 |
| `DiagnosticBundle` | `environment / counts / errors / contributions / redaction` | 排除聊天/账号/IP/坐标 |

## 7.3 关键页面流程

### 安装与导入（B）

```text
选择来源（本地文件/目录/拖拽/剪贴板）
  → PRECHECK：签名信封 → 文件清单全覆盖 → manifest → 依赖 → 冲突 → 平台 → 权限
  → 用户确认：增量 / 替换 / 取消；重大更新与新增权限须二次确认
  → 原子安装：INIT → PRECHECK → STAGING → BACKUP → COMMIT_PENDING
              → COMMITTED → VERIFY → DONE
  → 失败/取消：ABORTING → ABORTED（清理暂存、从备份恢复）
  → 提交点崩溃：保留 marker → recoverPending() 重放提交或从备份回滚
  → 记录实际来源与可撤销操作
```

交互状态：`idle / running / cancelling / cancelled / done / failed`。
进度条按状态推进，可取消点仅 `INIT..COMMIT_PENDING`；`COMMITTED` 后取消被拒绝并解释原因。

### 更新（D）

```text
检查更新（离线显示缓存时间）→ 兼容候选排序（SemVer 降序 + 加载器/客户端范围过滤）
  → 重大更新 / 权限增加 → 二次确认（差异展示）
  → 更新前备份 → 原子替换 → 冒烟测试 → 失败回滚 → 保留可迁移配置
  → 跳过版本 / 回退版本
```
`自动更新` 默认关闭；后台更新不得直接替换正在使用文件。

### 冲突（G）

```text
冲突检测（硬冲突 / 服务 / 命名空间 / 按键 / HUD 插槽 / 版本 / 环 / 重复 ID）
  → 展示"为什么不能启用" + 逐条可执行建议
  → 用户强制覆盖 → 风险说明 + 审计记录 + 回退点 BACKUP
  → 绝不静默覆盖资源或随机挑选胜者
```

### 权限与信任（H）

```text
安装前声明（通俗 + 技术双层）
  → 运行时新增权限 → 重新确认（reconfirm）
  → 高风险项（account / native / 遥测）→ 强化确认，不能用"继续"掩盖
  → 信任中心可撤销；签名/作者/来源/审计/已知问题/许可证/供应链状态可查
  → 遥测默认不收集，除非单独、明确、可撤销同意
```

### 诊断（I）

```text
采集（启动阶段、依赖结果、资源错误、崩溃、降级）
  → 按模组贡献度（帧时间 / 内存 / 对象数 / 错误）
  → 分类：模组 bug / 适配器限制 / 官方客户端限制 / 网络问题
  → 一键复制脱敏诊断包 → 修复动作（验证资源、清缓存、恢复默认、回滚最近变更）
  → 无法自动恢复 → 安全模式 + 原因说明 + 隔离上次失败模组
```

## 7.4 交互状态总表

| 页面 | 主要状态 | 空状态 | 错误 / 部分成功 | 长任务 |
|---|---|---|---|---|
| 模组库 | 浏览 / 筛选 / 搜索 / 收藏 / 详情 | 无匹配结果 | 损坏/不兼容/被屏蔽卡片带原因 | 列表查询可取消 |
| 安装 | idle / running / cancelled / done / failed | 未选来源 | `partial` 逐项列出预检失败 | 可取消 + 进度 |
| 源与仓库 | 已同步 / 离线缓存 / 不可信 | 无源 | 源不可信警告（非静默降级） | 索引拉取可取消 |
| 更新 | 候选 / 计划 / 执行 / 回滚 | 无更新 | 校验失败重试上限 3 次 | 可取消 + 进度 |
| 启用顺序 | 拓扑序 / 安全模式 | 无模组 | 阻止危险禁用并解释 | 启停可取消 |
| 配置 | 分层编辑 / 迁移差异 | 无配置项 | 无效值回落默认并列出差异 | — |
| 冲突 | 已解决 / 未解决 / 强制覆盖 | 无冲突 | 给出原因与建议 | — |
| 权限 | 已同意 / 待确认 / 已撤销 | 无权限 | 高风险需强化确认 | — |
| 诊断 | 正常 / 降级 / 隔离 / 安全模式 | 无记录 | 分类 + 贡献度 + 修复动作 | 修复可取消 |
| 配置集 | 已应用 / 有差异 | 无文件集 | 缺失模组与版本差异逐条说明 | 应用可取消 |
| 能力矩阵 | 只读证据视图 | — | 未验证项明确标注 | — |

## 7.5 界面层约束（可被静态检查）

- 界面层只持有 `ManagerUiApi`（九个服务 + 资源/事件/事务契约），不持有 `fs/path/crypto/child_process`。
- 不发起网络请求；离线可用；所有长任务可取消、可观察进度、原子提交、返回结构化错误。
- 不默认导出许可证不允许再分发的模组文件；导出配置集只含 ID/版本/配置。
- 高频数据更新批量化；不把客户端命中结果当作多人权威操作。
- 静态断言见 `test/compatibility.test.mjs`（外部 CDN、网络请求、板块关键词）。

## 7.6 公开 API（对第三方管理工具）

九服务接口见 [contracts/services.ts](../contracts/services.ts)：
`ModRepositoryService`、`InstallationService`、`UpdateService`、`DependencyResolver`、
`ModRuntimeController`、`ConfigService`、`DiagnosticsService`、`ProfileService`、`PermissionService`
（另加 `ResourceService`、`EventBusService`、`TransactionService` 支撑契约）。
全部返回 `Result<T>`（七态）、长任务接受 `AbortSignal` + `onProgress`、错误为 `ServiceError` 结构化对象。
