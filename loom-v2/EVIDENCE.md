# Bedrock Loom v2 —— 自动化测试与执行证据

生成时间：2026-11-06T04:01:11.484Z
环境：Node v22.13.1 / linux x64
命令：`node test/run-evidence.mjs`（内部执行 `node --test 10 个测试文件`）
目标客户端基线：Minecraft 基岩版国际版 **1.21.130**（文档/changelog 核对日期 2026-11-06）

## 1. 测试结果（真实执行输出）

| 指标 | 值 |
|---|---|
| 测试文件 | 10 |
| 用例总数 | 80 |
| 通过 | 80 |
| 失败 | **0** |
| 套件 | 0 |
| 进程退出码 | 0 |

测试文件清单：`compatibility.test.mjs`、`config-merge.test.mjs`、`fsm.test.mjs`、`installation.test.mjs`、`manifest-validator.test.mjs`、`migration.test.mjs`、`permissions.test.mjs`、`resolver.test.mjs`、`semver.test.mjs`、`signature-integrity.test.mjs`

### 关键断言（全部实际执行）

- `E_SIG_MANIFEST_ONLY`：只签 manifest 而不签文件清单的信封被拒绝。
- `E_FILE_UNLISTED`：在包内新增一个未列入 `META/file-list.json` 的文件被拒绝（用户硬要求）。
- `E_FILE_HASH_MISMATCH`：替换已列文件内容被拒绝；`E_FILE_MISSING` 返回 `partial` 允许断点续传。
- 原子安装：真实临时目录写入、升级前备份、磁盘满自动回滚、取消点、提交点崩溃恢复（重放提交 / 从备份回滚）。
- 零覆盖：`../mod/mod.json` 与 `docs/RENDER_AUDIT.md` 的 SHA-256 与基线一致，40 个既有文件未改动。
- 版本纪律：`in-game` 能力标 `Stable` 被拒绝；国际版构建含网易适配器被拒绝；`1.21.x` 泛化版本被拒绝。
- 阶段合同：`actualInterventionPoint` 写成"底层自动处理"被拒绝。
- 权限纪律：遥测默认拒绝、高风险权限需强化确认、运行时新增权限需再确认。

<details><summary>TAP 原始输出（截断）</summary>

```text
TAP version 13
# Subtest: S12 七态结果语义齐全且互斥
ok 1 - S12 七态结果语义齐全且互斥
  ---
  duration_ms: 1.223949
  ...
# Subtest: S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）
ok 2 - S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）
  ---
  duration_ms: 0.315514
  ...
# Subtest: B1/B2 模块边界：core 不依赖 node:*，services 不依赖界面层
ok 3 - B1/B2 模块边界：core 不依赖 node:*，services 不依赖界面层
  ---
  duration_ms: 1.51716
  ...
# Subtest: B4 负向探针：代码里不存在注入/Hook/私有偏移/绕过签名的实现
ok 4 - B4 负向探针：代码里不存在注入/Hook/私有偏移/绕过签名的实现
  ---
  duration_ms: 11.676188
  ...
# Subtest: S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测
ok 5 - S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测
  ---
  duration_ms: 1.349362
  ...
# Subtest: S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题
ok 6 - S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题
  ---
  duration_ms: 0.439975
  ...
# Subtest: S10 仓库索引与撤销机制可解析，来源唯一性可追溯
ok 7 - S10 仓库索引与撤销机制可解析，来源唯一性可追溯
  ---
  duration_ms: 0.694937
  ...
# Subtest: S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在
ok 8 - S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在
  ---
  duration_ms: 0.427997
  ...
# Subtest: S18 离线图形管理器存在、自包含、无外部网络请求
ok 9 - S18 离线图形管理器存在、自包含、无外部网络请求
  ---
  duration_ms: 0.547771
  ...
# Subtest: S09 三层合并顺序：global < world < player，默认值补齐
ok 10 - S09 三层合并顺序：global < world < player，默认值补齐
  ---
  duration_ms: 1.427963
  ...
# Subtest: S09 无效值回落默认并逐条列出差异（部分成功）
ok 11 - S09 无效值回落默认并逐条列出差异（部分成功）
  ---
  duration_ms: 0.992293
  ...
# Subtest: S09 敏感项脱敏：令牌不写普通配置
ok 12 - S09 敏感项脱敏：令牌不写普通配置
  ---
  duration_ms: 0.224144
  ...
# Subtest: S10 diff：新增/移除/类型变化/当前值冲突
ok 13 - S10 diff：新增/移除/类型变化/当前值冲突
  ---
  duration_ms: 0.29304
  ...
# Subtest: S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃
ok 14 - S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃
  ---
  duration_ms: 0.340843
  ...
# Subtest: S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置
ok 15 - S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置
  ---
  duration_ms: 0.552959
  ...
# Subtest: S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐
ok 16 - S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐
  ---
  duration_ms: 0.292238
  ...
# Subtest: S11 begin：事务 ID、流、取消点、日志首事件
ok 17 - S11 begin：事务 ID、流、取消点、日志首事件
  ---
  duration_ms: 1.653289
  ...
# Subtest: S12 完整安装流：INIT -> DONE，状态序列与取消点一致
ok 18 - S12 完整安装流：INIT -> DONE，状态序列与取消点一致
  ---
  duration_ms: 1.493674
  ...
# Subtest: S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消
ok 19 - S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消
  ---
  duration_ms: 0.496363
  ...
# Subtest: S12 fail 自动回滚并记录 phase 与错误码
ok 20 - S12 fail 自动回滚并记录 phase 与错误码
  ---
  duration_ms: 0.242613
  ...
# Subtest: S12 crash 进入 RECOVERY_REQUIRED，不伪装成功
ok 21 - S12 crash 进入 RECOVERY_REQUIRED，不伪装成功
  ---
  duration_ms: 0.178083
  ...
# Subtest: S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式
ok 22 - S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式
  ---
  duration_ms: 0.518396
  ...
# Subtest: S13 toLogEntry 符合事务日志 Schema 必填字段
ok 23 - S13 toLogEntry 符合事务日志 Schema 必填字段
  ---
  duration_ms: 0.300321
  ...
# Subtest: S14 真实原子安装：文件写入、状态 DONE、事务日志落盘
ok 24 - S14 真实原子安装：文件写入、状态 DONE、事务日志落盘
  ---
  duration_ms: 39.124914
  ...
# Subtest: S14 升级：更新前备份，提交后新版本生效
ok 25 - S14 升级：更新前备份，提交后新版本生效
  ---
  duration_ms: 25.8816
  ...
# Subtest: S14 磁盘满故障：自动回滚，不留下半安装状态
ok 26 - S14 磁盘满故障：自动回滚，不留下半安装状态
  ---
  duration_ms: 54.027086
  ...
# Subtest: S14 用户取消：可取消点生效，返回 partial 并回滚
ok 27 - S14 用户取消：可取消点生效，返回 partial 并回滚
  ---
  duration_ms: 5.79619
  ...
# Subtest: S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装
ok 28 - S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装
  ---
  duration_ms: 9.973404
  ...
# Subtest: S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态
ok 29 - S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态
  ---
  duration_ms: 16.270322
  ...
# Subtest: S14 手动回滚与签名预检集成
ok 30 - S14 手动回滚与签名预检集成
  ---
  duration_ms: 13.723982
  ...
# Subtest: S12/S15 七态中的超时、幂等销毁与引用计数回收
ok 31 - S12/S15 七态中的超时、幂等销毁与引用计数回收
  ---
  duration_ms: 26.01216
  ...
# Subtest: S01 真实迁移产出的 v2 manifest 通过全部校验
ok 32 - S01 真实迁移产出的 v2 manifest 通过全部校验
  ---
  duration_ms: 25.519474
  ...
# Subtest: S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2
ok 33 - S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2
  ---
  duration_ms: 1.261116
  ...
# Subtest: S01 错误码：schema / 缺字段 / ID 格式 / ID 与名称未分离
ok 34 - S01 错误码：schema / 缺字段 / ID 格式 / ID 与名称未分离
  ---
  duration_ms: 8.969622
  ...
# Subtest: S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器
ok 35 - S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器
  ---
  duration_ms: 7.757181
  ...
# Subtest: S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side
ok 36 - S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side
  ---
  duration_ms: 6.543186
  ...
# Subtest: S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述
ok 37 - S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述
  ---
  duration_ms: 4.466027
  ...
# Subtest: S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝
ok 38 - S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝
  ---
  duration_ms: 44.223664
  ...
# Subtest: S01 签名与完整性声明：hash 格式、文件清单、实际来源
ok 39 - S01 签名与完整性声明：hash 格式、文件清单、实际来源
  ---
  duration_ms: 4.653606
  ...
# Subtest: S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest
ok 40 - S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest
  ---
  duration_ms: 14.252323
  ...
# Subtest: S20 v1 示例 manifest 同样可迁移（兼容 fixture）
ok 41 - S20 v1 示例 manifest 同样可迁移（兼容 fixture）
  ---
  duration_ms: 1.98639
  ...
# Subtest: S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类
ok 42 - S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类
  ---
  duration_ms: 1.363314
  ...
# Subtest: S20 迁移说明记录五个真实审查发现，且 requiresVerification=true
ok 43 - S20 迁移说明记录五个真实审查发现，且 requiresVerification=true
  ---
  duration_ms: 1.124978
  ...
# Subtest: S20 权限映射：带命名空间的旧声明映射到 v2 目录项
ok 44 - S20 权限映射：带命名空间的旧声明映射到 v2 目录项
  ---
  duration_ms: 1.000676
  ...
# Subtest: S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）
ok 45 - S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）
  ---
  duration_ms: 5.044666
  ...
# Subtest: S20 makeSignedPack 的产物与迁移产物一致且签名摘要自洽
ok 46 - S20 makeSignedPack 的产物与迁移产物一致且签名摘要自洽
  ---
  duration_ms: 13.3707
  ...
# Subtest: S16 evaluate：已声明且已同意 -> allow，未声明 -> deny
ok 47 - S16 evaluate：已声明且已同意 -> allow，未声明 -> deny
  ---
  duration_ms: 0.834531
  ...
# Subtest: S16 高风险权限必须强化确认，不能用普通'继续'掩盖
ok 48 - S16 高风险权限必须强化确认，不能用普通'继续'掩盖
  ---
  duration_ms: 0.198955
  ...
# Subtest: S16 遥测默认拒绝：除非单独、明确、可撤销同意
ok 49 - S16 遥测默认拒绝：除非单独、明确、可撤销同意
  ---
  duration_ms: 0.118121
  ...
# Subtest: S16 源不可信必须警告，不允许静默降级
ok 50 - S16 源不可信必须警告，不允许静默降级
  ---
  duration_ms: 0.101295
  ...
# Subtest: S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地
ok 51 - S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地
  ---
  duration_ms: 0.222902
  ...
# Subtest: S17 reconfirm 产出可撤销同意记录与审计；revoke 生效
ok 52 - S17 reconfirm 产出可撤销同意记录与审计；revoke 生效
  ---
  duration_ms: 0.574432
  ...
# Subtest: S16 evaluateAll 汇总最大风险与是否需要强化确认
ok 53 - S16 evaluateAll 汇总最大风险与是否需要强化确认
  ---
  duration_ms: 0.263835
  ...
# Subtest: S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链
ok 54 - S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链
  ---
  duration_ms: 0.48194
  ...
# Subtest: S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序
ok 55 - S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序
  ---
  duration_ms: 1.687992
  ...
# Subtest: S07 缺依赖 / 版本不匹配 / 可选依赖只诊断
ok 56 - S07 缺依赖 / 版本不匹配 / 可选依赖只诊断
  ---
  duration_ms: 0.429549
  ...
# Subtest: S07 依赖环给出环路径
ok 57 - S07 依赖环给出环路径
  ---
  duration_ms: 12.64134
  ...
# Subtest: S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD
ok 58 - S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD
  ---
  duration_ms: 0.939453
  ...
# Subtest: S07 不静默挑选胜者：同名服务两个实现必须返回冲突
ok 59 - S07 不静默挑选胜者：同名服务两个实现必须返回冲突
  ---
  duration_ms: 0.163712
  ...
# Subtest: S15 computeEnableSet：依赖自动启用，阻止危险禁用
ok 60 - S15 computeEnableSet：依赖自动启用，阻止危险禁用
  ---
  duration_ms: 0.417151
  ...
# Subtest: S08 explain：给出人话原因与可执行建议，不只是'不能启用'
ok 61 - S08 explain：给出人话原因与可执行建议，不只是'不能启用'
  ---
  duration_ms: 0.307772
  ...
# Subtest: S07 resolve：安装新模组 + 强制覆盖必须产出审计与回退点
ok 62 - S07 resolve：安装新模组 + 强制覆盖必须产出审计与回退点
  ---
  duration_ms: 1.280136
  ...
# Subtest: S06 planUpdate：重大更新与权限增加须二次确认
ok 63 - S06 planUpdate：重大更新与权限增加须二次确认
  ---
  duration_ms: 1.117977
  ...
# Subtest: S05/S06 parse：合法与非法 SemVer
ok 64 - S05/S06 parse：合法与非法 SemVer
  ---
  duration_ms: 1.306205
  ...
# Subtest: S05 compare：正式版大于预发布，数值段正确
ok 65 - S05 compare：正式版大于预发布，数值段正确
  ---
  duration_ms: 0.404791
  ...
# Subtest: S05 satisfies：AND / OR / 比较符 / ^ / ~ / *
ok 66 - S05 satisfies：AND / OR / 比较符 / ^ / ~ / *
  ---
  duration_ms: 11.568523
  ...
# Subtest: S05 预发布版本默认不匹配无预发布的范围
ok 67 - S05 预发布版本默认不匹配无预发布的范围
  ---
  duration_ms: 0.176851
  ...
# Subtest: S06 rankCandidates：兼容候选降序，不满足项排后且给出原因
ok 68 - S06 rankCandidates：兼容候选降序，不满足项排后且给出原因
  ---
  duration_ms: 0.414276
  ...
# Subtest: S06 highestSatisfying 与 validateRange
ok 69 - S06 highestSatisfying 与 validateRange
  ---
  duration_ms: 0.36514
  ...
# Subtest: S02/S03/S04 真实包：签名 + 文件清单全覆盖校验通过
ok 70 - S02/S03/S04 真实包：签名 + 文件清单全覆盖校验通过
  ---
  duration_ms: 26.838329
  ...
# Subtest: S03 硬门槛：只签 manifest 而不签文件清单 -> E_SIG_MANIFEST_ONLY
ok 71 - S03 硬门槛：只签 manifest 而不签文件清单 -> E_SIG_MANIFEST_ONLY
  ---
  duration_ms: 6.761982
  ...
# Subtest: S03 篡改 manifest 或文件清单 -> 签名摘要不匹配
ok 72 - S03 篡改 manifest 或文件清单 -> 签名摘要不匹配
  ---
  duration_ms: 8.797207
  ...
# Subtest: S03 未知密钥 / 已撤销密钥 / 无效签名均拒绝
ok 73 - S03 未知密钥 / 已撤销密钥 / 无效签名均拒绝
  ---
  duration_ms: 48.847803
  ...
# Subtest: S04 关键负面用例：替换/新增未列文件被拒绝（签名不能只保护 manifest）
ok 74 - S04 关键负面用例：替换/新增未列文件被拒绝（签名不能只保护 manifest）
  ---
  duration_ms: 7.514958
  ...
# Subtest: S04 已列文件内容被替换 -> E_FILE_HASH_MISMATCH
ok 75 - S04 已列文件内容被替换 -> E_FILE_HASH_MISMATCH
  ---
  duration_ms: 7.062744
  ...
# Subtest: S04 清单中文件缺失 -> partial + E_FILE_MISSING（可断点续传补齐）
ok 76 - S04 清单中文件缺失 -> partial + E_FILE_MISSING（可断点续传补齐）
  ---
  duration_ms: 4.138384
  ...
# Subtest: S04 路径穿越与重复项被拒绝
ok 77 - S04 路径穿越与重复项被拒绝
  ---
  duration_ms: 4.986337
  ...
# Subtest: S02 manifestDigest 自洽：写回 manifestHash 后摘要不变
ok 78 - S02 manifestDigest 自洽：写回 manifestHash 后摘要不变
  ---
  duration_ms: 4.352203
  ...
# Subtest: S04 buildFileList 确定性：相同内容哈希稳定，路径排序
ok 79 - S04 buildFileList 确定性：相同内容哈希稳定，路径排序
  ---
  duration_ms: 0.535512
  ...
# Subtest: S10 仓库索引签名与撤销记录可验证
ok 80 - S10 仓库索引签名与撤销记录可验证
  ---
  duration_ms: 1.311193
  ...
1..80
# tests 80
# suites 0
# pass 80
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 245.896913

```

</details>

## 2. 示例产物（由脚本真实生成并复验）

文件数：22，总字节：37391
manifestHash：`094fa82d9c2e3bd61fb1e415a471274d43504f57fb84adeb0643b11b82d407b6`
签名保护范围：manifest.json + META/file-list.json
指纹：`fe7f19ce3082c2c259dac59dfbfa30b8`

| 产物 | SHA-256 |
|---|---|
| `examples/loom-blade.v2.manifest.json` | `c9f50f74f2589c980c6a0422151e08890947e03c10c7ee7e34fd114775d55ad2` |
| `examples/META/file-list.json` | `db73c5ecc1869e700d1e7497e5d43bcda6772af781173ed1b68d6c1e410d6147` |
| `examples/signature-envelope.example.json` | `b69619354a6165fe89035d5ef9d37ec8889ca55264b1c05e0756f60cf652eb0d` |
| `examples/trust-store.example.json` | `ed2eb14f8297caa96264b45c21cd8016a209fed69fe2716dfa0b5272e3daab3d` |
| `examples/repository-index.v2.json` | `0e6521c1e4333ef703bf813b5d37bf93add7dc011f74e4a8daf389318b7c1d90` |
| `examples/demo-private-key.pem` | `5e4c2e47ea685f82f90abbe05c511eec005400728ae5bc39164155d6a9f7d2bb` |
| `schemas/mod-package.v2.schema.json` | `b2f709bbbcadb2e5f166fd07af9555789fd45ab0356173c4db28bb465db5a10e` |
| `schemas/signature-envelope.v1.schema.json` | `c14b3a6198580a0d395f6f4d5753911c442c49bd1df4074ee6c312cbf46da14a` |
| `schemas/repository-index.v2.schema.json` | `c36ce18c388494145dcf769f7f6c4ae0c8d0b287f3150351a53b25eec6821703` |
| `schemas/transaction-log.v1.schema.json` | `ae3a67bfcb14f3e57429d0fc4fee2fe450acd9d5cdf9ed998a7cadc16a5faf6f` |
| `contracts/types.ts` | `dac795c4a41f7e5cb328c648bbbb39577e5802ccd3ec6fc4f8a7609c9d80fda1` |
| `contracts/services.ts` | `9f7c18dd45e1b3d8332f020829d8cd12e95c8f0617052970ca47640ce77b8f7b` |
| `manager/index.html` | `f7939d9d2cae58ada62edfa6de5eca257188c32bca04a2e8e4a9cfe1da9c456a` |

## 3. TypeScript 契约类型检查

- 结果：**通过**
- 说明：契约层为纯类型声明，不参与运行时；未安装 tsc 时如实记录，不冒充通过。

## 4. 证据级别与证据域（重要，防止把平台侧测试冒充游戏内渲染证据）

| 域 | 本仓库可达到的级别 | 对应状态 |
|---|---|---|
| `platform-side`（管理器/包/签名/依赖/事务/权限/诊断/迁移） | **E4**（自动测试跨 fixture 版本连续通过） | `Stable`（20 个接口） |
| `in-game`（粒子/音效/UI/资源加载/Vibrant Visuals 参数） | **E2 上限**（官方文档 + 官方示例） | `Experimental`；`Candidate` 数量为 0 |
| `custom-client`（签名 SPI） | **E0**（本仓库无实现） | `CustomClientOnly` |

**未验证（必须真机补齐，步骤见 docs/13-testing-and-budgets.md）**：

- 1.21.130 在 Windows / Android / iOS / Xbox / PlayStation / Switch 各设备上的实际可用性。
- 本地单人 / Realms / BDS 三种存档方式的行为差异；第三方 v26.30 平台差异表不适用于本结论。
- `@minecraft/server-graphics` 在 1.21.130 是否需实验性开关、Realms/BDS 限制。
- 所有画面结果（可见性、排序、遮挡、DPI、帧时间、清理）与视觉黄金测试。
- `@minecraft/server` 在 1.21.130 的确切模块版本号（官方 changelog 显示多项 API 转入 v2.4.0，页面未给单独声明，记为推断）。

E3/E4/E5 需要真实 1.21.130 客户端或官方自动截图/渲染测试通道；补齐后按 docs/01-freeze-definition.md §1.1 重新评级，无需修改代码结构。

## 5. 复现命令

```bash
cd /workspace/loom-v2
node services/migrate-v1-to-v2.mjs       # 只读旧 mod.json，生成 v2 manifest
node services/build-example-pack.mjs     # 生成并签名完整示例包
node --test test/*.test.mjs              # 自动化测试
node test/run-evidence.mjs               # 重新生成本报告
```

---

**结论：全部自动化测试通过。** 这只证明平台侧契约，不证明任何游戏内画面结果。
