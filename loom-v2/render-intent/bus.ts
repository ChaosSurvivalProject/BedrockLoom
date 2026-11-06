/**
 * render-intent/bus.ts —— 跨进程意图总线契约
 *
 * 三条链路（全部只走本机回环或本地文件，不访问外部网络）：
 *   file : loom-v2/runtime/intent.jsonl，离线可用，stable
 *   sse  : Node 内置 http + 浏览器原生 EventSource，零依赖，stable
 *   ws   : Node 内置 http 手写 RFC6455 文本帧，零依赖，stable
 *
 * 明确不可用：
 *   in-game-direct —— 国际版客户端 Script API 无法直连 WS / 写文件，unsupported
 *
 * 「不联网」的定义：不访问任何外部域名或公网地址；127.0.0.1 回环是本机进程间通道，
 * 与「离线可用」不冲突。离线演示不依赖任何服务进程。
 */

import type {
  Result, CapabilityLabel, EvidenceLayer, ProjectApiStatus, EvidenceLevel,
  RenderIntent, CollectorFrame, IntentEnvelope
} from "./intent-types";

export type TransportKind = "file" | "sse" | "ws" | "in-game-direct" | "bds-http";

export interface TransportCapability {
  readonly kind: TransportKind;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly description: string;
  readonly reason: string;
}

export const TRANSPORT_CONTRACT: readonly TransportCapability[] = [
  {
    kind: "file", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4",
    description: "追加写 loom-v2/runtime/intent.jsonl；外部合成器轮询或导入，离线可用。",
    reason: "平台侧文件管道，有自动化读写与往返测试。"
  },
  {
    kind: "sse", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4",
    description: "Node 内置 http 提供 /events；浏览器原生 EventSource 订阅，零依赖。",
    reason: "平台侧本机回环，有集成测试。"
  },
  {
    kind: "ws", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4",
    description: "Node 内置 http 的 upgrade 事件实现 RFC6455 文本帧，仅绑定 127.0.0.1，零依赖。",
    reason: "平台侧本机回环，有握手与帧测试。"
  },
  {
    kind: "bds-http", label: "beta", layer: "in-game",
    projectStatus: "PlatformRestricted", evidence: "E2",
    description: "BDS 服务端可用 @minecraft/server-net 发 HTTP 到本地桥接器；不适用于国际版客户端单人模式。",
    reason: "仅服务端模块，客户端不可用；未经真机验证。"
  },
  {
    kind: "in-game-direct", label: "unsupported", layer: "in-game",
    projectStatus: "Unavailable", evidence: "E0",
    description: "游戏内脚本直连 localhost WS / 写本地文件 / 共享内存。",
    reason: "国际版 1.21.130 客户端 Script API 不提供网络与任意文件访问能力。"
  }
] as const;

/** 平台侧桥接器允许的数据来源。私有内存、注入、Hook 不在其中。 */
export type BridgeInputKind =
  | "bds-http-forward"
  | "world-save-readonly"
  | "dynamic-property-export"
  | "manual-paste"
  | "private-memory";

export interface BridgeInputCapability {
  readonly kind: BridgeInputKind;
  readonly label: CapabilityLabel;
  readonly layer: EvidenceLayer;
  readonly projectStatus: ProjectApiStatus;
  readonly evidence: EvidenceLevel;
  readonly description: string;
  readonly reason: string;
}

export const BRIDGE_INPUT_CONTRACT: readonly BridgeInputCapability[] = [
  {
    kind: "bds-http-forward", label: "beta", layer: "in-game",
    projectStatus: "PlatformRestricted", evidence: "E2",
    description: "BDS 侧把采集帧通过 HTTP POST 转发到 127.0.0.1 桥接器。",
    reason: "仅 BDS 可用；需真机验证。"
  },
  {
    kind: "world-save-readonly", label: "beta", layer: "platform-side",
    projectStatus: "Experimental", evidence: "E2",
    description: "只读解析世界存档中的公开状态（含 dynamic properties），有写盘延迟，不是每帧实时。",
    reason: "零侵入但非实时，且存档格式未经官方承诺稳定。"
  },
  {
    kind: "dynamic-property-export", label: "beta", layer: "in-game",
    projectStatus: "Experimental", evidence: "E2",
    description: "游戏内用 World.setDynamicProperty 写出帧，平台侧读取。",
    reason: "公开 API 但有容量上限与非实时特性，需真机复核。"
  },
  {
    kind: "manual-paste", label: "stable", layer: "platform-side",
    projectStatus: "Stable", evidence: "E4",
    description: "调试/人工验收时把采集 JSON 粘贴或导入合成器。",
    reason: "平台侧纯数据导入，可自动化测试。"
  },
  {
    kind: "private-memory", label: "unsupported", layer: "custom-client",
    projectStatus: "Unavailable", evidence: "E0",
    description: "读取游戏私有内存 / 固定偏移。",
    reason: "验收硬门槛禁止项，任何形式都不属于本项目。"
  }
] as const;

export interface Disposable {
  readonly dispose: () => void;
  readonly disposed: boolean;
}

export interface IntentBus {
  readonly kind: TransportKind;
  /** 追加一条采集帧或意图；超预算返回 resource-exhausted，非法内容返回 denied。 */
  publish(payload: CollectorFrame | RenderIntent): Promise<Result<IntentEnvelope>>;
  /** 订阅；返回可幂等销毁的句柄，退出世界后必须 forceRelease。 */
  subscribe(handler: (envelope: IntentEnvelope) => void): Result<Disposable>;
  /** 读取已缓冲的最近若干条，用于离线回放与崩溃恢复。 */
  recent(limit?: number): Result<readonly IntentEnvelope[]>;
  close(): Promise<Result<null>>;
}

export interface LocalBusOptions {
  readonly host?: "127.0.0.1";
  readonly port?: number;
  /** 仅允许本机回环；拒绝外部 Host 与非本机来源 */
  readonly loopbackOnly?: boolean;
  readonly maxBuffered?: number;
  readonly filePath?: string;
}

/** 显式列出：本层不提供的能力（供文档与静态扫描引用）。 */
export const BUS_FORBIDDEN = [
  "game-binary-injection", "private-memory-read", "present-hook", "framebuffer-capture"
] as const;
