// render-intent/core/intent.mjs —— 意图与采集帧的构造、校验、序列化（纯逻辑）
// 边界：与 loom-v2/core 一致，本文件不 import 任何 node:*，不使用 process，浏览器也可运行。
// 七态结果直接复用 ../../core/result.mjs，不另起一套语义。

import { Status, ok, fail } from "../../core/result.mjs";

export const INTENT_SCHEMA = "bedrockloom.render-intent/v1";
export const FRAME_SCHEMA = "bedrockloom.collector.frame/v1";
export const CAMERA_SCHEMA = "bedrockloom.collector.camera/v1";
export const ENVELOPE_SCHEMA = "bedrockloom.intent-envelope/v1";

export const INTENT_TYPES = Object.freeze(["hud", "texture-push", "world-anchor", "overlay"]);
export const FRAME_SOURCES = Object.freeze([
  "in-game-script-api", "bds-http", "world-save-readonly", "manual", "synthetic-demo"
]);

export const LIMITS = Object.freeze({
  maxPayloadBytes: 64 * 1024,
  maxEntitiesPerFrame: 128,
  maxBlocksPerChunkSample: 256,
  tickInterval: 10,
  defaultTtlMs: 2000,
  dynamicPropertySafeBytes: 16 * 1024
});

const SAFE_SLOT = /^dynamic:\/\/[a-z0-9][a-z0-9._-]{0,63}$/;
const DANGEROUS_CONTENT = /<script|on[a-z]+\s*=|javascript:|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(/i;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** FNV-1a：确定性 id，不用随机数，便于测试与回放（不是密码学哈希）。 */
export function deterministicId(type, createdAt, extra = "") {
  let h = 0x811c9dc5;
  const s = `${type}|${createdAt}|${extra}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `ri-${h.toString(16).padStart(8, "0")}`;
}

const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);
const isVec3 = (v) => Boolean(v) && isFiniteNumber(v.x) && isFiniteNumber(v.y) && isFiniteNumber(v.z);

function byteLength(obj) {
  return JSON.stringify(obj).length;
}

export function validateSlot(slot) {
  if (typeof slot !== "string" || !SAFE_SLOT.test(slot)) {
    return fail(Status.DENIED, "E_RI_BAD_SLOT", "槽位必须是 dynamic:// 开头且只含安全字符", {
      field: "payload.slot", suggestion: "例如 dynamic://external-screen"
    });
  }
  return ok(slot);
}

/** 拒绝 HTML 内容里的可执行片段；合成器演示也只用 textContent，不用 innerHTML。 */
export function auditContent(data) {
  if (typeof data !== "string") return fail(Status.DENIED, "E_RI_BAD_CONTENT", "内容必须是字符串", { field: "content.data" });
  if (DANGEROUS_CONTENT.test(data)) {
    return fail(Status.DENIED, "E_RI_UNSAFE_CONTENT", "意图内容含可执行片段，拒绝提交", {
      field: "content.data", suggestion: "改用纯文本或 Canvas 指令，不要嵌入脚本"
    });
  }
  return ok(data);
}

function validatePayload(type, p) {
  if (!p || typeof p !== "object") return fail(Status.DENIED, "E_RI_BAD_PAYLOAD", "payload 必须是对象", { field: "payload" });
  switch (type) {
    case "hud": {
      if (typeof p.elementId !== "string" || !p.elementId) return fail(Status.DENIED, "E_RI_BAD_HUD", "elementId 缺失", { field: "payload.elementId" });
      const r = p.rect;
      if (!r || ![r.x, r.y, r.w, r.h].every(isFiniteNumber) || r.w <= 0 || r.h <= 0) {
        return fail(Status.DENIED, "E_RI_BAD_RECT", "rect 必须是正数尺寸", { field: "payload.rect" });
      }
      if (!["text", "html", "canvas"].includes(p.content?.kind)) {
        return fail(Status.DENIED, "E_RI_BAD_CONTENT_KIND", "content.kind 必须为 text/html/canvas", { field: "payload.content.kind" });
      }
      const c = auditContent(p.content.data);
      if (c.status !== Status.OK) return c;
      if (!["screen", "safe-area"].includes(p.anchor)) {
        return fail(Status.DENIED, "E_RI_BAD_ANCHOR", "anchor 必须为 screen/safe-area", { field: "payload.anchor" });
      }
      return ok(p);
    }
    case "texture-push": {
      const s = validateSlot(p.slot);
      if (s.status !== Status.OK) return s;
      if (p.mime !== "image/png") return fail(Status.DENIED, "E_RI_BAD_MIME", "只接受 image/png", { field: "payload.mime" });
      if (typeof p.pngBase64 !== "string" || !BASE64.test(p.pngBase64)) {
        return fail(Status.DENIED, "E_RI_BAD_BASE64", "pngBase64 不是合法 Base64", { field: "payload.pngBase64" });
      }
      if (!["compositor", "resource-pack-build"].includes(p.target)) {
        return fail(Status.DENIED, "E_RI_BAD_TARGET", "target 必须为 compositor/resource-pack-build", { field: "payload.target" });
      }
      return ok(p);
    }
    case "world-anchor": {
      if (typeof p.anchorId !== "string" || !p.anchorId) return fail(Status.DENIED, "E_RI_BAD_ANCHOR_ID", "anchorId 缺失", { field: "payload.anchorId" });
      if (!isVec3(p.position)) return fail(Status.DENIED, "E_RI_BAD_VEC3", "position 必须是有限 Vec3", { field: "payload.position" });
      const s = validateSlot(p.textureSlot);
      if (s.status !== Status.OK) return s;
      if (typeof p.billboard !== "boolean") return fail(Status.DENIED, "E_RI_BAD_BILLBOARD", "billboard 必须是布尔", { field: "payload.billboard" });
      return ok(p);
    }
    case "overlay": {
      if (!isFiniteNumber(p.zIndex)) return fail(Status.DENIED, "E_RI_BAD_ZINDEX", "zIndex 必须是有限数", { field: "payload.zIndex" });
      if (!isFiniteNumber(p.opacity) || p.opacity < 0 || p.opacity > 1) {
        return fail(Status.DENIED, "E_RI_BAD_OPACITY", "opacity 必须在 0..1", { field: "payload.opacity" });
      }
      if (typeof p.clickThrough !== "boolean") return fail(Status.DENIED, "E_RI_BAD_CLICK", "clickThrough 必须是布尔", { field: "payload.clickThrough" });
      if (!["overlay-window", "second-screen", "canvas"].includes(p.surface)) {
        return fail(Status.DENIED, "E_RI_BAD_SURFACE", "surface 非法", { field: "payload.surface" });
      }
      return ok(p);
    }
    default:
      return fail(Status.DENIED, "E_RI_UNKNOWN_TYPE", `未知意图类型：${type}`, { field: "type" });
  }
}

/** 完整校验一条 RenderIntent；成功返回冻结对象。 */
export function validateIntent(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return fail(Status.DENIED, "E_RI_NOT_OBJECT", "意图必须是对象");
  }
  if (obj.schema !== INTENT_SCHEMA) return fail(Status.DENIED, "E_RI_BAD_SCHEMA", "schema 不匹配", { field: "schema" });
  if (typeof obj.id !== "string" || !obj.id) return fail(Status.DENIED, "E_RI_BAD_ID", "id 缺失", { field: "id" });
  if (!Number.isFinite(obj.ttlMs) || obj.ttlMs <= 0) return fail(Status.DENIED, "E_RI_BAD_TTL", "ttlMs 必须为正数", { field: "ttlMs" });
  if (!Number.isFinite(Date.parse(obj.createdAt))) return fail(Status.DENIED, "E_RI_BAD_TIME", "createdAt 非法", { field: "createdAt" });
  if (!["platform-side", "in-game", "custom-client"].includes(obj.sourceLayer)) {
    return fail(Status.DENIED, "E_RI_BAD_LAYER", "sourceLayer 非法", { field: "sourceLayer" });
  }
  if (!INTENT_TYPES.includes(obj.type)) return fail(Status.DENIED, "E_RI_UNKNOWN_TYPE", `未知意图类型：${obj.type}`, { field: "type" });
  const p = validatePayload(obj.type, obj.payload);
  if (p.status !== Status.OK) return p;
  if (byteLength(obj) > LIMITS.maxPayloadBytes) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_RI_PAYLOAD_TOO_LARGE", `意图超过 ${LIMITS.maxPayloadBytes} 字节`, {
      field: "payload", recoverable: true, suggestion: "降低分辨率或分批推送"
    });
  }
  return ok(Object.freeze({ ...obj }));
}

export function createIntent(type, payload, meta = {}) {
  const now = Number.isFinite(meta.now) ? meta.now : Date.now();
  const createdAt = meta.createdAt ?? new Date(now).toISOString();
  const intent = {
    schema: INTENT_SCHEMA,
    id: meta.id ?? deterministicId(type, createdAt, meta.requestId ?? ""),
    createdAt,
    ttlMs: meta.ttlMs ?? LIMITS.defaultTtlMs,
    sourceLayer: meta.sourceLayer ?? "platform-side",
    type,
    payload,
    ...(meta.requestId ? { requestId: meta.requestId } : {})
  };
  return validateIntent(intent);
}

/**
 * 采集帧校验。硬约束：camera 的 fovDegrees / near / far 必须为 null，
 * 任何用猜测值填充的行为一律 denied，防止把「不可读」伪装成「已采集」。
 */
export function validateFrame(obj) {
  if (!obj || typeof obj !== "object") return fail(Status.DENIED, "E_RI_FRAME_BAD", "帧必须是对象");
  if (obj.schema !== FRAME_SCHEMA) return fail(Status.DENIED, "E_RI_FRAME_SCHEMA", "帧 schema 不匹配", { field: "schema" });
  if (!FRAME_SOURCES.includes(obj.source)) return fail(Status.DENIED, "E_RI_FRAME_SOURCE", "来源非法", { field: "source" });
  if (!Array.isArray(obj.entities)) return fail(Status.DENIED, "E_RI_FRAME_ENTITIES", "entities 必须是数组", { field: "entities" });
  if (obj.entities.length > LIMITS.maxEntitiesPerFrame) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_RI_FRAME_TOO_MANY", `实体数超过 ${LIMITS.maxEntitiesPerFrame}`, { field: "entities" });
  }
  for (const e of obj.entities) {
    if (!e || typeof e.id !== "string" || !isVec3(e.position)) {
      return fail(Status.DENIED, "E_RI_FRAME_ENTITY", "实体缺少 id 或 position", { field: "entities[]" });
    }
    if (e.bounds !== null && e.bounds !== undefined) {
      return fail(Status.DENIED, "E_RI_FRAME_BOUNDS", "官方无包围盒读取接口，bounds 必须为 null", { field: "entities[].bounds" });
    }
  }
  if (!Array.isArray(obj.caveats)) return fail(Status.DENIED, "E_RI_FRAME_CAVEATS", "caveats 必须是数组", { field: "caveats" });
  const cam = obj.camera;
  if (cam !== null && cam !== undefined) {
    if (cam.schema !== CAMERA_SCHEMA) return fail(Status.DENIED, "E_RI_CAM_SCHEMA", "相机 schema 不匹配", { field: "camera.schema" });
    if (!isVec3(cam.position) || !isVec3(cam.viewDirection)) {
      return fail(Status.DENIED, "E_RI_CAM_VEC", "相机位置/朝向必须是有限 Vec3", { field: "camera" });
    }
    for (const k of ["fovDegrees", "near", "far"]) {
      if (cam[k] !== null) {
        return fail(Status.DENIED, "E_RI_CAM_UNREADABLE", `${k} 官方不可读，必须为 null，不得用猜测值填充`, { field: `camera.${k}` });
      }
    }
  }
  if (byteLength(obj) > LIMITS.maxPayloadBytes) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_RI_FRAME_TOO_LARGE", "帧超过字节预算", { field: "frame" });
  }
  return ok(Object.freeze({ ...obj }));
}

export function makeFrame({ camera = null, entities = [], source = "manual", tick = 0, caveats = [], now } = {}) {
  const t = Number.isFinite(now) ? now : Date.now();
  return validateFrame({
    schema: FRAME_SCHEMA,
    tick,
    capturedAt: new Date(t).toISOString(),
    camera,
    entities,
    source,
    caveats
  });
}

export function toEnvelope(seq, channel, payload) {
  if (!Number.isInteger(seq) || seq < 0) return fail(Status.DENIED, "E_RI_BAD_SEQ", "seq 必须是非负整数", { field: "seq" });
  if (!["frame", "intent"].includes(channel)) return fail(Status.DENIED, "E_RI_BAD_CHANNEL", "channel 必须为 frame/intent", { field: "channel" });
  const checked = channel === "frame" ? validateFrame(payload) : validateIntent(payload);
  if (checked.status !== Status.OK) return checked;
  return ok(Object.freeze({ schema: ENVELOPE_SCHEMA, seq, channel, payload: checked.value }));
}

export const toWire = (envelope) => JSON.stringify(envelope);

export function fromWire(line) {
  if (typeof line !== "string" || line.trim() === "") return fail(Status.DENIED, "E_RI_EMPTY_LINE", "空行");
  let parsed;
  try { parsed = JSON.parse(line); } catch {
    return fail(Status.DENIED, "E_RI_BAD_JSON", "不是合法 JSON", { recoverable: false });
  }
  if (parsed?.schema !== ENVELOPE_SCHEMA) return fail(Status.DENIED, "E_RI_BAD_SCHEMA", "信封 schema 不匹配");
  return toEnvelope(parsed.seq, parsed.channel, parsed.payload);
}

export function isExpired(intent, now = Date.now()) {
  return now > Date.parse(intent.createdAt) + intent.ttlMs;
}

/** 批量化：相同 batchKey 的 HUD 意图只保留最后一条；过期意图统一丢弃。 */
export function coalesceIntents(intents, now = Date.now()) {
  const kept = new Map();
  let droppedExpired = 0;
  for (const it of intents) {
    if (isExpired(it, now)) { droppedExpired += 1; continue; }
    const key = it.type === "hud" && it.payload.batchKey ? `hud:${it.payload.batchKey}` : `id:${it.id}`;
    kept.set(key, it);
  }
  return Object.freeze({ intents: Object.freeze([...kept.values()]), droppedExpired });
}
