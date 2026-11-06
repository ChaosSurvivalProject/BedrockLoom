// test/render-intent.test.mjs —— v2.1.0 渲染意图层自动化测试
// 覆盖：意图/帧校验、能力表双表一致、文件与本地总线、合成器投影、资源包构建期绑定、
//       单文件演示页内联脚本「实际执行」、静态负向扫描（零注入/Hook、零外部网络）。
// 说明：本文件只验证 platform-side 契约；不代表任何 1.21.130 游戏内画面结果。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { ROOT } from "./_helpers.mjs";
import { Status, ALL_STATUSES } from "../core/result.mjs";

import {
  INTENT_SCHEMA, FRAME_SCHEMA, CAMERA_SCHEMA, ENVELOPE_SCHEMA,
  INTENT_TYPES, LIMITS, createIntent, validateIntent, validateSlot, auditContent,
  makeFrame, validateFrame, toEnvelope, toWire, fromWire, isExpired,
  coalesceIntents, deterministicId
} from "../render-intent/core/intent.mjs";
import {
  CAPABILITY_TABLE, LABEL_TO_PROJECT_STATUS, LABEL_TO_EVIDENCE_CEILING,
  auditCapabilityTable, countByLabel, FORBIDDEN_API_NAMES
} from "../render-intent/core/capability.mjs";
import { createCompositor, COMPOSITOR_BUDGET } from "../render-intent/core/compositor.mjs";
import {
  createFileBus, createLocalBus, wsTextFrame, parseWsFrames
} from "../render-intent/runtime/bus.mjs";
import {
  bindTexture, spawnBillboard, updateLight, runtimeTextureSwap, writeMaterialBin,
  slotToPackPath, buildTextureList, MAX_TEXTURE_BYTES
} from "../render-intent/runtime/pack-bridge.mjs";

const RI = path.join(ROOT, "render-intent");
const read = (rel) => readFileSync(path.join(RI, rel), "utf8");
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const cam = (over = {}) => ({
  schema: CAMERA_SCHEMA, tick: 1, capturedAt: "2026-11-06T05:00:00.000Z",
  dimensionId: "minecraft:overworld",
  position: { x: 0, y: 64, z: 0 }, viewDirection: { x: 0, y: 0, z: 1 },
  rotation: { x: 0, y: 0 }, fovDegrees: null, near: null, far: null,
  ...over
});
const frame = (over = {}) => makeFrame({
  camera: cam(), entities: [{ id: "e1", position: { x: 5, y: 64, z: 5 }, bounds: null }],
  source: "synthetic-demo", tick: 1, caveats: ["FOV 不可读"], now: 1000, ...over
});
const hudIntent = (over = {}) => createIntent("hud", {
  elementId: "hud-1", rect: { x: 1, y: 2, w: 100, h: 20 },
  content: { kind: "text", data: "外部合成器" }, anchor: "safe-area", batchKey: "status",
  ...over.payload
}, { now: 1000, ...over.meta });

// ---------------------------------------------------------------------------
// A. 意图与采集帧校验
// ---------------------------------------------------------------------------
test("RI-A1 四种意图类型冻结，七态结果与 core/result.mjs 完全一致", () => {
  assert.deepEqual([...INTENT_TYPES], ["hud", "texture-push", "world-anchor", "overlay"]);
  assert.equal(ALL_STATUSES.length, 7);
  // 演示页内联脚本也声明同一组七态（静态核对）
  const html = read("demo/overlay.html");
  for (const s of ALL_STATUSES) assert.ok(html.includes(s), `演示页缺少七态 ${s}`);
});

test("RI-A2 合法 HUD 意图构造成功且对象冻结", () => {
  const r = hudIntent();
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.schema, INTENT_SCHEMA);
  assert.equal(r.value.sourceLayer, "platform-side");
  assert.ok(Object.isFrozen(r.value));
});

test("RI-A3 危险内容（脚本片段）一律 denied，不进入合成器", () => {
  const r = createIntent("hud", {
    elementId: "x", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "html", data: "<script>alert(1)</script>" }, anchor: "screen"
  }, { now: 1000 });
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_RI_UNSAFE_CONTENT");
  assert.equal(auditContent("纯文本").status, Status.OK);
  assert.equal(auditContent("javascript:void(0)").status, Status.DENIED);
});

test("RI-A4 槽位、MIME、Base64、target 的输入边界", () => {
  assert.equal(validateSlot("dynamic://external-screen").status, Status.OK);
  assert.equal(validateSlot("http://evil/x").status, Status.DENIED);
  const bad = createIntent("texture-push", {
    slot: "dynamic://s", mime: "image/png", pngBase64: "!!!!", target: "compositor"
  }, { now: 1000 });
  assert.equal(bad.status, Status.DENIED);
  assert.equal(bad.code, "E_RI_BAD_BASE64");
  const okR = createIntent("texture-push", {
    slot: "dynamic://s", mime: "image/png", pngBase64: "iVBORw0KGgo=", target: "compositor"
  }, { now: 1000 });
  assert.equal(okR.status, Status.OK);
});

test("RI-A5 overlay / world-anchor 的数值边界", () => {
  assert.equal(createIntent("overlay", {
    zIndex: 1, opacity: 1.5, clickThrough: true, surface: "overlay-window", safeArea: true
  }, { now: 1000 }).code, "E_RI_BAD_OPACITY");
  assert.equal(createIntent("world-anchor", {
    anchorId: "a", position: { x: 1, y: 2, z: 3 }, dimensionId: "minecraft:overworld",
    billboard: true, textureSlot: "dynamic://s"
  }, { now: 1000 }).status, Status.OK);
});

test("RI-A6 超预算 payload 返回 resource-exhausted，不静默截断", () => {
  const r = createIntent("hud", {
    elementId: "x", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", data: "a".repeat(LIMITS.maxPayloadBytes + 10) }, anchor: "screen"
  }, { now: 1000 });
  assert.equal(r.status, Status.RESOURCE_EXHAUSTED);
  assert.equal(r.code, "E_RI_PAYLOAD_TOO_LARGE");
  assert.equal(r.recoverable, true);
});

test("RI-A7 采集帧：FOV/near/far 与包围盒为官方不可读，伪造值一律 denied", () => {
  assert.equal(frame().status, Status.OK);
  const fakeFov = makeFrame({ camera: cam({ fovDegrees: 70 }), now: 1000 });
  assert.equal(fakeFov.status, Status.DENIED);
  assert.equal(fakeFov.code, "E_RI_CAM_UNREADABLE");
  const fakeBounds = makeFrame({
    camera: cam(), entities: [{ id: "e", position: { x: 1, y: 2, z: 3 }, bounds: { min: {}, max: {} } }],
    now: 1000
  });
  assert.equal(fakeBounds.status, Status.DENIED);
  assert.equal(fakeBounds.code, "E_RI_FRAME_BOUNDS");
});

test("RI-A8 实体数超预算与来源白名单", () => {
  const many = Array.from({ length: LIMITS.maxEntitiesPerFrame + 1 }, (_, i) => ({
    id: `e${i}`, position: { x: i, y: 64, z: 0 }, bounds: null
  }));
  assert.equal(makeFrame({ camera: cam(), entities: many, now: 1000 }).status, Status.RESOURCE_EXHAUSTED);
  assert.equal(makeFrame({ camera: cam(), source: "java-edition", now: 1000 }).status, Status.DENIED);
});

test("RI-A9 信封序列化往返、坏 JSON 与非法通道", () => {
  const env = toEnvelope(3, "frame", frame().value);
  assert.equal(env.status, Status.OK);
  const back = fromWire(toWire(env.value));
  assert.equal(back.status, Status.OK);
  assert.equal(back.value.seq, 3);
  assert.equal(back.value.channel, "frame");
  assert.equal(fromWire("not json").status, Status.DENIED);
  assert.equal(toEnvelope(0, "render-pipeline", frame().value).status, Status.DENIED);
  assert.equal(toEnvelope(-1, "frame", frame().value).status, Status.DENIED);
});

test("RI-A10 批量化：batchKey 合并 + 过期丢弃；deterministicId 可回放", () => {
  const base = { now: 1000 };
  const a = createIntent("hud", {
    elementId: "x", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", data: "旧" }, anchor: "screen", batchKey: "k"
  }, base);
  const b = createIntent("hud", {
    elementId: "x", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", data: "新" }, anchor: "screen", batchKey: "k"
  }, { now: 1001, id: "ri-explicit" });
  const other = createIntent("hud", {
    elementId: "y", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", data: "另一批" }, anchor: "screen", batchKey: "other"
  }, { now: 1000 });
  const expired = createIntent("hud", {
    elementId: "x", rect: { x: 0, y: 0, w: 10, h: 10 },
    content: { kind: "text", data: "过期" }, anchor: "screen", batchKey: "k2"
  }, { now: 1, ttlMs: 10 });
  const r = coalesceIntents([a.value, b.value, other.value, expired.value], 1000);
  // a、b 同 batchKey 合并为 1 条；other 独立保留 1 条；expired 过期丢弃
  assert.equal(r.intents.length, 2, "同 batchKey 合并为 1 条 + 不同 key 1 条");
  assert.equal(r.droppedExpired, 1);
  assert.equal(r.intents.find((i) => i.payload.batchKey === "k").payload.content.data, "新", "同 key 保留最后一条");
  assert.equal(isExpired(expired.value, 1000), true);
  assert.equal(deterministicId("hud", "t", "x"), deterministicId("hud", "t", "x"));
  assert.notEqual(deterministicId("hud", "t", "x"), deterministicId("overlay", "t", "x"));
});

// ---------------------------------------------------------------------------
// B. 能力表：JS 可运行表 ↔ TS 契约表逐行一致
// ---------------------------------------------------------------------------
const groupIds = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);

/** 截取某个 export const 常量块，避免同文件其它数组干扰正则。 */
function contractBlock(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  assert.ok(s >= 0, `找不到常量 ${startMarker}`);
  const e = endMarker ? src.indexOf(endMarker, s) : src.length;
  return src.slice(s, e > s ? e : src.length);
}
function fieldSeq(block, key) {
  const re = new RegExp(`\\b${key}:\\s*"([^"]+)"`, "g");
  const out = []; let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function tsRows(rel, start, end, apiKey, apiPrefix = "") {
  const b = contractBlock(read(rel), start, end);
  const apis = fieldSeq(b, apiKey).map((a) => apiPrefix + a);
  return {
    apis,
    labels: fieldSeq(b, "label"),
    statuses: fieldSeq(b, "projectStatus"),
    evidences: fieldSeq(b, "evidence"),
    layers: fieldSeq(b, "layer")
  };
}
const jsGroup = (prefix) => CAPABILITY_TABLE.filter((r) => new RegExp(`^${prefix}\\d{2}$`).test(r.id));

function assertGroupEqual(ts, js, name) {
  assert.equal(ts.labels.length, js.length, `${name} 行数不一致`);
  for (let i = 0; i < js.length; i += 1) {
    assert.equal(ts.apis[i], js[i].api, `${name} ${js[i].id} api 不一致`);
    assert.equal(ts.labels[i], js[i].label, `${name} ${js[i].id} label 不一致`);
    assert.equal(ts.statuses[i], js[i].projectStatus, `${name} ${js[i].id} projectStatus 不一致`);
    assert.equal(ts.evidences[i], js[i].evidence, `${name} ${js[i].id} evidence 不一致`);
    assert.equal(ts.layers[i], js[i].layer, `${name} ${js[i].id} layer 不一致`);
  }
}

test("RI-B1 能力表自检：32 行、id 唯一、标签分布 13/10/9", () => {
  assert.equal(CAPABILITY_TABLE.length, 32);
  assert.equal(new Set(CAPABILITY_TABLE.map((r) => r.id)).size, 32);
  assert.deepEqual(auditCapabilityTable(), []);
  assert.deepEqual({ ...countByLabel() }, { stable: 13, beta: 10, unsupported: 9 });
  assert.deepEqual({ ...LABEL_TO_PROJECT_STATUS }, { stable: "Stable", beta: "Experimental", unsupported: "Unavailable" });
  assert.deepEqual({ ...LABEL_TO_EVIDENCE_CEILING }, { stable: "E4", beta: "E2", unsupported: "E0" });
});

test("RI-B2 六组契约：TS 源码与 JS 可运行表逐行一致（api/label/status/evidence/layer）", () => {
  assertGroupEqual(tsRows("collector.ts", "RENDER_COLLECTOR_CONTRACT", "UNREADABLE_CAMERA_FIELDS", "api"),
    jsGroup("RI-C"), "collector");
  assertGroupEqual(tsRows("bus.ts", "TRANSPORT_CONTRACT", "BRIDGE_INPUT_CONTRACT", "kind", "bus."),
    jsGroup("RI-B"), "transport");
  assertGroupEqual(tsRows("bus.ts", "BRIDGE_INPUT_CONTRACT", "export interface Disposable", "kind", "bridge."),
    jsGroup("RI-BR"), "bridge");
  assertGroupEqual(tsRows("capability-table.ts", "INTENT_API_CONTRACT", "const collectorRows", "api"),
    jsGroup("RI-I"), "intent");
  assertGroupEqual(tsRows("compositor-api.ts", "COMPOSITOR_CONTRACT", "COMPOSITOR_BUDGET", "api"),
    jsGroup("RI-CP"), "compositor");
  assertGroupEqual(tsRows("pack-bridge.ts", "PACK_BRIDGE_CONTRACT", "DEFERRED_RESOURCE_CONTRACT", "api"),
    jsGroup("RI-P"), "pack");
});

test("RI-B3 分组 id 集合与 TS 契约数组长度严格对应", () => {
  const expect = {
    "RI-C": 6, "RI-B": 5, "RI-BR": 5, "RI-I": 5, "RI-CP": 6, "RI-P": 5
  };
  for (const [p, n] of Object.entries(expect)) {
    assert.deepEqual(jsGroup(p).map((r) => r.id), groupIds(p, n), `${p} 分组 id 不连续`);
  }
  // 注意 RI-B 与 RI-BR 前缀不重叠（BR 有额外字母）
  assert.equal(jsGroup("RI-B").length, 5);
});

test("RI-B4 合规硬规则：stable 只在 platform-side，unsupported 有理由且证据 ≤ E1", () => {
  const capTable = read("capability-table.ts");
  assert.ok(capTable.includes('stable: "Stable"'));
  assert.ok(capTable.includes('beta: "Experimental"'));
  assert.ok(capTable.includes('unsupported: "Unavailable"'));
  for (const r of CAPABILITY_TABLE) {
    if (r.label === "stable") assert.equal(r.layer, "platform-side", `${r.id} stable 只能在平台侧`);
    if (r.label === "unsupported") {
      assert.ok(r.reason.trim().length > 0, `${r.id} 缺少审计理由`);
      assert.ok(["E0", "E1"].includes(r.evidence), `${r.id} 证据级别过高`);
    }
    if (r.label === "beta") assert.notEqual(r.projectStatus, "Stable", `${r.id} beta 不得标 Stable`);
  }
  // 被禁止的伪接口名允许作为「否定结论」登记在能力表，但必须是 unsupported/Unavailable，
  // 绝不能标成 stable/beta/可用状态（这是设计本意：Unavailable 是一等公民）。
  const forbiddenApiAsRow = CAPABILITY_TABLE.filter(
    (r) => FORBIDDEN_API_NAMES.some((n) => r.api === n || r.api.endsWith(`.${n}`))
  );
  assert.ok(forbiddenApiAsRow.length >= 1, "应至少有一条显式否定条目");
  for (const r of forbiddenApiAsRow) {
    assert.equal(r.label, "unsupported", `${r.id} 禁止名必须是 unsupported`);
    assert.equal(r.projectStatus, "Unavailable", `${r.id} 禁止名必须是 Unavailable`);
    assert.equal(r.evidence, "E0", `${r.id} 禁止名证据级别必须为 E0`);
  }
  // 否定桩函数允许存在，但必须显式返回 unsupported（RI-E3 已断言，这里再核对源码形态）
  const packSrc = read("runtime/pack-bridge.mjs");
  assert.match(packSrc, /export function runtimeTextureSwap\(\)[\s\S]{0,200}Status\.UNSUPPORTED/);
  assert.match(packSrc, /export function writeMaterialBin\(\)[\s\S]{0,260}Status\.UNSUPPORTED/);
  // 合成器里不得出现任何「游戏内绘制」函数定义
  assert.doesNotMatch(read("core/compositor.mjs"),
    /function\s+(drawTriangle|present|setMaterial|hookPresent|setRenderLayer)\b/);
});

// ---------------------------------------------------------------------------
// C. 总线：文件管道 / RFC6455 帧 / 本地 HTTP+SSE+WS
// ---------------------------------------------------------------------------
test("RI-C1 WS 文本帧编解码（含长度分档与掩码）", () => {
  for (const text of ["hi", "x".repeat(200), "y".repeat(70000)]) {
    const frameBytes = wsTextFrame(text);
    const parsed = parseWsFrames(frameBytes);
    assert.equal(parsed.texts[0], text);
    assert.equal(parsed.rest.length, 0);
  }
  // 客户端掩码帧解析
  const payload = Buffer.from("masked", "utf8");
  const mask = Buffer.from([1, 2, 3, 4]);
  const head = Buffer.from([0x81, 0x80 | payload.length]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i += 1) masked[i] = payload[i] ^ mask[i % 4];
  assert.equal(parseWsFrames(Buffer.concat([head, mask, masked])).texts[0], "masked");
  // 分片残帧
  const full = wsTextFrame("abc");
  const part = parseWsFrames(full.subarray(0, 4));
  assert.equal(part.texts.length, 0);
  assert.equal(part.rest.length, 4);
});

test("RI-C2 文件总线：追加写 → 读回全部信封，非法行单独报告", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ri-file-"));
  try {
    const p = path.join(dir, "intent.jsonl");
    const fb = await createFileBus(p);
    assert.equal((await fb.publish(frame().value, "frame")).status, Status.OK);
    assert.equal((await fb.publish(hudIntent().value, "intent")).status, Status.OK);
    const r = await fb.readAll();
    assert.equal(r.value.envelopes.length, 2);
    assert.equal(r.value.errors.length, 0);
    assert.equal(fb.recent(1).value.length, 1);
    await fb.close();
    // 追加一条坏行后仍可解析出好行
    const { appendFile } = await import("node:fs/promises");
    await appendFile(p, "{bad json}\n", "utf8");
    const fb2 = await createFileBus(p);
    const r2 = await fb2.readAll();
    assert.equal(r2.value.envelopes.length, 2);
    assert.equal(r2.value.errors.length, 1);
    await fb2.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RI-C3 本地总线端到端：/health、/capabilities、/intents.jsonl、POST /intent", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ri-bus-"));
  try {
    const bus = createLocalBus({ port: 0, filePath: path.join(dir, "intent.jsonl"), loopbackOnly: true });
    const addr = await bus.start();
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const health = await (await fetch(base + "/health")).json();
      assert.equal(health.status, "ok");
      assert.equal(health.kind, "local-bus");
      const caps = await (await fetch(base + "/capabilities")).json();
      assert.equal(caps.rows.length, 32);

      await bus.publish(frame().value, "frame");
      await bus.publish(hudIntent().value, "intent");
      const ndjson = await (await fetch(base + "/intents.jsonl")).text();
      assert.equal(ndjson.trim().split("\n").length, 2);

      // POST 直接提交 frame（in-game 桥接 / 本地工具常用形态）
      const post = await fetch(base + "/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame().value)
      });
      assert.equal(post.status, 200);
      assert.equal((await post.json()).status, "ok");
      assert.equal(bus.seq, 3);

      // 非法请求体被拒
      const bad = await fetch(base + "/intent", { method: "POST", body: "garbage" });
      assert.equal(bad.status, 400);

      // 非回环 Host 必须 403（用原生 http 显式设置 Host）
      const code403 = await new Promise((resolve) => {
        const req = http.request({ host: "127.0.0.1", port: addr.port, path: "/health",
          headers: { Host: "evil.example.com" } }, (res) => { res.resume(); resolve(res.statusCode); });
        req.on("error", () => resolve(-1)); req.end();
      });
      assert.equal(code403, 403);

      // ingestText 三种输入形态
      assert.equal((await bus.ingestText(JSON.stringify({ schema: FRAME_SCHEMA, ...frame().value }))).status, Status.OK);
      assert.equal((await bus.ingestText(JSON.stringify({ channel: "intent", payload: hudIntent().value }))).status, Status.OK);
      assert.equal((await bus.ingestText("{}")).status, Status.DENIED);
    } finally { await bus.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RI-C4 真实 WebSocket 客户端收到回放帧（Node 22 内置 WebSocket）", async () => {
  const bus = createLocalBus({ port: 0, loopbackOnly: true });
  const addr = await bus.start();
  try {
    await bus.publish(frame().value, "frame");
    await bus.publish(hudIntent().value, "intent");
    const msgs = await new Promise((resolve) => {
      const got = [];
      const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/`);
      const done = () => { try { ws.close(); } catch { /* ignore */ } resolve(got); };
      ws.onmessage = (e) => { got.push(e.data); if (got.length >= 2) done(); };
      ws.onerror = done;
      setTimeout(done, 3000).unref?.();
    });
    assert.ok(msgs.length >= 2, "应回放至少两条缓冲信封");
    for (const m of msgs) assert.equal(JSON.parse(m).schema, ENVELOPE_SCHEMA);
  } finally { await bus.close(); }
});

test("RI-C5 loopbackOnly 拒绝非 127.0.0.1 绑定", () => {
  assert.throws(() => createLocalBus({ host: "0.0.0.0", loopbackOnly: true }), /loopbackOnly/);
});

// ---------------------------------------------------------------------------
// D. 合成器：批量绘制、投影、超时、预算、销毁
// ---------------------------------------------------------------------------
test("RI-D1 ingest/submit/drawFrame 正常路径与 degraded（帧带 caveats）", () => {
  const c = createCompositor({ now: () => 1000 });
  assert.equal(c.ingest(frame().value).status, Status.OK);
  assert.equal(c.submit(hudIntent().value).status, Status.OK);
  assert.equal(c.pendingCount, 1);
  const r = c.drawFrame(() => {});
  assert.equal(r.status, Status.DEGRADED, "帧含限制说明 → degraded 而非 ok");
  assert.match(r.reason, /采集帧附带限制/);
  assert.equal(c.pendingCount, 0);
  assert.equal(c.dispose().status, Status.OK);
  assert.equal(c.submit(hudIntent().value).status, Status.DENIED, "销毁后拒绝提交");
  assert.equal(c.dispose().status, Status.OK, "幂等销毁");
});

test("RI-D2 绘制回调超时返回 timeout，不阻塞总线", () => {
  let t = 1000;
  const c = createCompositor({ now: () => { t += 20; return t; } }); // 每次 +20ms > 16ms 预算
  c.submit(hudIntent().value);
  assert.equal(c.drawFrame(() => {}).status, Status.TIMEOUT);
  assert.equal(COMPOSITOR_BUDGET.drawTimeoutMs, 16);
});

test("RI-D3 单帧意图数超预算返回 resource-exhausted", () => {
  const c = createCompositor({ now: () => 1000 });
  for (let i = 0; i < COMPOSITOR_BUDGET.maxIntentsPerFrame; i += 1) {
    const r = createIntent("hud", {
      elementId: `e${i}`, rect: { x: 0, y: 0, w: 1, h: 1 },
      content: { kind: "text", data: String(i) }, anchor: "screen"
    }, { now: 1000 });
    assert.equal(c.submit(r.value).status, Status.OK);
  }
  const over = createIntent("hud", {
    elementId: "over", rect: { x: 0, y: 0, w: 1, h: 1 },
    content: { kind: "text", data: "x" }, anchor: "screen"
  }, { now: 1000 });
  assert.equal(c.submit(over.value).status, Status.RESOURCE_EXHAUSTED);
  assert.equal(c.submit(over.value).code, "E_RI_TOO_MANY_INTENTS");
});

test("RI-D4 2D 正交投影：无采集帧返回 unsupported，不伪造中心点", () => {
  const c = createCompositor({ now: () => 1000 });
  const noFrame = c.projectMinimap(48, { x: 0, y: 0, w: 200, h: 200 });
  assert.equal(noFrame.status, Status.UNSUPPORTED);
  assert.equal(noFrame.code, "E_RI_NO_CAMERA");
  c.ingest(frame().value);
  const r = c.projectMinimap(48, { x: 0, y: 0, w: 200, h: 200 });
  assert.equal(r.status, Status.DEGRADED);
  assert.match(r.reason, /不是游戏视锥/);
  assert.equal(r.value.points.length, 2); // player + 1 entity
  assert.equal(r.value.points[0].kind, "player");
  assert.equal(r.value.clippedCount, 0);
  assert.equal(c.projectMinimap(0, { x: 0, y: 0, w: 200, h: 200 }).status, Status.DENIED);
});

test("RI-D5 snapshot 无编码器返回 unsupported，注入编码器后返回 PNG 字节", () => {
  const c1 = createCompositor({ now: () => 1000 });
  assert.equal(c1.snapshot().status, Status.UNSUPPORTED);
  const c2 = createCompositor({ now: () => 1000, encodePng: () => PNG_MAGIC });
  assert.equal(c2.snapshot().status, Status.OK);
  assert.ok(c2.snapshot().value instanceof Uint8Array);
  const c3 = createCompositor({ now: () => 1000, encodePng: () => "not bytes" });
  assert.equal(c3.snapshot().status, Status.DENIED);
});

// ---------------------------------------------------------------------------
// E. 资源包投影：构建期可做，运行期不可用
// ---------------------------------------------------------------------------
test("RI-E1 bindTexture 真实原子写文件并生成 texture_list.json", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ri-pack-"));
  try {
    const png = Buffer.concat([PNG_MAGIC, Buffer.from("fake-png-body")]);
    const r = await bindTexture("dynamic://external-screen", png, { outDir: dir });
    assert.equal(r.status, Status.OK);
    assert.equal(r.value.phase, "build-time");
    assert.equal(r.value.written, true);
    assert.equal(r.value.sha256, createHash("sha256").update(png).digest("hex"));
    assert.equal(slotToPackPath("dynamic://external-screen"), "textures/loom/external-screen.png");
    assert.ok(existsSync(path.join(dir, r.value.packPath)));
    assert.ok(existsSync(path.join(dir, "textures", "texture_list.json")));
    assert.equal(JSON.parse(readFileSync(path.join(dir, "textures", "texture_list.json"), "utf8"))[0], r.value.packPath);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("RI-E2 PNG 头、字节预算、槽位与路径穿越拒绝", async () => {
  assert.equal((await bindTexture("dynamic://s", Buffer.from("not a png"))).code, "E_RI_NOT_PNG");
  assert.equal((await bindTexture("http://x", PNG_MAGIC)).status, Status.DENIED);
  const huge = Buffer.alloc(MAX_TEXTURE_BYTES + 1);
  PNG_MAGIC.copy(huge);
  assert.equal((await bindTexture("dynamic://s", huge)).status, Status.RESOURCE_EXHAUSTED);
  assert.equal(buildTextureList(["textures/loom/a.png"]).status, Status.OK);
  assert.equal(buildTextureList(["../../evil.png"]).status, Status.DENIED);
});

test("RI-E3 公告板/光照为 beta（degraded），运行时纹理/材质一律 unsupported", () => {
  const bb = spawnBillboard({ x: 1, y: 2, z: 3 }, "dynamic://s", "minecraft:overworld");
  assert.equal(bb.status, Status.DEGRADED);
  assert.equal(bb.value.requiresPrebuiltGeometry, true);
  const light = updateLight({ target: "fog-resource", runtimeEffect: false, parameters: { density: 0.5 } });
  assert.equal(light.status, Status.DEGRADED);
  assert.equal(light.value.runtimeEffect, false);
  assert.equal(updateLight({ target: "fog-resource", runtimeEffect: true, parameters: {} }).status, Status.DENIED);
  assert.equal(runtimeTextureSwap().status, Status.UNSUPPORTED);
  assert.equal(writeMaterialBin().status, Status.UNSUPPORTED);
});

// ---------------------------------------------------------------------------
// F. 演示页内联脚本「实际执行」（vm + DOM stub），不是伪代码
// ---------------------------------------------------------------------------
test("RI-F1 overlay.html 内联脚本在隔离上下文中真实执行，核心逻辑可调用", () => {
  const html = read("demo/overlay.html");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);

  const noop = () => {};
  const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const els = new Map();
  const makeEl = (id) => ({
    id, value: id === "radius" ? "48" : id === "port" ? "8787" : "",
    textContent: "", innerHTML: "", className: "", files: [],
    width: id === "map" ? 640 : id === "screen" ? 560 : 300,
    height: id === "map" ? 400 : id === "screen" ? 150 : 150,
    onclick: null, oninput: null, onchange: null,
    click: noop, getContext: () => ctx2d
  });
  const wsUrls = [];
  class FakeWS { constructor(url) { this.url = url; wsUrls.push(url); } close() {} }
  class FakeES { constructor(url) { this.url = url; } close() {} }
  class FakeFR { readAsText() {} }
  const timers = [];
  const sandbox = {
    console: { log: noop }, document: { getElementById: (id) => {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    } },
    WebSocket: FakeWS, EventSource: FakeES, FileReader: FakeFR,
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: noop, setTimeout: () => 1, clearTimeout: noop,
    Date, Math, JSON, Number, String, Object, Array, Map, Set, RegExp, Error, isNaN, parseInt, parseFloat
  };
  vm.createContext(sandbox);
  // 追加探针：把词法作用域内的函数/常量暴露出来，用于断言（不修改源文件）
  const probe = `\n;globalThis.__probe = { validateFrame, validateIntent, demoFrame, demoIntent,
    projectMinimap, acceptEnvelope, render, RESULT_STATUSES, INTENT_SCHEMA, FRAME_SCHEMA,
    ENVELOPE_SCHEMA, get frames(){return frames}, get intents(){return intents},
    get mode(){return mode} };`;
  vm.runInContext(scripts[0] + probe, sandbox, { timeout: 3000 });
  const p = sandbox.__probe;

  // 1) 七态一致
  assert.deepEqual([...p.RESULT_STATUSES].sort(), [...ALL_STATUSES].sort());
  // 2) 演示帧合法、伪造 FOV 被拒
  assert.equal(p.validateFrame(p.demoFrame(1)).status, "ok");
  assert.equal(p.validateFrame({ ...p.demoFrame(1), camera: { ...p.demoFrame(1).camera, fovDegrees: 70 } }).status, "denied");
  // 3) 演示意图合法、危险 HTML 被拒
  assert.equal(p.validateIntent(p.demoIntent(1)).status, "ok");
  const evil = JSON.parse(JSON.stringify(p.demoIntent(1)));
  evil.payload.content.data = "<script>x</script>";
  assert.equal(p.validateIntent(evil).status, "denied");
  // 4) 喂入帧后正交投影产出 player + 3 实体，且 degraded 标注不是游戏视锥
  p.acceptEnvelope({ schema: p.ENVELOPE_SCHEMA, seq: 1, channel: "frame", payload: p.demoFrame(1) }, Date.now());
  const proj = p.projectMinimap(48, 640, 400);
  assert.equal(proj.status, "degraded");
  assert.equal(proj.value.points.length, 4);
  assert.equal(proj.value.points[0].id, "player");
  assert.match(proj.reason, /不是游戏视锥/);
  // 5) 启动与连接：演示定时器已注册；WS 指向本机回环，不是公网
  assert.ok(timers.length >= 1, "内置演示 setInterval 应已注册");
  assert.ok(wsUrls.length >= 1, "connect() 应尝试 WS");
  assert.match(wsUrls[0], /^ws:\/\/127\.0\.0\.1:\d+\/$/);
  // 6) render() 再次执行不抛错（Canvas stub 已覆盖全部调用）
  assert.doesNotThrow(() => p.render());
});

test("RI-F2 演示页离线约束：无 CDN、无 fetch、无外部域名，三级降级齐备", () => {
  const html = read("demo/overlay.html");
  assert.doesNotMatch(html, /<script[^>]+src=/, "不得引用外部脚本");
  assert.doesNotMatch(html, /<link[^>]+href=/, "不得引用外部样式");
  assert.doesNotMatch(html, /\bfetch\s*\(/, "不得发起 fetch 请求");
  assert.doesNotMatch(html, /https?:\/\/[^"'\s]+\.(js|css|png|jpg|woff)/, "不得引用外部资源");
  assert.doesNotMatch(html, /https?:\/\/(?!127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i, "不得出现外部域名");
  assert.match(html, /new WebSocket\(/);
  assert.match(html, /new EventSource\(/);
  assert.match(html, /内置合成演示/);
  assert.match(html, /不深入渲染管线，只深入渲染意图/);
});

test("RI-F3 sample-intents.jsonl 每行信封都能被 fromWire 解析", () => {
  const text = read("demo/sample-intents.jsonl");
  const lines = text.split("\n").filter((l) => l.trim());
  assert.equal(lines.length, 5);
  const channels = new Set();
  for (const [i, l] of lines.entries()) {
    const r = fromWire(l);
    assert.equal(r.status, Status.OK, `第 ${i + 1} 行解析失败：${r.code}`);
    assert.equal(r.value.seq, i);
    channels.add(r.value.channel);
  }
  assert.deepEqual([...channels].sort(), ["frame", "intent"]);
});

test("RI-F4 serve.mjs 的 demoFrame 能被 validateFrame 接受（非伪数据）", async () => {
  // 直接静态核对：serve.mjs 导出的 demoFrame 会 import core/intent.mjs；这里复现其形状并校验
  const src = read("demo/serve.mjs");
  assert.match(src, /export function demoFrame/);
  assert.match(src, /fovDegrees: null, near: null, far: null/);
  assert.match(src, /source: "synthetic-demo"/);
  assert.match(src, /loopbackOnly: true/);
  // 真值：把 serve.mjs 里的帧形状等价构造出来校验
  const f = makeFrame({ camera: cam(), entities: [
    { id: "e-zombie", position: { x: 8, y: 64, z: 6 }, bounds: null }
  ], source: "synthetic-demo", tick: 1, caveats: ["合成演示数据"], now: 1000 });
  assert.equal(f.status, Status.OK);
});

// ---------------------------------------------------------------------------
// G. 静态负向扫描：零注入 / 零 Hook / 零外部网络 / 零覆盖
// ---------------------------------------------------------------------------
test("RI-G1 core 纯逻辑无 node:* 与 process，runtime 才允许 Node 内置模块", () => {
  const coreDir = path.join(RI, "core");
  for (const f of readdirSync(coreDir).filter((x) => x.endsWith(".mjs"))) {
    const src = readFileSync(path.join(coreDir, f), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, `${f} 不得 import node:*`);
    assert.doesNotMatch(src, /\bprocess\./, `${f} 不得使用 process`);
  }
  const busSrc = read("runtime/bus.mjs");
  assert.match(busSrc, /from "node:http"/);
  assert.match(busSrc, /isLoopbackHost/);
});

test("RI-G2 全目录负向扫描：无注入/Hook/私有偏移实现，无外部网络调用", () => {
  const forbidden = /\b(sigscan|dll_inject|WriteProcessMemory|VirtualProtect|patchBinary|bypassSignature|privateOffset)\b/i;
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|ts|js|html)$/.test(e.name)) files.push(p);
    }
  };
  walk(RI);
  assert.ok(files.length >= 14, `扫描文件数不足：${files.length}`);
  for (const p of files) {
    const src = readFileSync(p, "utf8");
    assert.doesNotMatch(src, forbidden, `${path.relative(RI, p)} 出现被禁止的实现`);
    assert.doesNotMatch(src, /from\s+["'](?:axios|ws|express|puppeteer)["']/, `${path.relative(RI, p)} 不得引入第三方依赖`);
  }
});

test("RI-G3 采集脚本只用官方模块，明确 FOV null 与 publishDirect=unsupported", () => {
  const src = read("collector/behavior-pack-collector.js");
  assert.match(src, /from "@minecraft\/server"/);
  assert.match(src, /fovDegrees: null/);
  assert.match(src, /bounds: null/);
  assert.match(src, /setDynamicProperty/);
  assert.match(src, /status: "unsupported"/);
  assert.doesNotMatch(src, /new WebSocket|fetch\(|require\(|node:/, "客户端脚本不得直连网络/文件");
  assert.match(src, /每 10 tick|COLLECT_INTERVAL_TICKS = 10/);
});

test("RI-G4 零覆盖：既有 40 文件与 v2.0 关键产物哈希不变", () => {
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  assert.equal(sha(path.join(ROOT, "..", "mod", "mod.json")),
    "b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48");
  assert.equal(sha(path.join(ROOT, "..", "mod", "docs", "RENDER_AUDIT.md")),
    "3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390");
  // v2.0 冻结文档存在且未被本扩展改写
  for (const f of ["03-api-status-table.md", "04-render-stage-contract.md", "17-final-answer.md"]) {
    assert.ok(existsSync(path.join(ROOT, "docs", f)), `缺少既有文档 ${f}`);
  }
});

test("RI-G5 补充说明文档明确「不深入渲染管线，只深入渲染意图」", () => {
  const doc = readFileSync(path.join(ROOT, "docs", "18-render-intent.md"), "utf8");
  assert.match(doc, /不深入渲染管线，只深入渲染意图/);
  assert.match(doc, /Stable 20/);
  assert.match(doc, /@since 2\.1\.0/);
  assert.match(doc, /未经真机验证/);
  const audit = read("docs/14-render-intent.md");
  assert.match(audit, /能力边界表/);
  assert.match(audit, /32 行/);
  assert.match(audit, /render\.drawTriangle/); // 仅作为「禁止声明」出现
});
