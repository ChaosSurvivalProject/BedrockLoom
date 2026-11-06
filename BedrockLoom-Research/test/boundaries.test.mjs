/**
 * 边界静态负向扫描：确保硬边界在**文件层面**成立，而不只是写在文档里。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

function walk(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".git" || ent.name === "node_modules") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(abs));
    else if (ent.isFile()) out.push(abs);
  }
  return out;
}

const CODE_EXT = [".mjs", ".js", ".ts", ".hpp", ".cpp", ".c", ".cc"];
const BINARY_EXT = [".bin", ".apk", ".appx", ".exe", ".dll", ".so", ".dylib", ".pak", ".obb", ".zip", ".jar", ".pem"];

test("B1 仓库内无任何游戏二进制 / 提取资源 / 改后包 / 样本", () => {
  const all = walk(ROOT);
  const bad = all.filter((f) => BINARY_EXT.includes(path.extname(f).toLowerCase()));
  assert.deepEqual(bad.map((f) => path.relative(ROOT, f)), [], "不得出现二进制/包/密钥文件");
  assert.ok(all.length >= 20, "仓库应有完整骨架文件");
});

test("B2 代码中无真实注入实现特征（不含禁止清单常量本身）", () => {
  // 只扫描精确的实现级 API 名与硬编码地址；文档与「禁止清单字符串」不参与
  const FORBIDDEN_IMPL = [
    "CreateRemoteThread", "WriteProcessMemory", "VirtualProtect", "VirtualAlloc",
    "LoadLibraryA", "LoadLibraryW", "GetProcAddress", "DetourAttach", "MinHook",
    "dlsym", "ptrace", "#include <windows.h>", "__declspec(naked)",
    "NtCreateThreadEx", "SetWindowsHookEx"
  ];
  const HEX_ADDR = /\b0x[0-9a-fA-F]{8,}\b/;
  // 排除 test/ 与证据生成器：它们里面的「禁止词表/报告文字」是检测规则本身，不是实现
  const files = walk(ROOT).filter((f) => {
    const rel = path.relative(ROOT, f);
    return CODE_EXT.includes(path.extname(f).toLowerCase()) &&
      !rel.startsWith("test" + path.sep) && rel !== "run-evidence.mjs";
  });
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const kw of FORBIDDEN_IMPL) {
      assert.ok(!src.includes(kw), `${path.relative(ROOT, f)} 不得出现注入实现：${kw}`);
    }
    assert.ok(!HEX_ADDR.test(src), `${path.relative(ROOT, f)} 不得硬编码内存地址`);
  }
});

test("B3 游戏内合规层自包含：无 node:* / require / 网络 / 文件访问", () => {
  const dir = path.join(ROOT, "ingame");
  for (const f of walk(dir).filter((f) => /\.(js|mjs)$/.test(f))) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, `${f} 不得 import node:*`);
    assert.doesNotMatch(src, /\brequire\s*\(/, `${f} 不得使用 require`);
    assert.doesNotMatch(src, /\bfetch\s*\(|new\s+WebSocket|XMLHttpRequest/, `${f} 不得发起网络请求`);
    assert.doesNotMatch(src, /\breadFile|writeFile|createWriteStream/, `${f} 不得操作文件系统`);
  }
});

test("B4 A 层三标记在契约、数据与文档中齐全", () => {
  const table = JSON.parse(read("hook/candidates.json"));
  for (const c of table.candidates) {
    assert.equal(c.layer, "host-private");
    assert.equal(c.classification, "research-hypothesis");
    assert.equal(c.drift, "version-drift-risk");
    assert.equal(c.status, "unsupported");
    assert.equal(c.implementedInRepo, false);
  }
  for (const doc of ["docs/00-scope-and-three-layers.md", "docs/04-observable-surface.md",
                     "docs/05-hook-candidates.md", "docs/07-research-notes.md", "README.md"]) {
    const t = read(doc);
    assert.ok(t.includes("host-private") && t.includes("research-hypothesis") &&
              t.includes("version-drift-risk"), `${doc} 必须写齐三个标记`);
  }
});

test("B5 门禁与硬边界声明真实存在，且明确「停住」", () => {
  const gate = read("docs/01-local-path-gate.md");
  assert.match(gate, /停住/);
  assert.match(gate, /全部不存在|未命中/);
  assert.match(gate, /下载任何游戏二进制/);
  const readme = read("README.md");
  assert.match(readme, /不绕过登录\/签名\/沙箱\/反作弊/);
  assert.match(readme, /不给完整改包成品|不给完整改包成品/);
  assert.match(readme, /research` 分支/);
  // 明确写出「即使给了路径也不做注入成品」
  assert.match(gate, /不执行/);
});

test("B6 主仓库 main 既有基线文件零修改（哈希不变）", () => {
  const expected = {
    "../mod/mod.json": "b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48",
    "../mod/docs/RENDER_AUDIT.md": "3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390"
  };
  for (const [rel, exp] of Object.entries(expected)) {
    const abs = path.resolve(ROOT, rel);
    const h = createHash("sha256").update(readFileSync(abs)).digest("hex");
    assert.equal(h, exp, `${rel} 必须保持基线哈希`);
  }
});

test("B7 .gitignore 覆盖全部被禁止的文件类型", () => {
  const gi = read(".gitignore");
  for (const ext of ["*.bin", "*.apk", "*.appx", "*.dll", "*.so", "*.exe", "*.pem", "*.zip"]) {
    assert.ok(gi.includes(ext), `.gitignore 缺少 ${ext}`);
  }
  assert.ok(gi.includes("**/extracted/"));
});

test("B8 研究报告不含任何真实偏移 / 私有符号 / 样本内容", () => {
  const docs = walk(path.join(ROOT, "docs")).filter((f) => f.endsWith(".md"));
  for (const f of docs) {
    const t = readFileSync(f, "utf8");
    assert.doesNotMatch(t, /\b0x[0-9a-fA-F]{8,}\b/, `${f} 不得出现硬编码地址`);
    assert.doesNotMatch(t, /RVA\s*[:=]\s*0x|vtable\s*index\s*[:=]\s*\d+/i, `${f} 不得出现 RVA/vtable 索引`);
  }
  // 明确标注结构为假设而非实测
  assert.match(read("docs/03-pack-layout-hypothesis.md"), /非实测/);
  assert.match(read("docs/02-version-baseline.md"), /未核实/);
});

test("B9 目录体积与文件类型合理（避免误入库大文件）", () => {
  const all = walk(ROOT);
  for (const f of all) {
    assert.ok(statSync(f).size <= 200 * 1024, `${path.relative(ROOT, f)} 单文件不应超过 200 KiB`);
  }
});
