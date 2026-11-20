/**
 * Hook 候选表与桩：全部 unsupported、三标记齐全、无私有符号、C++ 桩可编译。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateCandidate, validateCandidateTable, createProbe,
  CATEGORIES, LEVELS, FORBIDDEN_FIELDS
} from "../hook/hook-contract.mjs";
import { Status } from "../loomrender/result.mjs";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const table = JSON.parse(readFileSync(path.join(ROOT, "hook/candidates.json"), "utf8"));

test("H1 候选表 9 条，覆盖 3 类 × 3 级，全部 unsupported", () => {
  const r = validateCandidateTable(table);
  assert.equal(r.status, Status.OK, JSON.stringify(r));
  assert.equal(r.value.count, 9);
  assert.equal(r.value.coverage, 9);
  assert.equal(table.candidates.length, 9);
  assert.deepEqual(CATEGORIES, ["present", "texture-bind", "camera-update"]);
  assert.deepEqual(LEVELS, ["low", "medium", "high"]);
});

test("H2 每条带三标记、implementedInRepo=false、不含私有符号字段", () => {
  for (const c of table.candidates) {
    assert.equal(validateCandidate(c).status, Status.OK, c.id);
    assert.equal(c.implementedInRepo, false);
    for (const k of FORBIDDEN_FIELDS) {
      assert.ok(!(k in c), `${c.id} 不得含 ${k}`);
    }
  }
});

test("H3 篡改标记 / 私有符号字段一律 denied", () => {
  const base = table.candidates[0];
  assert.equal(validateCandidate({ ...base, status: "stable" }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, layer: "in-game-compliant" }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, drift: "none" }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, symbol: "??0Foo@@" }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, rva: 1234 }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, implementedInRepo: true }).status, Status.DENIED);
  assert.equal(validateCandidate({ ...base, category: "unknown" }).status, Status.DENIED);
});

test("H4 研究桩 attach/detach/onFrame 恒 unsupported，不产生任何副作用", () => {
  const p = createProbe();
  for (const [name, fn] of [["attach", () => p.attach("H-PRESENT-01")],
                            ["detach", () => p.detach("H-PRESENT-01")],
                            ["onFrame", () => p.onFrame({ frameIndex: 1 }) ]]) {
    const r = fn();
    assert.equal(r.status, Status.UNSUPPORTED, `${name} 必须恒 unsupported`);
    assert.equal(r.code, "E_HOOK_NO_IMPL");
  }
  assert.equal(p.calls.length, 3);
  p.dispose();
  assert.equal(p.calls.length, 0);
});

test("H5 高级别条目明确标注「永不实现」", () => {
  const high = table.candidates.filter((c) => c.level === "high");
  assert.equal(high.length, 3);
  for (const c of high) assert.match(c.verification, /永不实现/);
});

test("H6 IHookProbe.hpp 是纯抽象接口，且可编译（若本机有 g++）", () => {
  const hpp = readFileSync(path.join(ROOT, "hook/IHookProbe.hpp"), "utf8");
  assert.match(hpp, /class IHookProbe/);
  assert.match(hpp, /virtual ProbeStatus attach/);
  assert.match(hpp, /return ProbeStatus::Unsupported/);
  for (const kw of ["DetourAttach", "CreateRemoteThread", "#include <windows.h>", "0x"]) {
    assert.ok(!hpp.includes(kw), `桩不得含 ${kw}`);
  }
  const r = spawnSync("g++", ["-std=c++17", "-fsyntax-only",
    path.join(ROOT, "hook/IHookProbe.hpp")], { encoding: "utf8", timeout: 60000 });
  if (r.error && r.error.code === "ENOENT") {
    // 无编译器时如实记录跳过，不算通过也不算失败
    assert.ok(true, "本机无 g++，跳过语法编译检查（在 EVIDENCE.md 中标注）");
  } else {
    assert.equal(r.status, 0, `C++ 桩语法检查失败：${r.stderr}`);
  }
});
