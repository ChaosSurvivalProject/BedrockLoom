/**
 * render-intent/compositor-api.ts —— 外部合成器契约（platform-side）
 *
 * 合成器是独立进程 / 网页 / 透明窗口，可以在自己的 Canvas / WebGL 表面画三角形、
 * 画文字、做 2D 投影。这与「游戏内控制渲染管线」是两件事：
 *   - 允许：在合成器自己的像素缓冲里画；
 *   - 不允许：把像素写进游戏帧缓冲、Hook Present、改写 material.bin。
 *
 * 所有绘制都发生在平台侧，证据域为 platform-side，可达到 E4。
 */

import type {
  Result, CapabilityLabel, EvidenceLayer, ProjectApiStatus, EvidenceLevel,
  RenderIntent, CollectorFrame, Vec3, RenderStage, Rect
} from "./intent-types";

export type CompositorSurface =
  | "canvas"
  | "overlay-window"
  | "second-screen"
  | "resource-pack-texture";

/** 小地图投影输出：平台侧纯数学计算，不是游戏内场景更新。 */
export interface MinimapProjection {
  readonly center: Vec3;
  readonly radius: number;
  readonly points: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
    readonly kind: "player" | "entity" | "anchor";
  }[];
  readonly viewport: Rect;
  readonly clippedCount: number;
}

export interface CompositorFrame {
  readonly seq: number;
  readonly generatedAt: string;
  readonly intents: readonly RenderIntent[];
  readonly latestFrame: CollectorFrame | null;
  readonly droppedExpired: number;
  readonly degradedReason: string | null;
}

export interface Compositor {
  readonly surface: CompositorSurface;
  /** 接收采集帧；只更新数据，不产生像素 */
  ingest(frame: CollectorFrame): Result<CompositorFrame>;
  /** 接收意图；只入队，绘制由 drawFrame 统一进行，保证批量化 */
  submit(intent: RenderIntent): Result<CompositorFrame>;
  /** 在合成器自己的表面上绘制；drawFn 由宿主注入（Canvas / WebGL / 测试 stub） */
  drawFrame(drawFn: (frame: CompositorFrame) => void): Result<CompositorFrame>;
  /** 平台侧数学投影，用于小地图/监控屏；不涉及游戏视锥（FOV 不可读） */
  projectMinimap(radius: number, viewport: Rect): Result<MinimapProjection>;
  /** 导出 PNG 字节，供 texture-push 或资源包构建使用；不是截帧 */
  snapshot(): Result<Uint8Array>;
  /** 幂等销毁；退出世界后活动句柄必须为 0 */
  dispose(): Result<null>;
  readonly disposed: boolean;
}

export interface CompositorCapability {
  readonly api: string;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly stage: RenderStage | "none";
  readonly description: string;
  readonly reason: string;
}

export const COMPOSITOR_CONTRACT: readonly CompositorCapability[] = [
  {
    api: "compositor.canvas", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    description: "在外部 Canvas / WebGL 表面绘制 HUD、小地图、监控屏。",
    reason: "纯平台侧像素，自动化可测；不触及任何游戏渲染阶段。"
  },
  {
    api: "compositor.overlayWindow", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    description: "透明置顶窗口或第二屏显示合成结果。",
    reason: "外部进程窗口，由操作系统合成；不是游戏 Overlay 渲染层。"
  },
  {
    api: "compositor.snapshotPng", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    description: "把合成结果导出为 PNG 字节，交给 texture-push 或构建期资源。",
    reason: "导出的是合成器自己的缓冲，不是游戏帧缓冲截图。"
  },
  {
    api: "compositor.projectMinimap", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    description: "用采集帧里的位置做 2D 正交投影，输出小地图点位。",
    reason: "纯数学；未使用不可读的 FOV/near/far，不伪装成游戏视锥。"
  },
  {
    api: "compositor.injectPresent", label: "unsupported", layer: "custom-client",
    projectStatus: "Unavailable", evidence: "E0", stage: "FramePresent",
    description: "在 FramePresent 阶段注入像素或回调。",
    reason: "需要 Hook 未公开函数或注入二进制，属于验收硬门槛禁止项。"
  },
  {
    api: "compositor.readGameFramebuffer", label: "unsupported", layer: "custom-client",
    projectStatus: "Unavailable", evidence: "E0", stage: "PostProcess",
    description: "读取游戏帧缓冲做后处理。",
    reason: "国际版公开客户端无该能力；私有内存与固定偏移被明确禁止。"
  }
] as const;

/** 高频更新的批量化指标（docs/13 的性能预算在本层的具体化）。 */
export const COMPOSITOR_BUDGET = {
  /** 每帧最多合并的意图数，超出返回 resource-exhausted */
  maxIntentsPerFrame: 64,
  /** 相同 batchKey 的 HUD 意图合并为一个 */
  coalesceByBatchKey: true,
  /** 意图过期即丢弃，计入 droppedExpired */
  dropExpired: true,
  /** 单帧绘制回调超时（毫秒），超时返回 timeout 而不是阻塞 */
  drawTimeoutMs: 16
} as const;
