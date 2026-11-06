# 07 · 最终研究笔记

> 回答用户第 8 步的三问：**哪些原版能力可包装 / 哪些渲染点可接 / 哪些永远碰不到**。
> 全文按「事实」与「假设」分开；假设一律带三标记，不写成结论。

## 0. 一句话结论

在**不碰游戏二进制**的前提下，可包装的是官方公开 Script API 与资源包静态定义，可接的是「游戏内出数据 → 平台侧合成 → 外部画面」这条链；**游戏自身的渲染管线、交换链、命令列表、相机矩阵、材质二进制，在本仓库范围内永远碰不到，也不该被包装成「接到了」**。

这与上一轮定调完全一致：**BedrockLoom 不是基岩版光影框架，而是「渲染意图总线 + 合规投影层」；本扩展不深入渲染管线，只深入渲染意图。**

## 1. 哪些原版能力可包装（B 合规层，事实）

| 能力 | 官方来源 | 可包装成 | 边界 |
| --- | --- | --- | --- |
| 玩家/实体位置、朝向、维度 | `@minecraft/server` | `loom.world.playerView()` / `entities(filter)` | FOV、near/far、视锥、包围盒**不可读**，恒 `null` |
| 方块/区块查询（公开范围内） | `@minecraft/server` | `loom.world.sampleChunk(x,z)` | 只读；不把客户端结果当多人权威 |
| 文本 HUD / ActionBar / Title | `@minecraft/server-ui`、`ScreenDisplay` | `loom.render.hud()` | 文本与表单，不是任意屏幕像素 |
| 表单与简单交互 | `@minecraft/server-ui` | 声明式 UI 骨架 | 无世界空间 UI、无实体附着 UI |
| 粒子 / 音效提交 | `Player.spawnParticle` / `playSound` | `loom.render.submitParticle()` / `submitSound()` | 提交请求，不控制粒子渲染实现 |
| 图形设置参数（大气散射） | `@minecraft/server-graphics`（1.21.130 新增） | `loom.render.setAtmospherics()` | **仅** Vibrant Visuals 大气散射 set/reset；不是 shader/后处理 |
| 资源包静态资源 | 创作期资源文件 | `loom.assets.*` 的 `ResourceHandle` 引用 | 创作期定义 ≠ 运行期修改已提交几何 |
| 客户端私有配置 | 公开 Script API 的存储能力（有配额） | `loom.world.config()` | 原子保存、Schema 版本、配额；不提供任意文件访问 |

**共同点**：全部是「产生数据 / 提交请求 / 设置参数」，执行权归游戏客户端。任何 `ok` 只表示契约完成，**不等于画面可见**。

## 2. 哪些渲染点「可接」（分两种，别混）

### 2.1 真正可接：B → C 意图链（有可运行骨架）

```
游戏内 Script API 采状态（B）
   → RenderIntent 纯数据（不画像素）
   → 本机 WS / 文件管道（仅 127.0.0.1，平台侧）
   → 外部合成器 Canvas/WebGL 算帧（C）
   → 透明窗口 / 第二屏 / 独立网页显示
```

这条链**合规、离线可用、已由主项目 `render-intent` 验证**（116/116 测试）。外部合成器算出的画面是**游戏外的画面**，不需要、也不应该写回游戏交换链。可接的东西：小地图、状态监控屏、调试可视化、AI/服务器状态面板。

### 2.2 只能登记为假设：A 层观测点（**不接**）

| 类别 | 标记 | 本仓库状态 |
| --- | --- | --- |
| 交换链呈现 `IDXGISwapChain::Present` | `host-private` / `research-hypothesis` / `version-drift-risk` | `unsupported`，仅分类记录 |
| 命令列表提交边界 | 同上 | `unsupported` |
| 纹理上传/绑定事件 | 同上 | `unsupported` |
| 视图/投影矩阵采样 | 同上 | `unsupported` |
| 帧回灌为 overlay / 动态纹理 | 同上 | `unsupported`（硬边界排除） |

**「可接」在这里只表示「值得记录为研究假设」，不表示「本仓库接了」**。见 [05 候选表](05-hook-candidates.md)：所有 `高` 级别条目标注「永不实现」，中级别「本仓库不实现」。

## 3. 哪些永远碰不到（明确否定，不改判）

| 项 | 结论 | 依据 |
| --- | --- | --- |
| 自定义 shader / 改 `material.bin` / 材质二进制结构 | `Unavailable` | 主项目裁定；硬边界禁止入库 |
| 运行时几何/材质提交、顶点缓冲写入 | `Unavailable` | 官方无接口 |
| 帧缓冲后处理 pass、透明排序、RenderLayer | `Unavailable` | 官方无接口 |
| 每帧骨骼写入 / 实时 IK | `Unavailable` | 官方无接口 |
| 原生相机 Hook、FOV/视锥读取 | `Unavailable` | 官方无接口 |
| 运行时动态纹理上传替换 | `Unavailable` | 主项目 `render-intent` 已判 |
| `FramePresent` 回调、截帧注入 | `Unavailable` | 需改呈现链路 |
| 游戏二进制注入 / Hook 未公开函数 / 私有内存 / 固定偏移 | **永久排除** | 验收硬门槛 + 本仓库硬边界 |
| 绕过登录/签名/沙箱/反作弊 | **永久排除** | 硬边界第 4 条 |
| 生成/分发改后客户端、apk、dll/so | **永久排除** | 硬边界第 1、2、9 条 |
| 把 Java 未混淆结构套到 RenderDragon | **永久排除** | 硬边界第 8 条 |
| 把只在 Java/网易/26.x 存在的能力写成国际版 1.21.130 支持 | **永久排除** | 主项目证据纪律 |

「永远碰不到」不是「暂时没做」：即使作者在本机拿到合法包，本仓库的**可分发内容**仍然不包含这些实现。这是范围声明，不是能力声明。

## 4. 门禁与证据状态

| 项 | 状态 |
| --- | --- |
| 本机 1.21.130 底包 | **未检出**（[01](01-local-path-gate.md)） |
| 静态解析（目录树/manifest/renderer/materials/字符串表） | **未执行**（按规则停住） |
| 官方元数据查询 | **已执行**：piston-meta 只读 JSON，HTTP 200（[02](02-version-baseline.md)） |
| 任何真实偏移/符号/样本 | **零**，且静态负向扫描断言 |
| A 层证据级别 | `E0`，不参与主项目评级 |
| B/C 层证据 | 自动化测试 + 真机项仍标未验证（沿用主项目 `docs/13`） |

## 5. 版本漂移风险清单

1. 两个 build 号（39448925 / 39263185）未经核实，Windows 与 Android 后端不同，任何观察不可跨平台外推。
2. 官方当前主线为 `26.x`（实测 `latest.release = 26.3`），**26.x 材料不得作为 1.21.130 证据**。
3. Vibrant Visuals / Deferred Technical Preview 等实验开关可能切换渲染路径。
4. 驱动、图形 API、平台完整性策略更新都会改变 A 层假设的可用性与合规性。

## 6. 若要继续（作者本机）

1. 提供作者**自己机器上**合法解包目录的绝对路径（环境变量传入，见 [01](01-local-path-gate.md) §4）。
2. 可推进的只有：静态目录树、通用头/块统计、字符串长度分布计数——**只读、不输出样本内容**。
3. 不会推进的：进程注入、Present detour、帧回灌、任何改后游戏文件。
4. 研究结果仍只进 `research` 分支，带三标记，不升级为 Stable。

## 7. 相关

- [00 三层边界](00-scope-and-three-layers.md) · [04 可观测面](04-observable-surface.md) · [05 候选表](05-hook-candidates.md) · [06 移植映射](06-port-mapping.md)
- 主项目最终回答：`../loom-v2/docs/17-final-answer.md`
