/**
 * render-intent/capability-table.ts —— 能力审计表（权威汇总）
 *
 * 本表把采集 / 总线 / 桥接 / 意图 / 合成器 / 资源包投影六组接口统一成一张可判定表。
 * 每条都带：模块标签 stable|beta|unsupported、证据层、项目七态、证据级别、渲染阶段、
 * 审计理由。unsupported 行必须有非空 reason；beta 行不得标成项目 Stable。
 *
 * 与 core/capability.mjs 的 JS 表字段一一对应（test/render-intent.test.mjs 会做一致性断言）。
 */

import type {
  CapabilityLabel, EvidenceLayer, ProjectApiStatus, EvidenceLevel,
  RenderStage, ResultStatus
} from "./intent-types";
import { RENDER_COLLECTOR_CONTRACT } from "./collector";
import { TRANSPORT_CONTRACT, BRIDGE_INPUT_CONTRACT } from "./bus";
import { COMPOSITOR_CONTRACT } from "./compositor-api";
import { PACK_BRIDGE_CONTRACT } from "./pack-bridge";

export interface CapabilityRow {
  readonly id: string;
  readonly api: string;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly stage: RenderStage | "none";
  readonly summary: string;
  readonly reason: string;
}

/** 模块标签 → 项目七态的默认映射；例外在各行 projectStatus 里显式写出。 */
export const LABEL_TO_PROJECT_STATUS: Readonly<Record<CapabilityLabel, ProjectApiStatus>> = {
  stable: "Stable",
  beta: "Experimental",
  unsupported: "Unavailable"
} as const;

/** 模块标签 → 本仓库可达到的证据级别上限。 */
export const LABEL_TO_EVIDENCE_CEILING: Readonly<Record<CapabilityLabel, EvidenceLevel>> = {
  stable: "E4",
  beta: "E2",
  unsupported: "E0"
} as const;

/** loom.intent.* —— 跨进程意图提交契约（平台侧，可自动化验证）。 */
export const INTENT_API_CONTRACT: readonly CapabilityRow[] = [
  {
    id: "RI-I01", api: "loom.intent.hud", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    summary: "向外部合成器提交 HUD 元素（id / rect / text|html|canvas / 批量键）。",
    reason: "提交的是意图数据，像素由合成器绘制；不调用游戏内 ScreenDisplay。"
  },
  {
    id: "RI-I02", api: "loom.intent.texture", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    summary: "把 PNG Base64 推给合成器或构建期资源生成器（slot: dynamic://...）。",
    reason: "target=compositor 只影响外部窗口；target=resource-pack-build 只生成构建期文件。"
  },
  {
    id: "RI-I03", api: "loom.intent.worldAnchor", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    summary: "登记世界坐标锚点与贴图槽位，供合成器做正交投影或资源包生成。",
    reason: "锚点是数据；游戏内是否可见取决于预建资源定义，标 beta 且未经真机验证。"
  },
  {
    id: "RI-I04", api: "loom.intent.overlay", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4", stage: "none",
    summary: "声明外部叠加层的 zIndex / opacity / clickThrough / safeArea。",
    reason: "作用于外部窗口，由操作系统合成；不是游戏 Overlay 渲染层。"
  },
  {
    id: "RI-I05", api: "loom.intent.gameDraw", label: "unsupported", layer: "in-game",
    projectStatus: "Unavailable", evidence: "E0", stage: "GeometrySubmit",
    summary: "试图在游戏内直接绘制三角形 / 写入场景对象。",
    reason: "国际版 1.21.130 无 render() 公开接口；伪造该能力违反定调与验收硬门槛。"
  }
] as const;

const collectorRows: readonly CapabilityRow[] = RENDER_COLLECTOR_CONTRACT.map((r, i) => ({
  id: `RI-C${String(i + 1).padStart(2, "0")}`,
  api: r.api, label: r.label, layer: r.layer, projectStatus: r.projectStatus,
  evidence: r.evidence, stage: r.stage, summary: r.sourceApi, reason: r.note
}));

const transportRows: readonly CapabilityRow[] = TRANSPORT_CONTRACT.map((r, i) => ({
  id: `RI-B${String(i + 1).padStart(2, "0")}`,
  api: `bus.${r.kind}`, label: r.label, layer: r.layer, projectStatus: r.projectStatus,
  evidence: r.evidence, stage: "none", summary: r.description, reason: r.reason
}));

const bridgeRows: readonly CapabilityRow[] = BRIDGE_INPUT_CONTRACT.map((r, i) => ({
  id: `RI-BR${String(i + 1).padStart(2, "0")}`,
  api: `bridge.${r.kind}`, label: r.label, layer: r.layer, projectStatus: r.projectStatus,
  evidence: r.evidence, stage: "none", summary: r.description, reason: r.reason
}));

const compositorRows: readonly CapabilityRow[] = COMPOSITOR_CONTRACT.map((r, i) => ({
  id: `RI-CP${String(i + 1).padStart(2, "0")}`,
  api: r.api, label: r.label, layer: r.layer, projectStatus: r.projectStatus,
  evidence: r.evidence, stage: r.stage, summary: r.description, reason: r.reason
}));

const packRows: readonly CapabilityRow[] = PACK_BRIDGE_CONTRACT.map((r, i) => ({
  id: `RI-P${String(i + 1).padStart(2, "0")}`,
  api: r.api, label: r.label, layer: r.layer, projectStatus: r.projectStatus,
  evidence: r.evidence, stage: r.stage, summary: r.description, reason: r.reason
}));

export const CAPABILITY_TABLE: readonly CapabilityRow[] = [
  ...collectorRows, ...transportRows, ...bridgeRows,
  ...INTENT_API_CONTRACT, ...compositorRows, ...packRows
];

/** 表级自检：返回错误列表，空数组表示全部合规。 */
export function auditCapabilityTable(rows: readonly CapabilityRow[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const r of rows) {
    if (ids.has(r.id)) errors.push(`重复 id: ${r.id}`);
    ids.add(r.id);
    if (r.label === "unsupported" && r.reason.trim().length === 0) {
      errors.push(`${r.id} unsupported 缺少审计理由`);
    }
    if (r.label === "beta" && r.projectStatus === "Stable") {
      errors.push(`${r.id} beta 不得标为项目 Stable`);
    }
    if (r.label === "stable" && r.layer !== "platform-side") {
      errors.push(`${r.id} stable 只能出现在 platform-side`);
    }
    if (r.label === "unsupported" && r.evidence !== "E0" && r.evidence !== "E1") {
      errors.push(`${r.id} unsupported 的证据级别不得高于 E1`);
    }
    if (/render\.(drawTriangle|present|setMaterial|hookPresent)/.test(r.api)) {
      errors.push(`${r.id} 出现被禁止的伪接口声明`);
    }
  }
  return errors;
}

/** 七态结果在本模块中的使用约束（与 core/result.mjs 相同，不另起语义）。 */
export const RESULT_STATUS_USAGE: Readonly<Record<ResultStatus, string>> = {
  ok: "平台侧契约完整完成",
  partial: "部分字段可用（例如区块采样被预算截断，但已明确报告）",
  unsupported: "国际版公开客户端无实现路径",
  denied: "非法输入 / 越权 / 路径穿越 / 未列入清单",
  timeout: "采集或绘制回调超时",
  "resource-exhausted": "实体数 / 方块数 / payload 字节数超预算",
  degraded: "可读字段缺失（FOV、包围盒、视锥），必须附带 fallback 与 reason"
} as const;
