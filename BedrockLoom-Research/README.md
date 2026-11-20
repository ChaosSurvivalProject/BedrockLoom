# BedrockLoom-Research

> **本机私有研究仓库。** 它不是 BedrockLoom 主项目的功能扩展，不产出、也不声称产出任何可分发或可运行的改后客户端。

## 0. 定位

对**作者自己合法购买、自己机器上的** Minecraft 基岩版国际版 1.21.130 做「渲染可观测性」的**研究记录 + 契约骨架 + 合规层封装**；把真正越界的那部分明确标为「本机私有 / 研究假设 / 版本漂移风险」，**不落地为成品**。

主项目 [ChaosSurvivalProject/BedrockLoom](https://github.com/ChaosSurvivalProject/BedrockLoom) 的零侵入结论（`Stable 20`、十阶段渲染合同）**一字未改**。本研究只存在于 `research` 分支，`main` 分支不受影响。

## 1. 门禁结论（必须先读）

按本项目「AI 执行顺序」第 1 步：先检查本机路径，没有就停住等路径。

实测 2026-11-06，详见 [docs/01-local-path-gate.md](docs/01-local-path-gate.md)：

| 检查项 | 结果 |
| --- | --- |
| 运行环境 | Linux x86_64 / Ubuntu 24.04.3 云沙箱（非 Windows、非 Android arm64） |
| `extracted/`（工作区、上传目录、用户目录） | 全部不存在 |
| Windows 官方安装目录、`*.appx`、`Minecraft*.exe` | 未命中 |
| Android `libminecraftpe.so`、`*.apk` | 未命中 |
| build `39448925` / `39263185`、`material.bin`、文件名含 `1.21.130` 的包 | 全盘限深搜索未命中 |
| 环境变量中的本机路径提示 | 无 |
| `/root/uploads` 内容 | 只有最初上传的 Bedrock Loom 项目 zip，不是游戏包 |

**结论：本机无可解析的 1.21.130 底包 → 按规则停住。**

本仓库**没有**、也**不会**包含：

- 任何真实的文件偏移、vtable 索引、私有符号、模块基址、pattern/签名扫描字节；
- `IDXGISwapChain::Present` 的 detour / vtable patch / DLL 注入 / 远程线程实现；
- 任何 `material.bin` 样本、解析出的渲染块、字符串表**内容**、提取资源、改后 dll/so/apk。

停住不是回避，是四条约束的必然结果：

1. 没有真实目标时写偏移 = **编造证据**，与主项目「不用伪代码冒充实现证据」的冻结定义冲突（`../loom-v2/docs/01-freeze-definition.md`）。
2. 硬边界要求「偏移/符号只做研究记录，**不硬写私有符号表到可分发代码**」。
3. 硬边界要求「**不绕过登录/签名/沙箱/反作弊**」——把代码注入受平台完整性保护的游戏进程与此直接冲突。
4. 禁止项要求「禁止『看起来能跑但越界』的一键脚本」「给可编译骨架，**不给完整改包成品**」。

上一轮项目定调已写明「Hook Present / 改 material.bin → 不在 BedrockLoom 范围」。本研究层只把这条**作为标注清楚的研究假设保留在分类表里**，不实现。

唯一执行的外部动作：`piston-meta` 官方版本清单**只读 JSON 查询**（HTTP 200），不下载任何二进制，结果见 [docs/02-version-baseline.md](docs/02-version-baseline.md)。

## 2. 三层模型

| 层 | 名称 | 内容 | 进本仓库 | 进主分支 Stable |
| --- | --- | --- | --- | --- |
| **A** | 本机私有层 | Present / 纹理绑定 / 相机矩阵的可观测点、进程内 Hook、帧回灌 | **只放契约、桩、研究假设；不放实现** | 否 |
| **B** | 游戏内合规层 | `@minecraft/server`、`server-ui`、`server-graphics` 公开 API 封装、`loom.*` 扩展、BP 框架 | 是（骨架） | 否（仅 research 分支） |
| **C** | 可公开仓库层 | 文档、解析器骨架、内核接口、测试、能力审计表 | 是 | 否 |

任何 A 层条目在文档与代码里都必须同时带三个标记：`host-private`、`research-hypothesis`、`version-drift-risk`。

## 3. 硬边界（写死，不可协商）

- 不生成可分发改后客户端、不打包改后游戏、不写一键改包器。
- 仓库不进：原版二进制、`material.bin` 样本、改后 dll/so/apk、游戏提取资源、反编译源码。
- 只写原创工具：解析器骨架、Hook 桩、本机 bridge、合成器接口、扩展 API 封装。
- 不绕过登录/签名/沙箱/反作弊，不写外挂，不做多人权威操作。
- 所有「渲染接口」标注本机私有 / 研究假设 / 版本漂移风险，**不进主分支 Stable 文档**。
- 不从第三方论坛下载游戏包；不把 Java 未混淆逻辑套到基岩闭源渲染。
- 主仓库 `main` 零侵入人设不动；本研究只在 `research` 分支。

## 4. 目录结构

```
BedrockLoom-Research/
├── docs/         00 边界 / 01 门禁 / 02 版本基线 / 03 底包结构假设
│                 04 可观测面 / 05 Hook 候选表 / 06 移植映射 / 07 研究笔记
├── parser/       原创通用解析器骨架（路径由环境变量传入，未知格式 unsupported）
├── hook/         Hook 候选表 + 纯抽象 probe 接口 + NullProbe 桩
├── loomrender/   LoomRender 内核骨架（init/submit/present/set_camera/push_texture）
├── bridge/       本机 WS bridge 意图信封协议（平台侧校验）
├── ingame/       游戏内合规层：loom 全局对象、loom.* 扩展 API、BP manifest、运行时骨架
├── test/         自动化测试 + 静态负向扫描
└── run-evidence.mjs / EVIDENCE.md
```

## 5. 八步执行状态（如实标注）

| # | 要求 | 状态 |
| --- | --- | --- |
| 1 | 检查本机路径，没有就停住 | **已完成 → 无包，停住**（[docs/01](docs/01-local-path-gate.md)） |
| 2 | 静态解析目录树/manifest/renderer/materials/字符串表 | **停住**，无真实目标；改为交付原创解析器骨架 + 明确非实测的结构假设（[docs/03](docs/03-pack-layout-hypothesis.md)） |
| 3 | 生成解析器代码（读偏移/头/块，路径由环境变量传入） | **已完成**（[parser/](parser/README.md)），不含任何真实偏移 |
| 4 | 生成 Hook 候选表（低/中/高 × Present / 纹理绑定 / 相机更新） | **已完成**（[docs/05](docs/05-hook-candidates.md)、[hook/candidates.json](hook/candidates.json)），纯分类记录 |
| 5 | 生成 LoomRender 内核骨架 | **已完成**（[loomrender/kernel.mjs](loomrender/kernel.mjs)），五个契约默认 `unsupported` |
| 6 | 生成游戏内 BP 框架 + 扩展 API + WS bridge 协议 | **已完成**（[ingame/](ingame/README.md)），仅公开 Script API 合规封装 |
| 7 | 移植旧 BedrockLoom 模块管理/事务/签名/依赖 | **已完成（映射 + 合规层骨架）**（[docs/06](docs/06-port-mapping.md)） |
| 8 | 研究笔记：可包装 / 可接 / 永远碰不到 | **已完成**（[docs/07](docs/07-research-notes.md)） |

## 6. 版本基线

| 项 | 值 | 来源 |
| --- | --- | --- |
| 基岩版目标 | 1.21.130（Windows 39448925 / Android arm64 39263185） | 用户提供；本机副本**未检出** |
| Java 对照 | `1.21.11` 在官方清单中真实存在（另有 rc1–3、pre1–5） | `piston-meta` version_manifest_v2.json，2026-11-06 只读查询 |
| 官方清单当前 latest | `26.3` release / `26.4-snapshot-7` | 同上；**26.x 不得当作 1.21.130 证据** |
| 基岩版公开能力 | 1.21.130 新增 `@minecraft/server-graphics`，仅 Vibrant Visuals 大气散射参数 | 主项目 `../loom-v2/docs/06-international-capability.md` |

Java 清单**不含基岩版版本号**；`1.21.130` 未出现在 Java 清单中属正常，不是查询失败。「官方启动器实验未混淆包」这一具体形态本仓库**未核实、未下载、未使用**，且按禁止项不将其逻辑套用到基岩闭源渲染。

## 7. 复现

```bash
cd BedrockLoom-Research
node --test test/*.test.mjs     # 自动化测试
node run-evidence.mjs           # 重跑测试并刷新 EVIDENCE.md
```

解析器需要显式给出路径，不给就拒绝（不猜路径、不扫全盘）：

```bash
BLR_TARGET_DIR=/path/to/your/own/extracted node parser/layout.mjs
```

## 8. 与主仓库的关系

- 本目录在 `ChaosSurvivalProject/BedrockLoom` 的 **`research` 分支**；`main` 分支的 README、文档、代码、Release 全部不变。
- 不设 `--latest`；不合并回 `main`；不发布为 npm 包（`package.json` 为 `private`）。
- 研究结论**不进入**主项目的 `Stable` / `Candidate` 评级体系，只作为带标记的假设记录。

## 9. 附加声明与免责

- 本仓库全部内容为原创骨架与研究记录，**不含**任何 Mojang / Microsoft 的游戏二进制、资源、材质样本、反编译源码或第三方重分发包。
- 「已购正版」不成立时请勿使用本仓库做任何游戏内实验；本仓库不提供绕过购买、登录、签名、平台完整性或反作弊的手段。
- 所有 A 层条目均为**研究假设**，可能随版本、平台、驱动、实验开关漂移；本仓库不保证、也不声称其可工作。
- 代码采用 MIT 许可证，但**不授予**对任何第三方游戏二进制或资源的权利；研究行为还需遵守适用 EULA 与当地法律。
