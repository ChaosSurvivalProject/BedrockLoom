# 04 · RenderDragon 可观测面分类（研究假设）

> ⚠️ 本文件是**分类框架**，不是逆向结果。按 [01 门禁](01-local-path-gate.md)，未解包、未观测、未验证。
> 每个条目强制带 `host-private` / `research-hypothesis` / `version-drift-risk`，证据级别一律 `E0`。
> 不出现任何私有符号、模块基址、偏移、pattern 字节。

## 1. 术语边界

「可观测面」指**理论上**在作者本机、合法调试条件下可能被观察到的图形运行时事件类别。它**不等于**：

- 不等于官方公开 API（官方没有渲染管线直连接口）；
- 不等于本仓库能观测到（当前无包、无实现）；
- 不等于可以写回或改变画面。

用户上一轮定调仍然成立：「基岩版 1.21.130 官方没有渲染管线直连接口」「不碰 RenderDragon，只做渲染意图 + 外部合成」。本文件只是把「不碰」的那部分**命名并记录风险**，便于将来区分，而不是去碰它。

## 2. 五个观测类别

| ID | 类别 | 抽象描述（通用图形学概念） | 层 | 官方公开接口 | 本仓库状态 |
| --- | --- | --- | --- | --- | --- |
| `OBS-SWAP` | 交换链呈现 | 一帧提交到呈现队列的时刻；`IDXGISwapChain::Present` 是 **Microsoft 公开的 D3D COM 接口**，不是游戏私有符号 | A | 无（对游戏而言） | 假设 / `unsupported` |
| `OBS-CMDLIST` | 命令列表 | 图形 API 命令缓冲的提交边界 | A | 无 | 假设 / `unsupported` |
| `OBS-TEXSUBMIT` | 纹理提交 | 纹理资源上传/绑定的时机与尺寸类别 | A | 无 | 假设 / `unsupported` |
| `OBS-CAMERA` | 相机矩阵 | 视图/投影矩阵在帧内的取值 | A | 无（Script API 无 FOV/near/far 读取） | 假设 / `unsupported` |
| `OBS-UILAYER` | UI 层 | 屏幕空间绘制与游戏内 HUD 的层次关系 | A+B | 部分（`ScreenDisplay` / 表单，属 B 层） | B 层可包装；A 层假设 |

**重要区分**：`IDXGISwapChain::Present` 之所以可以出现在文档里，是因为它是**操作系统/图形 API 的公开接口**（RenderDoc、PIX、OBS、各类 overlay 都基于公开图形调试机制）。但这只说明「概念公开」，**不说明**「把它挂到某个商业游戏进程上是本仓库要做的事」。后者涉及进程注入与平台完整性，正是硬边界第 4 条排除的。

## 3. 逐类风险记录

### OBS-SWAP · 交换链呈现

```yaml
id: OBS-SWAP
layer: host-private
classification: research-hypothesis
drift: version-drift-risk
evidence: E0
status: unsupported
publicApiConcept: "IDXGISwapChain::Present（D3D 公开 COM 接口）"
gamePrivateSymbol: none-declared       # 本仓库不声明任何游戏私有符号
risk: high
driftFactors:
  - 图形后端选择随平台/驱动/实验开关变化
  - UWP/Store 版本与 Android 后端完全不同
  - 每次客户端更新都可能改变调用路径
verification: "需作者本机合法包 + 官方图形调试工具；本仓库不提供拦截实现"
allowedInRepo: ["分类记录", "返回 unsupported 的抽象 probe 接口"]
forbiddenInRepo: ["vtable 索引", "detour 安装", "DLL 注入", "帧回灌"]
```

### OBS-CMDLIST · 命令列表

```yaml
id: OBS-CMDLIST
layer: host-private
classification: research-hypothesis
drift: version-drift-risk
evidence: E0
status: unsupported
risk: high
note: "命令列表内容属于引擎内部实现，不解析、不记录、不推断结构"
```

### OBS-TEXSUBMIT · 纹理提交

```yaml
id: OBS-TEXSUBMIT
layer: host-private
classification: research-hypothesis
drift: version-drift-risk
evidence: E0
status: unsupported
risk: high
relatedCompliantPath: "资源包静态纹理（创作期）+ loom.assets.* 引用；运行时动态纹理上传 = Unavailable"
note: "「运行时替换已提交纹理」在主项目已判 Unavailable，本研究不改判"
```

### OBS-CAMERA · 相机矩阵

```yaml
id: OBS-CAMERA
layer: host-private
classification: research-hypothesis
drift: version-drift-risk
evidence: E0
status: unsupported
risk: high
relatedCompliantPath: "Script API 只能读玩家位置/朝向；FOV/near/far/视锥不可读"
note: "主项目 render-intent 采集器对 FOV 恒返回 null，伪造值一律 denied，本结论沿用"
```

### OBS-UILAYER · UI 层

```yaml
id: OBS-UILAYER
layer: host-private + in-game-compliant
classification: mixed
evidence: "B 层 E1/E2（官方文档）；A 层 E0"
compliantApis:
  - "@minecraft/server-ui 表单"
  - "ScreenDisplay.setActionBar / setTitle（文本 HUD）"
  - "资源包 UI 定义（静态）"
unavailable:
  - "世界空间 UI / 实体附着 UI"
  - "任意屏幕像素绘制"
  - "HUD 层级覆盖核心界面"
```

## 4. 与合规层的接口切点

```
[B 合规层]  Script API 采状态 / 资源包静态定义 / 表单与文本 HUD
      │  RenderIntent（纯数据，不画像素）
      ▼
[C 平台侧]  本机 WS / 文件管道 → 外部合成器算帧（Canvas/WebGL）
      │
      ▼
[A 私有层]  ✖ 回灌到游戏交换链 —— 本仓库不提供实现，停在桩
```

**只有前半段（B → C）在本仓库有可运行骨架**；A 层的所有「接回游戏」路径都返回 `unsupported`。这与用户「平台侧画 ok / 游戏内只接受资源·HUD·实体投影 ok / Hook Present 不在范围」的合规边界一致。

## 5. 相关

- [05 Hook 候选表](05-hook-candidates.md) · [00 三层边界](00-scope-and-three-layers.md)
- [07 研究笔记](07-research-notes.md)
- [loomrender/kernel.mjs](../loomrender/kernel.mjs)
