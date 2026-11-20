/**
 * 目录树静态扫描（CLI 入口，原创）。
 *
 * 只读、只输出元数据：相对路径、字节数、SHA-256、扩展名分布。
 * 不输出任何文件内容、不解析图片/音频/材质、不写回源目录、不联网。
 * 路径必须由 BLR_TARGET_DIR 显式给出，缺失即拒绝。
 */

import { readdir, stat, readFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Status } from "../loomrender/result.mjs";

const ENV = process.env ?? {};

export const DEFAULTS = Object.freeze({
  maxFiles: 2000,
  maxBytes: 64 * 1024 * 1024
});

function limits() {
  const n = (v, d) => {
    const x = Number.parseInt(v ?? "", 10);
    return Number.isFinite(x) && x > 0 ? x : d;
  };
  return {
    maxFiles: n(ENV.BLR_MAX_FILES, DEFAULTS.maxFiles),
    maxBytes: n(ENV.BLR_MAX_BYTES, DEFAULTS.maxBytes)
  };
}

/** 扫描结果只含元数据；sha256 是内容摘要，不是内容本身。 */
export async function scanLayout(rootDir, opts = {}) {
  if (typeof rootDir !== "string" || rootDir.trim() === "") {
    return { status: Status.DENIED, code: "E_PATH_REQUIRED",
      message: "必须通过 BLR_TARGET_DIR 显式给出目录；不猜默认路径、不扫全盘" };
  }
  const lim = { ...limits(), ...opts };
  let root;
  try {
    root = await realpath(path.resolve(rootDir));
    const st = await stat(root);
    if (!st.isDirectory()) {
      return { status: Status.DENIED, code: "E_PATH_NOT_DIR", message: "目标不是目录" };
    }
  } catch {
    return { status: Status.DENIED, code: "E_PATH_MISSING", message: "目标目录不存在或不可访问" };
  }

  const files = [];
  let totalBytes = 0;
  const byExt = Object.create(null);
  let truncated = false;

  async function walk(dir, rel) {
    if (truncated) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const ent of entries) {
      if (truncated) return;
      const abs = path.join(dir, ent.name);
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      // 符号链接一律跳过，避免跳出根目录
      let isLink = false;
      try { isLink = (await lstat(abs)).isSymbolicLink(); } catch { continue; }
      if (isLink) continue;
      if (ent.isDirectory()) { await walk(abs, relPath); continue; }
      if (!ent.isFile()) continue;
      if (files.length >= lim.maxFiles) { truncated = true; return; }
      let st;
      try { st = await stat(abs); } catch { continue; }
      if (totalBytes + st.size > lim.maxBytes) { truncated = true; return; }
      totalBytes += st.size;
      let sha = null;
      try {
        const buf = await readFile(abs);
        sha = createHash("sha256").update(buf).digest("hex");
      } catch { /* 读失败只记录，不中断、不输出内容 */ }
      const ext = (path.extname(ent.name) || "(none)").toLowerCase();
      byExt[ext] = (byExt[ext] ?? 0) + 1;
      files.push(Object.freeze({ path: relPath, bytes: st.size, sha256: sha }));
    }
  }

  await walk(root, "");
  const payload = Object.freeze({
    root: "<redacted:本机绝对路径不进报告>",
    fileCount: files.length,
    totalBytes,
    extensionCounts: Object.freeze({ ...byExt }),
    files: Object.freeze(files),
    caveat: "仅元数据；不含任何文件内容、样本、解析结果或真实偏移"
  });
  if (truncated) {
    return { status: Status.RESOURCE_EXHAUSTED, code: "E_SCAN_LIMIT",
      message: "达到 BLR_MAX_FILES / BLR_MAX_BYTES 上限，结果不完整", value: payload };
  }
  return { status: Status.OK, value: payload };
}

// CLI：不给路径即拒绝，且明确打印停住原因
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await scanLayout(ENV.BLR_TARGET_DIR);
  console.log(JSON.stringify({
    status: r.status,
    code: r.code ?? null,
    message: r.message ?? "静态元数据扫描完成（未解析任何内容、未输出样本）",
    fileCount: r.value?.fileCount ?? 0,
    totalBytes: r.value?.totalBytes ?? 0,
    extensionCounts: r.value?.extensionCounts ?? {},
    caveat: r.value?.caveat ?? null
  }, null, 2));
  // 只输出摘要，不输出 files 明细，避免终端/日志里留下样本路径线索
  if (r.status === Status.DENIED) process.exitCode = 2;
}
