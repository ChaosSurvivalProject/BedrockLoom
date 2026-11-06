# 交付物 17：经审计后可承诺的能力清单与不能承诺的能力清单

判定口径：[01](01-freeze-definition.md)（"可用"冻结定义、七种状态、E0–E5、证据域、七态结果）。
总数来自 [03](03-api-status-table.md)：**Stable 20、Candidate 0、Experimental 20、
BuildTimeOnly 6、PlatformRestricted 2、CustomClientOnly 2、Unavailable 14**。
执行证据：[EVIDENCE.md](../EVIDENCE.md)（10 个测试文件 / 80 用例 / 80 通过 / `tsc --noEmit` 通过）。

## 16.1 "可承诺"的判定口径

一个能力进入本节 §16.2，必须同时满足：

1. 属于 `platform-side` 证据域（不依赖 1.21.130 客户端运行时行为）。
2. 达到 **E4**：`node --test` 跨多个 fixture / 版本连续通过，且有对应测试用例名可查。
3. 满足 [01](01-freeze-definition.md) §1.1 的十条（含七态结果、确定性销毁、性能预算、
   错误隔离、兼容性测试、示例确实执行过）。
4. 承诺的是**平台侧契约行为**，不是画面结果。

> "可承诺"不包含：资源是否被 1.21.130 加载、画面是否可见、排序/遮挡是否符合预期、
> 帧时间是否达标、GPU 资源是否立即回收。这些全部落在 `in-game` 域，当前上限 E2。

## 16.2 可承诺清单（Stable 20，全部 `platform-side` / E4）

### A. 包格式与完整性（S01–S04）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `ManifestValidator.validate` (S01) | 按 `bedrockloom.mod/v2` Schema 校验；拒绝 v1 直接安装、`1.21.x` 泛化版本、国际版含网易适配器、in-game 标 Stable、介入点写"底层自动处理"、令牌入普通配置 | 不验签（在 services 层）；不判断游戏内能力是否真的存在 |
| `SignatureEnvelope.sign` (S02) | Ed25519 生成 `signature.json`，`protected[]` 固定覆盖 `manifest.json` + `META/file-list.json` | 不保护"仅 manifest"的包（那会被拒绝） |
| `SignatureEnvelope.verify` (S03) | 校验 payloadHash、密钥在信任存储且未撤销未过期、签名有效；未知/撤销/过期密钥分别给错误码 | 不承诺首次信任（TOFU）自动成立；不可信源仍需用户显式信任 |
| `IntegrityChecker.verifyFileList` (S04) | 逐文件 SHA-256 匹配；**任何未列文件 → `E_FILE_UNLISTED`**；替换 → `E_FILE_HASH_MISMATCH`；缺失 → `partial` 可续传；拒绝路径穿越与重复项 | 不承诺引擎会加载这些资源 |

证据：`test/manifest-validator.test.mjs`、`test/signature-integrity.test.mjs`、`schemas/*.json`。

### B. 版本与依赖（S05–S08）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `Semver.satisfies` (S05) | AND / OR / 比较符 / `^` / `~` / `*`；预发布版本默认不匹配无预发布的范围 | 不按客户端版本号字符串盲猜能力 |
| `Semver.rankCandidates` (S06) | 兼容候选按 SemVer 降序，不满足项排后并给出原因，不静默丢弃 | 不自动应用更新 |
| `DependencyResolver.resolve` (S07) | 确定性 Kahn 拓扑排序（字典序 tie-break，与输入顺序无关）；缺依赖、版本不匹配、环、六类冲突逐条列出；强制覆盖产出审计与 `rollbackPoint` | 不静默覆盖资源、不随机挑选胜者、不自行删除已装模组 |
| `DependencyResolver.explain` (S08) | 每个问题给出人话标题、原因、涉及模组与可执行建议 | 不代替用户做仲裁决定 |

证据：`test/semver.test.mjs`、`test/resolver.test.mjs`。

### C. 配置合并与差异（S09–S10）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `ConfigMerge.merge` (S09) | `global < world < player` 三层合并；默认值补齐；无效值回落默认并列出；敏感键脱敏为 `***redacted***`；输出 `requiresRestart` / `layersApplied` | 不把令牌写入普通配置；不承诺热应用到游戏内对象 |
| `ConfigMerge.diff` (S10) | 输出 `added / removed / changed(type,default,enum) / conflicts`，供升级时展示差异 | 不静默覆盖旧值 |

证据：`test/config-merge.test.mjs`。

### D. 事务、安装与运行控制（S11–S15）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `TransactionFSM.begin` (S11) | 十种流程的明确状态序列、`cancelPoints`、`rollbackPoint:"BACKUP"`、日志首事件 | 不执行真实文件操作（纯逻辑） |
| `TransactionFSM.transition` (S12) | 拒绝非法事件；`COMMITTED` 后取消被拒；`fail` 自动回滚并记录 phase/错误码；`crash` 进入 `RECOVERY_REQUIRED` 不伪装成功 | 不把 `ok` 解释为画面成功 |
| `TransactionFSM.recover` (S13) | 依据最后状态与备份决定 `ROLLBACK_FROM_BACKUP` / `REPLAY_COMMIT` / `FINISH_ROLLBACK` / `VERIFY_ONLY` / `ENTER_SAFE_MODE` | 无备份且不可判定时不猜测，进安全模式 |
| `InstallationService.install` (S14) | 真实临时目录写入、单次 `rename` 原子替换、升级前备份、磁盘满回滚、取消点、提交点崩溃恢复、事务日志落盘；长任务可取消 + 进度 + `Result` | 不直接替换正在使用文件；不承诺游戏内加载成功 |
| `ModRuntimeController.setEnabled` (S15) | 依赖自动启用、阻止危险禁用、确定性加载顺序；禁用必须释放资源 | 不允许只隐藏按钮 |

证据：`test/fsm.test.mjs`、`test/installation.test.mjs`、`services/installation-service.mjs`。

### E. 权限与信任（S16–S17）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `PermissionService.evaluate` (S16) | 双层描述（通俗 + 技术实现）、`low/medium/high/critical` 分级、`critical` 强化确认、遥测默认拒绝、不可信源警告不静默降级 | 不用普通"继续"掩盖高风险 |
| `PermissionService.reconfirm` (S17) | 运行时新增权限重新确认，产出可撤销同意记录与审计；`revoke()` 生效；离线时网络能力降级且不影响本地 | 不默认授予任何新权限 |

证据：`test/permissions.test.mjs`、`core/permissions.mjs`。

### F. 诊断、配置集、迁移与兼容（S18–S20）

| 接口 | 承诺内容 | 明确不承诺 |
|---|---|---|
| `DiagnosticsService.collect` (S18) | 脱敏诊断包（排除聊天/账号/IP/坐标/令牌等）、按模组贡献度统计、错误分类为模组 bug / 适配器限制 / 官方客户端限制 / 网络问题 | 不默认上传、不收集遥测；不承诺防本机管理员篡改日志 |
| `ProfileService.export` (S19) | 默认只导出 `{id, version, config}`；请求含模组文件时返回 `degraded` + `requiresLicenseCheck`；导入时缺失模组与版本差异逐条说明 | 不默认导出受许可限制的模组文件；不静默补齐 |
| `V1CompatAdapter.toV2` (S20) | 真实读取 `../mod/mod.json` 单向生成合法 v2 manifest；14 类映射、五个审查发现、`requiresVerification`；**40 个既有文件字节级不变** | 不写回旧目录；不擅自改写原生 manifest 的模块版本与加载器范围 |

证据：`test/compatibility.test.mjs`、`test/migration.test.mjs`。

**共同承诺**：七态结果语义、`Disposable.dispose()` 幂等、长任务 `AbortSignal + onProgress`、
结构化错误码（[`schemas/validation-codes.md`](../schemas/validation-codes.md)）、
零私有符号 / 无注入 / 无 Hook（B4 负向探针）。

## 16.3 有条件登记、但不承诺画面结果

| 状态 | 数量 | 承诺边界 |
|---|---|---|
| `Candidate` | **0** | E3 需真实 1.21.130 最小工程；本沙箱不具备，不把 E2 拔高为 E3 |
| `Experimental` | 20 | 承诺"存在公开文档/官方示例级别的调用路径"；**不承诺**画面可见、排序、稳定可见、DPI、清理。全部默认关闭或需显式启用，`testDate=未运行（沙箱无客户端）` |
| `BuildTimeOnly` | 6 | 承诺"资源定义可被构建、校验、签名"；运行时调用返回 `unsupported`，不承诺被加载或绘制 |
| `PlatformRestricted` | 2 | 承诺"在特定图形模式/模块启用条件下可设置引擎参数"；设备、Realms/BDS 限制均 **未验证** |
| `CustomClientOnly` | 2 | 承诺"存在版本化 SPI 契约与契约测试"；国际版构建**不包含实现**，不承诺画面等价 |

## 16.4 不能承诺清单

### 16.4.1 能力层面（14 项 `Unavailable`）

自定义 Shader (U01) / 运行时几何与权重提交 (U02) / 帧缓冲与全屏后处理 pass (U03) /
渲染层与透明排序 (U04) / 每帧骨骼写入与实时 IK (U05) / 运行时点光聚光 (U06) /
原生相机 Hook 与 FOV 控制权 (U07) / 世界空间与实体附着 UI (U08) / decal 与穿墙描边 (U09) /
动态纹理上传与流送 (U10) / 屏幕空间粒子发射器与运行时改参 (U11) /
帧前帧后与 FramePresent 回调 (U12) / 网易版能力等价实现 (U13) /
定制客户端 R2/R3 原生管线控制 (U14)。

每条在 [03](03-api-status-table.md) §3.7 都有判定依据与正式授权路径；
实现它们需要修改二进制 / 私有内存 / Hook 未公开函数 / 绕过签名沙箱审核，属于验收硬门槛禁止项。

### 16.4.2 结果层面（明确不承诺）

1. 不承诺**资源被 1.21.130 加载**、不承诺资源包内 `ui/hud_screen.json` 生效。
2. 不承诺 `ok` 意味着画面可见；`ok` 只表示平台侧契约完成。
3. 不承诺可见性、排序、遮挡、DPI、安全区、帧时间、内存、GPU 立即回收。
4. 不承诺 `@minecraft/server-graphics` 能创建自定义后处理 pass 或帧缓冲访问；
   它只提供 Vibrant Visuals 大气散射**设置级参数**。
5. 不承诺跨设备 / 跨存档方式行为一致（Windows/Android/iOS/Xbox/PlayStation/Switch、
   本地单人/Realms/BDS 均 **未验证**）。
6. 不承诺 1.21.130 上 `@minecraft/server` 的确切模块版本号（v2.4.0 为推断）。
7. 不承诺 E3/E4/E5 游戏内证据、视觉黄金测试、长期崩溃统计已完成。
8. 不承诺首次信任（TOFU）自动成立；不承诺本机日志防篡改。
9. 不承诺网易版或定制客户端与国际版能力等价。
10. 不承诺任何"自动修复到可启动"之外的恢复结果；不可判定时进入安全模式并解释原因。

## 16.5 分界线（一句话）

| 证据域 | 可承诺级别 | 原因 |
|---|---|---|
| `platform-side` | E4 → `Stable`（20 个） | 纯 Node 环境，`node --test` 跨 fixture 连续通过，不触碰游戏二进制 |
| `in-game` | 上限 E2 → `Experimental`（20 个） | 沙箱无 1.21.130 客户端、无官方自动截图/渲染测试通道 |
| `custom-client` | E0 → `CustomClientOnly`（2 个） | 本仓库无实现，需正式授权与签名 SPI |

**这条分界线不是措辞技巧**：`Stable` 20 个接口里没有任何一个介入游戏内渲染。
"真正介入渲染"的接口清单与介入层级见 [17](17-final-answer.md)。

## 16.6 措辞纪律（禁止 vs 替代表述）

| 禁止的表述 | 为什么禁止 | 必须改成 |
|---|---|---|
| "理论上可用" / "应该可以" | 无实现证据 | 写明状态、证据级别、证据域、测试文件 |
| "未来可能" / "后续引擎会自动实现" | 用时间掩盖缺口 | 写明重新评估的**唯一条件**（新增证据 / 正式授权） |
| "类似 Java 版" | 平台不同，禁止借证据 | "国际版 1.21.130 未验证" 或 `Unavailable` |
| "已接入渲染管线" / "控制渲染管线" | 把资源定义包装成管线控制 | "在 `ResourceBuild` 阶段写入资源定义，执行权归游戏客户端" |
| "跨平台一致" | 设备与存档方式未验证 | 逐平台写 `未验证` |
| "成功即必然可见" | 混淆提交与画面 | "`ok` = 平台侧契约完成；画面结果未验证" |
| "底层自动处理" | 占位介入点 | 点名具体函数 / 资源路径（[04](04-render-stage-contract.md) §4.3） |
| 把 `render_controllers/*` 称为渲染层 | 它是资源层绑定描述 | "资源层材质/几何/纹理绑定描述" |

代码层已把其中几条变成可回归断言：`test/manifest-validator.test.mjs` 拒绝
"底层自动处理 / TODO / tbd / 未来"等介入点；`test/compatibility.test.mjs` 扫描禁止关键字。

## 16.7 重新评级路径（唯一途径是新增证据）

```text
Unavailable --(版本化官方文档 / 签名扩展点)--> Experimental (E1/E2)
Experimental --(真实 1.21.130 最小工程跑通 + acceptanceRecord)--> Candidate (E3)
Candidate --(自动测试跨版本通过)--> Stable (E4)
Stable --(多设备/多版本长期通过)--> Stable 长期 (E5)
```

补齐步骤见 [13](13-testing-and-budgets.md) §13.3–13.5，判定规则见 [01](01-freeze-definition.md) §1.1。
**修改措辞不改变状态**；`Unavailable` 升级不需要改代码结构，只需要新增证据。

## 16.8 数字总表

| 状态 | 数量 | 是否对外承诺 |
|---|---:|---|
| `Stable` | **20** | 是（仅 `platform-side`） |
| `Candidate` | **0** | —（刻意结论） |
| `Experimental` | 20 | 否（默认关闭，画面未验证） |
| `BuildTimeOnly` | 6 | 否（运行时 `unsupported`） |
| `PlatformRestricted` | 2 | 否（条件未验证） |
| `CustomClientOnly` | 2 | 否（国际版构建不含实现） |
| `Unavailable` | 14 | 否（合格结论，给出授权路径） |

> 宁可 `Stable` 只有二十个接口，也不要两百个无法兑现的接口。
