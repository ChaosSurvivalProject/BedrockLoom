# Bedrock Loom v2.1.0 —— 自动化测试与执行证据

生成时间：2026-11-06T06:35:37.459Z
环境：Node v22.13.1 / linux x64
命令：`node test/run-evidence.mjs`（内部执行 `node --test 11 个测试文件`）
目标客户端基线：Minecraft 基岩版国际版 **1.21.130**（文档/changelog 核对日期 2026-11-06）

## 1. 测试结果（真实执行输出）

| 指标 | 值 |
|---|---|
| 测试文件 | 11 |
| 用例总数 | 116 |
| 通过 | 116 |
| 失败 | **0** |
| 套件 | 0 |
| 进程退出码 | 0 |

测试文件清单：`compatibility.test.mjs`、`config-merge.test.mjs`、`fsm.test.mjs`、`installation.test.mjs`、`manifest-validator.test.mjs`、`migration.test.mjs`、`permissions.test.mjs`、`render-intent.test.mjs`、`resolver.test.mjs`、`semver.test.mjs`、`signature-integrity.test.mjs`

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
  duration_ms: 0.915132
  ...
# Subtest: S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）
ok 2 - S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）
  ---
  duration_ms: 0.223995
  ...
# Subtest: B1/B2 模块边界：core 不依赖 node:*，services 不依赖界面层
ok 3 - B1/B2 模块边界：core 不依赖 node:*，services 不依赖界面层
  ---
  duration_ms: 1.054309
  ...
# Subtest: B4 负向探针：代码里不存在注入/Hook/私有偏移/绕过签名的实现
ok 4 - B4 负向探针：代码里不存在注入/Hook/私有偏移/绕过签名的实现
  ---
  duration_ms: 1.426282
  ...
# Subtest: S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测
ok 5 - S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测
  ---
  duration_ms: 1.00736
  ...
# Subtest: S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题
ok 6 - S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题
  ---
  duration_ms: 0.296005
  ...
# Subtest: S10 仓库索引与撤销机制可解析，来源唯一性可追溯
ok 7 - S10 仓库索引与撤销机制可解析，来源唯一性可追溯
  ---
  duration_ms: 0.567379
  ...
# Subtest: S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在
ok 8 - S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在
  ---
  duration_ms: 0.341124
  ...
# Subtest: S18 离线图形管理器存在、自包含、无外部网络请求
ok 9 - S18 离线图形管理器存在、自包含、无外部网络请求
  ---
  duration_ms: 0.52018
  ...
# Subtest: S09 三层合并顺序：global < world < player，默认值补齐
ok 10 - S09 三层合并顺序：global < world < player，默认值补齐
  ---
  duration_ms: 1.197966
  ...
# Subtest: S09 无效值回落默认并逐条列出差异（部分成功）
ok 11 - S09 无效值回落默认并逐条列出差异（部分成功）
  ---
  duration_ms: 0.846104
  ...
# Subtest: S09 敏感项脱敏：令牌不写普通配置
ok 12 - S09 敏感项脱敏：令牌不写普通配置
  ---
  duration_ms: 0.164537
  ...
# Subtest: S10 diff：新增/移除/类型变化/当前值冲突
ok 13 - S10 diff：新增/移除/类型变化/当前值冲突
  ---
  duration_ms: 0.283824
  ...
# Subtest: S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃
ok 14 - S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃
  ---
  duration_ms: 0.307494
  ...
# Subtest: S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置
ok 15 - S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置
  ---
  duration_ms: 0.425222
  ...
# Subtest: S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐
ok 16 - S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐
  ---
  duration_ms: 0.228276
  ...
# Subtest: S11 begin：事务 ID、流、取消点、日志首事件
ok 17 - S11 begin：事务 ID、流、取消点、日志首事件
  ---
  duration_ms: 1.192316
  ...
# Subtest: S12 完整安装流：INIT -> DONE，状态序列与取消点一致
ok 18 - S12 完整安装流：INIT -> DONE，状态序列与取消点一致
  ---
  duration_ms: 0.842244
  ...
# Subtest: S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消
ok 19 - S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消
  ---
  duration_ms: 0.292505
  ...
# Subtest: S12 fail 自动回滚并记录 phase 与错误码
ok 20 - S12 fail 自动回滚并记录 phase 与错误码
  ---
  duration_ms: 0.165157
  ...
# Subtest: S12 crash 进入 RECOVERY_REQUIRED，不伪装成功
ok 21 - S12 crash 进入 RECOVERY_REQUIRED，不伪装成功
  ---
  duration_ms: 0.113317
  ...
# Subtest: S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式
ok 22 - S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式
  ---
  duration_ms: 0.376013
  ...
# Subtest: S13 toLogEntry 符合事务日志 Schema 必填字段
ok 23 - S13 toLogEntry 符合事务日志 Schema 必填字段
  ---
  duration_ms: 0.205056
  ...
# Subtest: S14 真实原子安装：文件写入、状态 DONE、事务日志落盘
ok 24 - S14 真实原子安装：文件写入、状态 DONE、事务日志落盘
  ---
  duration_ms: 92.394734
  ...
# Subtest: S14 升级：更新前备份，提交后新版本生效
ok 25 - S14 升级：更新前备份，提交后新版本生效
  ---
  duration_ms: 24.105782
  ...
# Subtest: S14 磁盘满故障：自动回滚，不留下半安装状态
ok 26 - S14 磁盘满故障：自动回滚，不留下半安装状态
  ---
  duration_ms: 8.435616
  ...
# Subtest: S14 用户取消：可取消点生效，返回 partial 并回滚
ok 27 - S14 用户取消：可取消点生效，返回 partial 并回滚
  ---
  duration_ms: 4.62905
  ...
# Subtest: S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装
ok 28 - S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装
  ---
  duration_ms: 7.622362
  ...
# Subtest: S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态
ok 29 - S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态
  ---
  duration_ms: 51.920931
  ...
# Subtest: S14 手动回滚与签名预检集成
ok 30 - S14 手动回滚与签名预检集成
  ---
  duration_ms: 15.274363
  ...
# Subtest: S12/S15 七态中的超时、幂等销毁与引用计数回收
ok 31 - S12/S15 七态中的超时、幂等销毁与引用计数回收
  ---
  duration_ms: 24.973244
  ...
# Subtest: S01 真实迁移产出的 v2 manifest 通过全部校验
ok 32 - S01 真实迁移产出的 v2 manifest 通过全部校验
  ---
  duration_ms: 83.40082
  ...
# Subtest: S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2
ok 33 - S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2
  ---
  duration_ms: 0.929402
  ...
# Subtest: S01 错误码：schema / 缺字段 / ID 格式 / ID 与名称未分离
ok 34 - S01 错误码：schema / 缺字段 / ID 格式 / ID 与名称未分离
  ---
  duration_ms: 5.354006
  ...
# Subtest: S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器
ok 35 - S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器
  ---
  duration_ms: 4.063081
  ...
# Subtest: S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side
ok 36 - S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side
  ---
  duration_ms: 4.216948
  ...
# Subtest: S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述
ok 37 - S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述
  ---
  duration_ms: 3.699708
  ...
# Subtest: S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝
ok 38 - S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝
  ---
  duration_ms: 3.889624
  ...
# Subtest: S01 签名与完整性声明：hash 格式、文件清单、实际来源
ok 39 - S01 签名与完整性声明：hash 格式、文件清单、实际来源
  ---
  duration_ms: 3.256057
  ...
# Subtest: S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest
ok 40 - S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest
  ---
  duration_ms: 5.193439
  ...
# Subtest: S20 v1 示例 manifest 同样可迁移（兼容 fixture）
ok 41 - S20 v1 示例 manifest 同样可迁移（兼容 fixture）
  ---
  duration_ms: 1.434942
  ...
# Subtest: S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类
ok 42 - S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类
  ---
  duration_ms: 1.122269
  ...
# Subtest: S20 迁移说明记录五个真实审查发现，且 requiresVerification=true
ok 43 - S20 迁移说明记录五个真实审查发现，且 requiresVerification=true
  ---
  duration_ms: 0.928652
  ...
# Subtest: S20 权限映射：带命名空间的旧声明映射到 v2 目录项
ok 44 - S20 权限映射：带命名空间的旧声明映射到 v2 目录项
  ---
  duration_ms: 0.889953
  ...
# Subtest: S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）
ok 45 - S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）
  ---
  duration_ms: 3.396064
  ...
# Subtest: S20 makeSignedPack 的产物与迁移产物一致且签名摘要自洽
ok 46 - S20 makeSignedPack 的产物与迁移产物一致且签名摘要自洽
  ---
  duration_ms: 73.192728
  ...
# Subtest: S16 evaluate：已声明且已同意 -> allow，未声明 -> deny
ok 47 - S16 evaluate：已声明且已同意 -> allow，未声明 -> deny
  ---
  duration_ms: 0.849134
  ...
# Subtest: S16 高风险权限必须强化确认，不能用普通'继续'掩盖
ok 48 - S16 高风险权限必须强化确认，不能用普通'继续'掩盖
  ---
  duration_ms: 0.172217
  ...
# Subtest: S16 遥测默认拒绝：除非单独、明确、可撤销同意
ok 49 - S16 遥测默认拒绝：除非单独、明确、可撤销同意
  ---
  duration_ms: 0.105178
  ...
# Subtest: S16 源不可信必须警告，不允许静默降级
ok 50 - S16 源不可信必须警告，不允许静默降级
  ---
  duration_ms: 0.094478
  ...
# Subtest: S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地
ok 51 - S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地
  ---
  duration_ms: 0.156407
  ...
# Subtest: S17 reconfirm 产出可撤销同意记录与审计；revoke 生效
ok 52 - S17 reconfirm 产出可撤销同意记录与审计；revoke 生效
  ---
  duration_ms: 0.474391
  ...
# Subtest: S16 evaluateAll 汇总最大风险与是否需要强化确认
ok 53 - S16 evaluateAll 汇总最大风险与是否需要强化确认
  ---
  duration_ms: 0.230246
  ...
# Subtest: S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链
ok 54 - S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链
  ---
  duration_ms: 0.427821
  ...
# Subtest: RI-A1 四种意图类型冻结，七态结果与 core/result.mjs 完全一致
ok 55 - RI-A1 四种意图类型冻结，七态结果与 core/result.mjs 完全一致
  ---
  duration_ms: 1.479921
  ...
# Subtest: RI-A2 合法 HUD 意图构造成功且对象冻结
ok 56 - RI-A2 合法 HUD 意图构造成功且对象冻结
  ---
  duration_ms: 1.01427
  ...
# Subtest: RI-A3 危险内容（脚本片段）一律 denied，不进入合成器
ok 57 - RI-A3 危险内容（脚本片段）一律 denied，不进入合成器
  ---
  duration_ms: 0.394032
  ...
# Subtest: RI-A4 槽位、MIME、Base64、target 的输入边界
ok 58 - RI-A4 槽位、MIME、Base64、target 的输入边界
  ---
  duration_ms: 0.324733
  ...
# Subtest: RI-A5 overlay / world-anchor 的数值边界
ok 59 - RI-A5 overlay / world-anchor 的数值边界
  ---
  duration_ms: 0.207886
  ...
# Subtest: RI-A6 超预算 payload 返回 resource-exhausted，不静默截断
ok 60 - RI-A6 超预算 payload 返回 resource-exhausted，不静默截断
  ---
  duration_ms: 0.477491
  ...
# Subtest: RI-A7 采集帧：FOV/near/far 与包围盒为官方不可读，伪造值一律 denied
ok 61 - RI-A7 采集帧：FOV/near/far 与包围盒为官方不可读，伪造值一律 denied
  ---
  duration_ms: 0.451431
  ...
# Subtest: RI-A8 实体数超预算与来源白名单
ok 62 - RI-A8 实体数超预算与来源白名单
  ---
  duration_ms: 0.298404
  ...
# Subtest: RI-A9 信封序列化往返、坏 JSON 与非法通道
ok 63 - RI-A9 信封序列化往返、坏 JSON 与非法通道
  ---
  duration_ms: 0.608698
  ...
# Subtest: RI-A10 批量化：batchKey 合并 + 过期丢弃；deterministicId 可回放
ok 64 - RI-A10 批量化：batchKey 合并 + 过期丢弃；deterministicId 可回放
  ---
  duration_ms: 0.670737
  ...
# Subtest: RI-B1 能力表自检：32 行、id 唯一、标签分布 13/10/9
ok 65 - RI-B1 能力表自检：32 行、id 唯一、标签分布 13/10/9
  ---
  duration_ms: 0.454781
  ...
# Subtest: RI-B2 六组契约：TS 源码与 JS 可运行表逐行一致（api/label/status/evidence/layer）
ok 66 - RI-B2 六组契约：TS 源码与 JS 可运行表逐行一致（api/label/status/evidence/layer）
  ---
  duration_ms: 1.654667
  ...
# Subtest: RI-B3 分组 id 集合与 TS 契约数组长度严格对应
ok 67 - RI-B3 分组 id 集合与 TS 契约数组长度严格对应
  ---
  duration_ms: 0.430411
  ...
# Subtest: RI-B4 合规硬规则：stable 只在 platform-side，unsupported 有理由且证据 ≤ E1
ok 68 - RI-B4 合规硬规则：stable 只在 platform-side，unsupported 有理由且证据 ≤ E1
  ---
  duration_ms: 0.625008
  ...
# Subtest: RI-C1 WS 文本帧编解码（含长度分档与掩码）
ok 69 - RI-C1 WS 文本帧编解码（含长度分档与掩码）
  ---
  duration_ms: 63.35022
  ...
# Subtest: RI-C2 文件总线：追加写 → 读回全部信封，非法行单独报告
ok 70 - RI-C2 文件总线：追加写 → 读回全部信封，非法行单独报告
  ---
  duration_ms: 10.965756
  ...
# Subtest: RI-C3 本地总线端到端：/health、/capabilities、/intents.jsonl、POST /intent
ok 71 - RI-C3 本地总线端到端：/health、/capabilities、/intents.jsonl、POST /intent
  ---
  duration_ms: 32.452029
  ...
# Subtest: RI-C4 真实 WebSocket 客户端收到回放帧（Node 22 内置 WebSocket）
ok 72 - RI-C4 真实 WebSocket 客户端收到回放帧（Node 22 内置 WebSocket）
  ---
  duration_ms: 6.206739
  ...
# Subtest: RI-C5 loopbackOnly 拒绝非 127.0.0.1 绑定
ok 73 - RI-C5 loopbackOnly 拒绝非 127.0.0.1 绑定
  ---
  duration_ms: 0.357683
  ...
# Subtest: RI-D1 ingest/submit/drawFrame 正常路径与 degraded（帧带 caveats）
ok 74 - RI-D1 ingest/submit/drawFrame 正常路径与 degraded（帧带 caveats）
  ---
  duration_ms: 0.452671
  ...
# Subtest: RI-D2 绘制回调超时返回 timeout，不阻塞总线
ok 75 - RI-D2 绘制回调超时返回 timeout，不阻塞总线
  ---
  duration_ms: 0.182267
  ...
# Subtest: RI-D3 单帧意图数超预算返回 resource-exhausted
ok 76 - RI-D3 单帧意图数超预算返回 resource-exhausted
  ---
  duration_ms: 0.593568
  ...
# Subtest: RI-D4 2D 正交投影：无采集帧返回 unsupported，不伪造中心点
ok 77 - RI-D4 2D 正交投影：无采集帧返回 unsupported，不伪造中心点
  ---
  duration_ms: 0.331273
  ...
# Subtest: RI-D5 snapshot 无编码器返回 unsupported，注入编码器后返回 PNG 字节
ok 78 - RI-D5 snapshot 无编码器返回 unsupported，注入编码器后返回 PNG 字节
  ---
  duration_ms: 0.115428
  ...
# Subtest: RI-E1 bindTexture 真实原子写文件并生成 texture_list.json
ok 79 - RI-E1 bindTexture 真实原子写文件并生成 texture_list.json
  ---
  duration_ms: 3.206177
  ...
# Subtest: RI-E2 PNG 头、字节预算、槽位与路径穿越拒绝
ok 80 - RI-E2 PNG 头、字节预算、槽位与路径穿越拒绝
  ---
  duration_ms: 1.02874
  ...
# Subtest: RI-E3 公告板/光照为 beta（degraded），运行时纹理/材质一律 unsupported
ok 81 - RI-E3 公告板/光照为 beta（degraded），运行时纹理/材质一律 unsupported
  ---
  duration_ms: 0.274274
  ...
# Subtest: RI-F1 overlay.html 内联脚本在隔离上下文中真实执行，核心逻辑可调用
ok 82 - RI-F1 overlay.html 内联脚本在隔离上下文中真实执行，核心逻辑可调用
  ---
  duration_ms: 47.319651
  ...
# Subtest: RI-F2 演示页离线约束：无 CDN、无 fetch、无外部域名，三级降级齐备
ok 83 - RI-F2 演示页离线约束：无 CDN、无 fetch、无外部域名，三级降级齐备
  ---
  duration_ms: 0.385862
  ...
# Subtest: RI-F3 sample-intents.jsonl 每行信封都能被 fromWire 解析
ok 84 - RI-F3 sample-intents.jsonl 每行信封都能被 fromWire 解析
  ---
  duration_ms: 0.334693
  ...
# Subtest: RI-F4 serve.mjs 的 demoFrame 能被 validateFrame 接受（非伪数据）
ok 85 - RI-F4 serve.mjs 的 demoFrame 能被 validateFrame 接受（非伪数据）
  ---
  duration_ms: 0.210096
  ...
# Subtest: RI-G1 core 纯逻辑无 node:* 与 process，runtime 才允许 Node 内置模块
ok 86 - RI-G1 core 纯逻辑无 node:* 与 process，runtime 才允许 Node 内置模块
  ---
  duration_ms: 0.306774
  ...
# Subtest: RI-G2 全目录负向扫描：无注入/Hook/私有偏移实现，无外部网络调用
ok 87 - RI-G2 全目录负向扫描：无注入/Hook/私有偏移实现，无外部网络调用
  ---
  duration_ms: 1.982762
  ...
# Subtest: RI-G3 采集脚本只用官方模块，明确 FOV null 与 publishDirect=unsupported
ok 88 - RI-G3 采集脚本只用官方模块，明确 FOV null 与 publishDirect=unsupported
  ---
  duration_ms: 0.170207
  ...
# Subtest: RI-G4 零覆盖：既有 40 文件与 v2.0 关键产物哈希不变
ok 89 - RI-G4 零覆盖：既有 40 文件与 v2.0 关键产物哈希不变
  ---
  duration_ms: 0.271235
  ...
# Subtest: RI-G5 补充说明文档明确「不深入渲染管线，只深入渲染意图」
ok 90 - RI-G5 补充说明文档明确「不深入渲染管线，只深入渲染意图」
  ---
  duration_ms: 0.194097
  ...
# Subtest: S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序
ok 91 - S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序
  ---
  duration_ms: 1.641568
  ...
# Subtest: S07 缺依赖 / 版本不匹配 / 可选依赖只诊断
ok 92 - S07 缺依赖 / 版本不匹配 / 可选依赖只诊断
  ---
  duration_ms: 0.50294
  ...
# Subtest: S07 依赖环给出环路径
ok 93 - S07 依赖环给出环路径
  ---
  duration_ms: 0.210516
  ...
# Subtest: S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD
ok 94 - S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD
  ---
  duration_ms: 0.
```

</details>

## 2. 示例产物（由脚本真实生成并复验）

文件数：22，总字节：37391
manifestHash：`52fe135bcabec941aa5d69877c0103982a77ceea3c0fee205d3f28145e257172`
签名保护范围：manifest.json + META/file-list.json
指纹：`fe7f19ce3082c2c259dac59dfbfa30b8`

| 产物 | SHA-256 |
|---|---|
| `examples/loom-blade.v2.manifest.json` | `71bb15276f08f51bb7efa8b6e8e8bcffa69759e1e39b76c084b633a99818e8ce` |
| `examples/META/file-list.json` | `db73c5ecc1869e700d1e7497e5d43bcda6772af781173ed1b68d6c1e410d6147` |
| `examples/signature-envelope.example.json` | `afcba101a9b9b554e1f5b5d9644055973eb0f143f598fb412e6d84b488baa2f2` |
| `examples/trust-store.example.json` | `4578c3abb0846e48daf992235acd42a9852533ece548406489b0e165282089b5` |
| `examples/repository-index.v2.json` | `0e5293c2233942fabd4480af7535727374b50e2bd231eb487ed8d5daacd2f41a` |
| `examples/demo-private-key.pem` | `88530e0c3aa6b94afe2c7823d3727a5fca5a9141e6260030fa94216193e6504e` |
| `schemas/mod-package.v2.schema.json` | `b2f709bbbcadb2e5f166fd07af9555789fd45ab0356173c4db28bb465db5a10e` |
| `schemas/signature-envelope.v1.schema.json` | `c14b3a6198580a0d395f6f4d5753911c442c49bd1df4074ee6c312cbf46da14a` |
| `schemas/repository-index.v2.schema.json` | `c36ce18c388494145dcf769f7f6c4ae0c8d0b287f3150351a53b25eec6821703` |
| `schemas/transaction-log.v1.schema.json` | `ae3a67bfcb14f3e57429d0fc4fee2fe450acd9d5cdf9ed998a7cadc16a5faf6f` |
| `contracts/types.ts` | `dac795c4a41f7e5cb328c648bbbb39577e5802ccd3ec6fc4f8a7609c9d80fda1` |
| `contracts/services.ts` | `9f7c18dd45e1b3d8332f020829d8cd12e95c8f0617052970ca47640ce77b8f7b` |
| `manager/index.html` | `f7939d9d2cae58ada62edfa6de5eca257188c32bca04a2e8e4a9cfe1da9c456a` |
| `render-intent/intent-types.ts` | `836b08da3e99236ba6ef83cc8e5fc880ce3b1ced332200153ec1b94ba4fa484c` |
| `render-intent/capability-table.ts` | `798a1d4a417e5408dd097b66a783e12325809b02459ba30987ac26e06663eb62` |
| `render-intent/core/intent.mjs` | `f3fd549f685c9f1683ce823ca5a354d543b8fbb7da8d5d15a6b6f54124fd978a` |
| `render-intent/core/compositor.mjs` | `fbb0656d62b41e166a524ac08e1de6367ee0ddef20b5e23e335ebfa1e39979ef` |
| `render-intent/runtime/bus.mjs` | `093a83e0cbd59d904b2d37dd4c8b6d000bb0efb3328d4a96d31179958ee151ad` |
| `render-intent/demo/overlay.html` | `0ae3227e844f45ba95202815eb115ecb0ab22c84f9d2d14014d3bcbec1d90047` |
| `render-intent/docs/14-render-intent.md` | `d72cb4975aabaa3957cc6724d4a3ccc5936ca0c42c27d966f417bbeb24f4c90e` |
| `docs/18-render-intent.md` | `6dfc4f9aaa7eda3f8e265a791040836a0ff8f1c5b6179ef71f3075548ea8136d` |

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

## 4.1 v2.1.0 渲染意图层（Render-Intent Bus）补充证据

本层为 `@since 2.1.0` 的**纯新增**模块，独立登记在 `render-intent/capability-table.ts`（32 行能力表），
**不并入** v2.0 的 20 个 `Stable` 接口计数；模块内 `stable / beta / unsupported` 是轻量标签，
映射到项目七态见 `docs/18-render-intent.md`。**本扩展不深入渲染管线，只深入渲染意图。**

| 验证项 | 结果 |
|---|---|
| 意图/帧校验、危险内容拒绝、FOV/包围盒不可读字段拒绝 | 通过 |
| 能力表 TS 契约 ↔ JS 可运行表逐行一致（api/label/status/evidence/layer） | 通过 |
| 文件总线追加写/读回、非法行报告 | 通过 |
| 本地总线 `/health` `/capabilities` `/intents.jsonl` `POST /intent`、非回环 Host 403 | 通过 |
| 真实 WebSocket（Node 22 内置）握手与缓冲帧回放 | 通过 |
| 合成器批量绘制、超时、预算、2D 正交投影（非游戏视锥）、幂等销毁 | 通过 |
| 资源包构建期 PNG 原子写入 + `texture_list.json`；运行时纹理替换/材质改写 = unsupported | 通过 |
| 单文件演示页内联脚本在隔离上下文**实际执行**（vm + DOM stub），非伪代码 | 通过 |
| 静态负向扫描：无 node:* 越界、无注入/Hook 实现、无外部 CDN/fetch、零覆盖哈希不变 | 通过 |

渲染意图层的 `stable` 条目全部是 `platform-side`（外部 Canvas/文件/回环总线），证据级别 E4；
所有 `in-game` 采集与资源包投影仍是 E2 上限、`Experimental`/`BuildTimeOnly`，
真机桥接链路（dynamic property → 平台侧 → 总线）**未经真机验证**，不冒充完成。

## 5. 复现命令

```bash
cd /workspace/loom-v2
node services/migrate-v1-to-v2.mjs       # 只读旧 mod.json，生成 v2 manifest
node services/build-example-pack.mjs     # 生成并签名完整示例包
node --test test/*.test.mjs              # 自动化测试（含 render-intent.test.mjs）
node test/run-evidence.mjs               # 重新生成本报告
node render-intent/demo/serve.mjs        # 启动本机意图总线（仅绑定 127.0.0.1）
# 直接双击 render-intent/demo/overlay.html 可离线播放合成演示
```

---

**结论：全部自动化测试通过。** 这只证明平台侧契约，不证明任何游戏内画面结果。
