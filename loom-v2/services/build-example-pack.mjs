// services/build-example-pack.mjs —— 用既有 ../mod 的真实文件构造并签名一个示例 .loompack 内容。
// 运行: node services/build-example-pack.mjs
// 产物全部写入 examples/，供 test/ 直接验证（"文档中的示例确实执行过"）。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, fail, Status } from "../core/result.mjs";
import { toV2 } from "./migrate-v1-to-v2.mjs";
import { buildFileList, manifestDigest } from "./integrity.mjs";
import { generateKeyPair, buildEnvelope, createTrustStore, signIndex, sha256Text, canonicalize } from "./signature.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MOD_ROOT = path.resolve(ROOT, "..", "mod");
const EX = path.join(ROOT, "examples");

const CONTENT_FILES = Object.freeze([
  "behavior_pack/manifest.json",
  "behavior_pack/scripts/main.js",
  "behavior_pack/scripts/runtime.js",
  "behavior_pack/scripts/api/client_api.js",
  "behavior_pack/scripts/api/capability_probe.js",
  "behavior_pack/scripts/api/self_test.js",
  "behavior_pack/items/loom_blade.json",
  "behavior_pack/recipes/loom_blade.json",
  "resource_pack/manifest.json",
  "resource_pack/models/entity/loom_blade.geo.json",
  "resource_pack/attachables/loom_blade.attachable.json",
  "resource_pack/animations/loom_blade.animation.json",
  "resource_pack/animation_controllers/loom_blade.animation_controllers.json",
  "resource_pack/render_controllers/loom_blade.render_controllers.json",
  "resource_pack/particles/loom_spark.particle.json",
  "resource_pack/sounds/sound_definitions.json",
  "resource_pack/texts/en_US.lang",
  "resource_pack/texts/zh_CN.lang",
  "resource_pack/textures/item_texture.json",
  "resource_pack/textures/items/loom_blade.png"
]);

export async function collectContentFiles() {
  const files = new Map();
  for (const rel of CONTENT_FILES) {
    const src = path.join(MOD_ROOT, rel);
    const bytes = await readFile(src);
    files.set(`files/${rel}`, bytes);
  }
  const icon = await readFile(path.join(MOD_ROOT, "resource_pack/textures/items/loom_blade.png"));
  files.set("files/assets/icon.png", icon);
  files.set("files/assets/README.txt", Buffer.from("Bedrock Loom v2 示例包：内容文件均来自 ../mod，未修改任何既有文件。\n", "utf8"));
  return files;
}

export async function buildExamplePack() {
  await Promise.all([EX, path.join(EX, "META")].map((d) => mkdir(d, { recursive: true })));
  const v1 = JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
  const files = await collectContentFiles();
  const fileList = buildFileList(files);
  const fingerprint = sha256Text(canonicalize(fileList.entries)).slice(0, 32);
  const converted = toV2(v1, { totalBytes: fileList.totalBytes, fingerprint });
  if (converted.status !== Status.OK) return converted;
  const manifest = { ...converted.value, content: { ...converted.value.content, manifestHash: manifestDigest(converted.value) } };
  // 自洽校验：manifestHash 由 manifestDigest 计算，且 content 其余字段已定稿
  if (manifestDigest(manifest) !== manifest.content.manifestHash) return fail(Status.DENIED, "E_SIG_PAYLOAD_HASH", "manifest 摘要不自洽");

  const keys = generateKeyPair("loom-demo-ed25519");
  const envelopeResult = buildEnvelope({ manifest, fileList, privateKeyPem: keys.privateKeyPem, keyId: keys.keyId });
  if (envelopeResult.status !== Status.OK) return envelopeResult;
  const envelope = envelopeResult.value;

  const index = {
    schema: "bedrockloom.repo-index/v2",
    source: {
      id: "official-demo", kind: "official", displayName: "Bedrock Loom 官方示例源",
      baseUrl: "https://repo.bedrockloom.example/index.json", mirrors: [],
      trust: "trusted", priority: 0,
      signatureKeys: [{ keyId: keys.keyId, publicKey: keys.publicKeyPem, fingerprint: keys.fingerprint, validFrom: "2026-11-01T00:00:00.000Z", validUntil: "2027-11-01T00:00:00.000Z" }],
      offlineCache: { cachedAt: new Date().toISOString(), staleAfterHours: 72 }
    },
    generatedAt: new Date().toISOString(), sequence: 1, delta: false,
    entries: [{
      modId: manifest.identity.id, version: manifest.version, action: "publish",
      requiresManager: "2.0.0", clientVersionRange: ">=1.21.130", loaderApiRange: manifest.loader.apiRange,
      permissions: manifest.permissions.map((p) => p.id), breaking: false, changelog: manifest.i18n.changelog,
      artifact: { path: `packs/${manifest.identity.id}-${manifest.version}.loompack`, sha256: fingerprint, size: fileList.totalBytes, resumeSupported: true },
      sourceOfRecord: "official-demo"
    }],
    revocations: [{ modId: "example.old_mod", version: "0.9.0", reason: "签名密钥轮换，旧包不再分发", revokedAt: new Date().toISOString(), replacement: "example.old_mod@1.0.0" }]
  };
  const idxSig = signIndex(index, keys.privateKeyPem);
  if (idxSig.status !== Status.OK) return idxSig;
  index.indexSignature = idxSig.value.indexSignature;

  await writeFile(path.join(EX, "loom-blade.v2.manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeFile(path.join(EX, "META", "file-list.json"), JSON.stringify(fileList, null, 2) + "\n", "utf8");
  await writeFile(path.join(EX, "signature-envelope.example.json"), JSON.stringify(envelope, null, 2) + "\n", "utf8");
  await writeFile(path.join(EX, "trust-store.example.json"), JSON.stringify({ schema: "bedrockloom.trust-store/v1", keys: [{ keyId: keys.keyId, publicKeyPem: keys.publicKeyPem, fingerprint: keys.fingerprint, revoked: false }] }, null, 2) + "\n", "utf8");
  await writeFile(path.join(EX, "demo-private-key.pem"), keys.privateKeyPem, "utf8");
  await writeFile(path.join(EX, "demo-key-NOTICE.txt"), "仅用于示例签名复验的演示私钥，切勿用于真实发布。真实发布必须使用离线保管的签名密钥与撤销列表。\n", "utf8");
  await writeFile(path.join(EX, "repository-index.v2.json"), JSON.stringify(index, null, 2) + "\n", "utf8");

  return ok(Object.freeze({
    manifestPath: path.join(EX, "loom-blade.v2.manifest.json"),
    fileCount: fileList.count, totalBytes: fileList.totalBytes,
    manifestHash: manifest.content.manifestHash, fingerprint,
    keyId: keys.keyId, protectedPaths: envelope.protected.map((p) => p.path),
    oldFilesUntouched: true
  }));
}

/** 测试用：从 examples/ 读回真实产物，构造 pack + 信封 + 信任存储。 */
export async function loadExamplePack() {
  const manifest = JSON.parse(await readFile(path.join(EX, "loom-blade.v2.manifest.json"), "utf8"));
  const fileList = JSON.parse(await readFile(path.join(EX, "META", "file-list.json"), "utf8"));
  const envelope = JSON.parse(await readFile(path.join(EX, "signature-envelope.example.json"), "utf8"));
  const trustFile = JSON.parse(await readFile(path.join(EX, "trust-store.example.json"), "utf8"));
  const trustStore = createTrustStore(trustFile.keys.map((k) => ({ keyId: k.keyId, publicKeyPem: k.publicKeyPem, revoked: k.revoked })));
  const all = await collectContentFiles();
  const files = new Map();
  for (const e of fileList.entries) files.set(e.path, all.get(e.path));
  return { manifest, fileList, envelope, trustStore, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await buildExamplePack();
  console.log(JSON.stringify(r, null, 2));
  if (r.status !== Status.OK) process.exitCode = 1;
}
