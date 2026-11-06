# 交付物 9：模组沙箱、错误隔离、权限模型、信任中心与威胁模型

## 10.1 沙箱：加载前后的权限边界

| 阶段 | 允许 | 默认拒绝 |
|---|---|---|
| 加载前（安装/预检） | 读包内文件、验签、校验文件清单、解析 manifest、静态扫描入口 | 执行脚本、写任意文件系统、动态加载库、读取其他模组私有文件 |
| 加载前（权限授予） | 按 `permissions[]` 生成最小权限集与通俗说明 | 未声明权限 `E_PERMISSION_UNDECLARED`；`native/account` 默认拒绝 |
| 运行时（脚本） | 通过 `ClientEventBus`、受控 `ResourceHandle`、白名单 API 提交请求 | 任意文件访问、私有内存、未公开符号、跨模组私有对象、全局可变状态 |
| 运行时（网络） | 仅可选 BLSP/1 白名单表现请求，带预算/过期/幂等 | 服务端脚本、任意资源路径、写本地存档、授予玩法权限 |
| 卸载 / 退出世界 | 取消订阅、定时器、清空白名单、`forceRelease()` | 残留句柄、残留事件监听器 |

**原生扩展**：单独标记 `native.module`（`critical`），默认拒绝；只在签名清单 + ABI 校验 +
崩溃隔离 worker + 可撤销许可同时满足时才加载；国际版构建不包含该实现。

## 10.2 错误隔离

| 风险 | 控制 | 实现 / 断言 |
|---|---|---|
| 脚本超时 | 每脚本 CPU 时间上限、watchdog | `withTimeout()` 返回 `timeout`；事件超时计入 `EventReport.timedOut` |
| 异常 | 逐监听器 try/catch，错误转诊断 | 既有 `ClientEventBus.emit` 用 try/catch 发 `listener_error`；`test/compatibility.test.mjs` 断言 |
| 无限循环 | 同步调用深度上限 + 总步数预算 | 事件总线有深度上限；单模组异常不扩散 |
| 过量分配 | 对象数 / 内存 / 每帧更新 / UI 提交预算 | `docs/RENDER_OPERATIONS.md` 预算常量化；超硬上限先拒绝新对象 |
| 事件超时 | 同步事件超时熔断、异步可取消 | `AbortSignal` + 超时返回 `timeout` |
| 同步调用深度 | 显式上限 | 契约 `EventBusService.on({timeoutMs, priority})` |
| 异步任务取消 | 所有长任务接受 `AbortSignal` | 契约 `LongTaskOptions`；安装测试验证取消点 |
| 一个模组故障 | 故障计数 → 熔断 → 隔离 → 恢复 | `ModRuntimeController.isolateFaulty()`、`listFaults()`；安全模式 |
| 不破坏核心界面 | 核心界面由宿主渲染，模组只提交受限请求 | `ScreenDisplay` 相关调用不得抢聊天/设置焦点 |
| 资源句柄可追踪 | `ResourceHandle` 引用计数 + 状态机 | `active → release-pending → released`；退出世界强制回收并断言句柄=0 |
| 禁止全局可变状态 | 命名空间隔离 ID、禁止隐式加载顺序 | `DependencyResolver` 确定性拓扑排序；`resolve()` 不依赖输入顺序 |
| 禁止读其他模组内部文件 | B4 边界规则 | `test/compatibility.test.mjs` 扫描被禁止关键字 |

**故障状态机**：`正常 → recovering → circuit-open(隔离) → 手动/自动恢复`。
连续失败达到阈值后熔断，不再重试风暴；上次导致启动失败的模组**自动隔离**，不反复崩溃。

## 10.3 权限模型（双层描述 + 分级）

实现：[`core/permissions.mjs`](../core/permissions.mjs)（`PERMISSION_CATALOG`）。
分级与作用域：

| 级别 | 作用域 | 示例 | 判定 |
|---|---|---|---|
| `low` | local | `resource.read`、`presentation.local`、`audio.local`、`ui.screen` | 声明即允许 |
| `medium` | local / input / world / player / notification | `input.local`、`entity.observe.local`、`storage.world`、`graphics.settings` | 声明 + 同意；Vibrant Visuals 依赖时降级 |
| `high` | network | `network.presentation` | 需明确同意；离线自动降级且不影响本地 |
| `critical` | account / native / network | `account.identity`、`native.module`、`telemetry.collect` | **强化确认**，不能用"继续"掩盖；遥测默认拒绝 |

**规则**：
- 安装前声明（通俗说明 + 技术实现说明双层）；运行时新增权限 `reconfirm()` 重新确认。
- 可撤销（`revoke()`）；撤销后相关能力立即停止。
- 不收集遥测，除非**单独、明确、可撤销**同意；默认 `deny`。
- 源不可信（`untrusted` / `revoked`）→ `deny` 并显示警告，不静默降级。
- 敏感项脱敏；令牌不写入普通配置（`E_SENSITIVE_IN_CONFIG`）。

## 10.4 信任中心

`trustSummary(mod)` 输出：签名与 `keyId`、作者、实际来源与 `sourceKind`、审计记录、
已知问题、许可证、供应链状态（密钥指纹/撤销列表）、高风险权限清单、`telemetry: 默认不收集`、
结论等级（`常规 / 高风险需强化确认 / 需审阅`）。

供应链底线（沿用既有 `RENDER_AUDIT.md` 并扩展）：
- 原生适配器只能来自签名清单，绑定客户端构建、ABI、能力许可与 SHA-256。
- 不从可写目录自动执行库；加载前校验签名与哈希，失败回滚到纯资源模式。
- 第三方模块需审核、最小权限、版本锁定、撤销列表；崩溃不结束游戏。
- 用户可查看已加载适配器、来源、签名、版本、哈希、权限与加载时间。
- 一个模组允许多个候选来源，但安装记录必须明确唯一 `sourceOfRecord`。

## 10.5 威胁模型（STRIDE 式，逐项给出缓解与残余风险）

| 威胁 | 攻击面 | 缓解 | 残余风险 / 诚实说明 |
|---|---|---|---|
| **S** 伪装官方包 / 密钥替换 | 仓库索引、签名信封 | Ed25519 签名覆盖 manifest + 文件清单；密钥撤销列表；`E_SIG_KEY_UNKNOWN/REVOKED/EXPIRED` | 首次信任（TOFU）仍需用户显式信任源；不可信源显示警告 |
| **T** 替换未列文件 / 篡改资源 | `.loompack` 内容 | `E_FILE_UNLISTED`、`E_FILE_HASH_MISMATCH`、manifestHash 自洽校验 | 已签名包内容不可变；私钥泄露需靠撤销列表 |
| **T** 中间人 / 降级到旧索引 | 仓库拉取 | `sequence` 单调递增 + 全索引签名；离线显示缓存时间 | 源被完全攻破且密钥未及时撤销时仍有窗口 |
| **R** 否认安装来源 | 安装记录 | `provenance.installedFrom` + 事务日志 + 审计 | 本地日志可被本机管理员删除，不承诺防篡改 |
| **I** 隐私泄露 / 遥测 | 诊断包、配置、账号权限 | 脱敏排除聊天/账号/IP/坐标；默认不收集；令牌不写普通配置 | 用户主动复制诊断包后自行负责 |
| **D** 单模组拖垮客户端 | 事件 / 对象 / 内存 | 预算、熔断、隔离、错误逐监听器捕获 | 游戏内真机性能预算**未验证**，需按 [13](13-testing-and-budgets.md) 校准 |
| **D** 崩溃循环 | 启动失败模组 | 自动隔离 + 安全模式 + 故障计数 | 需要事务日志与备份完整 |
| **E** 原生扩展提权 | `native.module` | 默认拒绝 + 签名 ABI + worker 隔离 + 可撤销 | 国际版公开客户端无该实现（`CustomClientOnly`） |
| **E** 二进制注入 / Hook | 渲染扩展 | B4 静态扫描 + 负向探针；`Unavailable` 结论 | 任何试图绕过者不属于本平台，直接拒绝 |
| 越权多人操作 | 客户端命中/表现 | 位置标 `sampled`/`local-predicted`；改变多人结果必须走权威服务端 | 不把客户端命中当权威 |
| 静默覆盖资源 / 随机胜者 | 依赖冲突 | 六类冲突检测 + 解释 + 强制覆盖审计与回退 | 用户强制覆盖仍属用户决定，已记录风险 |

## 10.6 网易与定制客户端只做接口预留

- 不复制、不下载、不嵌入网易 SDK 或游戏文件；`platform/netease/adapter.js` 保持 `enabled:false`。
- 用户开启适配器并**选择合法本地 SDK** 后才编译/运行；国际版构建不得包含网易代码
  （`E_PLATFORM_ADAPTER` 校验拒绝）。
- 用**契约测试**验证适配器，而不是让核心层依赖具体平台：`CC01` 只校验接口形状与能力清单，
  不校验画面等价。
- 定制客户端渲染扩展采用版本化 SPI、权限令牌、资源生命周期与崩溃隔离（既有 `RENDER_SPI.md`）。
- 提供能力清单，不声称两个平台可等价实现所有功能；`CC02` 为 `CustomClientOnly`。

静态验证：`test/compatibility.test.mjs` 的 B1/B2/B4 断言（core 无 `node:*`、services 不依赖界面层、
代码无注入/Hook/私有偏移关键字）。
