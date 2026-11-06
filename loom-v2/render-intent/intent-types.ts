/**
 * render-intent/intent-types.ts —— 渲染意图层类型冻结（BedrockLoom v2.1.0）
 *
 * 定调：基岩版国际版 1.21.130 没有「渲染管线直连接口」。
 * 本模块不声明任何 render() / drawTriangle() / present() 之类的游戏内绘制调用，
 * 只声明「数据（采集帧）」与「意图（RenderIntent）」，最终像素由外部合成器负责。
 *
 * 三层：platform-side（外部进程/网页可画）、in-game（Script API + 资源包 + UI 只能产生数据）、
 *       custom-client（明确拒绝，本仓库不实现）。
 * 模块标签：stable / beta / unsupported；映射到项目七态见 capability-table.ts。
 */

// ---------------------------------------------------------------------------
// 1. 七态结果：与 ../../core/result.mjs 的 Status 一一对应，不另起一套语义
// ---------------------------------------------------------------------------
export type ResultStatus =
  | "ok"
  | "partial"
  | "unsupported"
  | "denied"
  | "timeout"
  | "resource-exhausted"
  | "degraded";

export const RESULT_STATUSES: readonly ResultStatus[] = [
  "ok", "partial", "unsupported", "denied", "timeout", "resource-exhausted", "degraded"
] as const;

export interface Result<T> {
  readonly status: ResultStatus;
  readonly value?: T;
  readonly code?: string;
  readonly message?: string;
  readonly reason?: string;
  readonly fallback?: string;
  readonly recoverable?: boolean;
}

// ---------------------------------------------------------------------------
// 2. 能力分级
// ---------------------------------------------------------------------------
/** 模块内标签（本扩展专用，用户提示词要求）。 */
export type CapabilityLabel = "stable" | "beta" | "unsupported";

/** 项目冻结定义的七种 API 状态（docs/01-freeze-definition.md）。 */
export type ProjectApiStatus =
  | "Stable"
  | "Candidate"
  | "Experimental"
  | "BuildTimeOnly"
  | "PlatformRestricted"
  | "CustomClientOnly"
  | "Unavailable";

export type EvidenceLayer = "platform-side" | "in-game" | "custom-client";
export type EvidenceLevel = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

/** 项目冻结定义中的十个渲染阶段。本层不新增任何阶段的介入能力。 */
export type RenderStage =
  | "ResourceBuild" | "ResourceLoad" | "SimulationSync" | "SceneUpdate"
  | "CullAndSort" | "GeometrySubmit" | "RenderLayer" | "PostProcess"
  | "UiDraw" | "FramePresent";

// ---------------------------------------------------------------------------
// 3. 基础几何类型
// ---------------------------------------------------------------------------
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface AABB { readonly min: Vec3; readonly max: Vec3 }
export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

// ---------------------------------------------------------------------------
// 4. 采集帧类型（in-game 只产生数据，不画像素）
// ---------------------------------------------------------------------------
export interface CameraFrame {
  readonly schema: "bedrockloom.collector.camera/v1";
  readonly tick: number;
  readonly capturedAt: string;
  readonly dimensionId: string;
  /** Player.location（公开 API） */
  readonly position: Vec3;
  /** Player.getViewDirection()（公开 API） */
  readonly viewDirection: Vec3;
  /** Player.getRotation()（公开 API） */
  readonly rotation: { readonly x: number; readonly y: number };
  /** 官方无公开读取接口，恒为 null；不得用猜测值填充 */
  readonly fovDegrees: number | null;
  /** 官方无公开读取接口，恒为 null */
  readonly near: number | null;
  /** 官方无公开读取接口，恒为 null */
  readonly far: number | null;
  readonly unreadableFields: readonly ("fovDegrees" | "near" | "far")[];
  readonly precision: "exact" | "approximate";
}

export interface EntityBrief {
  readonly id: string;
  readonly typeId: string;
  readonly dimensionId: string;
  /** Entity.location（公开 API） */
  readonly position: Vec3;
  /** 官方无包围盒读取接口，恒为 null；估算值必须写进 boundsSource */
  readonly bounds: AABB | null;
  readonly boundsSource: "unavailable" | "estimated";
  readonly tags: readonly string[];
}

export interface BlockBrief {
  readonly x: number; readonly y: number; readonly z: number; readonly typeId: string;
}

export interface ChunkSample {
  readonly schema: "bedrockloom.collector.chunk/v1";
  readonly x: number;
  readonly z: number;
  readonly dimensionId: string;
  readonly yRange: readonly [number, number];
  /** Dimension.getBlock() 逐方块读取（公开 API），受预算限制 */
  readonly blocks: readonly BlockBrief[];
  readonly sampleCount: number;
  readonly budget: { readonly maxBlocks: number; readonly maxBytes: number };
  readonly truncated: boolean;
}

/** 视锥：依赖 FOV，官方不可读，因此该类型只用于说明 unsupported 结论。 */
export interface ViewFrustum {
  readonly fovDegrees: number;
  readonly near: number;
  readonly far: number;
  readonly planes: readonly number[];
}

export type FrameSource =
  | "in-game-script-api"
  | "bds-http"
  | "world-save-readonly"
  | "manual"
  | "synthetic-demo";

export interface CollectorFrame {
  readonly schema: "bedrockloom.collector.frame/v1";
  readonly tick: number;
  readonly capturedAt: string;
  readonly camera: CameraFrame | null;
  readonly entities: readonly EntityBrief[];
  readonly source: FrameSource;
  /** 必须列出的限制说明，例如「FOV 不可读」「包围盒不可读」 */
  readonly caveats: readonly string[];
}

// ---------------------------------------------------------------------------
// 5. RenderIntent 判别联合（四种，恰好对应用户提示词）
// ---------------------------------------------------------------------------
export interface IntentBase {
  readonly schema: "bedrockloom.render-intent/v1";
  readonly id: string;
  readonly createdAt: string;
  /** 过期意图必须被合成器丢弃，避免把陈旧数据画成当前画面 */
  readonly ttlMs: number;
  readonly sourceLayer: EvidenceLayer;
  readonly requestId?: string;
}

export interface HudIntent extends IntentBase {
  readonly type: "hud";
  readonly payload: {
    readonly elementId: string;
    readonly rect: Rect;
    readonly content: { readonly kind: "text" | "html" | "canvas"; readonly data: string };
    readonly anchor: "screen" | "safe-area";
    /** 高频更新必须按 batchKey 合并，给出测试指标 */
    readonly batchKey?: string;
  };
}

export interface TexturePush extends IntentBase {
  readonly type: "texture-push";
  readonly payload: {
    /** 例如 dynamic://external-screen */
    readonly slot: string;
    readonly mime: "image/png";
    readonly pngBase64: string;
    readonly width?: number;
    readonly height?: number;
    /** compositor：只画在外部窗口；resource-pack-build：只生成构建期资源，不代表运行时替换 */
    readonly target: "compositor" | "resource-pack-build";
  };
}

export interface WorldAnchor extends IntentBase {
  readonly type: "world-anchor";
  readonly payload: {
    readonly anchorId: string;
    readonly position: Vec3;
    readonly dimensionId: string;
    readonly billboard: boolean;
    readonly textureSlot: string;
    readonly maxDistance?: number;
  };
}

export interface OverlayIntent extends IntentBase {
  readonly type: "overlay";
  readonly payload: {
    readonly zIndex: number;
    readonly opacity: number;
    readonly clickThrough: boolean;
    readonly surface: "overlay-window" | "second-screen" | "canvas";
    readonly safeArea: boolean;
  };
}

export type RenderIntent = HudIntent | TexturePush | WorldAnchor | OverlayIntent;
export type RenderIntentType = RenderIntent["type"];

export const RENDER_INTENT_TYPES: readonly RenderIntentType[] = [
  "hud", "texture-push", "world-anchor", "overlay"
] as const;

/** 总线传输信封：采集帧与意图走同一条通道，但 channel 明确区分「数据」与「命令」。 */
export interface IntentEnvelope {
  readonly schema: "bedrockloom.intent-envelope/v1";
  readonly seq: number;
  readonly channel: "frame" | "intent";
  readonly payload: CollectorFrame | RenderIntent;
}

// ---------------------------------------------------------------------------
// 6. 预算与常量（超出即返回 resource-exhausted / degraded，不静默截断）
// ---------------------------------------------------------------------------
export const INTENT_LIMITS = {
  /** 单条意图/帧序列化后最大字节数 */
  maxPayloadBytes: 64 * 1024,
  /** 单帧最多实体数 */
  maxEntitiesPerFrame: 128,
  /** 单次区块采样最多方块数 */
  maxBlocksPerChunkSample: 256,
  /** 采集频率：每 10 tick */
  tickInterval: 10,
  /** 意图默认存活时间 */
  defaultTtlMs: 2000,
  /** 动态属性字符串上限的保守值（真机需复核） */
  dynamicPropertySafeBytes: 16 * 1024
} as const;

// ---------------------------------------------------------------------------
// 7. 明确不存在的伪接口：只作为「禁止声明」的类型常量，不提供任何调用签名
// ---------------------------------------------------------------------------
export type ForbiddenGameApi =
  | "render.drawTriangle"
  | "render.setMaterial"
  | "render.present"
  | "render.hookPresent"
  | "render.setRenderLayer"
  | "render.readFramebuffer"
  | "render.writeMaterialBin"
  | "runtimeTextureSwap";

export const FORBIDDEN_GAME_APIS: readonly ForbiddenGameApi[] = [
  "render.drawTriangle", "render.setMaterial", "render.present", "render.hookPresent",
  "render.setRenderLayer", "render.readFramebuffer", "render.writeMaterialBin", "runtimeTextureSwap"
] as const;
