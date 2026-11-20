/**
 * 游戏内合规层：能力探测、伪接口否定、FOV 恒 null、直连 WS 否定、运行时隔离。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoom, LOOM_LAYER } from "../ingame/loom-global.js";
import { UNAVAILABLE_RENDER_CALLS } from "../ingame/api-render.js";
import { UNAVAILABLE_ASSET_CALLS } from "../ingame/api-assets.js";
import { Status } from "../ingame/result.js";

test("G1 loom 全局对象三命名空间齐备，层标记正确", () => {
  const loom = createLoom({});
  assert.equal(loom.layer, LOOM_LAYER);
  assert.equal(loom.layer, "in-game-compliant");
  for (const k of ["render", "world", "assets", "runtime", "bridge", "probe"]) {
    assert.ok(k in loom, `缺少 ${k}`);
  }
  assert.equal(loom.probe.available.length, 0, "空 host 时无任何可用能力");
  assert.ok(loom.caveats.some((c) => c.includes("无 WebSocket")));
});

test("G2 能力探测逐项检查绑定，不靠版本号盲猜", () => {
  const host = { getPlayerView: () => ({ position: { x: 1, y: 64, z: 1 } }) };
  const loom = createLoom(host);
  assert.deepEqual(loom.probe.available, ["getPlayerView"]);
  assert.ok(loom.probe.unavailable.includes("setActionBar"));
  assert.match(loom.probe.note, /不读取客户端版本/);
});

test("G3 伪接口名只是只读否定清单，不是可调用函数", () => {
  const loom = createLoom({});
  for (const name of ["drawTriangle", "setShader", "hookPresent", "setCameraMatrix", "pushDynamicTexture"]) {
    assert.ok(UNAVAILABLE_RENDER_CALLS.includes(name));
    assert.equal(typeof loom.render[name], "undefined", `${name} 不得可调用`);
  }
  assert.ok(UNAVAILABLE_ASSET_CALLS.includes("runtimeTextureSwap"));
  assert.equal(typeof loom.assets.runtimeTextureSwap, "undefined");
});

test("G4 camera() 的 FOV/near/far/视锥/包围盒恒 null", () => {
  const loom = createLoom({ getPlayerView: () => ({ position: { x: 0, y: 64, z: 0 }, viewDirection: { x: 0, y: 0, z: 1 } }) });
  const r = loom.render.camera();
  assert.equal(r.status, Status.OK);
  for (const k of ["fovDegrees", "near", "far", "frustum", "bounds"]) {
    assert.equal(r.value[k], null, `${k} 必须为 null`);
  }
  assert.deepEqual(r.value.position, { x: 0, y: 64, z: 0 });
});

test("G5 适配器伪造 FOV 一律 denied（拒绝伪造证据）", () => {
  const loom = createLoom({ getPlayerView: () => ({ fovDegrees: 70 }) });
  const r = loom.render.camera();
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_CAMERA_FABRICATED");
});

test("G6 无 host 绑定的能力返回 unsupported，不伪造降级", () => {
  const loom = createLoom({});
  assert.equal(loom.render.hud({ text: "hi" }).status, Status.UNSUPPORTED);
  assert.equal(loom.render.submitParticle({ type: "x" }).status, Status.UNSUPPORTED);
  assert.equal(loom.world.playerView().status, Status.UNSUPPORTED);
  assert.equal(loom.assets.pushDynamicTexture().status, Status.UNSUPPORTED);
  assert.equal(loom.render.setAtmospherics({ rayleighStrength: 1 }).status, Status.UNSUPPORTED);
});

test("G7 HUD 提交成功但 visualGuarantee=none；危险文本被拒", () => {
  let called = null;
  const loom = createLoom({ setActionBar: (t) => { called = t; } });
  const r = loom.render.hud({ text: "hello" });
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.visualGuarantee, "none");
  assert.equal(called, "hello");
  assert.equal(loom.render.hud({ text: "<script>x</script>" }).status, Status.DENIED);
});

test("G8 大气散射只接受官方参数，未知参数拒绝", () => {
  const loom = createLoom({ setRayleighStrength: () => {}, setSunMieStrength: () => {} });
  const r = loom.render.setAtmospherics({ rayleighStrength: 1, sunMieStrength: 0.5 });
  assert.equal(r.status, Status.OK);
  assert.match(r.value.scope, /Vibrant Visuals/);
  assert.equal(loom.render.setAtmospherics({ customShader: 1 }).status, Status.DENIED);
});

test("G9 世界数据明确为客户端本地事实，不当多人权威", () => {
  const loom = createLoom({ getPlayerView: () => ({ dimensionId: "minecraft:overworld" }) });
  const r = loom.world.playerView();
  assert.equal(r.value.authority, "client-local");
  assert.equal(r.value.frustum, null);
  assert.match(r.value.caveat, /不得作为多人权威操作/);
});

test("G10 资产层拒绝路径穿越，句柄可回收", () => {
  const loom = createLoom({});
  assert.equal(loom.assets.bind("../evil").status, Status.DENIED);
  assert.equal(loom.assets.bind("/etc/passwd").status, Status.DENIED);
  const b = loom.assets.bind("pack://loom/icon.png");
  assert.equal(b.status, Status.OK);
  assert.equal(loom.assets.release(b.value.handle).status, Status.OK);
  assert.equal(loom.assets.dispose().status, Status.OK);
  assert.equal(loom.assets.dispose().value.already, true);
});

test("G11 运行时：注册/启停/事件隔离/幂等销毁", () => {
  const loom = createLoom({});
  assert.equal(loom.runtime.register({ id: "a.mod", name: "A", version: "1.0.0" }).status, Status.OK);
  assert.equal(loom.runtime.register({ id: "a.mod", name: "A" }).status, Status.DENIED);
  assert.equal(loom.runtime.start("a.mod").status, Status.OK);
  assert.equal(loom.runtime.stats().running, 1);
  assert.equal(loom.runtime.stop("a.mod").value.resourcesReleased, true);
  assert.equal(loom.runtime.stats().running, 0);

  let good = 0;
  loom.runtime.on("tick", () => { good += 1; });
  loom.runtime.on("tick", () => { throw new Error("boom"); });
  const em = loom.runtime.emit("tick", {});
  assert.equal(em.status, Status.DEGRADED);
  assert.equal(em.value.delivered, 1);
  assert.equal(em.value.failed, 1);
  assert.equal(good, 1, "故障处理器不得影响其他处理器");

  assert.equal(loom.runtime.dispose().status, Status.OK);
  assert.equal(loom.runtime.dispose().value.already, true);
});

test("G12 游戏内不能直连 WS：emitIntent 恒 unsupported", () => {
  const loom = createLoom({});
  const r = loom.bridge.emitIntent();
  assert.equal(r.status, Status.UNSUPPORTED);
  assert.equal(r.code, "E_NO_DIRECT_WS");
  assert.equal(r.directWebSocketFromScriptApi, false);
  assert.equal(r.verification, "未经真机验证");
  assert.equal(loom.bridge.contract.loopbackHost, "127.0.0.1");
  assert.equal(loom.bridge.describe().directWs, false);
});

test("G13 describe() 不含任何账号/坐标/令牌", () => {
  const loom = createLoom({});
  const json = JSON.stringify(loom.describe());
  for (const k of ["token", "xuid", "account", "position", "password"]) {
    assert.ok(!json.includes(k), `诊断信息不得含 ${k}`);
  }
});
