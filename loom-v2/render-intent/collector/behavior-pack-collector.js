/**
 * behavior-pack-collector.js —— 游戏内采集脚本（beta，未经 1.21.130 真机验证）
 *
 * 放置方式：把本文件放进行为包 scripts/ 目录，由 main.js import 后调用 start()。
 * 采集频率：每 10 tick。只读取公开 Script API 状态，产生「数据」，不画任何像素。
 *
 * ============================ 必须说清的边界 ============================
 * 1. 国际版 1.21.130 客户端 Script API 没有 WebSocket、没有任意文件写入、
 *    没有 localhost 网络访问能力。本脚本【不能】直连本地 WS 或写 intent.jsonl。
 * 2. 采集结果通过 World.setDynamicProperty() 写出（公开 API，有字符串容量上限、
 *    非实时），再由平台侧桥接器送入总线，见 docs/14-render-intent.md 的三条链路。
 * 3. Player.getViewDirection() / getRotation() / location 是公开接口；
 *    FOV、near、far、实体包围盒没有公开读取接口，本脚本一律写 null，
 *    绝不填猜测值。playerView() 因此判定为 unsupported。
 * 4. 本脚本不读私有内存、不依赖固定偏移、不访问任何私有模块、不发送网络请求。
 * 5. 状态标签：beta（模块内）/ Experimental（项目七态）/ E2（官方文档证据上限）。
 *
 * 真机验收步骤见 loom-v2/docs/13-testing-and-budgets.md 的 S1–S8 探针。
 * =====================================================================
 */

import { world, system } from "@minecraft/server";

export const DYNAMIC_PROPERTY_KEY = "bedrockloom:ri.frame";
export const COLLECT_INTERVAL_TICKS = 10;
export const SAFE_BYTES = 16 * 1024;       // 保守上限，真机需复核官方限制
export const MAX_ENTITIES = 128;
export const ENTITY_RADIUS = 48;

const CAMERA_SCHEMA = "bedrockloom.collector.camera/v1";
const FRAME_SCHEMA = "bedrockloom.collector.frame/v1";

/** 采集一帧。返回七态结果对象；不抛异常、不静默截断不可读字段。 */
export function collectOnce() {
  const players = world.getAllPlayers();
  if (players.length === 0) {
    return { status: "degraded", reason: "当前无玩家，跳过采集", fallback: "保留上一帧" };
  }
  const p = players[0];
  const dim = p.dimension;
  const camera = {
    schema: CAMERA_SCHEMA,
    tick: 0,
    capturedAt: new Date().toISOString(),
    dimensionId: dim.id,
    position: { x: p.location.x, y: p.location.y, z: p.location.z },
    viewDirection: (() => {
      const v = p.getViewDirection();
      return { x: v.x, y: v.y, z: v.z };
    })(),
    rotation: (() => {
      const r = p.getRotation();
      return { x: r.x, y: r.y };
    })(),
    // 官方无公开读取接口，恒为 null
    fovDegrees: null,
    near: null,
    far: null,
    unreadableFields: ["fovDegrees", "near", "far"],
    precision: "approximate"
  };

  let entities = [];
  try {
    entities = dim.getEntities({ location: p.location, maxDistance: ENTITY_RADIUS })
      .slice(0, MAX_ENTITIES)
      .map((e) => ({
        id: String(e.id),
        typeId: String(e.typeId),
        dimensionId: dim.id,
        position: { x: e.location.x, y: e.location.y, z: e.location.z },
        bounds: null,                  // 官方无包围盒读取接口
        boundsSource: "unavailable",
        tags: (e.getTags?.() ?? []).slice(0, 16)
      }));
  } catch (err) {
    // 单个能力失败不破坏加载器；返回 partial 而不是 ok
    return { status: "partial", reason: `实体枚举失败：${String(err)}`, fallback: "仅采集相机" };
  }

  const frame = {
    schema: FRAME_SCHEMA,
    tick: 0,
    capturedAt: camera.capturedAt,
    camera,
    entities,
    source: "in-game-script-api",
    caveats: [
      "FOV / near / far 官方不可读，恒为 null",
      "包围盒官方不可读，bounds 恒为 null",
      "本脚本无法直连 WS 或写文件，需平台侧桥接",
      "dynamic property 有容量上限且非实时"
    ]
  };

  const json = JSON.stringify(frame);
  if (json.length > SAFE_BYTES) {
    // 超预算降级：只保留相机，不静默丢实体
    frame.entities = [];
    frame.caveats.push("帧超预算，实体列表已清空（明确降级，不是静默截断）");
    const compact = JSON.stringify(frame);
    if (compact.length > SAFE_BYTES) {
      return { status: "resource-exhausted", reason: "采集帧超过 dynamic property 安全上限", fallback: "跳过本帧" };
    }
    world.setDynamicProperty(DYNAMIC_PROPERTY_KEY, compact);
    return { status: "degraded", reason: "实体列表因预算清空", fallback: "仅相机帧", bytes: compact.length };
  }
  world.setDynamicProperty(DYNAMIC_PROPERTY_KEY, json);
  return { status: "ok", bytes: json.length };
}

/** 启动定时采集；返回 runInterval 句柄，便于退出世界时清理。 */
export function start(intervalTicks = COLLECT_INTERVAL_TICKS) {
  return system.runInterval(() => {
    // 采集失败不得影响加载器与其他模组
    try { collectOnce(); } catch (err) {
      // 客户端脚本里避免 console 依赖，用 dynamic property 记录一次失败标记
      try { world.setDynamicProperty("bedrockloom:ri.lastError", String(err).slice(0, 200)); } catch { /* 忽略 */ }
    }
  }, intervalTicks);
}

/** 明确不支持：游戏内直连本地 WS / 写文件 / 共享内存。保留函数只为给出可判定结论。 */
export function publishDirect() {
  return { status: "unsupported", reason: "国际版 1.21.130 客户端 Script API 无网络与任意文件访问能力" };
}
