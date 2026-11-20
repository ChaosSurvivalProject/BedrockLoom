/**
 * loom 全局对象（游戏内合规层，中文注释）。
 *
 * 设计要点：
 * - 公开 Script API 通过 createLoom(host) 注入适配器，不直接 import 游戏模块；
 * - 能力探测逐项检查 host 绑定，不靠客户端版本号盲猜；
 * - 不 import 任何 node:*；不写任何私有符号/偏移/Hook；
 * - 不声明任何「直接控制渲染管线」的接口。
 */

import { Status, ok } from "./result.js";
import { createRenderApi } from "./api-render.js";
import { createWorldApi } from "./api-world.js";
import { createAssetsApi } from "./api-assets.js";
import { createRuntime } from "./loom-runtime.js";
import { BRIDGE_CONTRACT, createBridge } from "./ws-bridge-protocol.js";

export const LOOM_VERSION = "0.1.0-research";
export const LOOM_LAYER = "in-game-compliant";

/** 探测项：只检查「有没有绑定」，不读取版本、不猜能力。 */
export const PROBE_KEYS = Object.freeze([
  "getPlayerView", "listEntities", "sampleChunk",
  "setActionBar", "showForm", "spawnParticle", "playSound",
  "setRayleighStrength", "setSunMieStrength", "resetAtmospherics",
  "bindAsset", "readAsset"
]);

export function probeHost(host = {}) {
  const rows = PROBE_KEYS.map((key) => Object.freeze({
    key,
    available: typeof host?.[key] === "function",
    // 只有绑定存在才算「可调用」；仍不代表画面结果，见 caveats
    impliesVisualResult: false
  }));
  return Object.freeze({
    version: LOOM_VERSION,
    layer: LOOM_LAYER,
    available: rows.filter((r) => r.available).map((r) => r.key),
    unavailable: rows.filter((r) => !r.available).map((r) => r.key),
    rows: Object.freeze(rows),
    note: "能力探测只看适配器绑定，不读取客户端版本、不推断渲染能力"
  });
}

/**
 * 创建 loom 全局对象。
 * @param {object} host 作者本机 BP 注入的公开 Script API 适配器（不进本仓库）
 */
export function createLoom(host = {}) {
  const probe = probeHost(host);
  return Object.freeze({
    version: LOOM_VERSION,
    layer: LOOM_LAYER,
    probe,
    render: createRenderApi(host),
    world: createWorldApi(host),
    assets: createAssetsApi(host),
    runtime: createRuntime(host),
    bridge: createBridge(host),
    caveats: Object.freeze([
      "本层只产生数据/提交请求/设置参数；执行权归游戏客户端，ok 不等于画面可见",
      "FH-1: 客户端 Script API 无 WebSocket / 文件写入能力（见 bridge.contract）",
      "FH-2: FOV/near/far/视锥/包围盒不可读，恒 null",
      "FH-3: 运行时动态纹理替换、自定义 shader、帧缓冲后处理 = Unavailable",
      "FH-4: 所有跨进程桥接方案未经真机验证",
      "本层不进入主项目 Stable 评级，只存在于 research 分支"
    ]),
    /** 供诊断使用，不含任何账号/坐标/令牌。 */
    describe() {
      return ok(Object.freeze({
        version: LOOM_VERSION, layer: LOOM_LAYER,
        probeAvailable: probe.available.length,
        bridgeDirectWs: BRIDGE_CONTRACT.directWebSocketFromScriptApi,
        status: Status.OK
      }));
    }
  });
}
