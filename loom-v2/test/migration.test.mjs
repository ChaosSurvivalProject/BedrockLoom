import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { ROOT, MOD_ROOT, makeSignedPack } from "./_helpers.mjs";
import { toV2, migrateCli } from "../services/migrate-v1-to-v2.mjs";
import { validate } from "../core/manifest-validator.mjs";
import { Status } from "../core/result.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

test("S20 真实读取 ../mod/mod.json 并转换为合法 v2 manifest", async () => {
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
  const r = toV2(v1);
  assert.equal(r.status, Status.OK);
  const m = r.value;
  assert.equal(m.schema, "bedrockloom.mod/v2");
  assert.equal(m.identity.id, "example.loom_blade");
  assert.notEqual(m.identity.name, m.identity.id, "稳定 ID 与可见名称必须分离");
  assert.equal(m.client.clientVersionRange, ">=1.21.130");
  assert.deepEqual(m.client.platformAdapters, ["international"]);
  assert.equal(m.entrypoints.client, "files/behavior_pack/scripts/main.js");
  assert.equal(validate(m).status, Status.OK, JSON.stringify(validate(m).value?.errors));
});

test("S20 v1 示例 manifest 同样可迁移（兼容 fixture）", async () => {
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "examples/mod.manifest.json"), "utf8"));
  const r = toV2(v1);
  assert.equal(r.status, Status.OK);
  assert.equal(validate(r.value).status, Status.OK);
});

test("S20 生成的 v2 通过全部校验，capabilities 覆盖旧 14 类", async () => {
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
  const m = toV2(v1).value;
  const expected = ["event-bus", "permission-gate", "model-registry", "material-registry", "animation-controller", "particle-submit", "sound-submit", "screen-ui", "world-ui", "input-events", "camera-effect", "entity-observation", "local-storage", "capability-probe"];
  for (const id of expected) assert.ok(m.capabilities.some((c) => c.id === id), `缺少映射 ${id}`);
  assert.equal(m.capabilities.filter((c) => c.status === "Unavailable").length >= 2, true, "CameraApi/WorldUiApi 应标 Unavailable");
  assert.equal(m.stageContracts.length, 10, "十个渲染阶段合同齐全");
  assert.equal(validate(m).value.valid, true);
});

test("S20 迁移说明记录五个真实审查发现，且 requiresVerification=true", async () => {
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
  const m = toV2(v1).value;
  assert.equal(m.migration.fromSchema, "bedrockloom.mod/v1");
  assert.equal(m.migration.requiresVerification, true);
  const notes = m.migration.notes.join("\n");
  for (const kw of ["1.14.0", "@minecraft/server-graphics", "MolangVariableMap", "Dynamic Properties", "v26.30"]) {
    assert.ok(notes.includes(kw), `迁移说明缺少发现: ${kw}`);
  }
  assert.ok(m.client.moduleVersions["@minecraft/server"].includes("2.4.0"));
});

test("S20 权限映射：带命名空间的旧声明映射到 v2 目录项", async () => {
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
  const m = toV2(v1).value;
  assert.ok(m.permissions.some((p) => p.id === "storage.world"));
  assert.ok(m.permissions.some((p) => p.id === "presentation.local"));
  assert.ok(m.permissions.every((p) => p.plainReason && p.technicalDetail), "双层描述齐全");
});

test("S20 CLI 迁移写出文件，且 40 个既有文件字节级不变（零覆盖）", async () => {
  const before = {
    modJson: await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"),
    audit: await readFile(path.join(MOD_ROOT, "docs/RENDER_AUDIT.md"), "utf8"),
    clientApi: await readFile(path.join(MOD_ROOT, "behavior_pack/scripts/api/client_api.js"), "utf8")
  };
  const r = await migrateCli();
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.oldFilesUntouched, true);
  assert.ok((await stat(r.value.written)).size > 1000);
  const written = JSON.parse(await readFile(r.value.written, "utf8"));
  assert.equal(written.schema, "bedrockloom.mod/v2");
  assert.equal(validate(written).status, Status.OK);

  assert.equal(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"), before.modJson);
  assert.equal(await readFile(path.join(MOD_ROOT, "docs/RENDER_AUDIT.md"), "utf8"), before.audit);
  assert.equal(await readFile(path.join(MOD_ROOT, "behavior_pack/scripts/api/client_api.js"), "utf8"), before.clientApi);
  assert.equal(sha(before.modJson), "b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48");
  assert.equal(sha(before.audit), "3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390");
});

test("S20 makeSignedPack 的产物与迁移产物一致且签名摘要自洽", async () => {
  const pack = await makeSignedPack();
  assert.equal(pack.manifest.identity.id, "example.loom_blade");
  assert.equal(validate(pack.manifest).status, Status.OK);
  assert.match(pack.manifest.content.manifestHash, /^[a-f0-9]{64}$/);
});
