# 一、"可用"的冻结定义、状态枚举与证据分级

本文件是全部 API 裁定的**判定法**，[03-api-status-table.md](03-api-status-table.md) 与
[05-api-adjudication.md](05-api-adjudication.md) 的每条结论都按此表推导。

## 1.1 进入 Stable 的十个条件（逐条给出可判定形式）

| # | 条件 | 可判定形式（本仓库的落地物） | 不满足时的处置 |
|---|---|---|---|
| 1 | 明确平台与最低版本 | `platforms[]` 必须写明 `distribution`、`clientBuildMin`、`moduleVersions`（如 `@minecraft/server` 版本）；禁止写 "1.21.x" 泛化 | 标 `PlatformRestricted` |
| 2 | 不依赖未公开符号/偏移/偶然行为 | 实现路径清单必须可映射到公开文档 URL 或本仓库自有代码；出现 `offset`/`sigscan`/`patch`/`inject` 即否决 | 标 `Unavailable` |
| 3 | 有能力探测，不猜版本号 | 必须引用 `CapabilityProbe` 报告条目，且缓存键含 `clientBuild + adapterBuild + resourceFingerprint + graphicsBackend + quality` | 标 `Experimental` |
| 4 | 有最小可运行示例 | 示例必须是 `test/` 中实际执行的调用，或明确标注"未执行，真机验收步骤见 §x" | 标 `Experimental` |
| 5 | 结果语义完整 | 必须能返回 `ok / partial / unsupported / denied / timeout / resource-exhausted / degraded` 七态之一，见 §1.4 | 不得进 `Candidate` 以上 |
| 6 | 确定性销毁与回收 | 必须有 `dispose()` + 句柄计数断言 + 退出世界/维度切换/热禁用后活动句柄为 0 的测试 | 标 `Experimental` |
| 7 | 自动测试；否则人工验收步骤与证据 | `test/*.test.mjs` 有对应用例；无自动化时给出固定种子/设备/分辨率/截图对比的人工步骤与证据存放路径 | 标 `Experimental` 并写明人工证据 |
| 8 | 性能上限、错误隔离、降级 | 有预算常量、超限拒绝路径、单模组异常隔离测试、降级映射 | 标 `Experimental` |
| 9 | 连续通过兼容性测试 | `test/compatibility.test.mjs` 对 v1 包、v2 包、跨版本范围、损坏包、冲突包连续通过 | 不得进 Stable |
| 10 | 文档示例确实执行过 | 由 `test/run-evidence.mjs` 生成 [EVIDENCE.md](../EVIDENCE.md) 记录执行时间与结果 | 标为 `未执行` |

**判定规则：十条全部满足才允许 `Stable`；缺 4/7/9/10 中任一条最高 `Candidate`；缺 1/2/3 中任一条最高 `Experimental`。**

## 1.2 七种 API 状态（只允许这七种）

| 状态 | 定义 | 允许进入的条件 | 用户可见语义 |
|---|---|---|---|
| `Stable` | 十条全满足，且证据达 E4+ | 十条 + E4 | 可承诺行为，破坏性变更需 `@deprecated` + 适配器 + 迁移脚本 |
| `Candidate` | 实现路径真实存在，证据 E3（最小工程已跑通），缺长期/跨版本证据 | E3 + 十条中至少 7 条 | 可用于实验，不承诺跨版本画面一致 |
| `Experimental` | 有公开文档或官方示例（E1/E2），或实现存在但缺真机证据 | E1/E2，或平台侧逻辑测试通过但缺真机 | 需显式开启，默认关闭，行为可变更 |
| `BuildTimeOnly` | 只在创作期/打包期有效，运行时无对应对象 | 资源格式验证通过 | 只影响资源构建与加载；运行时调用返回 `unsupported` |
| `PlatformRestricted` | 仅特定发行形态/设备/画质可用（如 Vibrant Visuals、非 Realms） | 官方文档明确平台差异 | 探测缺失时自动降级且不报警为故障 |
| `CustomClientOnly` | 需客户端所有者签名的 Render Extension SPI 或正式授权 | 签名清单 + ABI + 崩溃隔离 | 国际版构建中不存在该实现；不得编译进国际版包 |
| `Unavailable` | 在"不改二进制、不注入、不绕过平台限制"底线内无法实现 | 负向探针确认拒绝 | **合格结论**，接口只允许返回 `unsupported` 并给出正式授权路径 |

> `Unavailable` 是合格结论。本仓库不为了接口数量制造假实现；也不把 `Unavailable` 包装成
> "后续引擎会自动实现"。升级状态的唯一途径是新增证据，不是新增措辞。

## 1.3 证据级别 E0–E5 与「证据域」

级别沿用用户定义，本仓库增加**证据域**字段，防止把平台侧代码测试冒充游戏内渲染证据：

| 级别 | 含义 | 允许的最高状态 |
|---|---|---|
| E0 | 已否定（实现需二进制修改/私有内存/Hook/绕过签名/依赖偶然行为） | `Unavailable` / `CustomClientOnly` |
| E1 | 仅官方文档 / 官方 changelog 声明 | `Experimental` |
| E2 | 官方示例或官方 SDK 文档给出可复现调用 | `Experimental` |
| E3 | 最小工程在**目标客户端**已跑通 | `Candidate` |
| E4 | 自动测试跨版本通过 | `Stable` |
| E5 | 多设备/多版本长期通过 | `Stable`（长期） |

**证据域**（必须随每条结论一起标注）：

| 域 | 定义 | 本沙箱可产生的证据上限 | 说明 |
|---|---|---|---|
| `platform-side` | 模组管理器、包格式、签名、依赖/冲突、状态机/事务、配置合并、权限判定、诊断、迁移、能力报告解析 | **E4 可达** | 纯 Node 环境，`node --test` 跨多个 fixture 版本连续通过；不触碰游戏二进制 |
| `in-game` | 粒子、音效、UI、输入、实体观察、资源包加载、Vibrant Visuals 参数、Script API 运行时 | **E2 上限** | 沙箱无 1.21.130 客户端、无官方自动截图/渲染测试通道；E3/E4/E5 必须由真机验收补齐，步骤见 [13](13-testing-and-budgets.md) |
| `custom-client` | 需签名 SPI 的定制客户端渲染扩展 | **E0（本仓库无实现）** | 只有正式授权、ABI 清单、崩溃隔离到位才重新评级 |

**由此产生的硬结论：本次 `Stable` 接口全部属于 `platform-side`；任何 `in-game` 接口都不得进入
`Stable` 或 `Candidate`。** 若用户在真实 1.21.130 设备上按 [13](13-testing-and-budgets.md) 补齐
E3/E4，可按本文件的判定规则重新评级，无需修改代码结构。

### 版本与来源纪律

- 每条 `in-game` 结论必须注明：`clientBuild`（1.21.130）、`distribution`（international）、
  `platform`（Windows / Android / iOS / Xbox / PlayStation / Switch，未测写"未验证"）、
  `worldStorage`（本地单人世界 / Realms / BDS，未测写"未验证"）、`testDate`、`source`。
- 本仓库所有 `in-game` 条目的 `testDate` 记为 `未运行（沙箱无客户端）`；文档与 changelog 核对日期为 `2026-11-06`。
- Java 版、网易版、26.x 版本的证据**不得**用于 1.21.130 国际版结论。
  已识别的版本混用风险：第三方 Script API 归档站 v1.21.130 页面上的"Platform Differences"表
  实际标注 *as of Minecraft v26.30*，本仓库**不引用该表作为 1.21.130 证据**，对应条目标"未验证"。

## 1.4 结果语义（七态，所有 Stable/Candidate 接口必须实现）

`core/result.mjs` 定义并由 `test/compatibility.test.mjs` 断言：

| 状态 | 含义 | 典型触发 | 调用方必须 |
|---|---|---|---|
| `ok` | 完整成功，副作用已提交 | 校验/安装/解析通过 | 记录事务日志 |
| `partial` | 部分成功并明确列出失败子项 | 批量更新中 3/4 成功 | 不得回滚已成功项；逐项列出 |
| `unsupported` | 平台无该能力 | 国际版请求自定义 Shader | 走降级映射，不重试 |
| `denied` | 权限/签名/策略拒绝 | 权限未声明、签名不符 | 写审计记录，向用户解释原因 |
| `timeout` | 超时（含可取消） | 下载/加载超时 | 释放占位、取消令牌生效 |
| `resource-exhausted` | 配额/磁盘/内存/预算不足 | 磁盘满、对象数超预算 | 不重试风暴，返回恢复条件 |
| `degraded` | 成功但使用更低等级路径 | 世界 UI → action bar | 必须同时给出 `reason` 与 `fallback` |

> 禁止把 `true` 解释为"画面稳定可见"。渲染相关调用另有
> `created / submitted / first_visible / stable_visible / degraded` 子状态，见 [04](04-render-stage-contract.md)。
> `ok` 只表示"平台侧契约完成"，不表示画面结果。

## 1.5 销毁与资源回收契约

- 每个创建类接口返回 `Disposable`：`dispose()` 幂等；重复调用不抛错、不重复释放。
- 对象池/引用计数由 `ResourceHandle` 表示**平台索引**，不承诺 GPU 立即回收；
  回收状态必须区分 `hidden / updates-stopped / release-pending / released`。
- 强制回收触发点：退出世界、维度切换、世界重启、模组禁用、适配器切换、断线、玩家死亡/传送。
  这些点在 [09](09-transactions-and-fsm.md) 的状态机里都有显式转换。
- 泄漏断言：进入/退出循环后活动句柄计数必须为 0，测试见 [EVIDENCE.md](../EVIDENCE.md)。

## 1.6 性能上限、错误隔离与降级

继承既有 `docs/RENDER_OPERATIONS.md` 的预算表并在 `core/` 中以常量固化：
单模组活动对象上限、每帧更新预算（ms）、UI 提交/重建次数、资源内存、粒子/秒、
跨语言调用次数。**超过硬上限先拒绝新对象**，接近上限按"远距 → 低优先级 → 透明 → 降更新频率"顺序软降级。
一个模组异常不得影响加载器、其他模组与核心界面：事件总线逐监听器 try/catch、超时熔断、故障计数、
隔离与恢复由 [10](10-sandbox-and-trust.md) 定义。

## 1.7 既有项目与本定义的关系

既有 `mod/docs/RENDER_AUDIT.md` 已建立 R0–R3 等级、`created/submitted/first_visible/stable_visible`
语义和"资源显示不等于管线控制"的原则，本文件**保留并沿用**，只增加：
① 七种 API 状态与用户定义的对齐；② E0–E5 与证据域；③ 七态结果语义；④ 十条可判定形式。
既有 `CapabilityProbe` 的 `CapabilityStatus` 枚举通过 [14](14-version-migration.md) 的兼容层映射到本文件状态集，
旧枚举值不改、不删。
