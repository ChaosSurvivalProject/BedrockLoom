/**
 * 本机 WS bridge 意图信封协议：往返、拒绝危险内容/凭据/未知种类/超限。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeEnvelope, validateEnvelope, toWire, fromWire,
  validateIntentPayload, INTENT_KINDS, ENVELOPE_SCHEMA
} from "../bridge/protocol.mjs";
import { Status } from "../loomrender/result.mjs";

test("PR1 构造信封并往返一致", () => {
  const env = makeEnvelope(0, "hud", { text: "hello" }, { now: () => 123 });
  assert.equal(env.status, Status.OK);
  assert.equal(env.value.emittedAt, 123);
  assert.equal(env.value.source, "platform-side");
  const wire = toWire(env.value);
  assert.equal(wire.status, Status.OK);
  const back = fromWire(wire.value);
  assert.equal(back.status, Status.OK);
  assert.equal(back.value.kind, "hud");
  assert.equal(back.value.payload.text, "hello");
  assert.equal(validateEnvelope(env.value).status, Status.OK);
});

test("PR2 六种意图种类，未知种类拒绝", () => {
  assert.deepEqual(INTENT_KINDS, ["hud", "world-anchor", "texture-push",
    "overlay", "camera-frame", "entity-frame"]);
  assert.equal(validateIntentPayload("drawTriangle", {}).status, Status.DENIED);
  assert.equal(makeEnvelope(1, "unknown", {}).status, Status.DENIED);
});

test("PR3 危险 HTML/JS 片段与凭据字段一律拒绝", () => {
  assert.equal(makeEnvelope(1, "hud", { html: "<script>alert(1)</script>" }).status, Status.DENIED);
  assert.equal(makeEnvelope(1, "hud", { url: "javascript:void(0)" }).status, Status.DENIED);
  const cred = makeEnvelope(1, "hud", { token: "abc" });
  assert.equal(cred.status, Status.DENIED);
  assert.equal(cred.code, "E_CREDENTIAL_IN_INTENT");
});

test("PR4 超上限返回 resource-exhausted", () => {
  assert.equal(ENVELOPE_SCHEMA.maxBytes, 256 * 1024);
  const big = makeEnvelope(1, "overlay", { blob: "x".repeat(300 * 1024) });
  assert.equal(big.status, Status.RESOURCE_EXHAUSTED);
  assert.equal(big.code, "E_ENVELOPE_TOO_LARGE");
});

test("PR5 seq 非法、schema 不匹配、非法 JSON 全部拒绝", () => {
  assert.equal(makeEnvelope(-1, "hud", {}).status, Status.DENIED);
  assert.equal(makeEnvelope(1.5, "hud", {}).status, Status.DENIED);
  assert.equal(validateEnvelope({ schema: "wrong", seq: 1, kind: "hud", payload: {} }).status, Status.DENIED);
  assert.equal(fromWire("{oops").status, Status.DENIED);
  assert.equal(fromWire("").status, Status.DENIED);
});

test("PR6 信封明确「不画像素、不控制渲染管线、不携带样本」", () => {
  const env = makeEnvelope(2, "camera-frame", { position: { x: 0, y: 64, z: 0 } }).value;
  assert.match(env.caveat, /不画像素/);
  assert.match(env.caveat, /不控制渲染管线/);
  assert.match(env.caveat, /不携带任何游戏资源样本/);
});
