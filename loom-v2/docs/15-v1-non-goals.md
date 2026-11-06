# 交付物 16：v1 明确"不做"清单

## 15.1 "v1" 的界定

本文的 **v1** 指本次交付的**首个可发布版本**（Bedrock Loom 平台 v2.0 首发版，包格式
`bedrockloom.mod/v2`）。它扩展但不替换 [`../../mod/`](../../mod/) 的既有项目
Bedrock Loom v1.1（40 个文件、只读基线）。

- 既有 v1.1 的文件、架构决策、公开接口继续保留，但**不作为本次对外承诺的 API 面**。
- 本次对外承诺的只有 [16](16-commitments.md) §16.2 的 20 个 `Stable` 接口。
- "不做"是**明确的、可被测试的结论**：管理器里对应能力显示为 `Unavailable` / `CustomClientOnly`
  或灰掉并给出原因，不是留一个返回 `true` 的假方法。

每项"不做"都给出**重新评估的唯一条件**（新增证据或正式授权），不写"未来可能""应该可以"
"后续引擎会自动实现"。判定规则见 [01](01-freeze-definition.md) §1.1–1.3。

## 15.2 渲染：v1 不做的事

| # | 不做的项 | 期望阶段 | 状态 | 依据 |
|---|---|---|---|---|
| N-R01 | 自定义 Shader / 材质参数运行时覆盖 | `GeometrySubmit` / `PostProcess` | `Unavailable` (U01) | 官方 1.21.130 `server-graphics` 范围仅大气散射参数 |
| N-R02 | 运行时顶点/索引/法线/UV/骨骼权重提交与修改 | `GeometrySubmit` | `Unavailable` (U02) | 无公开几何缓冲提交接口 |
| N-R03 | 帧缓冲 / 全屏后处理 pass（模糊、描边、景深、色差） | `PostProcess` | `Unavailable` (U03) | 资源包色彩分级为静态参数，不是 pass |
| N-R04 | 渲染层注册、透明排序、深度测试/混合控制 | `RenderLayer` / `CullAndSort` | `Unavailable` (U04) | 引擎固定；既有 `RENDER_PATH_LEDGER.md` 已否定 |
| N-R05 | 每帧骨骼矩阵写入 / 实时 IK / 程序化骨骼 | `SceneUpdate` | `Unavailable` (U05) | 只有预声明动画控制器与 Molang |
| N-R06 | 运行时点光/聚光（任意位置、动态衰减） | `SceneUpdate` / `PostProcess` | `Unavailable` (U06) | `local_lighting.json` 是静态方块绑定 |
| N-R07 | 原生相机 Hook、FOV/焦点/平滑控制权 | `SceneUpdate` / `PostProcess` | `Unavailable` (U07) | 既有 `CameraApi.pulse` 已标 `visualGuarantee: none` |
| N-R08 | 世界空间 UI / 实体附着 UI / billboard 通用绘制 | `UiDraw` | `Unavailable` (U08) | 既有 `WorldUiApi.mount` 显式返回 `false` |
| N-R09 | decal / 遮挡穿墙描边 / 可控高亮 | `GeometrySubmit` / `PostProcess` | `Unavailable` (U09) | 无深度贴花/描边提交 |
| N-R10 | 动态纹理上传 / 纹理流送 / 运行时图集替换 | `ResourceLoad` / `GeometrySubmit` | `Unavailable` (U10) | 无公开纹理上传句柄 |
| N-R11 | 屏幕空间粒子发射器 / 运行时修改已提交粒子参数 | `SimulationSync` / `UiDraw` | `Unavailable` (U11) | 发射时绑定模板变量不等于运行时修改 |
| N-R12 | 帧前/帧后回调、FramePresent 诊断与回收 | `FramePresent` | `Unavailable` (U12) | 无逐帧渲染回调 |
| N-R13 | 把"资源包里有模型"写成"控制渲染管线" | 全部 | **禁止措辞** | [04](04-render-stage-contract.md) §4.5 |
| N-R14 | 把 `render_controllers/*` 名称当成"渲染层控制" | `RenderLayer` | **禁止措辞** | 它是资源层材质/几何/纹理绑定描述 |
| N-R15 | 用粒子假光冒充场景光照 | `PostProcess` | **禁止做法** | [05](05-api-adjudication.md) 第 5 类裁定 |
| N-R16 | 只给效果枚举而不提供可重复视觉验收 | 相机/后处理 | **禁止做法** | [13](13-testing-and-budgets.md) §13.4 |

**重新评估的唯一条件**：取得版本化公开文档 + 签名扩展点 + 官方测试通道后，按
[06](06-international-capability.md) §6.5 走 E2 → E3 → E4 重新评级；在此之前接口只允许返回
`unsupported`。

## 15.3 平台与二进制：v1 不做的事

| # | 不做的项 | 依据 |
|---|---|---|
| N-P01 | 修改、破解、重打包、注入国际版游戏二进制 | 验收硬门槛 |
| N-P02 | 读取私有内存、依赖固定偏移 / 特征码扫描 / 二进制补丁 | 硬门槛 + B4 静态扫描 |
| N-P03 | Hook 未公开函数 | 硬门槛 |
| N-P04 | 绕过签名、版权保护、平台沙箱或审核 | 硬门槛 |
| N-P05 | 依赖某个版本的偶然行为 | [01](01-freeze-definition.md) 条件 2 |
| N-P06 | 复制、下载、嵌入网易 SDK 或游戏文件 | [10](10-sandbox-and-trust.md) §10.6 |
| N-P07 | 国际版构建中编译网易代码 / 默认开启网易适配器 | `E_PLATFORM_ADAPTER` 校验；`enabled:false` 保持 |
| N-P08 | 加载未签名原生扩展（默认拒绝） | `native.module` 为 `critical` |
| N-P09 | 声称两个平台可等价实现所有功能 | `CC01`/`CC02` 为 `CustomClientOnly` |
| N-P10 | 把 Java 版、网易版、26.x 版本证据用于 1.21.130 国际版结论 | [01](01-freeze-definition.md) 版本纪律 |
| N-P11 | 把客户端命中结果当作多人权威操作 | [04](04-render-stage-contract.md) §4.5 |

**重新评估的唯一条件**：客户端所有者正式授权 + 版本化 SPI + 签名清单 + ABI + 崩溃隔离
（[10](10-sandbox-and-trust.md) §10.6），且实现只落在独立适配器，不进入国际版构建。

## 15.4 模组管理器：v1 不做的事

| # | 不做的项 | 替代行为 |
|---|---|---|
| N-M01 | 默认上传玩家已安装模组或游玩数据 | 诊断包只在本地生成，由用户主动复制 |
| N-M02 | 默认收集遥测 | `telemetry.collect` 默认 `deny`，需单独、明确、可撤销同意 |
| N-M03 | 默认开启自动更新 / 后台更新直接替换正在使用文件 | 自动更新默认关闭；更新走 [09](09-transactions-and-fsm.md) 事务 |
| N-M04 | 界面层直接操作文件系统 / 发起网络请求 | 只持有 `ManagerUiApi` 九个服务契约；离线自包含 |
| N-M05 | 提供任意文件系统访问 | 受控 `ResourceHandle`，仅本模组命名空间 |
| N-M06 | 静默覆盖资源、随机挑选冲突胜者 | 六类冲突 + 解释 + 强制覆盖审计与回退 |
| N-M07 | 用"继续"按钮掩盖高风险权限 | `critical` 需强化确认 |
| N-M08 | 不显示实际来源、静默降级不可信源 | `sourceOfRecord` 唯一；不可信源 `deny` + 警告 |
| N-M09 | 默认导出许可证不允许再分发的模组文件 | 配置集默认只导出 ID/版本/配置 |
| N-M10 | 令牌/密钥写入普通配置 | `***redacted***` 脱敏 + `E_SENSITIVE_IN_CONFIG` |
| N-M11 | 禁用模组时只隐藏按钮、不释放资源 | `disable` 事务含资源强制回收与 `VERIFY` |
| N-M12 | 云同步冲突自动覆盖、账号绑定、内嵌在线商店 | v1 无该实现；不承诺 |
| N-M13 | 多人权威数据伪装成本地事实 | 位置标 `authoritative / local-predicted / sampled / unknown` |
| N-M14 | 冲突时静默补齐缺失模组或删除旧配置 | `importProfile` / `migrate` 均返回 `partial` 并逐条列出 |

## 15.5 API 治理：v1 不做的事

| # | 不做的项 | 原因 |
|---|---|---|
| N-A01 | 为凑 API 数量制造假实现 | `Unavailable` 是合格结论 |
| N-A02 | 把 `in-game` 接口放进 `Stable` | E4 门槛 + 证据域纪律；本沙箱 `in-game` 上限 E2 |
| N-A03 | 把 `BuildTimeOnly` 资源格式写成运行时可调用 | 运行时调用返回 `unsupported` |
| N-A04 | 用 E2 证据冒充 E3 / 把 `Candidate` 数量做成非零 | `Candidate = 0` 是刻意结论 |
| N-A05 | 用"理论上""未来可能""应该可以""类似 Java 版""后续引擎会自动实现"代替实现证据 | 用户硬要求；[16](16-commitments.md) §16.6 给出替代表述 |
| N-A06 | 把 `ok` 解释为"画面稳定可见" | `ok` 只表示平台侧契约完成；画面另用 `created/submitted/first_visible/stable_visible/degraded` |
| N-A07 | 把能力探测退化成按客户端版本号盲猜 | 缓存键含 `clientBuild + adapterBuild + resourceFingerprint + graphicsBackend + quality` |
| N-A08 | 破坏性变更直接编辑旧文件 / 静默替换字段 | [14](14-version-migration.md) 四件套 |

## 15.6 测试与证据：v1 不做的事

| # | 不做的项 | 当前状态 |
|---|---|---|
| N-T01 | 声称真机验收、视觉黄金测试、E3/E4/E5 游戏内证据已完成 | 均未运行，见 [13](13-testing-and-budgets.md) |
| N-T02 | 把平台侧 `node --test` 的 E4 记作游戏内渲染证据 | 证据域隔离，[01](01-freeze-definition.md) §1.3 |
| N-T03 | 把游戏内帧时间/内存/对象数预算当作已达标指标 | 沿用既有建议值，标注"必须用真实设备校准" |
| N-T04 | 把文档示例写成未执行的伪代码 | 所有 `core/` / `services/` 示例在 `test/` 中实际执行 |
| N-T05 | 用"看起来像"作为视觉验收结论 | 结构化区域容差 + `diff.json` |
| N-T06 | 引用第三方 v1.21.130 归档页的 v26.30 平台差异表 | 已排除，标"未验证" |

## 15.7 用户可见呈现

| 状态 | 管理器呈现 | 解释来源 |
|---|---|---|
| `Unavailable` | 灰掉 + "国际版公开客户端无该能力" + 正式授权路径 | [03](03-api-status-table.md) §3.7 |
| `CustomClientOnly` | 灰掉 + "需客户端所有者签名 SPI / 授权" | 同上 §3.6 |
| `PlatformRestricted` | 显示所需图形模式/设备条件；探测缺失自动降级且不报警为故障 | 同上 §3.5 |
| `Experimental` | 默认关闭 + "画面结果未验证" + 真机验收步骤链接 | 同上 §3.3 |
| `BuildTimeOnly` | 标注"仅创作期/打包期有效，运行时调用返回 unsupported" | 同上 §3.4 |

契约层 `contracts/types.ts` 的 `UnavailableCapability` 枚举只用于**解释为什么灰掉**，
不提供可调用实现（[03](03-api-status-table.md) §3.7）。

## 15.8 与其余交付物的关系

- **可承诺什么** → [16](16-commitments.md) §16.2（20 个 `Stable` 接口及其边界）。
- **不能承诺什么** → [16](16-commitments.md) §16.3–16.4。
- **哪些 API 真正介入渲染、介入到哪一层、如何证明** → [17](17-final-answer.md)。
- **不做的事如何被回归检查** → `test/compatibility.test.mjs` 的 B1/B2/B4/B5/B6 断言与
  `test/manifest-validator.test.mjs` 的占位措辞拒绝用例。
