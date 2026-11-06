import test from "node:test";
import assert from "node:assert/strict";
import { makeSignedPack } from "./_helpers.mjs";
import { verifyEnvelope, buildEnvelope, createTrustStore, signIndex, verifyIndex, generateKeyPair, canonicalize, sha256Text } from "../services/signature.mjs";
import { verifyFileList, buildFileList, manifestDigest, hashBytes } from "../services/integrity.mjs";
import { Status } from "../core/result.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));

test("S02/S03/S04 真实包：签名 + 文件清单全覆盖校验通过", async () => {
  const pack = await makeSignedPack();
  const sig = verifyEnvelope({ manifest: pack.manifest, fileList: pack.fileList, envelope: pack.envelope, trustStore: pack.trustStore });
  assert.equal(sig.status, Status.OK, sig.message);
  assert.deepEqual(sig.value.protectedPaths, ["META/file-list.json", "manifest.json"]);
  const integrity = verifyFileList(pack);
  assert.equal(integrity.status, Status.OK, JSON.stringify(integrity.details ?? integrity.failures));
  assert.equal(integrity.value.unlisted, 0);
  assert.equal(integrity.value.mismatched, 0);
  assert.equal(integrity.value.manifestHashMatch, true);
  assert.ok(integrity.value.count > 15);
});

test("S03 硬门槛：只签 manifest 而不签文件清单 -> E_SIG_MANIFEST_ONLY", async () => {
  const pack = await makeSignedPack();
  const forged = clone(pack.envelope);
  forged.protected = [forged.protected[0]];
  const r = verifyEnvelope({ manifest: pack.manifest, fileList: pack.fileList, envelope: forged, trustStore: pack.trustStore });
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_SIG_MANIFEST_ONLY");
});

test("S03 篡改 manifest 或文件清单 -> 签名摘要不匹配", async () => {
  const pack = await makeSignedPack();
  const changedManifest = clone(pack.manifest);
  changedManifest.identity.license = "evil-license";
  const r1 = verifyEnvelope({ manifest: changedManifest, fileList: pack.fileList, envelope: pack.envelope, trustStore: pack.trustStore });
  assert.equal(r1.code, "E_SIG_PAYLOAD_HASH");

  const changedList = clone(pack.fileList);
  changedList.count += 1;
  const r2 = verifyEnvelope({ manifest: pack.manifest, fileList: changedList, envelope: pack.envelope, trustStore: pack.trustStore });
  assert.equal(r2.code, "E_SIG_PAYLOAD_HASH");
});

test("S03 未知密钥 / 已撤销密钥 / 无效签名均拒绝", async () => {
  const pack = await makeSignedPack();
  const unknown = verifyEnvelope({ manifest: pack.manifest, fileList: pack.fileList, envelope: pack.envelope, trustStore: createTrustStore([]) });
  assert.equal(unknown.code, "E_SIG_KEY_UNKNOWN");
  const revoked = verifyEnvelope({ manifest: pack.manifest, fileList: pack.fileList, envelope: pack.envelope, trustStore: createTrustStore([{ keyId: pack.keys.keyId, publicKeyPem: pack.keys.publicKeyPem, revoked: true, revocationReason: "密钥轮换" }]) });
  assert.equal(revoked.code, "E_SIG_KEY_REVOKED");
  const badSig = clone(pack.envelope); badSig.signature = Buffer.from("invalid").toString("base64");
  assert.equal(verifyEnvelope({ manifest: pack.manifest, fileList: pack.fileList, envelope: badSig, trustStore: pack.trustStore }).code, "E_SIG_INVALID");
});

test("S04 关键负面用例：替换/新增未列文件被拒绝（签名不能只保护 manifest）", async () => {
  const pack = await makeSignedPack();
  const tamperedFiles = new Map(pack.files);
  tamperedFiles.set("files/behavior_pack/scripts/evil_payload.js", Buffer.from("require('fs')", "utf8"));
  const r = verifyFileList({ manifest: pack.manifest, fileList: pack.fileList, files: tamperedFiles });
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_FILE_UNLISTED");
  assert.ok(r.details.unlistedPaths.includes("files/behavior_pack/scripts/evil_payload.js"));
});

test("S04 已列文件内容被替换 -> E_FILE_HASH_MISMATCH", async () => {
  const pack = await makeSignedPack();
  const files = new Map(pack.files);
  const target = [...files.keys()].find((k) => k.endsWith(".json"));
  files.set(target, Buffer.from(String(files.get(target)) + "\n// injected"));
  const r = verifyFileList({ manifest: pack.manifest, fileList: pack.fileList, files });
  assert.equal(r.code, "E_FILE_HASH_MISMATCH");
});

test("S04 清单中文件缺失 -> partial + E_FILE_MISSING（可断点续传补齐）", async () => {
  const pack = await makeSignedPack();
  const files = new Map(pack.files);
  files.delete([...files.keys()][0]);
  const r = verifyFileList({ manifest: pack.manifest, fileList: pack.fileList, files });
  assert.equal(r.status, Status.PARTIAL);
  assert.ok(r.failures.some((f) => f.code === "E_FILE_MISSING"));
});

test("S04 路径穿越与重复项被拒绝", async () => {
  const pack = await makeSignedPack();
  const list = clone(pack.fileList);
  list.entries[0].path = "../escape.txt";
  const r = verifyFileList({ manifest: pack.manifest, fileList: list, files: pack.files });
  assert.equal(r.code, "E_FILE_PATH_TRAVERSAL");
  const dup = clone(pack.fileList);
  dup.entries.push({ ...dup.entries[0] });
  assert.ok(verifyFileList({ manifest: pack.manifest, fileList: dup, files: pack.files }).failures?.some((f) => f.code === "E_FILE_DUPLICATE"));
});

test("S02 manifestDigest 自洽：写回 manifestHash 后摘要不变", async () => {
  const { manifest } = await makeSignedPack();
  const without = clone(manifest);
  delete without.content.manifestHash;
  assert.equal(sha256Text(canonicalize(without)), manifest.content.manifestHash);
  assert.equal(manifestDigest(manifest), manifest.content.manifestHash);
});

test("S04 buildFileList 确定性：相同内容哈希稳定，路径排序", () => {
  const a = buildFileList(new Map([["b.txt", "B"], ["a.txt", "A"]]));
  const b = buildFileList(new Map([["a.txt", "A"], ["b.txt", "B"]]));
  assert.deepEqual(a.entries.map((e) => e.path), ["a.txt", "b.txt"]);
  assert.equal(a.entries[0].sha256, hashBytes("A"));
  assert.deepEqual(a.entries, b.entries);
});

test("S10 仓库索引签名与撤销记录可验证", () => {
  const keys = generateKeyPair("repo-key");
  const index = {
    schema: "bedrockloom.repo-index/v2", source: { id: "official", kind: "official", trust: "trusted", priority: 0, signatureKeys: [] },
    generatedAt: new Date().toISOString(), sequence: 1, delta: false,
    entries: [{ modId: "a", version: "1.0.0", action: "publish", artifact: { path: "a.loompack", sha256: hashBytes("x"), size: 1, resumeSupported: true }, sourceOfRecord: "official" }],
    revocations: [{ modId: "old", version: "0.9.0", reason: "密钥轮换", revokedAt: new Date().toISOString() }]
  };
  const signed = signIndex(index, keys.privateKeyPem);
  assert.equal(signed.status, Status.OK);
  index.indexSignature = signed.value.indexSignature;
  assert.equal(verifyIndex(index, keys.publicKeyPem).status, Status.OK);
  index.sequence = 2;
  assert.equal(verifyIndex(index, keys.publicKeyPem).code, "E_SIG_INVALID");
});
