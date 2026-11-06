# Bedrock Loom v2 —— 既有项目审查与扩展交付

基线客户端：**Minecraft 基岩版国际版 1.21.130**（2025-12-09 发布，协议版本 898）。
本次是**对既有项目 `../mod`（Bedrock Loom v1.1，40 个文件）的审查与扩展**，不是重写。

## 零覆盖承诺

- `../mod` 下 **40 个既有文件全部保留，字节级未修改**。
- 校验基线：`mod.json` SHA-256 `b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48`；
  `docs/RENDER_AUDIT.md` SHA-256 `3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390`。
- 所有新增内容位于 `loom-v2/`，采用独立模块名（`core/`、`services/`、`contracts/`、`schemas/`、`manager/`）。
- 对旧接口的弃用、迁移、版本化只通过**新增文档标注 + 兼容适配层 + 迁移脚本**完成，不编辑旧文件。见 [00-impact-and-migration.md](docs/00-impact-and-migration.md)。

## 三条核心结论（先说结果）

1. **真正介入渲染的只有资源构建与资源加载阶段，且是"间接影响"级别。** 1.21.130 官方公开的
   `@minecraft/server-graphics` 只提供 Vibrant Visuals 大气散射参数读写（Beta、Realms 不支持），
   它是**设置级参数**，不是帧阶段回调、不是几何/材质提交、不是自定义后处理 pass。
   其余九个渲染阶段（GeometrySubmit、RenderLayer、PostProcess 的自定义 pass、CullAndSort、
   SceneUpdate 的每帧写入、FramePresent）在国际版公开客户端上均为**不可访问**，
   实现它们需要修改二进制 / 私有内存 / Hook 未公开函数，属于验收硬门槛禁止项 → `Unavailable` 或 `CustomClientOnly`。
2. **Stable API 只有平台侧（管理器/包/依赖/事务/权限/校验/诊断/迁移），没有渲染介入接口。**
   按用户门槛"E4 及以上才可进入 Stable"，而 E3/E4/E5 需要真实 1.21.130 客户端或官方自动测试通道；
   本沙箱不具备该条件，因此所有**游戏内**表现接口最高只能到 `Experimental`（E1/E2）。
   这不是回避，而是把"可自动验证的东西"和"必须真机验收的东西"分开，见
   [01-freeze-definition.md](docs/01-freeze-definition.md) 的**证据域**定义。
3. **本次可真实兑现的产品能力是模组管理器**：包格式 2.0、签名覆盖全部文件、依赖拓扑与冲突解释、
   原子安装/回滚/崩溃恢复、配置合并、权限信任中心、诊断、配置文件集、离线图形界面。
   这部分有可运行代码和自动化测试，证据在 [EVIDENCE.md](EVIDENCE.md)。

## 运行证据（不是伪代码）

```bash
cd /workspace/loom-v2
node --test test/                      # 自动化测试，生成实际输出
node services/migrate-v1-to-v2.mjs     # 真实读取 ../mod/mod.json，生成 examples/loom-blade.v2.manifest.json
node test/run-evidence.mjs             # 汇总为 EVIDENCE.md
node -e "import('./core/resolver.mjs').then(m=>console.log(m.resolveLoadOrder(...)))"  # 示例可直接执行
```

文档中所有 `core/` / `services/` 的示例均为上述测试中实际执行的调用；凡未执行的示例一律标注
`未执行 / 真机验收步骤`，见 [13-testing-and-budgets.md](docs/13-testing-and-budgets.md)。
离线图形界面：`manager/index.html`（单文件、无网络依赖、双击即可打开）。

## 交付物索引（对应用户要求的 18 项）

| # | 交付物 | 文件 |
|---|---|---|
| 1 | 对现有文件的影响清单 | [docs/00-impact-and-migration.md](docs/00-impact-and-migration.md) |
| 2 | 完整包结构与模块边界 | [docs/02-package-structure.md](docs/02-package-structure.md) |
| 3 | API 状态总表 | [docs/03-api-status-table.md](docs/03-api-status-table.md) |
| 4 | 渲染阶段合同与证据卡 | [docs/04-render-stage-contract.md](docs/04-render-stage-contract.md) |
| 5 | 国际版能力矩阵 | [docs/06-international-capability.md](docs/06-international-capability.md) |
| 6 | 模组管理器信息架构 / 页面流程 / 交互状态 | [docs/07-mod-manager-ia.md](docs/07-mod-manager-ia.md) |
| 7 | 包格式 / 签名 / 仓库索引 / 事务日志 Schema | [docs/08-package-format-2.md](docs/08-package-format-2.md)、[schemas/](schemas/) |
| 8 | 依赖、冲突与配置合并算法 | [docs/11-algorithms.md](docs/11-algorithms.md) |
| 9 | 权限模型、信任中心、威胁模型 | [docs/10-sandbox-and-trust.md](docs/10-sandbox-and-trust.md) |
| 10 | 核心服务 TypeScript 接口与数据类型 | [contracts/services.ts](contracts/services.ts)、[contracts/types.ts](contracts/types.ts) |
| 11 | 管理器后端状态机与故障恢复表 | [docs/09-transactions-and-fsm.md](docs/09-transactions-and-fsm.md) |
| 12 | 二十个关键用户故事 | [docs/12-user-stories.md](docs/12-user-stories.md) |
| 13 | 自动测试 / 真机验收 / 视觉黄金测试清单 | [docs/13-testing-and-budgets.md](docs/13-testing-and-budgets.md) |
| 14 | 性能预算 / 低设备降级 / 泄漏检测 | [docs/13-testing-and-budgets.md](docs/13-testing-and-budgets.md) |
| 15 | 旧 API 兼容与版本迁移方案 | [docs/14-version-migration.md](docs/14-version-migration.md) |
| 16 | v1 明确"不做"清单 | [docs/15-v1-non-goals.md](docs/15-v1-non-goals.md) |
| 17 | 经审计可承诺 / 不可承诺能力清单 | [docs/16-commitments.md](docs/16-commitments.md) |
| 18 | 最终回答：哪些 API 真正介入渲染 | [docs/17-final-answer.md](docs/17-final-answer.md) |

附加：[14 类 API 逐项裁定](docs/05-api-adjudication.md)、["可用"冻结定义与证据分级](docs/01-freeze-definition.md)、
[状态机与事务规范](docs/09-transactions-and-fsm.md)、[自动化测试报告](EVIDENCE.md)。

## 交付状态（18/18 已落地）

- 18 项交付物全部完成：文档 `docs/00`–`docs/17`、4 个 JSON Schema、8 个 `core/*.mjs`、
  6 个 `services/*.mjs`、2 个 TypeScript 契约、离线图形管理器、10 个测试文件、真实示例包与证据报告。
- **最终回答**见 [docs/17-final-answer.md](docs/17-final-answer.md)：哪些 API 真正介入渲染、
  介入到哪一层、如何证明。
- 自动化测试 **80/80 通过**、`tsc --noEmit` 通过；`../mod` 40 个既有文件字节级不变。
- 真机验收、各设备与各存档方式、全部画面结果、视觉黄金测试、E3/E4/E5 证据均标 **未验证**，
  补齐步骤见 [docs/13-testing-and-budgets.md](docs/13-testing-and-budgets.md)。

## 禁止事项（本仓库不出现）

修改/注入国际版游戏二进制、读取私有内存或固定偏移、Hook 未公开函数、绕过签名/版权/沙箱/审核、
复制或嵌入网易 SDK 与游戏文件、把 Java 版或网易版证据记作国际版结论、把"资源包里有模型"写成"控制渲染管线"。
