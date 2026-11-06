import test from "node:test";
import assert from "node:assert/strict";
import { begin, transition, run, recover, toLogEntry, STATE, CANCEL_POINTS, flowFor } from "../core/fsm.mjs";
import { Status } from "../core/result.mjs";

test("S11 begin：事务 ID、流、取消点、日志首事件", () => {
  const r = begin("install", { modId: "example.loom_blade", toVersion: "1.1.0" });
  assert.equal(r.status, Status.OK);
  const tx = r.value;
  assert.match(tx.txId, /^tx-[a-f0-9]{16}$/);
  assert.equal(tx.state, STATE.INIT);
  assert.deepEqual(tx.cancelPoints, [...CANCEL_POINTS]);
  assert.equal(tx.rollbackPoint, "BACKUP");
  assert.equal(tx.events.length, 1);
  assert.equal(flowFor("upgrade").at(-1), "DONE");
});

test("S12 完整安装流：INIT -> DONE，状态序列与取消点一致", () => {
  const r = run(begin("install", { modId: "a" }).value, Array(7).fill("advance"));
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.tx.state, STATE.DONE);
  const states = r.value.tx.events.map((e) => e.to);
  assert.deepEqual(states, ["INIT", "PRECHECK", "STAGING", "BACKUP", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"]);
  assert.equal(r.value.tx.events.at(-1).canCancel, false);
});

test("S12 取消点：COMMIT_PENDING 可取消，COMMITTED 之后拒绝取消", () => {
  const tx = run(begin("install", { modId: "a" }).value, ["advance", "advance", "advance", "advance"]).value.tx;
  assert.equal(tx.state, STATE.COMMIT_PENDING);
  const cancelled = transition(tx, "cancel");
  assert.equal(cancelled.status, Status.OK);
  assert.equal(cancelled.value.state, STATE.ABORTED);
  assert.equal(cancelled.rollbackRequired, true);

  const committed = run(begin("install", { modId: "a" }).value, Array(5).fill("advance")).value.tx;
  assert.equal(committed.state, STATE.COMMITTED);
  const tooLate = transition(committed, "cancel");
  assert.equal(tooLate.status, Status.DENIED);
  assert.equal(tooLate.code, "E_TX_CANCEL_TOO_LATE");
});

test("S12 fail 自动回滚并记录 phase 与错误码", () => {
  const tx = run(begin("upgrade", { modId: "a", fromVersion: "1.0.0" }).value, ["advance", "advance"]).value.tx;
  const r = transition(tx, "fail", { code: "E_TX_DISK_FULL", message: "磁盘空间不足" });
  assert.equal(r.value.state, STATE.ABORTED);
  assert.equal(r.value.error.code, "E_TX_DISK_FULL");
  assert.equal(r.value.error.phase, "STAGING");
  assert.equal(r.rollbackRequired, true);
});

test("S12 crash 进入 RECOVERY_REQUIRED，不伪装成功", () => {
  const tx = run(begin("install", { modId: "a" }).value, Array(4).fill("advance")).value.tx;
  const r = transition(tx, "crash", "关机");
  assert.equal(r.value.state, STATE.RECOVERY_REQUIRED);
  assert.equal(r.recoveryRequired, true);
});

test("S13 recover：提交点有备份 -> 回滚；无备份不可判定 -> 安全模式", () => {
  const withBackup = recover({ txId: "tx-1", kind: "install", modId: "a", state: STATE.COMMIT_PENDING, backupPath: "/backup/a" });
  assert.equal(withBackup.value.action, "ROLLBACK_FROM_BACKUP");
  assert.equal(withBackup.value.safeMode, false);
  const noBackup = recover({ txId: "tx-2", kind: "install", modId: "a", state: STATE.RECOVERY_REQUIRED, backupPath: null });
  assert.equal(noBackup.value.action, "ENTER_SAFE_MODE");
  assert.equal(noBackup.value.safeMode, true);
  const done = recover({ txId: "tx-3", kind: "enable", modId: "a", state: STATE.VERIFY, backupPath: null });
  assert.equal(done.value.action, "VERIFY_ONLY");
  const aborting = recover({ txId: "tx-4", kind: "uninstall", modId: "a", state: STATE.ABORTING, backupPath: "/b" });
  assert.equal(aborting.value.action, "FINISH_ROLLBACK");
});

test("S13 toLogEntry 符合事务日志 Schema 必填字段", () => {
  const entry = toLogEntry(begin("adapter-switch", { modId: "a" }).value);
  for (const k of ["txId", "kind", "modId", "state", "createdAt", "events", "cancelPoints", "rollbackPoint"]) {
    assert.ok(k in entry, `缺少字段 ${k}`);
  }
  assert.ok(Array.isArray(entry.events));
  assert.equal(entry.cancelPoints.includes("INIT"), true);
});
