/**
 * render-intent/collector.ts —— 游戏内采集契约（只描述签名，不在本文件实现底层）
 *
 * 重要事实（不得回避）：国际版客户端的 Script API 只能读取公开状态，
 * 没有 WebSocket、没有任意文件写入、没有 localhost 网络访问能力。
 * 因此「游戏内每 10 tick 直连本地 WS」这条链路在国际版客户端单人模式下不成立，
 * 必须由平台侧桥接器把公开状态转进总线，见 bus.ts 的 BRIDGE_INPUT_CONTRACT。
 *
 * 实现位置：collector/behavior-pack-collector.js（可放进行为包，标 beta，未经真机验证）。
 */

import type {
  Result, CapabilityLabel, EvidenceLayer, ProjectApiStatus, EvidenceLevel,
  CameraFrame, EntityBrief, ChunkSample, CollectorFrame, ViewFrustum,
  RenderStage, Vec3, AABB
} from "./intent-types";

export interface EntityFilter {
  readonly typeIds?: readonly string[];
  readonly tags?: readonly string[];
  /** 以玩家位置为中心的半径；超出预算返回 resource-exhausted */
  readonly radius?: number;
  readonly maxEntities?: number;
  readonly dimensionId?: string;
}

export interface ChunkQuery {
  readonly dimensionId?: string;
  readonly yRange?: readonly [number, number];
  readonly maxBlocks?: number;
  readonly maxBytes?: number;
}

/** 客户端不存在的目的地；publish 恒返回 unsupported，保留签名只为说明边界。 */
export type UnsupportedTransportTarget =
  | "localhost-ws-from-script-api"
  | "local-file-from-script-api"
  | "shared-memory";

export interface CollectorCapability {
  readonly api: string;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly stage: RenderStage | "none";
  readonly sourceApi: string;
  readonly note: string;
}

/**
 * loom.render.* —— 只采集，不绘制。
 * 所有返回都是 Result，失败时携带七态语义而不是抛异常。
 */
export interface LoomRenderApi {
  /** beta：位置/朝向/旋转可读；FOV、near、far 官方不可读，恒为 null，返回 degraded。 */
  camera(player: unknown): Promise<Result<CameraFrame>>;
  /** beta：实体与位置可读；包围盒不可读，bounds 为 null，返回 degraded。 */
  entities(filter: EntityFilter): Promise<Result<readonly EntityBrief[]>>;
  /** beta：Dimension.getBlock() 逐方块采样；超预算返回 resource-exhausted，不静默截断。 */
  chunk(x: number, z: number, query?: ChunkQuery): Promise<Result<ChunkSample>>;
  /** unsupported：视锥依赖 FOV，官方无公开读取接口。 */
  playerView(): Result<ViewFrustum>;
  /** unsupported：客户端 Script API 无法直连 WS / 写文件 / 共享内存。 */
  publish(target: UnsupportedTransportTarget, frame: CollectorFrame): Result<never>;
  /** beta：把采集帧写进 World.setDynamicProperty，供平台侧桥接器读取（有容量上限）。 */
  writeDynamicProperty(frame: CollectorFrame): Result<{ readonly key: string; readonly bytes: number }>;
}

export const RENDER_COLLECTOR_CONTRACT: readonly CollectorCapability[] = [
  {
    api: "loom.render.camera", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "none",
    sourceApi: "Player.location / getViewDirection() / getRotation() / Dimension.id",
    note: "FOV、near、far 无公开读取接口，恒为 null；结果状态为 degraded，不是 ok。"
  },
  {
    api: "loom.render.entities", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "none",
    sourceApi: "Dimension.getEntities(EntityQueryOptions) / Entity.location / getTags()",
    note: "无包围盒读取接口；bounds 恒为 null，boundsSource 为 unavailable。"
  },
  {
    api: "loom.render.chunk", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "none",
    sourceApi: "Dimension.getBlock()",
    note: "逐方块读取成本高；maxBlocks/maxBytes 超出即 resource-exhausted，truncated 不得静默置 true。"
  },
  {
    api: "loom.render.playerView", label: "unsupported", layer: "in-game",
    projectStatus: "Unavailable", evidence: "E0", stage: "none",
    sourceApi: "无",
    note: "视锥需要 FOV / near / far；国际版 1.21.130 公开 Script API 不提供，不得用猜测值伪装。"
  },
  {
    api: "loom.render.publish", label: "unsupported", layer: "in-game",
    projectStatus: "Unavailable", evidence: "E0", stage: "none",
    sourceApi: "无",
    note: "客户端 Script API 无 WebSocket / 任意文件写入 / 共享内存；必须由平台侧桥接。"
  },
  {
    api: "loom.render.writeDynamicProperty", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2", stage: "SimulationSync",
    sourceApi: "World.setDynamicProperty()",
    note: "公开 API，但有字符串容量上限且非实时；属于数据写出，不是渲染提交。"
  }
] as const;

/** 采集帧里必须显式记录的不可读字段，防止上层用默认值伪造。 */
export const UNREADABLE_CAMERA_FIELDS = ["fovDegrees", "near", "far"] as const;

/** 包围盒：官方不可读。若上层自行估算，必须把 boundsSource 标为 estimated 并随帧附带说明。 */
export const BOUNDS_POLICY: Readonly<{
  officialBoundsAvailable: false;
  fallback: "null";
  estimatedRequiresCaveat: true;
}> = { officialBoundsAvailable: false, fallback: "null", estimatedRequiresCaveat: true } as const;

/** 类型占位：供测试与文档引用，不表示存在该能力。 */
export type UnreadableGeometry = { readonly aabb: AABB | null; readonly position: Vec3 };
