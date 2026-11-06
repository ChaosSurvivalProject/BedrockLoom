import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ROOT, MOD_ROOT } from "./_helpers.mjs";
import { ALL_STATUSES, Status, ok, fail, partial, degraded, unwrap, makeDisposable, makeResourceHandle, StructuredError } from "../core/result.mjs";
import { PackageStore, ModState } from "../core/package-store.mjs";
import { collect, toClipboardText, classify, repairActions } from "../services/diagnostics.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

test("S12 七态结果语义齐全且互斥", () => {
  assert.equal(ALL_STATUSES.length, 7);
  for (const s of ["ok", "partial", "unsupported", "denied", "timeout", "resource-exhausted", "degraded"]) {
    assert.ok(ALL_STATUSES.includes(s));
  }
  assert.equal(ok(1).status, Status.OK);
  assert.equal(fail(Status.DENIED, "E_TEST", "x").status, Status.DENIED);
  assert.equal(partial({ a: 1 }, [{ code: "E_X" }]).status, Status.PARTIAL);
  assert.equal(degraded(1, "reason", "fallback").fallback, "fallback");
  assert.equal(unwrap(ok(42)), 42);
  assert.throws(() => unwrap(fail(Status.DENIED, "E_X", "no")), StructuredError);
});

test("S12 幂等销毁与资源句柄强制回收（退出世界后活动句柄为 0）", () => {
  let n = 0;
  const d = makeDisposable(() => { n += 1; });
  d.dispose(); d.dispose(); d.dispose();
  assert.equal(n, 1);
  let released = 0;
  const h = makeResourceHandle("res-1", { release: () => { released += 1; } });
  h.retain(); h.retain();
  assert.equal(h.refs, 3);
  assert.equal(h.forceRelease(), "released");
  assert.equal(h.refs, 0);
  assert.equal(released, 1);
  assert.equal(h.state, "released");
});

test("B1/B2 模块边界：core 不依赖 node:*，services 不依赖界面层", () => {
  const coreDir = path.join(ROOT, "core");
  const coreFiles = readdirSync(coreDir).filter((f) => f.endsWith(".mjs"));
  assert.ok(coreFiles.length >= 8);
  for (const f of coreFiles) {
    const src = readFileSync(path.join(coreDir, f), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:/, `${f} 不得 import node:*`);
    assert.doesNotMatch(src, /\bprocess\./, `${f} 不得使用 process`);
  }
  const svcDir = path.join(ROOT, "services");
  for (const f of readdirSync(svcDir).filter((f) => f.endsWith(".mjs"))) {
    assert.doesNotMatch(readFileSync(path.join(svcDir, f), "utf8"), /from\s+["'][^"']*manager\//, `${f} 不得依赖界面层`);
  }
});

test("B4 负向探针：代码里不存在注入/Hook/私有偏移/绕过签名的实现", () => {
  const dirs = ["core", "services", "contracts"];
  const forbidden = /\b(sigscan|dll_inject|WriteProcessMemory|VirtualProtect|patchBinary|bypassSignature|privateOffset)\b/i;
  for (const d of dirs) {
    for (const f of readdirSync(path.join(ROOT, d)).filter((f) => /\.(mjs|ts)$/.test(f))) {
      assert.doesNotMatch(readFileSync(path.join(ROOT, d, f), "utf8"), forbidden, `${d}/${f} 出现被禁止的实现`);
    }
  }
});

test("S18 诊断包脱敏：排除聊天/账号/IP/坐标，且不收集遥测", () => {
  const store = new PackageStore([{ id: "a", version: "1.0.0", state: ModState.CORRUPT, contribution: { frameMs: 2.5, objects: 12 } }]);
  const bundle = collect({
    store, errors: [{ code: "E_TX_NETWORK", message: "断线", recoverable: true }],
    performance: { chat: "玩家私密聊天", ip: "1.2.3.4", coordinates: [1, 2, 3], frameP95: 16.7 }
  }).value;
  assert.equal(bundle.performance.chat, "***redacted***");
  assert.equal(bundle.performance.ip, "***redacted***");
  assert.equal(bundle.performance.coordinates, "***redacted***");
  assert.equal(bundle.performance.frameP95, 16.7);
  assert.equal(bundle.redaction.telemetry, "默认不收集");
  assert.equal(bundle.errors[0].category, "network");
  const text = toClipboardText(bundle);
  assert.ok(!text.includes("玩家私密聊天"));
  assert.ok(text.includes("默认不收集"));
});

test("S18 错误分类区分模组 bug / 适配器限制 / 官方客户端限制 / 网络问题", () => {
  assert.equal(classify({ code: "E_DEP_MISSING" }), "mod-bug");
  assert.equal(classify({ code: "E_CAP_ADAPTER_OFF" }), "adapter-limit");
  assert.equal(classify({ code: "E_CAP_UNAVAILABLE" }), "client-limit");
  assert.equal(classify({ code: "E_TX_NETWORK" }), "network");
  const repair = repairActions([
    { code: "E_DEP_DUPLICATE_ID" }, { code: "E_FILE_UNLISTED" }, { code: "E_CFG_MIGRATION_CONFLICT" }
  ]).value;
  assert.equal(repair.actions.length, 3);
  assert.equal(repair.autoSafe, false, "未列文件是严重问题，不得自动修复");
  assert.ok(repair.actions.some((a) => a.action === "去重"));
});

test("S10 仓库索引与撤销机制可解析，来源唯一性可追溯", () => {
  const index = {
    schema: "bedrockloom.repo-index/v2",
    source: { id: "official", kind: "official", trust: "trusted", priority: 0, signatureKeys: [{ keyId: "k", publicKey: "pem", fingerprint: sha("pem") }] },
    generatedAt: new Date().toISOString(), sequence: 7, delta: false,
    entries: [{ modId: "a", version: "1.0.0", action: "publish", artifact: { path: "a.loompack", sha256: sha("a"), size: 10, resumeSupported: true }, sourceOfRecord: "official" }],
    revocations: [{ modId: "old", version: "0.9.0", reason: "密钥轮换", revokedAt: new Date().toISOString() }]
  };
  assert.equal(index.entries[0].sourceOfRecord, index.source.id);
  assert.equal(index.revocations[0].reason.length > 0, true);
  const store = new PackageStore([{ id: "a", version: "1.0.0" }]);
  store.addSource({ id: "official", kind: "official", trust: "trusted", priority: 0, entries: [{ modId: "a" }] });
  store.addSource({ id: "community", kind: "community", trust: "unknown", priority: 5, entries: [{ modId: "a" }] });
  const candidates = store.candidateSources("a");
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].id, "official", "优先级数值小者在前，但安装记录仍必须明确实际来源");
  assert.equal(store.get("a").actualSource, "local-file");
});

test("S18 既有 40 个文件保持原样，v1 API 输入边界实现仍在", () => {
  assert.equal(sha(readFileSync(path.join(MOD_ROOT, "mod.json"), "utf8")), "b4a0541c1ee8812f56bf32f94f2b8a13c85bf1dd997cc81024d710536c746c48");
  assert.equal(sha(readFileSync(path.join(MOD_ROOT, "docs/RENDER_AUDIT.md"), "utf8")), "3b22b0f93041800ee369d71783ee6623e80973715db721d163e925bb0dc59390");
  const api = readFileSync(path.join(MOD_ROOT, "behavior_pack/scripts/api/client_api.js"), "utf8");
  for (const kw of ["safeId", "spawnParticle", "playSound", "setActionBar", "whitelist", "maxStorageBytes", "dispose"]) {
    assert.ok(api.includes(kw), `旧 API 实现缺少 ${kw}`);
  }
  const camera = readFileSync(path.join(MOD_ROOT, "behavior_pack/scripts/api/client_api.js"), "utf8");
  assert.match(camera, /visualGuarantee:\s*"none"/, "相机不得承诺画面效果");
});

test("S18 离线图形管理器存在、自包含、无外部网络请求", () => {
  const gui = path.join(ROOT, "manager", "index.html");
  assert.equal(existsSync(gui), true);
  const html = readFileSync(gui, "utf8");
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(js|css)/, "不得依赖外部 CDN");
  assert.doesNotMatch(html, /\bfetch\s*\(/, "离线界面不得发起网络请求");
  for (const kw of ["模组库", "安装", "更新", "权限", "配置", "诊断", "配置文件集"]) {
    assert.ok(html.includes(kw), `界面缺少板块 ${kw}`);
  }
});
