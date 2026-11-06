/**
 * 通用二进制容器头读取骨架（原创；不 import 任何 node: 模块）。
 * 二进制字段读取使用宿主提供的 Buffer 全局，因此本模块在本机 CLI（Node）环境运行。
 *
 * 重要：本模块**不含任何游戏格式知识**。
 * - 魔数表只列公开通用容器（PNG / ZIP / GZIP / JSON 文本起始），用于演示「未知即 unsupported」；
 * - 块表读取必须传入外部 descriptor，仓库里没有真实偏移；
 * - 任何返回值都不包含原始字节内容。
 */

import { Status, ok, fail } from "../loomrender/result.mjs";

/** 只读取文件头部前若干字节，避免把整个文件读进内存做结构推断。 */
export const HEADER_BYTES = 32;

/** 公开通用容器魔数（十六进制小写）。这些不是游戏私有符号。 */
export const GENERIC_MAGIC = Object.freeze([
  { id: "png", hex: "89504e470d0a1a0a", label: "PNG 公开格式" },
  { id: "zip", hex: "504b0304", label: "ZIP 公开格式" },
  { id: "gzip", hex: "1f8b", label: "GZIP 公开格式" },
  { id: "json-text", hex: "7b", label: "以 '{' 起始的文本（可能是 JSON）" }
]);

/**
 * 通用魔数分类。未知一律 unsupported，不猜测格式。
 * @param {Uint8Array|Buffer} buffer
 */
export function classifyMagic(buffer) {
  if (!(buffer instanceof Uint8Array) || buffer.length === 0) {
    return fail(Status.DENIED, "E_HDR_EMPTY", "缓冲区为空或类型不合法");
  }
  const head = Buffer.from(buffer.subarray(0, HEADER_BYTES)).toString("hex");
  for (const m of GENERIC_MAGIC) {
    if (head.startsWith(m.hex)) {
      return ok(Object.freeze({
        magic: m.id,
        label: m.label,
        headerBytes: Math.min(buffer.length, HEADER_BYTES),
        note: "仅识别出公开通用容器魔数，不做任何结构推断"
      }));
    }
  }
  return fail(Status.UNSUPPORTED, "E_HDR_UNKNOWN_MAGIC",
    "未知魔数：拒绝推断格式，不输出头部字节");
}

/**
 * 通用文件头读取。返回无语义的元数据，不返回内容。
 * 这里刻意不提供「字段含义映射」——那是把研究假设硬写进代码的做法。
 */
export function readGenericHeader(buffer) {
  const cls = classifyMagic(buffer);
  if (cls.status !== Status.OK) return cls;
  const b = Buffer.from(buffer.subarray(0, HEADER_BYTES));
  return ok(Object.freeze({
    magic: cls.value.magic,
    headerBytes: b.length,
    firstU32LE: b.length >= 4 ? b.readUInt32LE(0) : null,
    secondU32LE: b.length >= 8 ? b.readUInt32LE(4) : null,
    caveat: "以上两个 u32 仅为通用头部数值，不代表任何已知格式的语义字段"
  }));
}

/**
 * 解析外部提供的 descriptor（真实 descriptor 由作者在本机给出，不进仓库）。
 * 只接受无语义的 name/offset/size/kind；任何疑似私有符号的字段一律拒绝。
 */
export function parseDescriptor(text) {
  let d;
  try {
    d = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return fail(Status.DENIED, "E_DESC_INVALID_JSON", "descriptor 不是合法 JSON");
  }
  if (!d || typeof d !== "object" || !Array.isArray(d.entries)) {
    return fail(Status.DENIED, "E_DESC_SHAPE", "descriptor 需要 entries 数组");
  }
  if (d.entries.length > 64) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_DESC_TOO_MANY", "descriptor 条目超过 64 上限");
  }
  const FORBIDDEN = ["symbol", "rva", "moduleBase", "pattern", "vtableIndex", "dllPath", "signature"];
  for (const e of d.entries) {
    if (!e || typeof e.name !== "string" || !Number.isInteger(e.offset) ||
        !Number.isInteger(e.size) || e.offset < 0 || e.size <= 0 || e.size > 8) {
      return fail(Status.DENIED, "E_DESC_ENTRY", "条目需含 name/offset(>=0)/size(1..8)");
    }
    for (const k of Object.keys(e)) {
      if (FORBIDDEN.includes(k)) {
        return fail(Status.DENIED, "E_DESC_PRIVATE_SYMBOL",
          "descriptor 不得包含私有符号/偏移类字段：" + k);
      }
    }
  }
  return ok(Object.freeze({
    endianness: d.endianness === "be" ? "be" : "le",
    entries: Object.freeze(d.entries.map((e) => Object.freeze({
      name: e.name, offset: e.offset, size: e.size,
      kind: e.kind === "u16" || e.kind === "u32" || e.kind === "u64" ? e.kind : "u32"
    })))
  }));
}

/**
 * 参数化通用块表读取：按外部 descriptor 取定长字段的数值。
 * 不返回原始字节、不解释字段含义、不生成任何真实偏移。
 *
 * @param {Uint8Array|Buffer} buffer
 * @param {object} descriptor 由 parseDescriptor() 得到
 */
export function readBlockTable(buffer, descriptor) {
  if (!descriptor || !Array.isArray(descriptor.entries)) {
    return fail(Status.DENIED, "E_DESC_REQUIRED",
      "必须显式传入 descriptor；本仓库不内置任何真实偏移表");
  }
  if (!(buffer instanceof Uint8Array)) {
    return fail(Status.DENIED, "E_HDR_EMPTY", "缓冲区类型不合法");
  }
  const b = Buffer.from(buffer);
  const be = descriptor.endianness === "be";
  const blocks = [];
  for (const e of descriptor.entries) {
    const end = e.offset + e.size;
    if (end > b.length) {
      return fail(Status.DENIED, "E_DESC_OUT_OF_RANGE",
        `字段 ${e.name} 越界（${end} > ${b.length}），拒绝读取`);
    }
    let value;
    if (e.kind === "u16") value = be ? b.readUInt16BE(e.offset) : b.readUInt16LE(e.offset);
    else if (e.kind === "u64") value = (be ? b.readBigUInt64BE(e.offset) : b.readBigUInt64LE(e.offset)).toString();
    else if (e.size === 4) value = be ? b.readUInt32BE(e.offset) : b.readUInt32LE(e.offset);
    else value = b.readUIntLE(e.offset, e.size);
    blocks.push(Object.freeze({ name: e.name, offset: e.offset, size: e.size, value }));
  }
  // 未知魔数时给出 degraded，明确「读到了数值但不代表理解格式」
  const cls = classifyMagic(buffer);
  const status = cls.status === Status.OK ? Status.OK : Status.DEGRADED;
  return { status, value: Object.freeze({
    magic: cls.status === Status.OK ? cls.value.magic : "unknown",
    blocks: Object.freeze(blocks),
    caveat: "数值仅为通用定长字段读取结果，不代表任何私有格式语义；不得写入可分发代码作为偏移表"
  }), code: cls.status === Status.OK ? undefined : "E_HDR_UNKNOWN_MAGIC" };
}
