# 00 · 研究范围与三层边界

> 状态：**冻结**。本文件定义什么可以写进仓库；任何新增条目先在这里归类。

## 1. 为什么必须分三层

用户目标里同时存在两类诉求：

- 一类是**可公开、可验证、不越界**的：官方 Script API 封装、意图协议、解析器骨架、测试、审计文档。
- 一类是**本机私有、可能越界**的：进程内 `Present` Hook、命令列表可观测、相机矩阵读取、帧回灌。

把两者混在一个「API 总表」里，会让读者误以为主项目真的能控制渲染管线——这正是 `../loom-v2/docs/01-freeze-definition.md` 明令禁止的「把资源包里有模型包装成控制渲染管线」。所以物理分层，不靠措辞区分。

## 2. 三层定义

### A · 本机私有层（host-private）

| 项 | 说明 |
| --- | --- |
| 定义 | 运行在作者自己机器、作用于游戏进程可观测面的研究点 |
| 例子 | 交换链呈现时刻、命令列表观察、纹理绑定观察、相机矩阵采样、进程内覆盖层 |
| 允许进仓库 | **契约、纯抽象接口、返回 `unsupported` 的桩、带标记的分类表、风险记录** |
| 禁止进仓库 | 真实偏移/符号/vtable 索引/pattern 字节、detour 安装、DLL 注入、远程线程、把帧写回交换链的实现、任何「一键」脚本 |
| 必须标记 | `host-private` + `research-hypothesis` + `version-drift-risk`，三者缺一不可 |
| 测试要求 | 只能测「桩确实返回 `unsupported`」，不能测「Hook 生效」 |
| 证据级别 | 本仓库一律 `E0`（已否定/未验证），不参与主项目 E0–E5 评级 |

### B · 游戏内合规层（in-game compliant）

| 项 | 说明 |
| --- | --- |
| 定义 | 通过公开 Script API 与资源/行为包在**游戏内**产生数据，不画像素、不碰管线 |
| 允许模块 | `@minecraft/server`、`@minecraft/server-ui`、`@minecraft/server-graphics`（仅大气散射参数）、资源包静态资源、表单/HUD 文本 |
| 明确不可用 | FOV / near / far / 视锥 / 包围盒读取、运行时动态纹理上传、每帧骨骼写入、自定义 shader、帧缓冲后处理、原生相机 Hook |
| 允许进仓库 | 骨架代码、类型、协议、manifest、测试 |
| 是否进 Stable | **否**。只存在于 research 分支，不写入主项目 API 总表 |

### C · 可公开仓库层（publishable）

文档、解析器骨架、内核接口、能力审计表、自动化测试、边界声明。这一层的全部内容可以公开，**不含任何游戏资产或注入实现**。

## 3. 禁止清单（逐条对应硬边界）

| # | 禁止项 | 仓库内的落实方式 |
| --- | --- | --- |
| 1 | 生成可分发改后客户端 / 打包改后游戏 / 一键改包器 | 无构建目标、无打包脚本、无产物目录 |
| 2 | 原版二进制、`material.bin` 样本、改后 dll/so/apk、提取资源入库 | `.gitignore` 全量排除 + `test/boundaries.test.mjs` 静态扫描断言 |
| 3 | 只写原创工具 | 解析器/桩/内核/封装均为本仓库原创，不复制第三方逆向代码 |
| 4 | 绕过登录/签名/沙箱/反作弊、写外挂 | 无任何进程注入、无网络协议伪造、无多人权威操作；`hook/IHookProbe.hpp` 只有虚接口 |
| 5 | 渲染接口不进主分支 Stable | 全部 A 层条目带三标记，禁止合并 `main` |
| 6 | 主仓库零侵入人设不动 | 只在 `research` 分支新增本目录，`main` 零改动 |
| 7 | 禁止从第三方论坛下载游戏包 | 无下载逻辑；外部动作仅 `piston-meta` 只读清单查询 |
| 8 | 禁止把 Java 未混淆逻辑套到基岩闭源渲染 | Java 1.21.11 仅作版本清单**符号级对照记录**，不引用其类/方法/结构 |
| 9 | 禁止生成改后游戏文件、反编译源码入库 | 无写回游戏路径的代码；解析器只读、只统计 |
| 10 | 禁止「看起来能跑但越界」的一键脚本 | 所有长任务返回七态结果；`attach()` / `present()` 默认 `unsupported` |

## 4. 标注规范

代码里每个 A 层条目用统一对象表达（`hook/hook-contract.mjs`）：

```js
{
  id: "H-PRESENT-01",
  layer: "host-private",          // A
  classification: "research-hypothesis",
  drift: "version-drift-risk",
  risk: "high",
  status: "unsupported",          // 一律 unsupported，不写 stable/beta 冒充可用
  verification: "需要作者本机包 + 合法调试环境；本仓库不提供"
}
```

禁止出现 `stable` / `beta` 用于 A 层。B 层若要用标签，也只用于**标注这是研究分支**，不写进主项目评级。

## 5. 与既有结论的关系

| 既有结论（主项目 `main`） | 本研究是否改动 |
| --- | --- |
| `Stable 20` 全为 platform-side | 否 |
| 十阶段渲染合同（无任何「直接控制」阶段） | 否 |
| `Unavailable 14`、自定义 shader / 帧缓冲 / RenderLayer 不可用 | 否 |
| `@minecraft/server-graphics` 仅限大气散射参数 | 否 |
| E0–E5 证据评级、`Candidate 0` | 否 |
| 网易/定制客户端只做接口预留 | 否 |

本研究**不重新评级**、不新增 Stable 接口，只补充「若将来在作者本机拿到合法观测条件，哪些点值得记录」的假设清单。

## 6. 相关

- [01 门禁记录](01-local-path-gate.md)
- [02 版本基线](02-version-baseline.md)
- [05 Hook 候选表](05-hook-candidates.md)
- [07 最终研究笔记](07-research-notes.md)
