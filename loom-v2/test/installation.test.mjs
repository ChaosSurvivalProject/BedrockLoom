import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { makeSignedPack } from "./_helpers.mjs";
import { createWorkspace, AtomicInstaller } from "../services/installation-service.mjs";
import { verifyEnvelope } from "../services/signature.mjs";
import { Status, withTimeout, makeDisposable, makeResourceHandle } from "../core/result.mjs";

async function withInstaller(fn) {
  const root = await createWorkspace();
  try { return await fn({ root, installer: new AtomicInstaller({ root }) }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("S14 真实原子安装：文件写入、状态 DONE、事务日志落盘", async () => {
  await withInstaller(async ({ root, installer }) => {
    const pack = await makeSignedPack();
    const r = await installer.install(pack, { modId: "example.loom_blade", version: "1.1.0" });
    assert.equal(r.status, Status.OK, JSON.stringify(r.tx?.error ?? r));
    assert.equal(r.value.tx.state, "DONE");
    const written = await readFile(path.join(root, "mods/example.loom_blade/files/behavior_pack/scripts/main.js"), "utf8");
    assert.match(written, /startLifecycle/);
    const log = JSON.parse(await readFile(path.join(root, "txlog.json"), "utf8"));
    assert.equal(log.schema, "bedrockloom.txlog/v1");
    assert.equal(log.transactions[0].events.at(-1).to, "DONE");
    assert.equal(r.value.backupCreated, false);
  });
});

test("S14 升级：更新前备份，提交后新版本生效", async () => {
  await withInstaller(async ({ root, installer }) => {
    const p1 = await makeSignedPack();
    await installer.install(p1, { modId: "example.loom_blade", version: "1.1.0" });
    const p2 = await makeSignedPack();
    const files = new Map(p2.files);
    files.set("files/behavior_pack/scripts/main.js", Buffer.from("// v2 upgraded\n"));
    // 重新生成清单以保持完整性一致
    const { buildFileList } = await import("../services/integrity.mjs");
    const fileList = buildFileList(files);
    const r = await installer.install({ manifest: p1.manifest, fileList, files }, { modId: "example.loom_blade", version: "1.2.0" });
    assert.equal(r.status, Status.OK);
    assert.equal(r.value.backupCreated, true);
    const upgraded = await readFile(path.join(root, "mods/example.loom_blade/files/behavior_pack/scripts/main.js"), "utf8");
    assert.match(upgraded, /v2 upgraded/);
    const backups = await readdir(path.join(root, "backup"));
    assert.ok(backups.length >= 1);
  });
});

test("S14 磁盘满故障：自动回滚，不留下半安装状态", async () => {
  await withInstaller(async ({ root, installer }) => {
    const pack = await makeSignedPack();
    const r = await installer.install(pack, { modId: "example.loom_blade", faultInjection: { at: "BACKUP", error: "disk-full" } });
    assert.equal(r.status, Status.RESOURCE_EXHAUSTED);
    assert.equal(r.code, "E_TX_DISK_FULL");
    assert.equal(r.tx.state, "ABORTED");
    assert.equal(r.rollback.rolledBack, true);
    await assert.rejects(stat(path.join(root, "mods/example.loom_blade")));
    assert.deepEqual(await readdir(path.join(root, "staging")), []);
  });
});

test("S14 用户取消：可取消点生效，返回 partial 并回滚", async () => {
  await withInstaller(async ({ root, installer }) => {
    const pack = await makeSignedPack();
    const controller = new AbortController();
    const r = await installer.install(pack, {
      modId: "example.loom_blade", signal: controller.signal,
      onProgress: (p) => { if (p.state === "PRECHECK") controller.abort(); }
    });
    assert.equal(r.status, Status.PARTIAL);
    assert.equal(r.code, "E_TX_CANCELLED");
    assert.equal(r.tx.state, "ABORTED");
    await assert.rejects(stat(path.join(root, "mods/example.loom_blade")));
  });
});

test("S14 提交点崩溃：保留恢复标记，recoverPending 重放提交完成安装", async () => {
  await withInstaller(async ({ root, installer }) => {
    const pack = await makeSignedPack();
    const r = await installer.install(pack, { modId: "example.loom_blade", faultInjection: { at: "COMMIT_PENDING", error: "crash" } });
    assert.equal(r.code, "E_TX_CRASH_RECOVERY");
    assert.equal(r.rollback.rolledBack, false);
    const markers = await readdir(path.join(root, "pending"));
    assert.equal(markers.length, 1);
    const recovery = await installer.recoverPending();
    assert.equal(recovery.status, Status.OK);
    assert.equal(recovery.value.results[0].action, "REPLAY_COMMIT");
    const finalFile = await readFile(path.join(root, "mods/example.loom_blade/files/behavior_pack/scripts/main.js"), "utf8");
    assert.match(finalFile, /startLifecycle/);
    assert.deepEqual(await readdir(path.join(root, "pending")), []);
  });
});

test("S14 提交点崩溃且有旧版本备份：从备份回滚，不允许不可启动状态", async () => {
  await withInstaller(async ({ root, installer }) => {
    const p1 = await makeSignedPack();
    await installer.install(p1, { modId: "example.loom_blade", version: "1.1.0" });
    const p2 = await makeSignedPack();
    const r = await installer.install(p2, { modId: "example.loom_blade", version: "1.2.0", faultInjection: { at: "COMMIT_PENDING", error: "crash" } });
    assert.equal(r.code, "E_TX_CRASH_RECOVERY");
    const recovery = await installer.recoverPending();
    assert.equal(recovery.value.results[0].action, "ROLLBACK_FROM_BACKUP");
    const restored = await readFile(path.join(root, "mods/example.loom_blade/files/behavior_pack/scripts/main.js"), "utf8");
    assert.match(restored, /startLifecycle/);
  });
});

test("S14 手动回滚与签名预检集成", async () => {
  await withInstaller(async ({ installer }) => {
    const pack = await makeSignedPack();
    const r = await installer.install(pack, { modId: "example.loom_blade" });
    const rolled = await installer.rollback(r.value.tx.txId);
    assert.equal(rolled.status, Status.OK);
    assert.equal(rolled.value.state, "ABORTED");
    const installer2 = new AtomicInstaller({ root: installer.root, trustStore: pack.trustStore, verifyFn: verifyEnvelope });
    const signed = await installer2.install(pack, { modId: "example.loom_blade", version: "1.1.0", envelope: pack.envelope });
    assert.equal(signed.status, Status.OK);
  });
});

test("S12/S15 七态中的超时、幂等销毁与引用计数回收", async () => {
  const timeout = await withTimeout(new Promise(() => {}), 25, { code: "E_TX_NETWORK" });
  assert.equal(timeout.status, Status.TIMEOUT);
  let calls = 0;
  const d = makeDisposable(() => { calls += 1; });
  assert.equal(d.dispose(), true);
  assert.equal(d.dispose(), false);
  assert.equal(calls, 1);
  let released = 0;
  const h = makeResourceHandle("tex-1", { release: () => { released += 1; } });
  h.retain();
  assert.equal(h.release(), "active");
  assert.equal(h.release(), "released");
  assert.equal(released, 1);
});
