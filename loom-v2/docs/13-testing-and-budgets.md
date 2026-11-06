# 交付物 13 / 14：自动测试、真机验收、视觉黄金测试、性能预算、降级与泄漏检测

本文件把"已经执行过的证据"与"必须真机补齐的步骤"严格分开。
既有基线文档：[`../../mod/docs/PROBE_SCENARIOS.md`](../../mod/docs/PROBE_SCENARIOS.md)（八个探针场景，A/B/C 验收分层）、
[`../../mod/docs/RENDER_OPERATIONS.md`](../../mod/docs/RENDER_OPERATIONS.md)（预算表与合入门槛）、
[`../../mod/docs/RENDER_AUDIT.md`](../../mod/docs/RENDER_AUDIT.md)（停机点与状态语义）。三者**原文保留**，本文件只做 1.21.130 对齐与补齐。

## 13.1 三层验收

| 层 | 范围 | 本仓库状态 | 证据域 / 最高级别 |
|---|---|---|---|
| **A 平台侧自动化** | manifest / 签名 / 完整性 / 依赖 / 冲突 / 配置 / 权限 / 事务 / 安装 / 迁移 / 诊断 / 模块边界 | **已执行，80/80 通过** | `platform-side` / E4 |
| **B 真实客户端** | 1.21.130 各设备、各存档方式、资源加载、公开 API 提交后的画面行为 | **未运行（沙箱无客户端）** | `in-game` / 上限 E2 |
| **C 视觉黄金测试** | 中心/边缘、近/远、昼夜、透明/遮挡、移动/静止的区域容差对比 | **未运行** | `in-game` / 需 B 层环境 |

> A 层通过**不证明** B/C 层的任何画面结果。这个区分是 [01](01-freeze-definition.md) 证据域的核心。

## 13.2 已执行的自动化测试（A 层）

复现：`cd /workspace/loom-v2 && node --test test/`，汇总由 `node test/run-evidence.mjs` 写入
[EVIDENCE.md](../EVIDENCE.md)。最近一次结果：**10 个测试文件 / 80 用例 / 80 通过 / 0 失败 / 退出码 0；
TypeScript 契约 `tsc --noEmit` 通过**。

| 测试文件 | 覆盖的 Stable 接口 | 关键断言 |
|---|---|---|
| `test/semver.test.mjs` | S05 / S06 | 合法非法 SemVer、AND/OR/`^`/`~`/`*`、预发布不匹配、候选降序与不兼容原因 |
| `test/fsm.test.mjs` | S11 / S12 / S13 / S15 | 完整安装流、取消点、`fail` 回滚、`crash` 不伪装成功、恢复决策、日志 Schema |
| `test/resolver.test.mjs` | S06 / S07 / S08 / S15 | 乱序输入同结果、缺依赖、版本不匹配、环路径、六类冲突、不静默挑选胜者、强制覆盖审计 |
| `test/config-merge.test.mjs` | S09 / S10 / S19 | 三层顺序、无效值回落、令牌脱敏、Schema 差异、迁移不静默丢弃、配置集导入导出 |
| `test/permissions.test.mjs` | S16 / S17 | 分级、高风险强化确认、遥测默认拒绝、不可信源警告、再确认与撤销、信任摘要 |
| `test/manifest-validator.test.mjs` | S01 | v1 被拒并提示迁移、ID 与名称分离、客户端版本不得泛化、国际版不含网易适配器、in-game 不得标 Stable、介入点不得写"底层自动处理"、令牌不得入普通配置 |
| `test/signature-integrity.test.mjs` | S02 / S03 / S04 / S10 | 真实包签名+清单全覆盖、只签 manifest 被拒、篡改清单/未知/撤销密钥、未列文件被拒、哈希不符、缺失 `partial`、路径穿越、仓库索引签名 |
| `test/installation.test.mjs` | S14 | 真实临时目录原子安装、升级备份、磁盘满回滚、取消、提交点崩溃重放提交/从备份回滚、手动回滚 |
| `test/migration.test.mjs` | S20 | 真实读取 `../mod/mod.json`、v1 fixture 兼容、14 类映射、五个审查发现、CLI 零覆盖 |
| `test/compatibility.test.mjs` | S18 / B1–B7 | 七态互斥、幂等销毁与句柄归零、模块边界、负向探针（无注入/Hook/私有偏移关键字）、脱敏诊断、错误分类、离线 GUI 无网络请求、既有 40 文件不变 |

**负向探针是硬门槛**：`test/compatibility.test.mjs` 扫描源码，禁止 `inject / hook / offset / sigscan / patch`
等实现关键字；`test/manifest-validator.test.mjs` 拒绝"底层自动处理""TODO""未来"等占位介入点。
这些断言把 [06](06-international-capability.md) §6.5 的禁止项变成可回归的检查，而不是文档承诺。

## 13.3 真实客户端验收清单（B 层，未运行）

### 13.3.1 每条结论必须记录的字段

```yaml
acceptanceRecord:
  clientBuild: 1.21.130            # 必须写具体构建，不写 1.21.x
  distribution: international       # 非 Java / 非网易 / 非定制客户端
  platform: <Windows|Android|iOS|Xbox|PlayStation|Switch|未验证>
  device: <具体型号 或 未验证>
  worldStorage: <本地单人世界|Realms|BDS|未验证>
  graphicsMode: <Vibrant Visuals 开/关 或 未验证>
  testDate: <YYYY-MM-DD>
  source: <官方 changelog / Microsoft Learn / 实测>
  evidenceLevel: E0..E5
  evidenceDomain: in-game
```

当前所有 `in-game` 条目的 `testDate` 记为 **`未运行（沙箱无客户端）`**；文档/changelog 核对日期为 2026-11-06。
**第三方 jaylydev v1.21.130 归档页的 "Platform Differences" 表标注 *as of v26.30*，不得填入本记录。**

### 13.3.2 八个标准探针场景（沿用既有文档，逐项补齐 1.21.130 记录）

固定种子、时间、天气、分辨率、画质、相机与玩家姿态。每场景记录能力报告、资源指纹、对象计数、
帧时间与清理结果；截图接口若非官方测试能力，只能人工验收并标记 `manual-visual`。

| 场景 | 输入（既有定义） | 1.21.130 必须补记的字段 | 证据存放路径 | 当前状态 |
|---|---|---|---|---|
| S1 三距离模型 | 原点前 2/16/48 格同一标准模型 | 各平台 `platform`、是否 Vibrant Visuals、近中可见与远距剔除实测 | `evidence/manual/S1/` | 未运行 |
| S2 右手挂点 | 走动、转身、播放预设动画 | 60 tick 更新、漂移 ≤ 0.25 格、重进世界无旧句柄 | `evidence/manual/S2/` | 未运行 |
| S3 三层透明面 | 红/绿/蓝透明面前后交叠 | 记录游戏实际排序，**不预期可控排序** | `evidence/manual/S3/` | 未运行 |
| S4 实体轨迹 | 实体沿固定路径 120 tick | 每 tick 调用数、停止后 2 秒内句柄=0、无稳定 Trail 时标 `degraded` | `evidence/manual/S4/` | 未运行 |
| S5 遮挡高亮 | 墙前后同类标记 | 只报可见/不可见与默认深度；不承诺穿墙描边 | `evidence/manual/S5/` | 未运行 |
| S6 范围预警面 | 固定圆/方范围，100 采样点 | 地面贴合误差 ≤ 0.5 格、超预算降级、禁用后无残留订阅 | `evidence/manual/S6/` | 未运行 |
| S7 屏幕+世界 UI | action bar 与资源层标记并存，桌面/移动 DPI | 文字裁切、焦点是否抢聊天、世界 UI `unsupported` 时降级说明 | `evidence/manual/S7/` | 未运行 |
| S8 相机与色彩 | 请求 pulse/FOV/闪白/色差，叠加与超时 | 普通国际版必须报 `no-op`/`degraded`；40 tick 后效果层=0 | `evidence/manual/S8/` | 未运行 |

### 13.3.3 额外真机项（1.21.130 特有）

| 编号 | 项目 | 判定 | 当前状态 |
|---|---|---|---|
| M1 | `@minecraft/server-graphics` 是否需实验性开关、`permissions.json` 是否需手动声明 | 官方 changelog 未给结论 | 未验证 |
| M2 | `BiomeAtmospherics.set*/reset*` 回读一致性（官方未提供回读断言接口） | 固定时间/天气/生物群系下截图对比 | 未验证 |
| M3 | Realms / BDS 下 graphics 模块可用性 | 第三方 v26.30 表不可用于本结论 | 未验证 |
| M4 | Vibrant Visuals 资源 JSON 覆盖顺序与逐生物群系映射 | 固定资源包集合对比 | 未验证 |
| M5 | 资源层 `ui/hud_screen.json` 是否被 1.21.130 加载 | 内容日志 + 画面 | 未验证 |
| M6 | `Dynamic Properties` 持久化的配额、迁移、损坏隔离 | 退出重进世界后回读 | 未验证 |
| M7 | 1.21.130 上 `@minecraft/server` 的确切模块版本号 | changelog 显示多项转入 v2.4.0，页面未给单独声明 | 推断，未完全验证 |
| M8 | 离线单人模式下本地模组基本功能（断网/断线重连） | 网络不可用不得影响本地 | 未验证 |

## 13.4 视觉黄金测试（C 层，未运行）

沿用既有 A/B/C 验收分层，把 C 层固化为可重复的**结构化区域容差**，不使用"看起来像"：

| 维度 | 对比区域 | 允许误差来源 | 失败判定 |
|---|---|---|---|
| 中心 / 边缘 | 屏幕中心 20% 与四角 15% | 固定分辨率与画质下的基准图 | 超区域容差或与能力报告矛盾 |
| 近 / 远 | 2 格 / 16 格 / 48 格 | S1 基准 | 近处不可见、远距未按能力剔除 |
| 昼夜 / 天气 | 固定时间关键帧 0/0.25/0.5/0.75 | S8/M2 基准 | 大气散射参数切换后画面无差异或差异超出容差 |
| 透明 / 遮挡 | S3、S5 基准 | 游戏默认排序与深度 | 宣称可控排序、或穿墙描边 |
| 移动 / 静止 | S2、S4 的 60/120 tick 序列 | 允许 1 tick 延迟、漂移 ≤ 0.25 格 | 点不更新、生命周期不收敛 |

**证据目录约定**：`evidence/manual/<场景>/{baseline.png, actual.png, diff.json, acceptanceRecord.yaml, capability-report.json}`。
`diff.json` 记录逐区域像素统计与容差，不写主观描述。无官方自动截图通道时全部标记 `manual-visual`。

## 13.5 证据升级路径（重新评级，不靠措辞）

| 从 | 到 | 必须新增的产物 | 判定依据 |
|---|---|---|---|
| E2 → E3 | `Experimental` → `Candidate` | 真实 1.21.130 最小工程跑通：§13.3.1 记录 + S1–S8 中对应场景的 `acceptanceRecord` + 可复现包 | [01](01-freeze-definition.md) §1.3 |
| E3 → E4 | `Candidate` → `Stable` | 自动测试跨版本通过（≥2 个客户端构建、≥2 种设备）、回归套件、兼容周期记录 | 同上 |
| E4 → E5 | `Stable`（长期） | 多设备/多版本长期通过、崩溃与性能长期统计 | 同上 |
| E0 → E1/E2 | `Unavailable` → `Experimental` | 版本化官方文档或**签名扩展点**出现 | [06](06-international-capability.md) §6.5 |

**当前 `Candidate = 0`**：本沙箱无法产生 E3 证据，因此不把任何 E2 接口拔高为 Candidate。
补齐后按 [01](01-freeze-definition.md) §1.1 重新评级，**无需修改代码结构**。

## 13.6 性能预算

### 13.6.1 平台侧（已可测，Node 环境）

| 项 | 约束 | 检查位置 |
|---|---|---|
| 单文件大小 / 文件总数 | manifest 预检 + `META/file-list.json` 全覆盖；示例包 22 文件 / 37391 字节 | `services/integrity.mjs`、`examples/` |
| 资源加载并发 | 低档 2 / 普通 4（沿用既有建议） | [07](07-mod-manager-ia.md) 索引拉取可取消 |
| 单资源超时 | 5 秒；超时返回 `timeout` 而非无限等待 | `withTimeout()`，[01](01-freeze-definition.md) §1.4 |
| 原子写入 | 目标目录一次 `rename`，不出现边写边用 | [09](09-transactions-and-fsm.md) §9.3 不变式 1 |
| 校验失败重试 | 上限 3 次，超限隔离损坏资源，不重试风暴 | [09](09-transactions-and-fsm.md) §9.3 |
| 事务日志 | 追加先于状态转换落盘，崩溃后可读 | 同上不变式 4 |

### 13.6.2 游戏内（沿用既有预算表，**必须用真实设备校准**）

以下数值来自 [`../../mod/docs/RENDER_OPERATIONS.md`](../../mod/docs/RENDER_OPERATIONS.md)，
是 v1 的**建议值**，在 1.21.130 真机上**未验证**，不得当作已达标指标：

| 档位 | 单模组活动对象 | 全局表现对象 | 每帧更新 | UI 提交/重建 | 资源内存 | 粒子/轨迹 |
|---|---:|---:|---:|---:|---:|---:|
| mobile-low | 64 | 256 | 0.5 ms | 2/1 次 | 16 MiB | 128/秒 |
| mobile/console | 128 | 512 | 1.0 ms | 4/2 次 | 32 MiB | 256/秒 |
| desktop | 256 | 1024 | 2.0 ms | 8/4 次 | 128 MiB | 1024/秒 |

跨语言调用建议：单模组 60 次/秒、全局 300 次/秒。
**超过硬上限先拒绝新对象**；接近上限按下列顺序软降级。诊断面板按模组统计对象数、创建/更新/销毁计数、
预算拒绝次数、降级次数、帧时间 P50/P95/P99 与丢帧同刻相关性（日志采样，不每帧全量输出）。

> 校准义务：只有在 §13.3 的 B 层真机记录齐备后，才能把上表从"建议值"改为"1.21.130 实测预算"。
> 在此之前，[16](16-commitments.md) 的承诺清单不包含任何游戏内帧时间或内存数值。

## 13.7 低设备降级

| 触发 | 动作顺序（固定，不依赖启动顺序） | 恢复条件 |
|---|---|---|
| 接近对象/内存上限 | ① 远距对象 → ② 低优先级 → ③ 透明对象 → ④ 降低更新频率 | 预算回落到阈值以下 |
| 低帧率连续 10 秒 | 整体降一级画质档 | 连续稳定后再评估 |
| 低内存 | 先拒绝新资源，再卸载可重建的实验对象 | 内存回收完成 |
| 集显 / 移动设备 | 禁用高频轨迹与实验屏幕效果 | 设备档位变更 |
| 无 Vibrant Visuals / 模块未启用 | 大气散射相关能力 `degraded` 或 `unsupported`，不报警为故障 | 能力探测报告更新 |
| 离线 / 网络不可用 | `network.presentation` 降级，本地模组基本功能不受影响 | 网络恢复 |

降级必须同时给出 `reason` 与 `fallback`（七态中的 `degraded` 语义），并在诊断面板显示原因与恢复条件。
效果仲裁固定为：命名空间隔离 ID + `priority` + `exclusiveGroup` + 确定性 tie-break。

## 13.8 内存与句柄泄漏检测

| 检查点 | 断言 | 状态 |
|---|---|---|
| `Disposable.dispose()` 幂等 | 重复调用不抛错、不重复释放 | **已自动执行**：`test/compatibility.test.mjs` `S12 七态结果语义齐全且互斥` |
| `ResourceHandle` 状态机 | `active → release-pending → released`，回收状态区分 `hidden / updates-stopped / release-pending / released` | 契约见 `contracts/types.ts`；游戏内未验证 |
| 进入/退出循环 | 活动句柄计数必须为 **0** | **已自动执行**：`S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）` |
| 强制回收触发点 | 退出世界、维度切换、世界重启、模组禁用、适配器切换、断线、玩家死亡/传送 | [09](09-transactions-and-fsm.md) §9.2 显式转换；游戏内未验证 |
| 重复创建/销毁 | 同一 ID 重复创建不产生孤儿句柄 | 平台侧已测；游戏内未验证 |
| 引擎侧 GPU 资源 | 退出世界后引擎对象是否真正释放 | **未验证**（无公开回读接口，需 B 层真机） |
| 贡献度统计 | 按模组输出帧时间/内存/对象数/错误，定位泄漏归属 | `services/diagnostics.mjs` 已实现平台侧统计；游戏内数值未校准 |

**诚实边界**：`ResourceHandle` 只表示**平台索引**，不承诺 GPU 立即回收；平台侧句柄归零
不等于引擎侧资源已释放。二者在文档中始终分开书写。

## 13.9 复现命令

```bash
cd /workspace/loom-v2
node services/migrate-v1-to-v2.mjs       # 只读旧 mod.json，生成 v2 manifest
node services/build-example-pack.mjs     # 生成并签名完整示例包
node --test test/*.test.mjs              # A 层自动化测试
node test/run-evidence.mjs               # 汇总为 EVIDENCE.md（含 tsc --noEmit）
sha256sum ../mod/mod.json ../mod/docs/RENDER_AUDIT.md   # 零覆盖验收
```

B/C 层没有可复现命令：本沙箱无 1.21.130 客户端与官方自动截图通道。
人工验收按 §13.3 / §13.4 的固定步骤执行，产物写入 `evidence/manual/`，
并把 `acceptanceRecord.yaml` 附到对应证据卡（[04](04-render-stage-contract.md) §4.4）。

## 13.10 明确写"未验证"的汇总

1. 1.21.130 在 Windows / Android / iOS / Xbox / PlayStation / Switch 各设备上的实际可用性。
2. 本地单人 / Realms / BDS 三种存档方式的行为差异。
3. `@minecraft/server-graphics` 的实验开关、`permissions.json` 要求、Realms/BDS 限制、设备启用状态。
4. Vibrant Visuals 资源 JSON 覆盖顺序与逐生物群系映射。
5. 全部画面结果：可见性、排序、遮挡、DPI、安全区、帧时间、清理、黄金图对比。
6. 1.21.130 上 `@minecraft/server` 的确切模块版本号（v2.4.0 为推断）。
7. 游戏内帧时间 / 内存 / 对象数 / 粒子预算的真实数值。
8. E3 / E4 / E5 证据、跨版本兼容周期、长期崩溃统计。

上述项目在本仓库一律标 `未验证`，不写"支持""应该可以""理论上可用"。
