// services/integrity.mjs —— 文件清单 SHA-256 全覆盖校验；拒绝未列文件、路径穿越、超预算、重复项。
import { createHash } from "node:crypto";
import { ok, fail, partial, Status } from "../core/result.mjs";
import { sha256Text, canonicalize } from "./signature.mjs";

export function hashBytes(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), "utf8");
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * manifest 摘要：对"移除 content.manifestHash 字段后的 manifest"做规范化哈希。
 * 这样 content.manifestHash 可以自洽地写回 manifest 而不产生循环依赖。
 * manifest.json 与 META/file-list.json 本身由签名信封 protected[] 直接保护。
 */
export function manifestDigest(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest ?? {}));
  if (copy?.content) delete copy.content.manifestHash;
  return sha256Text(canonicalize(copy));
}

export function bytesOf(v) {
  return Buffer.isBuffer(v) ? v : Buffer.from(String(v), "utf8");
}

/** 由 path->content 构造 META/file-list.json；路径排序保证确定性。 */
export function buildFileList(files) {
  const entries = [];
  for (const [path, content] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const buf = bytesOf(content);
    entries.push({ path, sha256: hashBytes(buf), size: buf.length, mode: "0644" });
  }
  return Object.freeze({
    schema: "bedrockloom.file-list/v1",
    hashAlgorithm: "sha256",
    entries: Object.freeze(entries),
    totalBytes: entries.reduce((s, e) => s + e.size, 0),
    count: entries.length
  });
}

const UNSAFE = (p) => typeof p !== "string" || p.includes("..") || p.startsWith("/") || /^[A-Za-z]:/.test(p) || p.includes("\\") || p.includes("\0");

/**
 * 校验文件清单与包内实际文件集合。
 * pack: { manifest, fileList, files: Map<path, content> }
 * 关键断言：files 中存在未列入 fileList 的路径 -> E_FILE_UNLISTED（拒绝），
 * 这保证"签名不能只保护 manifest 而允许替换未列文件"。
 */
export function verifyFileList(pack, { maxTotalBytes = 64 * 1024 * 1024, maxFileBytes = 16 * 1024 * 1024 } = {}) {
  const { manifest, fileList, files } = pack ?? {};
  if (!fileList) return fail(Status.DENIED, "E_FILE_LIST_MISSING", "缺少 META/file-list.json", { recoverable: false });
  if (!Array.isArray(fileList.entries)) return fail(Status.DENIED, "E_FILE_LIST_MISSING", "文件清单格式错误", { recoverable: false });
  if (!(files instanceof Map)) return fail(Status.DENIED, "E_FILE_LIST_MISSING", "包内文件集合无效", { recoverable: false });
  const errors = [];
  const warnings = [];
  const listed = new Map();
  const seen = new Set();
  for (const e of fileList.entries) {
    if (UNSAFE(e.path)) { errors.push({ code: "E_FILE_PATH_TRAVERSAL", path: e.path, message: "非法路径" }); continue; }
    if (seen.has(e.path)) { errors.push({ code: "E_FILE_DUPLICATE", path: e.path, message: "清单内重复路径" }); continue; }
    seen.add(e.path);
    listed.set(e.path, e);
    if (e.mode && !/^0[0-7]{3}$/.test(e.mode)) warnings.push({ code: "E_FILE_MODE", path: e.path, message: "非常规文件模式" });
    if (e.size > maxFileBytes) errors.push({ code: "E_FILE_SIZE", path: e.path, message: `单文件超过 ${maxFileBytes} 字节` });
  }
  // 未列文件：任何不在清单中的实际文件都拒绝
  const unlisted = [...files.keys()].filter((p) => !listed.has(p));
  for (const p of unlisted) errors.push({ code: "E_FILE_UNLISTED", path: p, message: "存在未列入文件清单的文件，拒绝安装" });
  // 清单中缺失 / 哈希不符
  const missing = [], mismatched = [];
  for (const [path, entry] of listed) {
    if (!files.has(path)) { missing.push({ code: "E_FILE_MISSING", path, message: "清单中的文件缺失" }); continue; }
    const buf = bytesOf(files.get(path));
    if (hashBytes(buf) !== entry.sha256) mismatched.push({ code: "E_FILE_HASH_MISMATCH", path, message: "文件内容哈希与清单不符" });
    else if (buf.length !== entry.size) mismatched.push({ code: "E_FILE_HASH_MISMATCH", path, message: "文件大小与清单不符" });
  }
  // manifest 自身哈希（若 manifest 声明了 content.manifestHash）
  let manifestHashMatch = null;
  if (manifest?.content?.manifestHash) {
    const actual = manifestDigest(manifest);
    manifestHashMatch = actual === manifest.content.manifestHash;
    if (!manifestHashMatch) errors.push({ code: "E_SIG_PAYLOAD_HASH", path: "manifest.json", message: "manifest 哈希与声明不符" });
  }
  const total = [...files.values()].reduce((s, v) => s + bytesOf(v).length, 0);
  if (total > maxTotalBytes) errors.push({ code: "E_FILE_SIZE", path: "*", message: `总大小 ${total} 超过预算 ${maxTotalBytes}` });
  if (errors.length === 0 && mismatched.length === 0 && missing.length === 0) {
    return ok(Object.freeze({
      verified: true, count: listed.size, totalBytes: total, unlisted: 0, unlistedPaths: Object.freeze([]),
      mismatched: 0, missing: 0, manifestHashMatch, warnings: Object.freeze(warnings)
    }));
  }
  const all = [...errors, ...mismatched, ...missing];
  const report = Object.freeze({
    verified: false, count: listed.size, totalBytes: total,
    unlisted: unlisted.length, unlistedPaths: Object.freeze(unlisted),
    mismatched: mismatched.length, missing: missing.length, manifestHashMatch,
    errors: Object.freeze(all), warnings: Object.freeze(warnings)
  });
  const fatal = all.some((e) => ["E_FILE_UNLISTED", "E_FILE_PATH_TRAVERSAL", "E_FILE_HASH_MISMATCH", "E_SIG_PAYLOAD_HASH"].includes(e.code));
  if (fatal) return fail(Status.DENIED, all[0].code, all[0].message, { recoverable: false, details: report });
  return partial(report, all);
}

/** 对包做一次"签名 + 完整性"的组合校验（安装前置）。 */
export function verifyPack(pack, { envelope, trustStore, verifyFn } = {}) {
  if (!verifyFn || !envelope || !trustStore) return fail(Status.DENIED, "E_SIG_MISSING", "缺少签名验证所需的信封/信任存储");
  const sig = verifyFn({ manifest: pack.manifest, fileList: pack.fileList, envelope, trustStore });
  if (sig.status !== Status.OK) return sig;
  const integrity = verifyFileList(pack);
  if (integrity.status !== Status.OK) return integrity;
  return ok(Object.freeze({ verified: true, signature: sig.value, integrity: integrity.value }));
}
