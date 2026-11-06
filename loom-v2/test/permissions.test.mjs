import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, evaluateAll, reconfirm, revoke, trustSummary, catalogEntry, Decision } from "../core/permissions.mjs";
import { Status } from "../core/result.mjs";

const base = { modId: "a", granted: ["presentation.local", "native.module", "network.presentation"], sourceTrust: "trusted" };

test("S16 evaluate：已声明且已同意 -> allow，未声明 -> deny", () => {
  assert.equal(evaluate({ ...base, permission: "presentation.local" }).value.decision, Decision.ALLOW);
  const denied = evaluate({ ...base, permission: "audio.local" });
  assert.equal(denied.value.decision, Decision.DENY);
  assert.match(denied.value.reasons[0], /未.*声明|撤销/);
});

test("S16 高风险权限必须强化确认，不能用普通'继续'掩盖", () => {
  const r = evaluate({ ...base, permission: "native.module" });
  assert.equal(r.value.decision, Decision.RECONFIRM);
  assert.equal(r.value.requiresConfirm, true);
  assert.match(r.value.reasons[0], /强化确认/);
  assert.equal(r.value.risk, "critical");
});

test("S16 遥测默认拒绝：除非单独、明确、可撤销同意", () => {
  const r = evaluate({ ...base, permission: "telemetry.collect", granted: ["telemetry.collect"] });
  assert.equal(r.value.decision, Decision.DENY);
  const withConsent = evaluate({
    ...base, permission: "telemetry.collect", granted: ["telemetry.collect"],
    consent: { "telemetry.collect": { explicit: true, separate: true, revoked: false } }
  });
  assert.equal(withConsent.value.decision, Decision.ALLOW);
  const revokedConsent = evaluate({
    ...base, permission: "telemetry.collect", granted: ["telemetry.collect"],
    consent: { "telemetry.collect": { explicit: true, separate: true, revoked: true } }
  });
  assert.equal(revokedConsent.value.decision, Decision.DENY);
});

test("S16 源不可信必须警告，不允许静默降级", () => {
  const r = evaluate({ ...base, permission: "presentation.local", sourceTrust: "untrusted" });
  assert.equal(r.value.decision, Decision.DENY);
  assert.match(r.value.reasons[0], /不可信/);
  const revoked = evaluate({ ...base, permission: "presentation.local", sourceTrust: "revoked" });
  assert.equal(revoked.value.decision, Decision.DENY);
});

test("S17 运行时新增权限必须重新确认；离线时网络能力降级但不影响本地", () => {
  const added = evaluate({ ...base, permission: "audio.local", runtimeAdded: true });
  assert.equal(added.value.decision, Decision.RECONFIRM);
  const offline = evaluate({ ...base, permission: "network.presentation", offline: true });
  assert.equal(offline.value.decision, Decision.DEGRADE);
  assert.match(offline.value.fallback, /本地/);
});

test("S17 reconfirm 产出可撤销同意记录与审计；revoke 生效", () => {
  const r = reconfirm("a", ["network.presentation"], { consented: true, explicit: true });
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.revocable, true);
  assert.equal(r.value.riskStatement.length, 1);
  assert.match(r.value.audit, /撤销/);
  const noConsent = reconfirm("a", ["network.presentation"], { consented: false });
  assert.equal(noConsent.status, Status.DENIED);
  assert.equal(noConsent.code, "E_PERM_NEW_AT_RUNTIME");
  const consent = { "presentation.local": { explicit: true, revoked: false } };
  const revoked = revoke(consent, "presentation.local");
  assert.equal(revoked.value["presentation.local"].revoked, true);
  assert.equal(consent["presentation.local"].revoked, false, "不得修改原对象");
});

test("S16 evaluateAll 汇总最大风险与是否需要强化确认", () => {
  const r = evaluateAll(["presentation.local", "native.module"], base);
  assert.equal(r.value.decisions.length, 2);
  assert.equal(r.value.maxRisk, 4);
  assert.equal(r.value.needsStrongConfirm, true);
  assert.equal(r.value.allAllowed, false);
});

test("S16 双层描述与信任摘要：签名/作者/来源/已知问题/许可证/供应链", () => {
  assert.ok(catalogEntry("native.module").plain);
  assert.ok(catalogEntry("native.module").technical);
  const summary = trustSummary({
    identity: { id: "a", authors: ["Author"], license: "MIT" },
    signature: { keyId: "k1" },
    provenance: { installedFrom: "official", sourceKind: "official" },
    permissions: [{ id: "native.module" }],
    compatibility: { knownIssues: ["崩溃"] }
  });
  assert.equal(summary.signed, true);
  assert.equal(summary.author, "Author");
  assert.equal(summary.license, "MIT");
  assert.equal(summary.highRiskPermissions.length, 1);
  assert.equal(summary.telemetry, "默认不收集");
  assert.ok(summary.flags.includes("存在已知问题"));
});
