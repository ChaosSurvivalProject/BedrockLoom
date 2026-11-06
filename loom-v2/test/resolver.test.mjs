import test from "node:test";
import assert from "node:assert/strict";
import { resolveLoadOrder, detectConflicts, computeEnableSet, resolve, explain, planUpdate, ISSUE_CODE } from "../core/resolver.mjs";
import { Status } from "../core/result.mjs";

const m = (id, version = "1.0.0", extra = {}) => ({ id, version, enabled: true, ...extra });

test("S07 拓扑排序：依赖在前，tie-break 按 id 字典序，不依赖输入顺序", () => {
  const mods = [
    m("z.hud", "1.0.0", { requires: [{ id: "b.core", range: ">=1.0.0" }] }),
    m("a.fx", "1.0.0", { requires: [{ id: "b.core", range: ">=1.0.0" }] }),
    m("b.core", "1.0.0")
  ];
  const a = resolveLoadOrder(mods);
  const b = resolveLoadOrder([...mods].reverse());
  assert.equal(a.ok, true);
  assert.deepEqual(a.order, ["b.core", "a.fx", "z.hud"]);
  assert.deepEqual(a.order, b.order);
});

test("S07 缺依赖 / 版本不匹配 / 可选依赖只诊断", () => {
  const r = resolveLoadOrder([
    m("a", "1.0.0", { requires: [{ id: "missing", range: ">=1.0.0" }] }),
    m("b", "1.0.0", { requires: [{ id: "c", range: ">=2.0.0" }] }),
    m("c", "1.0.0"),
    m("d", "1.0.0", { optional: [{ id: "not-there", range: ">=1.0.0" }] })
  ]);
  const codes = r.issues.map((i) => i.code);
  assert.ok(codes.includes(ISSUE_CODE.MISSING));
  assert.ok(codes.includes(ISSUE_CODE.VERSION));
  assert.ok(codes.includes(ISSUE_CODE.OPTIONAL_MISSING));
  assert.equal(r.ok, false);
});

test("S07 依赖环给出环路径", () => {
  const r = resolveLoadOrder([
    m("a", "1.0.0", { requires: [{ id: "b", range: ">=1.0.0" }] }),
    m("b", "1.0.0", { requires: [{ id: "a", range: ">=1.0.0" }] })
  ]);
  const cycle = r.issues.find((i) => i.code === ISSUE_CODE.CYCLE);
  assert.ok(cycle);
  assert.deepEqual(cycle.cycle.sort(), ["a", "b"]);
});

test("S07 六类冲突：硬冲突 / 服务 / 命名空间 / 按键 / HUD", () => {
  const mods = [
    m("a", "1.0.0", { conflicts: [{ id: "b", range: ">=1.0.0" }] }),
    m("b", "1.0.0"),
    m("c", "1.0.0", { provides: ["service.particle"], resourceNamespaces: ["ns.shared"], inputBindings: ["key.g"], hudSlots: ["top_right"] }),
    m("d", "1.0.0", { provides: ["service.particle"], resourceNamespaces: ["ns.shared"], inputBindings: ["key.g"], hudSlots: ["top_right"] })
  ];
  const codes = detectConflicts(mods).map((i) => i.code);
  for (const c of [ISSUE_CODE.HARD_CONFLICT, ISSUE_CODE.SERVICE_CONFLICT, ISSUE_CODE.NAMESPACE_COLLISION, ISSUE_CODE.KEY_CONFLICT, ISSUE_CODE.HUD_CONFLICT]) {
    assert.ok(codes.includes(c), `缺少冲突类型 ${c}`);
  }
});

test("S07 不静默挑选胜者：同名服务两个实现必须返回冲突", () => {
  const issues = detectConflicts([m("a", "1.0.0", { provides: ["svc"] }), m("b", "1.0.0", { provides: ["svc"] })]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, ISSUE_CODE.SERVICE_CONFLICT);
  assert.equal(issues[0].involved.length, 2);
});

test("S15 computeEnableSet：依赖自动启用，阻止危险禁用", () => {
  const mods = [
    m("a", "1.0.0", { requires: [{ id: "b", range: ">=1.0.0" }] }),
    m("b", "1.0.0"),
    m("c", "1.0.0")
  ];
  const r = computeEnableSet(mods, ["a"]);
  assert.deepEqual(r.enabled, ["a", "b"]);
  const disabled = computeEnableSet([m("a", "1.0.0"), m("b", "1.0.0", { requires: [{ id: "a", range: ">=1.0.0" }] })], ["b"]);
  assert.deepEqual(disabled.enabled, ["a", "b"]);
});

test("S08 explain：给出人话原因与可执行建议，不只是'不能启用'", () => {
  const e = explain({ code: ISSUE_CODE.VERSION, modId: "a", detail: "b 版本 1.0.0 不满足 >=2.0.0", involved: ["b"] });
  assert.equal(e.title, "依赖版本不匹配");
  assert.match(e.why, /不满足/);
  assert.ok(e.suggestions.length >= 2);
  assert.ok(e.suggestions.some((s) => /候选版本|回退/.test(s)));
});

test("S07 resolve：安装新模组 + 强制覆盖必须产出审计与回退点", () => {
  const state = { installed: [m("core", "2.0.0")] };
  const clean = resolve(state, { install: m("new.mod", "1.0.0"), enable: ["core", "new.mod"] });
  assert.equal(clean.status, Status.OK);
  assert.deepEqual(clean.value.order.sort(), ["core", "new.mod"]);

  const withConflict = {
    installed: [
      m("a", "1.0.0", { conflicts: [{ id: "b", range: ">=1.0.0" }], provides: ["svc"] }),
      m("b", "1.0.0", { provides: ["svc"] })
    ]
  };
  const blocked = resolve(withConflict, { enable: ["a", "b"] });
  assert.equal(blocked.status, Status.PARTIAL);
  assert.equal(blocked.value.ok, false);
  assert.ok(blocked.value.explanations.length > 0);

  const forced = resolve(withConflict, { enable: ["a", "b"], forceOverrides: [ISSUE_CODE.SERVICE_CONFLICT] });
  assert.equal(forced.value.audit.length > 0, true);
  assert.equal(forced.value.audit[0].rollbackPoint, "BACKUP");
  assert.match(forced.value.audit[0].risk, /强制覆盖/);
});

test("S06 planUpdate：重大更新与权限增加须二次确认", () => {
  const plans = planUpdate(
    { version: "1.0.0", permissions: ["presentation.local"] },
    [{ version: "1.1.0", permissions: ["presentation.local"] }, { version: "2.0.0", breaking: true, permissions: ["presentation.local", "network.presentation"] }],
    { loaderApiRange: ">=2.0.0 <3.0.0" }
  );
  const major = plans.find((p) => p.version === "2.0.0");
  assert.equal(major.majorChange, true);
  assert.equal(major.requiresSecondConfirm, true);
  assert.deepEqual(major.permissionIncrease, ["network.presentation"]);
  assert.equal(plans.find((p) => p.version === "1.1.0").requiresSecondConfirm, false);
});
