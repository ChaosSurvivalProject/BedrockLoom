/**
 * render-intent/pack-bridge.ts —— 资源包投影契约（附加包层）
 *
 * 关键区分：
 *   构建期：把 Canvas 导出的 PNG 写成资源包纹理、生成 texture_list.json 与引用定义 → 可做（stable）。
 *   运行期：用 Script API 替换已加载纹理、动态改 material.bin、创建任意公告板 → 不可做（unsupported）。
 *
 * Deferred Technical Preview / Vibrant Visuals 的 PBR、点光源、体积雾、色调映射、SSR
 * 属于「实验性资源包配置」，不是公开 Script API，也不是运行时调用；标 beta 并注明需实验开关、
 * 不承诺跨设备可用。绝不写成 loom.pack.updateLight() 能实时改场景光照。
 */

import type {
  Result, CapabilityLabel, EvidenceLayer, ProjectApiStatus, EvidenceLevel,
  RenderStage, Vec3
} from "./intent-types";

export interface TextureBinding {
  /** dynamic://external-screen 等逻辑槽位 */
  readonly slot: string;
  /** 资源包内相对路径，例如 textures/loom/external-screen.png（槽位名中的连字符被保留） */
  readonly packPath: string;
  readonly sha256: string;
  readonly bytes: number;
  /** 只有构建期产物，运行期不可替换 */
  readonly phase: "build-time";
}

export interface BillboardDefinition {
  readonly anchorId: string;
  readonly position: Vec3;
  readonly dimensionId: string;
  readonly billboard: boolean;
  readonly textureSlot: string;
  /** 需要预先存在的资源包 geometry / attachable / entity 定义 */
  readonly requiresPrebuiltGeometry: true;
}

export interface LightPackIntent {
  /** 实验性资源参数目标（biomes / atmospherics / lighting 配置文件） */
  readonly target: "vibrant-visuals-atmospherics" | "deferred-pbr-resource" | "fog-resource";
  readonly parameters: Readonly<Record<string, number | string | boolean>>;
  readonly experimental: true;
  readonly requiresToggle: string;
  readonly runtimeEffect: false;
}

export interface PackBridgeCapability {
  readonly api: string;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly stage: RenderStage | "none";
  readonly description: string;
  readonly reason: string;
}

/**
 * loom.pack.* —— 把外部画面投影成资源包内容；不是运行时渲染 API。
 * 只描述契约，底层生成逻辑在 core/pack-bridge.mjs（平台侧纯逻辑，有测试）。
 */
export interface LoomPackApi {
  /** stable / BuildTimeOnly：把 PNG 写入资源包并生成引用，返回可校验的绑定。 */
  bindTexture(slot: string, pngBytes: Uint8Array): Result<TextureBinding>;
  /** beta：生成公告板实体所需的资源定义；需要预建 geometry，不承诺运行时动态纹理。 */
  spawnBillboard(position: Vec3, slot: string, dimensionId: string): Result<BillboardDefinition>;
  /** beta：生成实验性光照/大气资源参数；不是运行时点光源提交。 */
  updateLight(spec: LightPackIntent): Result<LightPackIntent>;
  /** unsupported：运行时替换已加载纹理。 */
  runtimeTextureSwap(slot: string, pngBytes: Uint8Array): Result<never>;
  /** unsupported：改写 material.bin。用户明确要求不在 BedrockLoom 范围内。 */
  writeMaterialBin(bytes: Uint8Array): Result<never>;
}

export const PACK_BRIDGE_CONTRACT: readonly PackBridgeCapability[] = [
  {
    api: "loom.pack.bindTexture", label: "stable", layer: "platform-side",
    projectStatus: "BuildTimeOnly", evidence: "E4", stage: "ResourceBuild",
    description: "构建期把合成器 PNG 写成资源包纹理并生成 texture_list.json 引用。",
    reason: "平台侧文件生成，自动化可测；只影响 ResourceBuild，不控制加载后的管线。"
  },
  {
    api: "loom.pack.spawnBillboard", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "ResourceBuild",
    description: "生成公告板实体所需的资源定义；运行时仍需 Script API 生成已定义实体。",
    reason: "依赖预建 geometry/attachable，且运行期动态纹理不可用；未经真机验证。"
  },
  {
    api: "loom.pack.updateLight", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "ResourceBuild",
    description: "生成 Vibrant Visuals / Deferred 实验资源参数（大气、PBR、雾、色调映射）。",
    reason: "实验性资源包配置，非公开 Script API；需实验开关，不承诺跨设备，runtimeEffect=false。"
  },
  {
    api: "loom.pack.runtimeTextureSwap", label: "unsupported", layer: "in-game",
    projectStatus: "Unavailable", evidence: "E0", stage: "ResourceLoad",
    description: "游戏运行时替换已加载纹理。",
    reason: "国际版 1.21.130 公开 Script API 无运行时纹理上传接口。"
  },
  {
    api: "loom.pack.writeMaterialBin", label: "unsupported", layer: "custom-client",
    projectStatus: "Unavailable", evidence: "E0", stage: "GeometrySubmit",
    description: "改写 material.bin / 自定义 Shader。",
    reason: "需要改写游戏资源与绕过资源校验，属验收硬门槛禁止项；用户明确排除。"
  }
] as const;

/** 延迟渲染实验项：全部是资源包参数，不是渲染管线控制。 */
export interface DeferredResourceCapability {
  readonly item: string;
  readonly label: CapabilityLabel;
  readonly note: string;
}

export const DEFERRED_RESOURCE_CONTRACT: readonly DeferredResourceCapability[] = [
  { item: "Deferred Technical Preview 开关", label: "beta", note: "实验开关，官方未承诺稳定；需真机确认。" },
  { item: "PBR 材质资源", label: "beta", note: "资源包配置，构建期产物。" },
  { item: "点光源 / 发光板资源", label: "beta", note: "资源定义，不是运行时点光源提交；不得用粒子假光冒充。" },
  { item: "体积雾 / 色调映射 / SSR 资源", label: "beta", note: "实验资源参数，效果未经视觉黄金测试验证。" },
  { item: "把外部画面预渲染成 cubemap / 天空盒", label: "beta", note: "平台侧预渲染 PNG → 资源包贴图，构建期投影。" },
  { item: "运行时自定义 Shader pass", label: "unsupported", note: "无公开接口，需注入二进制，明确拒绝。" }
] as const;

/** 逻辑槽位到资源包路径的确定性映射规则。 */
export const SLOT_PREFIX = "dynamic://" as const;
