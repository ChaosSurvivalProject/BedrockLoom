# 渲染意图层 · 能力审计表与补充说明

`@since 2.1.0` · 基线：Minecraft 基岩版**国际版 1.21.130** · 核对日期 2026-11-06

> **本扩展不深入渲染管线，只深入渲染意图。**
> 基岩版 1.21.130 官方没有「渲染管线直连接口」。本层不声明 `render.drawTriangle()`，
> 只做「渲染意图抽象 + 外部合成」：游戏内采状态，平台侧出像素。

本文按用户要求的七节组织，所有代码片段均来自本仓库**已执行**的文件
（`node --test test/` 与 `node render-intent/demo/serve.mjs` 实际跑通），不是伪代码。
未执行的真机链路逐项标注「未经真机验证」。

---

## 一、设计原则

| # | 原则 | 代码锚点 |
|---|---|---|
| 1 | 用「渲染意图（RenderIntent）」代替「渲染调用」 | `core/intent.mjs` 的 `INTENT_TYPES = ["hud","texture-push","world-anchor","overlay"]` |
| 2 | 游戏内只产生数据，不画像素 | `collector/behavior-pack-collector.js` 只写 `World.setDynamicProperty` |
| 3 | 外部合成器负责最终像素 | `core/compositor.mjs` 的 `drawFrame(drawFn)`；`demo/overlay.html` 的 Canvas |
| 4 | 三层严格分离：`platform-side / in-game / custom-client` | `capability-table.ts` 每行 `layer` 字段 |
| 5 | 不可读字段不伪造（FOV、包围盒、视锥恒 `null` / `Unavailable`） | `validateFrame` 的 `E_RI_CAM_UNREADABLE`、`E_RI_FRAME_BOUNDS` |
| 6 | 不用「理论上 / 未来可能 / 应该可以」代替证据 | 全表每行都有 `label / evidence / reason` |

详见 [`00-design-freeze.md`](00-design-freeze.md) 的 P1–P6 与硬事实表 H1–H8。

---

## 二、目录结构

```
loom-v2/render-intent/
├── intent-types.ts              ① 类型冻结 + 七态结果 + 禁止接口常量
├── collector.ts                 ② loom.render.* 采集契约（只出数据）
├── bus.ts                       ③ 文件 / SSE / WS 三链路 + 桥接输入契约
├── compositor-api.ts            ④ 外部合成器契约（Canvas / overlay / 投影 / PNG）
├── pack-bridge.ts               ⑤ loom.pack.* 资源包投影契约（构建期）
├── capability-table.ts          ⑥ 32 行能力审计表（权威汇总）
├── core/                        【纯逻辑，无 node:*，浏览器可运行】
│   ├── intent.mjs                意图/帧构造、校验、序列化、批量化
│   ├── capability.mjs            可运行能力表 + 表级自检
│   └── compositor.mjs            合成器状态机、批量绘制、2D 正交投影
├── runtime/                     【Node 侧，零第三方依赖】
│   ├── bus.mjs                   RFC6455 WS + SSE + 文件管道 + /intent POST
│   └── pack-bridge.mjs           构建期 PNG 绑定、公告板/光照资源定义
├── collector/
│   └── behavior-pack-collector.js   行为包采集脚本（beta，未经真机验证）
├── demo/
│   ├── serve.mjs                 一键启动本机总线（仅绑定 127.0.0.1）
│   ├── overlay.html              单文件离线演示（WS→SSE→内置演示）
│   └── sample-intents.jsonl      5 条可导入示例信封
├── docs/
│   ├── 00-design-freeze.md       设计原则冻结
│   └── 14-render-intent.md       本文件
└── README.md                    模块入口
```

新增对主文档集的补充：[`loom-v2/docs/18-render-intent.md`](../../docs/18-render-intent.md)。
**零覆盖**：以上全是新增文件，`../mod`、`../core`、`../services`、`../docs/00–17` 未改动。

---

## 三、核心类型定义（TypeScript，已通过 `tsc --noEmit`）

以下为 [`intent-types.ts`](../intent-types.ts) 的真实摘录（中文注释保留）：

```ts
// 七态结果：与 ../../core/result.mjs 的 Status 一一对应，不另起一套语义
export type ResultStatus =
  | "ok" | "partial" | "unsupported" | "denied"
  | "timeout" | "resource-exhausted" | "degraded";

// 三层能力域
export type EvidenceLayer = "platform-side" | "in-game" | "custom-client";
export type CapabilityLabel = "stable" | "beta" | "unsupported";

// 相机帧：FOV / near / far 官方不可读，恒为 null
export interface CameraFrame {
  readonly schema: "bedrockloom.collector.camera/v1";
  readonly position: Vec3;              // Player.location（公开 API）
  readonly viewDirection: Vec3;         // Player.getViewDirection()（公开 API）
  readonly rotation: { readonly x: number; readonly y: number };
  readonly fovDegrees: number | null;   // 恒 null，不得用猜测值填充
  readonly near: number | null;
  readonly far: number | null;
}

// 实体简报：包围盒不可读，bounds 恒为 null
export interface EntityBrief {
  readonly id: string; readonly typeId: string;
  readonly position: Vec3;
  readonly bounds: AABB | null;
  readonly boundsSource: "unavailable" | "estimated";
}

// 区块采样：受预算限制，超预算返回 resource-exhausted，不静默截断
export interface ChunkSample {
  readonly blocks: readonly BlockBrief[];
  readonly truncated: boolean;
  readonly budget: { readonly maxBlocks: number; readonly maxBytes: number };
}

// RenderIntent 判别联合（四种）
export type RenderIntent = HudIntent | TexturePush | WorldAnchor | OverlayIntent;

// 明确不存在的伪接口：只作为「禁止声明」的类型常量，不提供任何调用签名
export type ForbiddenGameApi =
  | "render.drawTriangle" | "render.setMaterial" | "render.present"
  | "render.hookPresent" | "render.setRenderLayer" | "render.readFramebuffer"
  | "render.writeMaterialBin" | "runtimeTextureSwap";
```

完整定义（含 `HudIntent` / `TexturePush` / `WorldAnchor` / `OverlayIntent` 的 payload、
`CollectorFrame`、`IntentEnvelope`、`INTENT_LIMITS`）见源文件。

---

## 四、平台侧伪 API（只描述契约，不实现游戏内底层）

所有接口返回 [`Result<T>`](../intent-types.ts) 七态结果；长任务可取消、可观察进度。

### 4.1 采集 `loom.render.*`（in-game，`beta`）

| 接口 | 标签 | 返回 | 说明 |
|---|---|---|---|
| `camera(player)` | `beta` | `Result<CameraFrame>` | 位置/朝向/旋转可读；FOV/near/far 恒 `null` → `degraded` |
| `entities(filter)` | `beta` | `Result<EntityBrief[]>` | 实体与位置可读；`bounds` 恒 `null` → `degraded` |
| `chunk(x,z,query)` | `beta` | `Result<ChunkSample>` | `Dimension.getBlock()` 逐方块；超预算 → `resource-exhausted` |
| `playerView()` | `unsupported` | `Result<ViewFrustum>` | 视锥依赖 FOV，官方无公开接口 |
| `publish(target,frame)` | `unsupported` | `Result<never>` | 客户端 Script API 无网络 / 文件 / 共享内存能力 |
| `writeDynamicProperty(frame)` | `beta` | `Result<{key,bytes}>` | 公开 API，有容量上限且非实时 |

### 4.2 意图 `loom.intent.*`（platform-side，`stable`）

| 接口 | 标签 | 说明 |
|---|---|---|
| `hud({ id,elementId,rect,content,batchKey })` | `stable` | 提交 HUD 意图数据；像素由合成器绘制，不调用游戏内 `ScreenDisplay` |
| `texture({ slot,pngBase64,target })` | `stable` | `target=compositor` 只画外部窗口；`resource-pack-build` 只生成构建期文件 |
| `worldAnchor({ id,pos,dimensionId,billboard,textureSlot })` | `stable` | 登记锚点**数据**；游戏内可见性依赖预建资源（另标 `beta`） |
| `overlay({ zIndex,opacity,clickThrough,surface,safeArea })` | `stable` | 作用于外部窗口，由操作系统合成，**不是**游戏 Overlay 渲染层 |
| `gameDraw(...)` | `unsupported` | 不存在；仅登记为 `Unavailable`（E0） |

### 4.3 资源包投影 `loom.pack.*`（附加包层）

| 接口 | 标签 | 项目状态 | 说明 |
|---|---|---|---|
| `bindTexture(slot,pngBytes)` | `stable` | `BuildTimeOnly` | 构建期写 PNG + `texture_list.json`；只影响 `ResourceBuild` |
| `spawnBillboard(pos,slot,dimensionId)` | `beta` | `Experimental` | 仅生成资源定义，需预建 geometry；**未经真机验证** |
| `updateLight(spec)` | `beta` | `Experimental` | 实验性资源参数，`runtimeEffect=false`；不是运行时点光源 |
| `runtimeTextureSwap(...)` | `unsupported` | `Unavailable` | 无运行时纹理上传接口 |
| `writeMaterialBin(...)` | `unsupported` | `Unavailable` | 需绕过资源校验，用户明确排除 |

### 4.4 总线与合成器（platform-side，`stable`）

`bus.file`（`intent.jsonl` 文件管道，离线可用）、`bus.sse`（`/events`）、
`bus.ws`（RFC6455 文本帧，仅 `127.0.0.1`）、`bus.bds-http`（`beta`，仅 BDS）、
`bus.in-game-direct`（`unsupported`）。
`compositor.canvas / overlayWindow / snapshotPng / projectMinimap` 为 `stable`；
`compositor.injectPresent / readGameFramebuffer` 为 `unsupported`。

> 三条链路都不访问公网。`127.0.0.1` 是本机进程间回环，与「离线可用」不冲突。

---

## 五、最小可跑示例（纯前端 HTML，零依赖）

**已执行**：`demo/overlay.html` 可直接双击（`file://`）打开，无需任何服务即可播放内置合成演示；
`node render-intent/demo/serve.mjs` 启动总线后，页面自动优先连 WS → 降级 SSE → 保持演示。
内联脚本已通过 `node --check`，并由 `test/render-intent.test.mjs` 用 DOM stub 实际执行验证。

### 5.1 游戏内采集（每 10 tick，来自 `collector/behavior-pack-collector.js`）

```js
import { world, system } from "@minecraft/server";

export const DYNAMIC_PROPERTY_KEY = "bedrockloom:ri.frame";

export function start(intervalTicks = 10) {
  return system.runInterval(() => {
    try { collectOnce(); } catch (err) {
      try { world.setDynamicProperty("bedrockloom:ri.lastError", String(err).slice(0, 200)); } catch {}
    }
  }, intervalTicks);
}
// collectOnce() 只读 p.location / getViewDirection() / getRotation() / dim.getEntities()，
// fovDegrees / near / far / bounds 一律写 null，超预算降级而非静默截断。
```

> **诚实标注**：此脚本**不能**直连本地 WS 或写 `intent.jsonl`（H3）。
> 它由 `World.setDynamicProperty()` 写出，再由**平台侧桥接器**送入总线。
> 该桥接链路在 1.21.130 客户端上**未经真机验证**。

### 5.2 启动本机总线（真实命令）

```bash
node render-intent/demo/serve.mjs          # 仅绑定 127.0.0.1:8787
# 端点：/health  /capabilities  /intents.jsonl  /events(SSE)  /(WS)  /intent(POST)
```

### 5.3 外部合成器核心投影（来自 `demo/overlay.html` 内联脚本，已执行）

```js
// 2D 正交投影：不使用 FOV/near/far，不伪装成游戏视锥
function projectMinimap(radius, vw, vh) {
  if (!latestFrame || !latestFrame.camera) {
    return degraded(null, "没有采集帧，不会用猜测值伪造中心点", "等待采集帧");
  }
  const c = latestFrame.camera.position, hw = vw / 2, hh = vh / 2;
  const proj = (p) => ({
    x: hw + (p.x - c.x) / radius * hw,
    y: hh + (p.z - c.z) / radius * hh,
    visible: Math.abs((p.x - c.x) / radius) <= 1 && Math.abs((p.z - c.z) / radius) <= 1
  });
  const pts = [{ id: "player", ...proj(c), kind: "player" }];
  for (const e of latestFrame.entities) pts.push({ id: e.id, ...proj(e.position), kind: "entity" });
  for (const a of anchors) pts.push({ id: a.id, ...proj(a.position), kind: "anchor" });
  return degraded({ center: c, radius, points: pts,
    clippedCount: pts.filter(p => !p.visible).length },
    "正交投影不是游戏视锥；FOV / near / far 官方不可读", "按半径裁剪的 2D 小地图");
}
```

### 5.4 链路图

```
[游戏内 in-game / beta]                    [平台侧 platform-side / stable]
┌──────────────────────┐                 ┌────────────────────────────────────┐
│ Script API 只读采集   │                 │ 桥接器读取 dynamic property / 存档  │
│ camera · entities     │  ──数据写出──▶  │        ↓                            │
│ chunk · setDynamicProp│  （非实时、有   │ bus: file / SSE / WS (127.0.0.1)   │
└──────────────────────┘    容量上限）   │        ↓                            │
                                         │ 外部合成器：Canvas / WebGL / 窗口   │
   ❌ 无 WS / 无文件写入                 │  → 小地图 / HUD / 监控屏（本页像素）│
   ❌ 无 FOV / 包围盒 / 视锥             │        ↓ 可选（构建期）             │
                                         │ loom.pack.bindTexture → 资源包 PNG  │
                                         └────────────────────────────────────┘
[custom-client]  默认关闭，本仓库不实现；injectPresent / 帧缓冲读取 = Unavailable
```

---

## 六、能力边界表

| 层 | 能 | 不能 | 标签 |
|---|---|---|---|
| **platform-side** | HUD、叠加层、动态贴图、世界锚点登记、小地图 2D 投影、Canvas/WebGL 绘制、PNG 导出、透明窗口 / 第二屏、构建期资源包纹理与实验参数 | 把像素写进游戏帧缓冲 | `stable` |
| **in-game** | 只读采集相机位置/朝向/旋转、实体列表与位置、区块采样；构建期生成公开资源包定义；HUD 表单；粒子/音效提交 | 直连 WS / 写文件 / 共享内存；FOV·near·far·包围盒·视锥；运行时替换已加载纹理；实时 IK；改写 `material.bin` | `beta` |
| **custom-client** | —（本仓库不实现，默认关闭） | 直接画三角形、改 Shader / 深度缓冲、截帧注入、Hook Present、读游戏帧缓冲、私有内存 / 固定偏移 | `unsupported` |

### 6.1 完整能力审计表（32 行，权威源：`core/capability.mjs` / `capability-table.ts`）

`stage` 沿用 v2.0 十阶段合同；`none` 表示不介入任何游戏渲染阶段。

| ID | API | 标签 | 层 | 项目状态 | 证据 | 阶段 | 审计理由（摘要） |
|---|---|---|---|---|---|---|---|
| RI-C01 | `loom.render.camera` | beta | in-game | Experimental | E2 | none | FOV/near/far 不可读，恒 null → degraded |
| RI-C02 | `loom.render.entities` | beta | in-game | Experimental | E2 | none | 无包围盒接口，bounds 恒 null |
| RI-C03 | `loom.render.chunk` | beta | in-game | Experimental | E2 | none | 逐方块采样，超预算 `resource-exhausted` |
| RI-C04 | `loom.render.playerView` | unsupported | in-game | Unavailable | E0 | none | 视锥依赖 FOV，无公开接口 |
| RI-C05 | `loom.render.publish` | unsupported | in-game | Unavailable | E0 | none | 客户端 Script API 无网络/文件能力 |
| RI-C06 | `loom.render.writeDynamicProperty` | beta | in-game | Experimental | E2 | SimulationSync | 公开 API，有容量上限且非实时；数据写出非渲染提交 |
| RI-B01 | `bus.file` | stable | platform-side | Stable | E4 | none | 文件管道，离线可用，有自动化往返测试 |
| RI-B02 | `bus.sse` | stable | platform-side | Stable | E4 | none | Node http + EventSource，零依赖，有集成测试 |
| RI-B03 | `bus.ws` | stable | platform-side | Stable | E4 | none | 手写 RFC6455 文本帧，仅 127.0.0.1，有握手/帧测试 |
| RI-B04 | `bus.bds-http` | beta | in-game | PlatformRestricted | E2 | none | 仅 BDS 服务端，客户端单人模式不适用，未验证 |
| RI-B05 | `bus.in-game-direct` | unsupported | in-game | Unavailable | E0 | none | 客户端 Script API 不提供网络能力 |
| RI-BR01 | `bridge.bds-http-forward` | beta | in-game | PlatformRestricted | E2 | none | 仅 BDS 可用，需真机验证 |
| RI-BR02 | `bridge.world-save-readonly` | beta | platform-side | Experimental | E2 | none | 零侵入但非实时，存档格式未经官方承诺稳定 |
| RI-BR03 | `bridge.dynamic-property-export` | beta | in-game | Experimental | E2 | none | 有容量上限与非实时特性，需真机复核 |
| RI-BR04 | `bridge.manual-paste` | stable | platform-side | Stable | E4 | none | 平台侧纯数据导入，可自动化测试 |
| RI-BR05 | `bridge.private-memory` | unsupported | custom-client | Unavailable | E0 | none | 验收硬门槛禁止项 |
| RI-I01 | `loom.intent.hud` | stable | platform-side | Stable | E4 | none | 提交意图数据，像素由合成器绘制 |
| RI-I02 | `loom.intent.texture` | stable | platform-side | Stable | E4 | none | 只影响外部窗口或构建期文件 |
| RI-I03 | `loom.intent.worldAnchor` | stable | platform-side | Stable | E4 | none | 锚点是数据；游戏内可见性另标 beta 未验证 |
| RI-I04 | `loom.intent.overlay` | stable | platform-side | Stable | E4 | none | 作用于外部窗口，非游戏 Overlay 渲染层 |
| RI-I05 | `loom.intent.gameDraw` | unsupported | in-game | Unavailable | E0 | GeometrySubmit | 1.21.130 无 `render()` 公开接口 |
| RI-CP01 | `compositor.canvas` | stable | platform-side | Stable | E4 | none | 纯平台侧像素，不触及游戏渲染阶段 |
| RI-CP02 | `compositor.overlayWindow` | stable | platform-side | Stable | E4 | none | 外部进程窗口，由操作系统合成 |
| RI-CP03 | `compositor.snapshotPng` | stable | platform-side | Stable | E4 | none | 导出合成器自身缓冲，不是游戏帧缓冲截图 |
| RI-CP04 | `compositor.projectMinimap` | stable | platform-side | Stable | E4 | none | 纯数学，未使用不可读的 FOV/near/far |
| RI-CP05 | `compositor.injectPresent` | unsupported | custom-client | Unavailable | E0 | FramePresent | 需 Hook 未公开函数或注入二进制 |
| RI-CP06 | `compositor.readGameFramebuffer` | unsupported | custom-client | Unavailable | E0 | PostProcess | 私有内存与固定偏移被明确禁止 |
| RI-P01 | `loom.pack.bindTexture` | stable | platform-side | BuildTimeOnly | E4 | ResourceBuild | 构建期文件生成，只影响 ResourceBuild |
| RI-P02 | `loom.pack.spawnBillboard` | beta | in-game | Experimental | E2 | ResourceBuild | 需预建 geometry，运行期动态纹理不可用，未验证 |
| RI-P03 | `loom.pack.updateLight` | beta | in-game | Experimental | E2 | ResourceBuild | 实验性资源包配置，非公开 Script API，`runtimeEffect=false` |
| RI-P04 | `loom.pack.runtimeTextureSwap` | unsupported | in-game | Unavailable | E0 | ResourceLoad | 无运行时纹理上传接口 |
| RI-P05 | `loom.pack.writeMaterialBin` | unsupported | custom-client | Unavailable | E0 | GeometrySubmit | 需绕过资源校验，用户明确排除 |

**表级自检**（`auditCapabilityTable()`，由测试断言为空数组）：

- id 唯一；`unsupported` 必须有非空 reason；`beta` 不得标项目 `Stable`；
- `stable` 只能在 `platform-side`；`unsupported` 证据不得高于 E1；
- 禁止出现 `render.drawTriangle / present / setMaterial / hookPresent` 等伪接口声明；
- TypeScript 表与 JS 可运行表的 **id 集合、标签、项目状态逐行一致**。

统计：`stable 13 / beta 10 / unsupported 9`，共 32 行。

---

## 七、给 BedrockLoom 文档的补充说明

> 需要写入主文档集的原文，见 [`loom-v2/docs/18-render-intent.md`](../../docs/18-render-intent.md)：

1. **明确写**：「本扩展不深入渲染管线，只深入渲染意图。」
   `docs/04-render-stage-contract.md` 的十阶段结论**不变**；本层新增的 `ResourceBuild`
   介入点是「平台侧生成公开资源包文件」，仍为**间接影响**，不升级为「直接控制」。
2. **明确写**：v2.0 的 `Stable 20 / Candidate 0 / Experimental 20 / BuildTimeOnly 6 /
   PlatformRestricted 2 / CustomClientOnly 2 / Unavailable 14` 总表**不变**。
   本层的 `stable` 是**模块内标签**，不等于「新增游戏内渲染 API 进入项目 Stable」；
   为避免混淆，本层能力单独登记在 `render-intent/capability-table.ts`，不并入 `docs/03`。
3. **明确写**：`@minecraft/server-graphics` 仍只覆盖 Vibrant Visuals 大气散射参数；
   Deferred / PBR / 点光源 / 体积雾 / 色调映射 / SSR 是**实验性资源包配置**，
   `beta`、`runtimeEffect=false`、需实验开关、**不承诺跨设备**，不是运行时光照 API。
4. **明确写**：「游戏内每 10 tick 直连本地 WS」在国际版客户端单人模式下**不成立**（H3）。
   演示页与 `serve.mjs` 默认播放的是 `synthetic-demo` **合成数据**；真机链路需平台侧桥接，
   且**未经真机验证**，不得在文档或截图中包装成真机采集。
5. **明确写**：`ok` 只表示平台侧契约完成，**不等于画面可见**；调用成功不等于渲染成功。
   本层所有画面结果仍需 `docs/13-testing-and-budgets.md` 的视觉黄金测试与 S1–S8 探针。
6. **版本化**：本层整体 `@since 2.1.0`，纯新增，无 `@deprecated`、无需旧接口适配器；
   `contracts/tsconfig.json` 已把 `render-intent/*.ts` 纳入 `tsc --noEmit` 检查。

---

## 8. 验收硬门槛逐条核对

| 门槛 | 本层结论 |
|---|---|
| 修改 / 注入游戏二进制 | 不出现；`docs/00` §5 + 静态负向扫描 |
| 私有内存 / 固定偏移 | `bridge.private-memory` = `Unavailable`（E0） |
| Hook 未公开函数 | `injectPresent` = `Unavailable`（E0） |
| 绕过签名 / 沙箱 / 审核 | 不出现；`bindTexture` 只写公开资源包格式 |
| 依赖偶然行为 | 所有字段走校验器，超预算显式 `resource-exhausted` / `timeout` |
| 无法自动测试且无人工证据 | `beta` 项给出 S1–S8 人工验收步骤与 `acceptanceRecord.yaml` |
| 只在 Java / 网易存在 | H3/H7 已排除；`@minecraft/server-net` 仅 BDS |

## 9. 仍未验证（不冒充完成）

真机 1.21.130 的 dynamic property 容量与端到端时延、BDS HTTP 转发、公告板与
Deferred / Vibrant Visuals 资源的画面结果、实验开关与 Realms 限制、各设备一致性、
视觉黄金测试、帧时间 / 内存 / 对象数贡献度。补齐后按 `docs/01` §1.1 重新评级，无需改代码结构。
