# 06 · 旧 BedrockLoom 逻辑移植映射

> 目标：把「模组注册 / 生命周期 / 事件总线 / 事务 / 签名 / 依赖 / 渲染意图层」接入新框架，**语义不变、零覆盖**。
> 做法：**B 合规层内置骨架，平台侧服务通过契约引用复用**，不复制粘贴改坏既有代码。

## 1. 移植原则

1. 主项目（`../loom-v2/`）已通过 `116/116` 自动化测试与 `tsc --noEmit`，是**已验证实现**，不重写。
2. 新框架只做两件事：在游戏内提供合规的运行时骨架；把平台侧能力以**引用 + 契约**方式接进来。
3. A 私有层**不复用**签名/事务逻辑去保护改后 dll/so/apk——那是硬边界禁止的用途。
4. 所有映射标注 `@since` / 来源 / 是否改变语义；任何破坏性变更都要有适配器。

## 2. 映射表

| # | 能力 | 主项目来源 | 新框架落点 | 语义 |
| --- | --- | --- | --- | --- |
| 1 | 模组注册 | `../loom-v2/core/package-store.mjs`（`ModState` 八态） | `../ingame/loom-runtime.js` `register()` | 不变；八态值一致 |
| 2 | 生命周期 | `../loom-v2/core/result.mjs`（`makeDisposable` / `ResourceHandle`） | `../ingame/loom-runtime.js` `start()` / `stop()` / `dispose()` | 不变；确定性销毁 |
| 3 | 事件总线 | `../loom-v2/contracts/services.ts`（`EventBusService`） | `../ingame/loom-runtime.js` `on()` / `emit()` | 契约对齐；带超时与错误隔离 |
| 4 | 事务 / 状态机 | `../loom-v2/core/fsm.mjs`（`INIT..DONE`、取消点、`BACKUP` 回滚点） | **引用复用**，不重写 | 不变 |
| 5 | 签名信封 | `../loom-v2/services/signature.mjs`（Ed25519、protected 恰两项） | **引用复用** | 不变；仍要求 `manifest.json` + `META/file-list.json` 全覆盖 |
| 6 | 完整性 / 文件清单 | `../loom-v2/services/integrity.mjs`（`E_FILE_UNLISTED`） | **引用复用** | 不变；替换/新增未列文件仍 `denied` |
| 7 | 依赖 / 冲突 | `../loom-v2/core/resolver.mjs`（Kahn 拓扑、六类冲突、人类可读解释） | **引用复用** | 不变 |
| 8 | 配置合并 | `../loom-v2/core/config-merge.mjs`（`global < world < player`） | **引用复用** | 不变 |
| 9 | 权限 / 信任 | `../loom-v2/core/permissions.mjs`（双层描述、遥测默认拒绝） | **引用复用** | 不变；A 层不新增权限种类 |
| 10 | 七态结果 | `../loom-v2/core/result.mjs`（`Status`） | `../loomrender/result.mjs` 独立同构实现 | 值集合一致，避免跨层隐式依赖 |
| 11 | 渲染意图类型 | `../loom-v2/render-intent/intent-types.ts` | `../bridge/protocol.mjs`（运行时校验） | 意图形状一致 |
| 12 | 意图采集 / 总线 / 合成器 | `../loom-v2/render-intent/` | `../ingame/ws-bridge-protocol.js`（协议常量）+ 外部引用 | B→C 链路不变 |
| 13 | 模组管理器 | `../loom-v2/manager/index.html` | **引用复用**，不改写 | 不变 |
| 14 | API 评级 / 阶段合同 | `../loom-v2/docs/03` `04` `05` | **不移植、不重评级** | 主项目结论冻结 |

## 3. 新框架内置的合规运行时骨架

`ingame/loom-runtime.js` 是**原创纯逻辑**（无 `node:*`、无 fs、无 crypto、无全局可变状态）：

- `register(mod)` → 注册，重复 ID 返回 `denied`；
- `start(id)` / `stop(id)` → 生命周期，禁用必须释放 `ResourceHandle`；
- `on(event, handler)` / `emit(event, payload)` → 同步分发，单处理器超时/异常被隔离，不影响其他模组；
- `dispose()` → 幂等，回收全部句柄；
- 全部返回七态 `Result`。

它**不**包含：文件写入、签名运算、网络、进程注入、任何 A 层能力。事务/签名/依赖这类需要 fs/crypto 的能力留在平台侧，通过服务契约调用，符合「界面层/游戏内层不得直接操作文件系统」。

## 4. 明确**不**移植的部分

| 项 | 原因 |
| --- | --- |
| 用签名服务给改后 dll/so/apk 背书 | 硬边界第 1、2、9 条；签名只保护合规模组包 |
| 用事务状态机管理「注入/替换游戏文件」流程 | 不存在该流程 |
| 把 `Unavailable` 能力改判为可用 | 主项目评级冻结，本研究不重评 |
| 把 A 层条目写进任何 Stable 表 | 硬边界第 5 条 |
| 把 Java 侧类/结构映射过来 | 硬边界第 8 条 |

## 5. 兼容性验收

`../test/boundaries.test.mjs` 断言：

- 主项目既有基线文件哈希不变（`mod/mod.json`、`mod/docs/RENDER_AUDIT.md`）；
- 新框架不 import `node:*`；
- 引用路径均指向真实存在的 `../loom-v2/` 模块；
- 无任何 A 层实现进入 `ingame/`。

## 6. 相关

- [00 三层边界](00-scope-and-three-layers.md) · [07 研究笔记](07-research-notes.md)
- [`ingame/README.md`](../ingame/README.md)
