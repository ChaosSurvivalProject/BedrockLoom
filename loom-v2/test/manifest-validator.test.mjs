import test from "node:test";
import assert from "node:assert/strict";
import { validate, isV1, isV2 } from "../core/manifest-validator.mjs";
import { Status } from "../core/result.mjs";
import { makeSignedPack, readV1 } from "./_helpers.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));

test("S01 真实迁移产出的 v2 manifest 通过全部校验", async () => {
  const { manifest } = await makeSignedPack();
  const r = validate(manifest);
  assert.equal(r.status, Status.OK, JSON.stringify(r.value?.errors ?? r.failures));
  assert.equal(r.value.valid, true);
  assert.equal(r.value.id, "example.loom_blade");
  assert.equal(isV2(manifest), true);
});

test("S01 v1 manifest 被拒绝并提示迁移，不静默当成 v2", async () => {
  const v1 = await readV1();
  assert.equal(isV1(v1), true);
  const r = validate(v1);
  assert.equal(r.status, Status.UNSUPPORTED);
  assert.equal(r.code, "E_MANIFEST_SCHEMA");
  assert.match(r.message, /迁移/);
});

test("S01 错误码：schema / 缺字段 / ID 格式 / ID 与名称未分离", async () => {
  const { manifest } = await makeSignedPack();
  const badSchema = clone(manifest); badSchema.schema = "bedrockloom.mod/v9";
  assert.equal(validate(badSchema).code, "E_MANIFEST_SCHEMA");

  const missing = clone(manifest); delete missing.identity;
  assert.ok(validate(missing).failures.some((e) => e.code === "E_MANIFEST_MISSING_FIELD"));

  const badId = clone(manifest); badId.identity.id = "Bad ID!";
  assert.ok(validate(badId).failures.some((e) => e.code === "E_ID_FORMAT"));

  const coupled = clone(manifest); coupled.identity.name = coupled.identity.id;
  assert.ok(validate(coupled).failures.some((e) => e.code === "E_ID_NAME_COUPLED"));
});

test("S01 平台纪律：客户端版本不得泛化，国际版构建不得含网易适配器", async () => {
  const { manifest } = await makeSignedPack();
  const vague = clone(manifest); vague.client.clientVersionRange = "1.21.x";
  assert.ok(validate(vague).failures.some((e) => e.code === "E_CLIENT_RANGE"));
  const mixed = clone(manifest); mixed.client.platformAdapters = ["international", "netease"];
  assert.ok(validate(mixed).failures.some((e) => e.code === "E_PLATFORM_ADAPTER"));
});

test("S01 证据纪律：in-game 能力不得标 Stable；Stable 必须 E4/E5 + platform-side", async () => {
  const { manifest } = await makeSignedPack();
  const a = clone(manifest);
  a.client.capabilityMap.international.push({ id: "fake", status: "Stable", evidenceLevel: "E4", evidenceDomain: "in-game" });
  assert.ok(validate(a).failures.some((e) => e.code === "E_CAPABILITY_MIXED_EVIDENCE"));

  const b = clone(manifest);
  b.capabilities.push({ id: "fake2", status: "Stable", evidenceLevel: "E2", evidenceDomain: "platform-side" });
  assert.ok(validate(b).failures.some((e) => e.code === "E_CAPABILITY_MIXED_EVIDENCE"));

  const c = clone(manifest);
  c.capabilities.push({ id: "fake3", status: "Stable", evidenceLevel: "E4", evidenceDomain: "in-game" });
  assert.ok(validate(c).failures.some((e) => e.code === "E_CAPABILITY_MIXED_EVIDENCE"));
});

test("S01 阶段合同纪律：介入点不得写'底层自动处理'等占位表述", async () => {
  const { manifest } = await makeSignedPack();
  const m = clone(manifest);
  m.stageContracts = [{ stage: "PostProcess", intervention: "indirect-influence", actualInterventionPoint: "底层自动处理" }];
  assert.ok(validate(m).failures.some((e) => e.code === "E_STAGE_POINT_EMPTY"));
});

test("S01 权限与敏感项：未登记权限、低风险账号权限、令牌写入普通配置均拒绝", async () => {
  const { manifest } = await makeSignedPack();
  const a = clone(manifest); a.permissions.push({ id: "unknown.permission", scope: "local", risk: "low", plainReason: "x", technicalDetail: "y" });
  assert.ok(validate(a).failures.some((e) => e.code === "E_PERMISSION_UNDECLARED"));

  const b = clone(manifest); b.permissions.push({ id: "account.identity", scope: "account", risk: "low", plainReason: "x", technicalDetail: "y" });
  assert.ok(validate(b).failures.some((e) => e.code === "E_PERMISSION_SCOPE"));

  const c = clone(manifest); c.config.defaults.api_token = "abc";
  assert.ok(validate(c).failures.some((e) => e.code === "E_SENSITIVE_IN_CONFIG"));
});

test("S01 签名与完整性声明：hash 格式、文件清单、实际来源", async () => {
  const { manifest } = await makeSignedPack();
  const a = clone(manifest); a.content.manifestHash = "xyz";
  assert.ok(validate(a).failures.some((e) => e.code === "E_SIG_PAYLOAD_HASH"));
  const b = clone(manifest); b.signature.algorithm = "RSA";
  assert.ok(validate(b).failures.some((e) => e.code === "E_SIG_MISSING"));
  const c = clone(manifest); delete c.provenance.installedFrom;
  assert.ok(validate(c).failures.some((e) => e.code === "E_MANIFEST_MISSING_FIELD"));
});
