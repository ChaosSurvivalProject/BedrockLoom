// 测试公共夹具：从既有 ../mod 的真实文件构造一个已签名的 v2 包（内存中，无竞态）。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectContentFiles } from "../services/build-example-pack.mjs";
import { toV2 } from "../services/migrate-v1-to-v2.mjs";
import { buildFileList, manifestDigest } from "../services/integrity.mjs";
import { generateKeyPair, buildEnvelope, createTrustStore, sha256Text, canonicalize } from "../services/signature.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
export const MOD_ROOT = path.resolve(ROOT, "..", "mod");

export async function readV1() {
  return JSON.parse(await readFile(path.join(MOD_ROOT, "mod.json"), "utf8"));
}

export async function makeSignedPack({ keyId = "test-key", tamper } = {}) {
  const v1 = await readV1();
  const files = await collectContentFiles();
  if (tamper?.unlisted) files.set("files/unlisted_payload.txt", Buffer.from("malicious extra file", "utf8"));
  if (tamper?.modify) {
    const target = [...files.keys()].find((k) => k.endsWith(".json"));
    files.set(target, Buffer.from(String(files.get(target)) + "\n/*tampered*/", "utf8"));
  }
  const fileList = buildFileList(files);
  const fingerprint = sha256Text(canonicalize(fileList.entries)).slice(0, 32);
  const converted = toV2(v1, { totalBytes: fileList.totalBytes, fingerprint });
  const manifest = { ...converted.value, content: { ...converted.value.content, manifestHash: manifestDigest(converted.value) } };
  const keys = generateKeyPair(keyId);
  const env = buildEnvelope({ manifest, fileList, privateKeyPem: keys.privateKeyPem, keyId: keys.keyId });
  const trustStore = createTrustStore([{ keyId: keys.keyId, publicKeyPem: keys.publicKeyPem, revoked: false }]);
  return { manifest, fileList, files, envelope: env.value, trustStore, keys };
}

export async function fileTextInMod(rel) {
  return readFile(path.join(MOD_ROOT, rel), "utf8");
}
