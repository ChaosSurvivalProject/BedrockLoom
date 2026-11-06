/**
 * 字符串表「统计」骨架（原创，纯逻辑）。
 *
 * 明确边界：只返回计数与长度直方图，**绝不返回任何字符串内容**。
 * 目的仅是为了让将来作者本机解析时有个「不把样本带进仓库」的工具。
 */

import { Status, ok, fail } from "../loomrender/result.mjs";

/** 可打印 ASCII 判定，用于切分候选串；不做编码推断、不做语义识别。 */
function printable(byte) {
  return byte >= 0x20 && byte <= 0x7e;
}

/**
 * @param {Uint8Array|Buffer} buffer
 * @param {{minLength?:number, maxStrings?:number}} opts
 * @returns 计数 + 长度直方图（不含内容）
 */
export function summarizeStrings(buffer, opts = {}) {
  if (!(buffer instanceof Uint8Array)) {
    return fail(Status.DENIED, "E_STR_INPUT", "输入必须是 Uint8Array/Buffer");
  }
  const minLength = Number.isInteger(opts.minLength) && opts.minLength >= 1 ? opts.minLength : 4;
  const maxStrings = Number.isInteger(opts.maxStrings) && opts.maxStrings > 0 ? opts.maxStrings : 100000;

  // 直方图按「长度桶」聚合，桶本身也不含内容
  const buckets = Object.create(null);
  let count = 0;
  let maxLength = 0;
  let run = 0;
  let overflow = false;

  const push = (len) => {
    if (len < minLength) return;
    if (count >= maxStrings) { overflow = true; return; }
    count += 1;
    if (len > maxLength) maxLength = len;
    const bucket = len <= 8 ? "1-8" : len <= 16 ? "9-16" : len <= 32 ? "17-32"
      : len <= 64 ? "33-64" : len <= 128 ? "65-128" : "129+";
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  };

  for (let i = 0; i < buffer.length; i += 1) {
    if (printable(buffer[i])) run += 1;
    else { push(run); run = 0; }
  }
  push(run);

  const payload = Object.freeze({
    totalStrings: count,
    maxLength,
    lengthHistogram: Object.freeze({ ...buckets }),
    truncated: overflow,
    note: "仅统计；未输出任何字符串内容，不能由此推断符号名或结构"
  });
  return overflow
    ? { status: Status.RESOURCE_EXHAUSTED, code: "E_STR_LIMIT",
        message: "字符串数量达到上限，统计不完整", value: payload }
    : ok(payload);
}
