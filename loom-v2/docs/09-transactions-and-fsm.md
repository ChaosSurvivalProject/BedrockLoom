# 交付物 11：管理器后端状态机与故障恢复表

实现：[`core/fsm.mjs`](../core/fsm.mjs)（纯逻辑、不可变转换、可注入中断点）+
[`services/installation-service.mjs`](../services/installation-service.mjs)（真实原子文件操作）+
[`schemas/transaction-log.v1.schema.json`](../schemas/transaction-log.v1.schema.json)。
自动化测试：`test/fsm.test.mjs`、`test/installation.test.mjs`（80/80 通过，见 [EVIDENCE.md](../EVIDENCE.md)）。

## 9.1 通用状态与转换

```text
INIT ─→ PRECHECK ─→ STAGING ─→ BACKUP ─→ COMMIT_PENDING ─→ COMMITTED ─→ VERIFY ─→ DONE
 │         │           │          │            │
 └─────────┴───────────┴──────────┴────────────┴──→ ABORTING ─→ ABORTED   (cancel / fail / rollback)
                                                 │
                                                 └─→ RECOVERY_REQUIRED ─→ SAFE_MODE (crash 且不可判定)
```

| 状态 | 含义 | 可取消 | 是否可回滚 |
|---|---|---|---|
| `INIT` | 事务创建，已写首条日志 | 是 | 无需 |
| `PRECHECK` | 签名、文件清单、manifest、依赖、冲突、平台、权限校验 | 是 | 无需 |
| `STAGING` | 写入独立暂存目录（不碰目标） | 是 | 清理暂存 |
| `BACKUP` | 已安装时把旧版本 rename 到备份目录 | 是 | 从备份恢复 |
| `COMMIT_PENDING` | 写恢复 marker（崩溃可判定） | 是 | 从备份恢复 |
| `COMMITTED` | 目录 rename 原子替换完成 | **否** | 仅通过备份回退 |
| `VERIFY` | 回读逐文件冒烟验证 | 否 | — |
| `DONE` | 完成 | 否 | — |
| `ABORTING / ABORTED` | 回滚中 / 已回滚 | — | — |
| `RECOVERY_REQUIRED` | 进程中断，状态未提交 | — | 依 marker + 备份 |
| `SAFE_MODE` | 无备份且不可判定，进入安全模式并隔离失败模组 | — | — |

**取消点**：`INIT / PRECHECK / STAGING / BACKUP / COMMIT_PENDING`（全部流程共用）。
**回滚点**：`BACKUP`（`rollbackPoint` 字段固定）。
**提交点**：`COMMIT_PENDING` 的 marker 文件 `{txId, modId, backupExists, stagingDir, targetDir, backupDir}`。

## 9.2 十个流程的明确状态、取消点与崩溃恢复

| 流程 | 状态序列（省略 ABORT 分支） | 取消点 | 回滚点 | 崩溃恢复决策 |
|---|---|---|---|---|
| 安装 `install` | INIT→PRECHECK→STAGING→BACKUP→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | BACKUP（首次安装无备份） | 有备份→`ROLLBACK_FROM_BACKUP`；无备份→`REPLAY_COMMIT`（完成目录 rename） |
| 升级 `upgrade` | 同 install（必有 BACKUP） | 同上 | BACKUP | 总有备份→`ROLLBACK_FROM_BACKUP`，恢复旧版本 |
| 卸载 `uninstall` | INIT→PRECHECK→BACKUP→STAGING→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | BACKUP | 从备份恢复被卸载内容 |
| 启用 `enable` | INIT→PRECHECK→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | 配置快照 | 依赖结果不可判定→保持禁用并提示 |
| 禁用 `disable` | 同 enable（必须释放资源） | 同上 | 启用状态快照 | 回滚到启用态；禁止只隐藏按钮 |
| 依赖修复 `dependency-repair` | INIT→PRECHECK→STAGING→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | 修复前解析快照 | 回滚启用集合，不允许随机挑选胜者 |
| 资源加载 `resource-load` | INIT→STAGING→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | 资源索引快照 | 校验失败重试上限 3 次；超上限隔离损坏资源 |
| 世界进入 `world-enter` | INIT→PRECHECK→COMMITTED→DONE | INIT/PRECHECK | 无需 | 重新执行 PRECHECK；不半加载 |
| 世界退出 `world-exit` | INIT→BACKUP→COMMITTED→DONE | INIT/BACKUP | BACKUP | 强制回收全部 ResourceHandle，活动句柄归零 |
| 适配器切换 `adapter-switch` | INIT→PRECHECK→BACKUP→COMMIT_PENDING→COMMITTED→VERIFY→DONE | INIT..COMMIT_PENDING | BACKUP | 签名/ABI 不符→回退原适配器并隔离崩溃插件 |

**统一清理触发点**（世界进入/退出、维度切换、世界重启、玩家死亡/传送、断线、模组禁用、适配器切换）：
取消订阅与定时器、清空白名单与播放描述、`ResourceHandle.forceRelease()`、活动句柄计数断言为 0。

## 9.3 故障恢复表（任何中断都不留不可启动状态）

| 中断 | 发生阶段 | 平台检测 | 自动恢复动作 | 用户可见结果 |
|---|---|---|---|---|
| 关机 / 掉电 | `COMMIT_PENDING`（marker 存在） | 读 pending marker + txlog | 有备份→从备份回滚；无备份→重放提交完成安装 | 事务日志显示 `RECOVERY_REQUIRED → DONE/ABORTED` |
| 关机 / 掉电 | `STAGING` / `BACKUP` | marker 不存在 | 清理孤儿暂存目录；已完成备份则恢复 | 无半写入文件 |
| 磁盘满 | 任意写入阶段 | `E_TX_DISK_FULL` | ABORTING→ABORTED，清理暂存；不重试风暴 | 明确"清空间后重试"，返回 `resource-exhausted` |
| 权限拒绝 | 写入 / rename | `E_TX_PERMISSION` | 自动回滚，写审计 | 提示检查目录权限，返回 `denied` |
| 文件占用 | 提交前 | `E_TX_FILE_BUSY` | 延后提交；不直接替换正在使用文件 | 返回 `timeout`，后台更新默认关闭 |
| 网络断开 | 下载 / 索引 | `E_TX_NETWORK` | 断点续传；离线显示缓存信息时间 | 本地模组基本功能不受影响 |
| 校验失败 | PRECHECK / VERIFY | `E_FILE_HASH_MISMATCH` | 重新下载，重试上限 3 次；超限回滚 | `partial` + 逐项原因 |
| 客户端崩溃 | 提交阶段 | 客户端重启后扫描 marker | 同上崩溃恢复 | 无法自动恢复→**安全模式**并解释原因 |
| 无法判定且无备份 | `RECOVERY_REQUIRED` | `recover()` 决策 | `ENTER_SAFE_MODE`：全部模组停用，隔离上次导致启动失败的模组 | 明确列出被隔离模组与原因，不反复崩溃 |
| 适配器崩溃 | `adapter-switch` | 崩溃隔离 worker | 撤销本帧、回退 R0/R1、禁用该适配器 | 签名与 ABI 不符不加载原生库 |

**不变式**：
1. 目标目录在任何时刻只通过一次 `rename` 从暂存目录原子替换，不出现"边写边用"。
2. 提交前必有 marker；提交成功后立即删除 marker。
3. 回滚总能回到 BEGIN 前状态（有备份恢复旧版本，无备份删除新建目录）。
4. 事务日志追加先于状态转换落盘，崩溃后可读。
5. 无法自动恢复时**必须**进入安全模式并解释原因，绝不留下不可启动状态。

## 9.4 事务日志（`bedrockloom.txlog/v1`）

```json
{
  "schema": "bedrockloom.txlog/v1",
  "transactions": [{
    "txId": "tx-<16hex>", "kind": "install", "modId": "example.loom_blade",
    "fromVersion": null, "toVersion": "1.1.0", "state": "DONE",
    "createdAt": "...", "updatedAt": "...",
    "cancelPoints": ["INIT","PRECHECK","STAGING","BACKUP","COMMIT_PENDING"],
    "rollbackPoint": "BACKUP", "backupPath": null, "stagingPath": "staging/...",
    "error": null,
    "events": [{ "at": "...", "from": "INIT", "to": "PRECHECK", "event": "advance", "detail": "预检通过", "canCancel": true }]
  }]
}
```

真实产物由 `AtomicInstaller._appendLog()` 写入临时工作区 `txlog.json`；
`test/installation.test.mjs` 断言其 schema、最终状态与事件序列。

## 9.5 状态机与用户要求的对应

| 用户要求 | 落地 |
|---|---|
| 明确状态、允许转换、取消点、回滚点 | `STATE`、`FORWARD`、`CANCEL_POINTS`、`ROLLBACK_POINT`，`transition()` 拒绝非法事件 |
| 九个流程全覆盖 | `flowFor()` 十种（含 install/upgrade 分列），§9.2 表 |
| 崩溃恢复 | `recover()` + `recoverPending()` + marker，测试含"重放提交"与"从备份回滚"两例 |
| 任何中断不留不可启动状态 | §9.3 故障恢复表 + 安全模式 |
| 长任务可取消、可观察进度、原子提交、结构化错误 | `AbortSignal` + `onProgress` + rename + `Result` 七态 |
