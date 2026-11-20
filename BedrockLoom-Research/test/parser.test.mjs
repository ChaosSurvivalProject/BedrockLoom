/**
 * 原创通用解析器骨架的行为测试：只读元数据、未知即 unsupported、路径必填、不输出样本内容。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  classifyMagic, readGenericHeader, parseDescriptor, readBlockTable, GENERIC_MAGIC
} from "../parser/headers.mjs";
import { summarizeStrings } from "../parser/strings.mjs";
import { scanLayout } from "../parser/layout.mjs";
import { Status } from "../loomrender/result.mjs";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const zip = Buffer.from("504b03040000000000000000", "hex");
const unknown = Buffer.from("deadbeefcafebabe00000000", "hex");

test("P1 魔数表只列公开通用容器，不含任何游戏格式", () => {
  const ids = GENERIC_MAGIC.map((m) => m.id);
  assert.deepEqual(ids, ["png", "zip", "gzip", "json-text"]);
  assert.equal(classifyMagic(png).status, Status.OK);
  assert.equal(classifyMagic(zip).value.magic, "zip");
});

test("P2 未知魔数一律 unsupported，且不返回头部字节", () => {
  const r = classifyMagic(unknown);
  assert.equal(r.status, Status.UNSUPPORTED);
  assert.equal(r.value, undefined);
  assert.ok(!JSON.stringify(r).includes("deadbeef"));
});

test("P3 通用头只给无语义数值，且带 caveat", () => {
  const r = readGenericHeader(png);
  assert.equal(r.status, Status.OK);
  assert.match(r.value.caveat, /不代表任何已知格式/);
  assert.equal(r.value.magic, "png");
});

test("P4 descriptor 必须由外部传入；缺 descriptor 直接拒绝", () => {
  const r = readBlockTable(png, null);
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_DESC_REQUIRED");
});

test("P5 descriptor 拒绝私有符号类字段", () => {
  const bad = { entries: [{ name: "x", offset: 0, size: 4, symbol: "??0Foo@@" }] };
  const r = parseDescriptor(bad);
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_DESC_PRIVATE_SYMBOL");
  assert.equal(parseDescriptor({ entries: [] }).status, Status.OK);
  assert.equal(parseDescriptor("not-json").status, Status.DENIED);
});

test("P6 块表读取按外部 descriptor 取数值，越界拒绝，不返回字节", () => {
  const d = parseDescriptor({ endianness: "le", entries: [
    { name: "length", offset: 0, size: 4, kind: "u32" },
    { name: "count", offset: 4, size: 2, kind: "u16" }
  ] }).value;
  const buf = Buffer.alloc(16);
  buf.writeUInt32LE(1234, 0);
  buf.writeUInt16LE(7, 4);
  const r = readBlockTable(buf, d);
  assert.equal(r.status, Status.DEGRADED, "未知魔数时降级，明确不理解格式");
  assert.equal(r.value.blocks[0].value, 1234);
  assert.equal(r.value.blocks[1].value, 7);
  assert.ok(!JSON.stringify(r).includes("raw") && !r.value.bytes);
  const oob = parseDescriptor({ entries: [{ name: "x", offset: 100, size: 4 }] }).value;
  assert.equal(readBlockTable(buf, oob).status, Status.DENIED);
});

test("P7 字符串表只输出统计，绝不返回任何字符串内容", () => {
  const buf = Buffer.from("HelloWorld\0secret_symbol_name\0" + "A".repeat(40) + "\0", "utf8");
  const r = summarizeStrings(buf, { minLength: 4 });
  assert.equal(r.status, Status.OK);
  assert.ok(r.value.totalStrings >= 3);
  assert.ok(r.value.maxLength >= 40);
  assert.ok(Object.keys(r.value.lengthHistogram).length > 0);
  const json = JSON.stringify(r);
  assert.ok(!json.includes("HelloWorld"), "不得泄露字符串内容");
  assert.ok(!json.includes("secret_symbol_name"), "不得泄露符号名候选");
  assert.match(r.value.note, /未输出任何字符串内容/);
});

test("P8 无路径即拒绝，不猜默认路径、不扫全盘", async () => {
  const r = await scanLayout("");
  assert.equal(r.status, Status.DENIED);
  assert.equal(r.code, "E_PATH_REQUIRED");
  const r2 = await scanLayout("/definitely/not/a/real/path/xyz");
  assert.equal(r2.status, Status.DENIED);
});

test("P9 对合成临时目录只输出元数据，不含内容与真实绝对路径", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "blr-parser-"));
  try {
    await writeFile(path.join(dir, "a.txt"), "hello");
    await writeFile(path.join(dir, "b.json"), "{\"k\":1}");
    const r = await scanLayout(dir);
    assert.equal(r.status, Status.OK);
    assert.equal(r.value.fileCount, 2);
    assert.equal(r.value.extensionCounts[".txt"], 1);
    assert.match(r.value.root, /redacted/);
    for (const f of r.value.files) {
      assert.match(f.sha256, /^[0-9a-f]{64}$/);
      assert.equal(typeof f.bytes, "number");
      assert.ok(!("content" in f), "不得携带文件内容");
    }
    assert.ok(!JSON.stringify(r).includes("hello"), "不得泄露文件内容");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("P10 达到上限返回 resource-exhausted，结果不完整明确标注", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "blr-limit-"));
  try {
    await writeFile(path.join(dir, "a.txt"), "1");
    await writeFile(path.join(dir, "b.txt"), "2");
    const r = await scanLayout(dir, { maxFiles: 1 });
    assert.equal(r.status, Status.RESOURCE_EXHAUSTED);
    assert.equal(r.code, "E_SCAN_LIMIT");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
