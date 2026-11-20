/**
 * 本机 WS bridge 协议常量与**否定声明**（游戏内合规层，中文注释）。
 *
 * 硬事实：基岩版客户端 Script API 没有 WebSocket 能力，也没有任意文件写入能力。
 * 因此「游戏内脚本直连 ws://127.0.0.1」不成立；emitIntent 恒返回 unsupported。
 * 跨进程桥接（平台侧总线 + 作者本机桥接 / BDS @minecraft/server-net 可选）一律标注「未经真机验证」。
 */

import { Status, fail } from "./result.js";

export const BRIDGE_CONTRACT = Object.freeze({
  schema: "bedrockloom.research.ws-bridge/v1",
  directWebSocketFromScriptApi: false,
  reason: "基岩版客户端 Script API 无 WebSocket / 任意文件写入能力",
  loopbackOnly: true,
  loopbackHost: "127.0.0.1",
  verification: "未经真机验证",
  compliantPath: "游戏内产出纯数据意图 → 平台侧本机总线（127.0.0.1）→ 外部合成器",
  optionalPath: "BDS 侧 @minecraft/server-net 转发（可选模块，单人模式不依赖）",
  forbiddenInGame: Object.freeze([
    "direct WebSocket connection", "arbitrary file write", "process injection",
    "native module load", "frame write-back to game swap chain"
  ]),
  layer: "in-game-compliant",
  note: "本对象只描述协议边界，不建立任何连接、不打开任何端口"
});

export const INTENT_KINDS = Object.freeze([
  "hud", "world-anchor", "texture-push", "overlay", "camera-frame", "entity-frame"
]);

export function createBridge(host = {}) {
  return Object.freeze({
    contract: BRIDGE_CONTRACT,
    kinds: INTENT_KINDS,

    /**
     * 游戏内直接发意图：恒不支持。
     * 不是「暂未实现」，而是「该能力在官方客户端不存在」。
     */
    emitIntent() {
      return fail(Status.UNSUPPORTED, "E_NO_DIRECT_WS",
        "游戏内 Script API 不能直连本机 WS；需平台侧桥接且该链路未经真机验证",
        { ...BRIDGE_CONTRACT });
    },

    /** 只读说明，便于诊断包展示。 */
    describe() {
      return Object.freeze({
        directWs: BRIDGE_CONTRACT.directWebSocketFromScriptApi,
        loopbackHost: BRIDGE_CONTRACT.loopbackHost,
        verification: BRIDGE_CONTRACT.verification,
        hostBindingsPresent: Object.keys(host ?? {}).length
      });
    }
  });
}
