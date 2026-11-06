// services/signature.mjs —— Ed25519 签名信封：保护范围 = manifest + META/file-list.json（逐文件哈希）。
// 用户硬要求：签名不能只保护 manifest 而允许替换未列文件。
import { createHash, generateKeyPairSync, sign as edSign, verify as edVerify, createPublicKey, createPrivateKey, randomBytes } from "node:crypto";
import { ok, fail, Status } from "../core/result.mjs";

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}

export function sha256Text(text) { return createHash("sha256").update(text, "utf8").digest("hex"); }
export function hashCanonical(obj) { return sha256Text(canonicalize(obj)); }

export function generateKeyPair(keyId = "demo-key") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  return Object.freeze({ keyId, publicKeyPem, privateKeyPem, fingerprint: sha256Text(publicKeyPem) });
}

/**
 * 构造签名信封。protected 固定两项：manifest.json 与 META/file-list.json。
 * 只签 manifest 而不签文件清单会返回 E_SIG_MANIFEST_ONLY（在 verify 中也会被拒绝）。
 */
export function buildEnvelope({ manifest, fileList, privateKeyPem, keyId, signedBy = "Bedrock Loom Demo", signedAt }) {
  if (!manifest || !fileList) return fail(Status.DENIED, "E_SIG_PROTECTED_INCOMPLETE", "签名必须同时提供 manifest 与文件清单");
  const manifestCanon = canonicalize(manifest);
  const listCanon = canonicalize(fileList);
  const manifestHash = sha256Text(manifestCanon);
  const listHash = sha256Text(listCanon);
  const payloadHash = sha256Text(`${manifestCanon}\n${listCanon}`);
  let signature;
  try {
    signature = edSign(null, Buffer.from(payloadHash, "utf8"), createPrivateKey(privateKeyPem)).toString("base64");
  } catch (e) {
    return fail(Status.DENIED, "E_SIG_INVALID", `签名失败: ${e.message}`);
  }
  const envelope = Object.freeze({
    schema: "bedrockloom.signature-envelope/v1",
    algorithm: "Ed25519",
    keyId,
    signedBy,
    signedAt: signedAt ?? new Date().toISOString(),
    canonicalization: Object.freeze({ method: "json-key-sorted-utf8", newline: "LF", encoding: "utf-8" }),
    protected: Object.freeze([
      Object.freeze({ path: "manifest.json", sha256: manifestHash, bytes: Buffer.byteLength(manifestCanon, "utf8") }),
      Object.freeze({ path: "META/file-list.json", sha256: listHash, bytes: Buffer.byteLength(listCanon, "utf8") })
    ]),
    payloadHash,
    signature,
    trust: Object.freeze({ publisher: signedBy, keyFingerprint: sha256Text(createPublicKey(privateKeyToPublicPem(privateKeyPem)).export({ type: "spki", format: "pem" })), revoked: false })
  });
  return ok(envelope);
}

function privateKeyToPublicPem(privateKeyPem) {
  const priv = createPrivateKey(privateKeyPem);
  return createPublicKey(priv).export({ type: "spki", format: "pem" });
}

export function createTrustStore(keys = []) {
  const store = new Map();
  for (const k of keys) store.set(k.keyId, Object.freeze({ ...k }));
  return store;
}

/** 验证签名信封；严格校验信任状态、有效期、protected 覆盖与 payloadHash。 */
export function verifyEnvelope({ manifest, fileList, envelope, trustStore, now = new Date() }) {
  if (!envelope) return fail(Status.DENIED, "E_SIG_MISSING", "缺少 signature.json", { recoverable: false });
  if (envelope.algorithm !== "Ed25519") return fail(Status.DENIED, "E_SIG_ALGORITHM", "签名算法不是 Ed25519", { recoverable: false });
  const protectedPaths = (envelope.protected ?? []).map((p) => p.path).sort();
  const expected = ["META/file-list.json", "manifest.json"].sort();
  if (JSON.stringify(protectedPaths) !== JSON.stringify(expected)) {
    return fail(Status.DENIED, protectedPaths.length === 1 && protectedPaths[0] === "manifest.json" ? "E_SIG_MANIFEST_ONLY" : "E_SIG_PROTECTED_INCOMPLETE",
      "签名必须同时覆盖 manifest.json 与 META/file-list.json", { recoverable: false });
  }
  const manifestCanon = canonicalize(manifest);
  const listCanon = canonicalize(fileList);
  const manifestHash = sha256Text(manifestCanon);
  const listHash = sha256Text(listCanon);
  const p0 = envelope.protected.find((p) => p.path === "manifest.json");
  const p1 = envelope.protected.find((p) => p.path === "META/file-list.json");
  if (p0.sha256 !== manifestHash || p1.sha256 !== listHash) return fail(Status.DENIED, "E_SIG_PAYLOAD_HASH", "manifest 或文件清单与签名摘要不符", { recoverable: false });
  if (envelope.payloadHash !== sha256Text(`${manifestCanon}\n${listCanon}`)) return fail(Status.DENIED, "E_SIG_PAYLOAD_HASH", "payloadHash 不匹配", { recoverable: false });
  const key = trustStore?.get(envelope.keyId);
  if (!key) return fail(Status.DENIED, "E_SIG_KEY_UNKNOWN", `签名密钥 ${envelope.keyId} 不在信任存储`, { recoverable: false });
  if (key.revoked) return fail(Status.DENIED, "E_SIG_KEY_REVOKED", `密钥已撤销: ${key.revocationReason ?? "无原因"}`, { recoverable: false });
  if (key.validUntil && new Date(key.validUntil) < now) return fail(Status.DENIED, "E_SIG_KEY_EXPIRED", "签名密钥已过期", { recoverable: false });
  let valid = false;
  try {
    valid = edVerify(null, Buffer.from(envelope.payloadHash, "utf8"), createPublicKey(key.publicKeyPem), Buffer.from(envelope.signature, "base64"));
  } catch { valid = false; }
  if (!valid) return fail(Status.DENIED, "E_SIG_INVALID", "签名验证失败", { recoverable: false });
  return ok(Object.freeze({ verified: true, keyId: envelope.keyId, signedBy: envelope.signedBy, signedAt: envelope.signedAt, protectedPaths: Object.freeze(protectedPaths) }));
}

/** 生成仓库索引签名（对整个索引对象，不含 indexSignature 字段）。 */
export function signIndex(index, privateKeyPem) {
  const body = { ...index };
  delete body.indexSignature;
  const hash = hashCanonical(body);
  return ok(Object.freeze({ indexSignature: edSign(null, Buffer.from(hash, "utf8"), createPrivateKey(privateKeyPem)).toString("base64"), payloadHash: hash }));
}

export function verifyIndex(index, publicKeyPem) {
  if (!index?.indexSignature) return fail(Status.DENIED, "E_SIG_MISSING", "仓库索引未签名");
  const body = { ...index };
  delete body.indexSignature;
  let valid = false;
  try { valid = edVerify(null, Buffer.from(hashCanonical(body), "utf8"), createPublicKey(publicKeyPem), Buffer.from(index.indexSignature, "base64")); } catch { valid = false; }
  if (!valid) return fail(Status.DENIED, "E_SIG_INVALID", "仓库索引签名无效");
  return ok(Object.freeze({ verified: true, sequence: index.sequence, sourceId: index.source?.id }));
}

export { randomBytes };
