/**
 * 本机 WS bridge 意图信封协议（原创，纯逻辑，无 node:* 依赖）。
 *
 * 重要：这是**平台侧**的信封校验。基岩版客户端 Script API 没有 WebSocket / 文件写入能力，
 * 「游戏内脚本直连本机 WS」不成立；跨进程桥接方案一律标注「未经真机验证」。
 */

import { Status, ok, fail } from "../loomrender/result.mjs";

export const INTENT_KINDS = Object.freeze([
  "hud", "world-anchor", "texture-push", "overlay", "camera-frame", "entity-frame"
]);

export const ENVELOPE_SCHEMA = Object.freeze({
  schema: "bedrockloom.research.intent-envelope/v1",
  maxBytes: 256 * 1024
});

/** 危险内容片段：意图里不允许夹带可执行 HTML/JS。 */
const UNSAFE = /<script|javascript:|onerror\s*=|onload\s*=|onclick\s*=|data:text\/html/i;

export function validateIntentPayload(kind, payload) {
  if (!INTENT_KINDS.includes(kind)) {
    return fail(Status.DENIED, "E_KIND_UNKNOWN", `未知意图种类：${String(kind)}`);
  }
  if (payload === undefined || payload === null || typeof payload !== "object") {
    return fail(Status.DENIED, "E_PAYLOAD_SHAPE", "payload 必须是对象");
  }
  let text;
  try { text = JSON.stringify(payload); }
  catch { return fail(Status.DENIED, "E_PAYLOAD_SERIALIZE", "payload 无法序列化"); }
  if (new TextEncoder().encode(text).length > ENVELOPE_SCHEMA.maxBytes) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_ENVELOPE_TOO_LARGE", "信封超过 256 KiB 上限");
  }
  if (UNSAFE.test(text)) {
    return fail(Status.DENIED, "E_UNSAFE_CONTENT", "意图中不得夹带可执行 HTML/JS 片段");
  }
  // 禁止把凭据类字段塞进意图
  const FORBIDDEN_KEYS = /(token|secret|password|credential|xuid|account|auth)/i;
  for (const k of Object.keys(payload)) {
    if (FORBIDDEN_KEYS.test(k)) {
      return fail(Status.DENIED, "E_CREDENTIAL_IN_INTENT", `意图不得携带凭据字段：${k}`);
    }
  }
  return ok(Object.freeze({ kind, bytes: new TextEncoder().encode(text).length }));
}

/** 构造信封。seq 必须是非负整数，保证幂等与重放可判定。 */
export function makeEnvelope(seq, kind, payload, { now = () => Date.now(), source = "platform-side" } = {}) {
  if (!Number.isInteger(seq) || seq < 0) {
    return fail(Status.DENIED, "E_SEQ_INVALID", "seq 必须是非负整数");
  }
  const v = validateIntentPayload(kind, payload);
  if (v.status !== Status.OK) return v;
  return ok(Object.freeze({
    schema: ENVELOPE_SCHEMA.schema,
    seq,
    kind,
    payload,
    source,
    emittedAt: now(),
    caveat: "纯数据意图；不画像素、不控制渲染管线、不携带任何游戏资源样本"
  }));
}

/** 校验一个外部传入的信封。 */
export function validateEnvelope(env) {
  if (!env || typeof env !== "object") {
    return fail(Status.DENIED, "E_ENV_SHAPE", "信封必须是对象");
  }
  if (env.schema !== ENVELOPE_SCHEMA.schema) {
    return fail(Status.DENIED, "E_ENV_SCHEMA", "信封 schema 不匹配");
  }
  if (!Number.isInteger(env.seq) || env.seq < 0) {
    return fail(Status.DENIED, "E_SEQ_INVALID", "seq 必须是非负整数");
  }
  return validateIntentPayload(env.kind, env.payload);
}

export function toWire(env) {
  const v = validateEnvelope(env);
  if (v.status !== Status.OK) return v;
  return ok(JSON.stringify(env));
}

export function fromWire(text) {
  if (typeof text !== "string" || text.length === 0) {
    return fail(Status.DENIED, "E_WIRE_EMPTY", "线路文本为空");
  }
  if (new TextEncoder().encode(text).length > ENVELOPE_SCHEMA.maxBytes * 2) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_WIRE_TOO_LARGE", "线路文本过大");
  }
  let env;
  try { env = JSON.parse(text); }
  catch { return fail(Status.DENIED, "E_WIRE_JSON", "线路文本不是合法 JSON"); }
  const v = validateEnvelope(env);
  if (v.status !== Status.OK) return v;
  return ok(env);
}
