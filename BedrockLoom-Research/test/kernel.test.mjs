/**
 * LoomRender 内核骨架：五契约、A 层恒 unsupported、合规层不写回游戏、资源回收。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createKernel, KERNEL_CONTRACT } from "../loomrender/kernel.mjs";
import { Status } from "../loomrender/result.mjs";

test("K1 五个契约齐备，A 层三个方法标注为 unsupported", () => {
  const names = KERNEL_CONTRACT.map((c) => c.name);
  assert.deepEqual(names, ["init", "submit", "present", "set_camera", "push_texture"]);
  for (const n of ["present", "set_camera", "push_texture"]) {
    const c = KERNEL_CONTRACT.find((x) => x.name === n);
    assert.equal(c.layer, "host-private");
    assert.equal(c.status, "unsupported");
  }
});

test("K2 init 只建立骨架：不附着游戏、不加载原生模块", () => {
  const k = createKernel({ now: () => 1 });
  const r = k.init();
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.mode, "skeleton-only");
  assert.equal(r.value.attachedToGame, false);
  assert.equal(r.value.nativeModulesLoaded, false);
  assert.equal(r.value.frameWrittenToGame, false);
  k.dispose();
});

test("K3 未 init 调用一律 denied；dispose 后同样 denied", () => {
  const k = createKernel();
  assert.equal(k.present().status, Status.DENIED);
  assert.equal(k.submit({ a: 1 }).status, Status.DENIED);
  k.init(); k.dispose();
  assert.equal(k.submit({ a: 1 }).status, Status.DENIED);
});

test("K4 A 层三方法恒 unsupported，且返回三标记", () => {
  const k = createKernel();
  k.init();
  for (const [name, fn] of [["present", k.present], ["set_camera", k.set_camera], ["push_texture", k.push_texture]]) {
    const r = fn();
    assert.equal(r.status, Status.UNSUPPORTED, `${name} 必须恒 unsupported`);
    assert.equal(r.layer, "host-private");
    assert.equal(r.classification, "research-hypothesis");
    assert.equal(r.drift, "version-drift-risk");
    assert.ok(r.verification.includes("本仓库不提供实现"));
  }
  k.dispose();
});

test("K5 submit 未挂合成器返回 degraded，且不写回游戏", () => {
  const k = createKernel(); k.init();
  const r = k.submit({ type: "hud", text: "x" });
  assert.equal(r.status, Status.DEGRADED);
  assert.equal(r.value.frameWrittenToGame, false);
  assert.equal(k.stats().pendingHandles, 0, "句柄必须回收");
  k.dispose();
});

test("K6 挂载外部合成器后算帧，frameWrittenToGame 仍恒 false", () => {
  const k = createKernel(); k.init();
  assert.equal(k.attachCompositor(() => ({ drawn: true })).status, Status.OK);
  const r = k.submit({ type: "hud", text: "hello" });
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.composedExternally, true);
  assert.equal(r.value.frameWrittenToGame, false);
  assert.match(r.value.note, /不进入游戏呈现链路/);
  k.dispose();
});

test("K7 合成器抛错被隔离，句柄强制回收", () => {
  const k = createKernel(); k.init();
  k.attachCompositor(() => { throw new Error("boom"); });
  const r = k.submit({ type: "hud" });
  assert.equal(r.status, Status.DEGRADED);
  assert.equal(k.stats().pendingHandles, 0);
  k.dispose();
});

test("K8 意图体积上限 → resource-exhausted；非法意图 → denied", () => {
  const k = createKernel(); k.init();
  assert.equal(k.submit(null).status, Status.DENIED);
  const big = { blob: "x".repeat(300 * 1024) };
  const r = k.submit(big);
  assert.equal(r.status, Status.RESOURCE_EXHAUSTED);
  assert.equal(r.code, "E_INTENT_TOO_LARGE");
  k.dispose();
});

test("K9 dispose 幂等，回收全部句柄", () => {
  const k = createKernel({ now: () => 42 }); k.init();
  k.attachCompositor(() => undefined);
  k.submit({ a: 1 });
  const r1 = k.dispose();
  assert.equal(r1.status, Status.OK);
  assert.equal(r1.value.closedAt, 42);
  const r2 = k.dispose();
  assert.equal(r2.value.already, true);
  assert.equal(k.stats().pendingHandles, 0);
  assert.equal(k.stats().disposed, true);
});
