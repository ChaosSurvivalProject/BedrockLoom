# CapabilityProbe 规范与报告 Schema

## 目标

`CapabilityProbe` 不猜版本，不读取私有内存，不扫描函数签名，不触发未定义行为。它只组合发行形态元数据、公开 API 能力声明、资源验证结果和最小无副作用实验。实验失败必须区分 `unsupported`、`unknown` 与权限/资源错误。

## 类型定义

```ts
export type CapabilityId =
  | "resource.geometry" | "resource.attachable" | "resource.animation"
  | "runtime.particle" | "runtime.sound" | "runtime.screen_ui"
  | "runtime.entity_observation" | "runtime.entity_attachment"
  | "runtime.world_ui" | "runtime.camera_effect"
  | "render.material_override" | "render.geometry_update"
  | "render.shader" | "render.framebuffer" | "render.render_layer";

export type CapabilityStatus =
  | "supported" | "unsupported" | "unknown" | "experimental"
  | "platform-dependent" | "degraded" | "permission-required";

export type EvidenceKind =
  | "official-documentation" | "runtime-api" | "resource-load"
  | "minimal-experiment" | "visual-golden" | "manual-acceptance";

export interface Evidence {
  kind: EvidenceKind;
  source: string;
  observedAt: string;
  clientBuild?: string;
  expiresWhen?: string[];
  repeatable: boolean;
  notes?: string;
}

export interface ProbeResult {
  capability: CapabilityId;
  status: CapabilityStatus;
  level: "R0" | "R1" | "R2" | "R3";
  evidence: Evidence[];
  experiment?: { id: string; durationMs: number; assertions: string[]; passed: boolean };
  fallback?: string;
  reason?: string;
  permission?: string;
  budget?: { objects?: number; updatesPerTick?: number; bytes?: number };
}

export interface CapabilityReport {
  schema: "bedrockloom.capability-report/v1";
  generatedAt: string;
  distribution: { platform: "international" | "netease" | "custom" | "unknown"; edition: string; channel?: string };
  client: { build?: string; adapter: string; adapterBuild?: string; apiVersion?: string };
  device: { class: "desktop" | "mobile" | "console" | "unknown"; memoryMb?: number; graphicsBackend?: string; quality?: string };
  experiments: { enabled?: string[]; resourceFingerprint?: string; cacheKey: string };
  results: ProbeResult[];
  invalidatedBy: string[];
}
```

## 执行策略

1. 在资源加载完成前读取公开环境元数据，生成候选清单。
2. 在后台或加载阶段运行零实体/零声音/零输入的最小实验；没有官方离屏或测试接口的能力直接返回 `unknown`，不闪屏。
3. 将报告写入诊断导出而不是世界聊天；默认不记录账号、聊天、IP、跨平台 ID。
4. 缓存键包含客户端构建、适配器构建、资源指纹、实验玩法设置摘要、图形后端、画质和设备档位。任一变化使相关结果失效。
5. “当前恰好显示”只产生一次实验的 `minimal-experiment` 证据，不自动产生长期 `supported` 承诺；稳定支持还需要版本化官方文档或视觉黄金测试。

## 用户可读示例

```text
Bedrock Loom 本设备能力报告
发行形态：international / 1.21.x（适配器 international）
设备：mobile；图形后端 unknown；画质 medium
R0 资源模型：experimental（资源加载成功，未完成黄金截图）
R1 粒子：supported（白名单 + 最小实验通过）
R1 屏幕 action bar：supported
R1 世界空间 UI：unsupported（无公开通用提交接口）
R2 自定义 Shader：unsupported（无官方扩展点）
R3 原生渲染回调：unsupported（未获授权 SPI）
降级：世界 UI -> action bar；相机效果 -> no-op；Shader -> 预设资源
报告不代表跨版本兼容承诺。
```

## 探测断言

- 参数、权限、资源引用和预算错误不得改变世界。
- 重复创建/销毁句柄不增加活动对象。
- 进入/退出世界、维度切换、传送、断线、模组禁用后活动句柄为零。
- 低内存或资源缺失返回可解释状态，不重试风暴。
- 报告中的 `supported` 必须至少有一个可重复 API 或实验断言；`R2/R3` 还必须有正式 SDK/授权证据。
