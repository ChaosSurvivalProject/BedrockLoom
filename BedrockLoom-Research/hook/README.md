# hook · Hook 候选表与研究桩

> ⚠️ **本目录没有任何可运行的注入实现。** 只有分类数据、纯抽象接口、恒返回 `unsupported` 的桩。

## 1. 这里有什么

| 文件 | 内容 |
| --- | --- |
| `candidates.json` | 9 条候选（Present / 纹理绑定 / 相机更新 × 低·中·高），全部 `status: unsupported` |
| `hook-contract.mjs` | 候选校验、三标记强制、私有符号字段拒绝、`attach()` → `unsupported` |
| `IHookProbe.hpp` | 纯抽象 C++ 接口 + `NullProbe`，可 `-fsyntax-only` 编译，不含任何符号/偏移/安装逻辑 |

## 2. 这里没有什么（逐条对应硬边界）

- ❌ 无 `IDXGISwapChain::Present` 的 detour / vtable patch / trampoline
- ❌ 无 `LoadLibrary` / `CreateRemoteThread` / DLL 注入 / 进程附加
- ❌ 无模块名、RVA、基址、vtable 索引、pattern 扫描字节、私有符号表
- ❌ 无「运行即注入」的一键脚本
- ❌ 无改后 dll/so/apk、无 apk 修改、无 Android 注入代码

`IDXGISwapChain::Present` 只在 `candidates.json` 的**抽象描述**里作为「Microsoft 公开 D3D COM 接口」被提及（概念名，不是游戏符号）。即便如此，把它挂到游戏进程上的实现仍被排除。

## 3. Windows / Android 的处理

| 平台 | 本仓库提供 |
| --- | --- |
| Windows x64 | 仅 `H-PRESENT-*` 分类记录 + 抽象 probe 接口；**无 detour 实现** |
| Android arm64 | 仅登记「本机研究用空壳」这一事实；**无 `.so`、无注入、无 apk 修改、无样本** |

## 4. 三标记强制

`hook-contract.mjs` 的 `validateCandidate()` 要求每条同时具备：

```
layer === "host-private"
classification === "research-hypothesis"
drift === "version-drift-risk"
status === "unsupported"
```

且拒绝任何 `symbol` / `rva` / `pattern` / `vtableIndex` / `moduleBase` / `signature` / `dllPath` 字段。测试 `test/hook-contract.test.mjs` 会对 `candidates.json` 逐条断言。

## 5. 为什么不实现

1. 门禁未命中本机包（[docs/01](../docs/01-local-path-gate.md)），没有真实目标时写偏移就是编造。
2. 硬边界：「偏移/符号只做研究记录，不硬写私有符号表到可分发代码」。
3. 硬边界：「不绕过登录/签名/沙箱/反作弊」——进程内 Hook 与平台完整性保护冲突。
4. 禁止项：「给可编译骨架，不给完整改包成品」「禁止看起来能跑但越界的一键脚本」。
5. 项目上一轮定调：「Hook Present / 改 material.bin → 不在 BedrockLoom 范围」。

**即使作者后来提供本机路径，本仓库的可分发内容仍不包含这些实现**（[docs/01](../docs/01-local-path-gate.md) §5）。

## 6. 层归属

A（本机私有层）的**契约与桩**，放进了 C（可公开仓库层）。这是刻意的：公开的是「边界声明 + 风险分类」，不是能力。

相关：[docs/05 候选表](../docs/05-hook-candidates.md) · [docs/04 可观测面](../docs/04-observable-surface.md)
