# 交付物 2：完整包结构与模块边界

## 2.1 顶层结构（既有 / 新增物理隔离）

```text
/workspace/
├── mod/                              【既有 40 文件，零修改，只读引用】
│   ├── mod.json                       v1 平台 manifest（迁移输入）
│   ├── examples/mod.manifest.json     v1 示例 manifest（兼容 fixture）
│   ├── behavior_pack/
│   │   ├── manifest.json             原生行为包 manifest
│   │   ├── scripts/
│   │   │   ├── main.js              入口 / 生命周期组装
│   │   │   ├── runtime.js           生命周期 + BLSP/1 安全校验
│   │   │   └── api/
│   │   │       ├── client_api.js    14 类客户端 API（签名冻结）
│   │   │       ├── capability_probe.js
│   │   │       └── self_test.js
│   │   ├── items/  recipes/
│   ├── resource_pack/                geometry / attachable / animation /
│   │                                 controller / particle / sound / ui / texts / textures
│   ├── platform/
│   │   ├── international/adapter.js 公开能力快照（不读私有内存）
│   │   └── netease/adapter.js       占位，enabled:false
│   └── docs/                         11 份 v1 架构文档
│
└── loom-v2/                          【本次全部新增，独立模块名】
    ├── README.md                     入口 / 结论 / 交付物索引 / 运行证据命令
    ├── EVIDENCE.md                   自动化测试实际输出（由脚本生成）
    ├── package.json                  无第三方依赖，仅 Node 内置 + node:test
    ├── docs/                         00–17 号设计文档
    ├── schemas/                      JSON Schema（包 / 仓库索引 / 事务日志 / 校验错误码）
    ├── examples/                     由脚本生成的真实 v2 manifest、仓库索引、签名信封
    ├── contracts/                    TypeScript 接口与数据类型（不参与运行时）
    ├── core/                         同构核心：纯函数 / 状态机 / 算法，零 Node 专有依赖
    ├── services/                     Node 侧：文件系统、签名、完整性、安装事务、诊断、迁移
    ├── manager/index.html            离线图形模组管理器（单文件，无网络依赖）
    └── test/                         node:test 自动化测试 + 证据汇总脚本
```

## 2.2 模块边界与依赖方向（单向，无环）

```text
manager/index.html  ──(界面层，仅调用契约，禁止直接操作文件系统)
        │  ModManagerService 契约（contracts/services.ts）
        ▼
services/            ──(Node 侧实现；fs / crypto / 原子写入 / 事务日志)
        │  import
        ▼
core/                ──(纯逻辑；可在浏览器或 Node 运行；无 fs/crypto/process)
        │  只读引用
        ▼
schemas/ + examples/  (数据契约与 fixture)
        ▲
        └── services/migrate-v1-to-v2.mjs 只读 ../mod/mod.json（绝不写回）

../mod/  ──(只读：兼容层解析旧 manifest、冻结旧 API 签名)
```

**边界规则（可被静态检查）**

| 规则 | 约束 | 检查方式 |
|---|---|---|
| B1 | `core/**` 不得 import `node:*`、不得使用 `process`/`fs`/`crypto` | `test/compatibility.test.mjs` 扫描源码文本 |
| B2 | `services/**` 不得 import `manager/**`；界面层不得 import `services/**` | 同上 |
| B3 | `contracts/**` 只含类型与声明，不产生运行时代码 | `tsc --noEmit` |
| B4 | 任何模块不得 `import` 网易 SDK / 游戏二进制 / 平台专有库 | 源码扫描关键字 `netease|sdk|dll|inject|offset|sigscan` |
| B5 | `../mod` 只以只读方式被引用；不得出现对 `../mod` 的写操作 | 迁移脚本只 `readFile`，测试断言目录校验和不变 |
| B6 | 国际版构建不含网易代码；适配器默认关闭 | `platform/netease` 保持 `enabled:false`，v2 只增加契约测试 |
| B7 | 长任务必须可取消、可观察进度、原子提交、返回结构化错误 | `AbortSignal` + `Progress` + 事务日志，见 [09](09-transactions-and-fsm.md) |

## 2.3 各模块职责

| 模块 | 职责 | 不做 |
|---|---|---|
| `core/result.mjs` | 七态结果、结构化错误码、`Disposable` | 不做 I/O |
| `core/semver.mjs` | SemVer 解析、范围匹配、候选版本排序 | 不猜客户端版本 |
| `core/fsm.mjs` | 通用状态机、允许转换表、取消点、回滚点、事务日志追加 | 不执行真实文件操作 |
| `core/resolver.mjs` | 依赖拓扑、版本范围、软依赖、冲突检测、资源命名空间/服务/按键/HUD 插槽冲突 | 不静默挑选胜者 |
| `core/config-merge.mjs` | 分层配置合并、Schema 版本迁移、默认值、差异比对 | 不写令牌到普通配置 |
| `core/permissions.mjs` | 权限分级、风险判定、运行时新增权限再确认 | 不收集遥测 |
| `core/manifest-validator.mjs` | v2 manifest 纯逻辑校验 + 错误码 | 不验签（验签在 services） |
| `core/package-store.mjs` | 内存数据模型：模组库、来源、配置集、状态 | 不持久化（由 services 落盘） |
| `services/signature.mjs` | Ed25519 签名信封生成/校验、密钥标识 | 不保护"仅 manifest" |
| `services/integrity.mjs` | 文件清单 SHA-256 全覆盖校验、未列文件拒绝 | 不允许替换未列文件 |
| `services/installation-service.mjs` | 原子安装/升级/卸载、回滚、崩溃恢复 | 不直接替换正在使用文件 |
| `services/diagnostics.mjs` | 脱敏诊断包、贡献度统计、问题分类 | 不上传玩家数据 |
| `services/migrate-v1-to-v2.mjs` | v1 → v2 单向生成 | 不写回旧目录 |
| `manager/index.html` | 离线 GUI：模组库 / 安装向导 / 更新 / 冲突 / 权限 / 配置 / 诊断 / 配置集 | 不直接操作文件系统 |
| `contracts/*.ts` | 9 个服务接口 + 数据类型 | 不参与运行时 |
| `schemas/*.json` | 机器可校验的数据契约 | 不含实现 |

## 2.4 运行时分层（v1 分层保留 + v2 增量）

沿用既有 `docs/PLATFORM.md` 的 bootstrap / resolver / resources / capability / presentation / protocol / storage，
v2 在其上新增三层，**不替换**：

```text
v1 既有（保留）
  bootstrap → resolver → resources → capability → presentation → protocol → storage
v2 新增
  ├─ manager     一等模块：ModRepositoryService / InstallationService / UpdateService /
  │              DependencyResolver / ModRuntimeController / ConfigService /
  │              DiagnosticsService / ProfileService / PermissionService
  ├─ package     v2 manifest 校验 / 签名信封 / 文件清单 / 仓库索引 / 事务日志
  └─ compat      v1 manifest 适配器、v1 状态枚举映射、旧 API 签名冻结层
```

平台适配层保持独立：国际版为默认实现面；网易与定制客户端仅保留**版本化 SPI 与契约测试**，
默认关闭，国际版构建不编译其代码。

## 2.5 包（.loompack）物理结构

```text
<mod-id>-<version>.loompack        （zip，确定性：固定时间戳 / 排序 / 无绝对路径）
├── manifest.json                  v2 manifest（bedrockloom.mod/v2）
├── signature.json                 签名信封（覆盖 manifest + files 清单）
├── files/
│   ├── behavior_pack/...          原样保留 v1 资源与脚本目录结构
│   ├── resource_pack/...
│   └── assets/...                 图标 / 截图 / 变更日志
├── META/
│   ├── file-list.json             每个文件的 path / sha256 / size / mode
│   └── licenses/                  素材与代码许可
└── migration/                     可选：v1→v2 迁移说明与冲突差异
```

签名保护范围 = `manifest.json` + `META/file-list.json` + `files/` 下**每一个**文件的哈希。
未列入 `file-list.json` 的文件一律拒绝安装；新增/替换/删除任何文件都会导致验签或完整性校验失败。
见 [08](08-package-format-2.md) 与 `services/integrity.mjs` 的负向测试。

## 2.6 版本化接口约定

- 所有公开接口带 `@since`；破坏性变更必须提供 `@deprecated` + 适配器 + 迁移脚本（详见 [14](14-version-migration.md)）。
- 数据契约用 `schema` 字段带版本（`bedrockloom.mod/v2`、`bedrockloom.repo-index/v2`、`bedrockloom.txlog/v1`）。
- `CapabilityReport` 沿用 v1 `bedrockloom.capability-report/v1`，v2 以**可选字段**追加 `evidenceDomain` / `evidenceLevel`，旧解析器不受影响。
