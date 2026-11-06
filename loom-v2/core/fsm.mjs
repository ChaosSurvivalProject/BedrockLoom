// core/fsm.mjs —— 事务状态机（安装/升级/卸载/启停/依赖修复/资源加载/世界进出/适配器切换）
// 纯逻辑、不可变转换、可注入中断点；崩溃恢复只依赖事务日志与备份路径。
// 边界规则 B1：不 import node:*。
import { ok, fail, partial, Status } from "./result.mjs";

export const STATE = Object.freeze({
  INIT: "INIT", PRECHECK: "PRECHECK", STAGING: "STAGING", BACKUP: "BACKUP",
  COMMIT_PENDING: "COMMIT_PENDING", COMMITTED: "COMMITTED", VERIFY: "VERIFY", DONE: "DONE",
  ABORTING: "ABORTING", ABORTED: "ABORTED", RECOVERY_REQUIRED: "RECOVERY_REQUIRED", SAFE_MODE: "SAFE_MODE"
});

const FORWARD = Object.freeze({
  install:           ["INIT", "PRECHECK", "STAGING", "BACKUP", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  upgrade:           ["INIT", "PRECHECK", "STAGING", "BACKUP", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  uninstall:         ["INIT", "PRECHECK", "BACKUP", "STAGING", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  enable:            ["INIT", "PRECHECK", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  disable:           ["INIT", "PRECHECK", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  "dependency-repair": ["INIT", "PRECHECK", "STAGING", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  "resource-load":   ["INIT", "STAGING", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"],
  "world-enter":     ["INIT", "PRECHECK", "COMMITTED", "DONE"],
  "world-exit":      ["INIT", "BACKUP", "COMMITTED", "DONE"],
  "adapter-switch":  ["INIT", "PRECHECK", "BACKUP", "COMMIT_PENDING", "COMMITTED", "VERIFY", "DONE"]
});

export const CANCEL_POINTS = Object.freeze(["INIT", "PRECHECK", "STAGING", "BACKUP", "COMMIT_PENDING"]);
export const ROLLBACK_POINT = "BACKUP";

let seq = 0;
function nextId() {
  seq += 1;
  const hex = (Date.now().toString(16) + seq.toString(16).padStart(4, "0")).padEnd(16, "0").slice(-16);
  return `tx-${hex}`;
}

export function flowFor(kind) { return FORWARD[kind] ?? null; }

export function begin(kind, plan = {}) {
  const flow = flowFor(kind);
  if (!flow) return fail(Status.UNSUPPORTED, "E_TX_UNKNOWN_KIND", `未知事务类型: ${kind}`);
  const now = new Date().toISOString();
  const tx = Object.freeze({
    txId: nextId(), kind, modId: plan.modId ?? "unknown",
    fromVersion: plan.fromVersion ?? null, toVersion: plan.toVersion ?? null,
    state: STATE.INIT, createdAt: now, updatedAt: now,
    plan: Object.freeze({ ...plan }),
    flow: Object.freeze(flow),
    cancelPoints: Object.freeze([...CANCEL_POINTS]),
    rollbackPoint: ROLLBACK_POINT,
    backupPath: plan.backupPath ?? null,
    stagingPath: plan.stagingPath ?? null,
    error: null,
    events: Object.freeze([{ at: now, from: null, to: STATE.INIT, event: "begin", detail: `kind=${kind}`, canCancel: true }])
  });
  return ok(tx);
}

function append(tx, to, event, detail, canCancel = false) {
  const now = new Date().toISOString();
  return Object.freeze({
    ...tx, state: to, updatedAt: now,
    events: Object.freeze([...tx.events, { at: now, from: tx.state, to, event, detail, canCancel }])
  });
}

/** 推进到流的下一状态；event 可为 'advance' | 'cancel' | 'fail' | 'rollback' | 'crash'。 */
export function transition(tx, event = "advance", detail = "") {
  if (!tx || !tx.flow) return fail(Status.DENIED, "E_TX_INVALID", "无效事务对象");
  const flow = tx.flow;
  const idx = flow.indexOf(tx.state);

  if (event === "cancel") {
    if (!CANCEL_POINTS.includes(tx.state)) return fail(Status.DENIED, "E_TX_CANCEL_TOO_LATE", `状态 ${tx.state} 已不可取消`, { recoverable: false });
    const a = append(tx, STATE.ABORTING, "cancel", detail || "用户取消", true);
    return ok(append(a, STATE.ABORTED, "abort-complete", "已回滚到 BEGIN 前状态"), { rollbackRequired: true });
  }
  if (event === "fail") {
    const a = append(tx, STATE.ABORTING, "fail", detail || "阶段失败");
    const b = Object.freeze({ ...append(a, STATE.ABORTED, "rollback", "自动回滚"), error: { code: detail?.code ?? "E_TX_FAILED", message: detail?.message ?? String(detail), phase: tx.state } });
    return ok(b, { rollbackRequired: true });
  }
  if (event === "crash") {
    return ok(append(tx, STATE.RECOVERY_REQUIRED, "crash", detail || "进程中断，状态未提交"), { recoveryRequired: true });
  }
  if (event === "rollback") {
    const a = append(tx, STATE.ABORTING, "rollback", detail || "手动回滚");
    return ok(append(a, STATE.ABORTED, "rollback-complete", "回滚完成"));
  }
  if (event !== "advance") return fail(Status.DENIED, "E_TX_UNKNOWN_EVENT", `未知事件: ${event}`);
  if (idx < 0) return fail(Status.DENIED, "E_TX_BAD_STATE", `当前状态 ${tx.state} 不在流中`);
  if (idx === flow.length - 1) return fail(Status.DENIED, "E_TX_ALREADY_DONE", "事务已完成");
  const next = flow[idx + 1];
  return ok(append(tx, next, "advance", detail, CANCEL_POINTS.includes(next)), { nextState: next });
}

export function run(tx, events = []) {
  let current = tx;
  const results = [];
  for (const e of events) {
    const r = transition(current, typeof e === "string" ? e : e.event, typeof e === "string" ? "" : (e.detail ?? ""));
    results.push(r);
    if (r.status !== Status.OK) return partial({ tx: current, results }, [r]);
    current = r.value;
  }
  return ok({ tx: current, results });
}

/**
 * 崩溃恢复：只依据事务最后状态与是否存在备份。
 * COMMIT_PENDING / COMMITTED -> 重放提交或从备份回滚；
 * ABORTING/ABORTED -> 完成回滚；其余 -> 从 INIT 重做。
 * 无法判定 -> SAFE_MODE（不允许留下不可启动状态）。
 */
export function recover(logEntry) {
  if (!logEntry || !logEntry.state) return fail(Status.DENIED, "E_TX_INVALID", "事务日志条目无效");
  const s = logEntry.state;
  const hasBackup = Boolean(logEntry.backupPath);
  const base = {
    txId: logEntry.txId, kind: logEntry.kind, modId: logEntry.modId,
    fromState: s, hasBackup, at: new Date().toISOString()
  };
  if (s === STATE.COMMIT_PENDING || s === STATE.COMMITTED) {
    return ok(Object.freeze({ ...base, action: hasBackup ? "ROLLBACK_FROM_BACKUP" : "REPLAY_COMMIT", targetState: hasBackup ? STATE.ABORTED : STATE.DONE, safeMode: false, reason: "提交阶段中断；依据备份决定回滚或重放" }));
  }
  if (s === STATE.ABORTING || s === STATE.ABORTED) {
    return ok(Object.freeze({ ...base, action: "FINISH_ROLLBACK", targetState: STATE.ABORTED, safeMode: false, reason: "中断发生在回滚阶段，继续完成回滚" }));
  }
  if (s === STATE.DONE || s === STATE.VERIFY) {
    return ok(Object.freeze({ ...base, action: "VERIFY_ONLY", targetState: STATE.DONE, safeMode: false, reason: "已提交，仅做冒烟验证" }));
  }
  if (s === STATE.RECOVERY_REQUIRED && hasBackup) {
    return ok(Object.freeze({ ...base, action: "ROLLBACK_FROM_BACKUP", targetState: STATE.ABORTED, safeMode: false, reason: "存在备份可恢复" }));
  }
  return ok(Object.freeze({ ...base, action: "ENTER_SAFE_MODE", targetState: STATE.SAFE_MODE, safeMode: true, reason: "无可用备份且状态不可判定；进入安全模式并隔离上次导致启动失败的模组" }));
}

export function toLogEntry(tx) {
  return Object.freeze({
    txId: tx.txId, kind: tx.kind, modId: tx.modId,
    fromVersion: tx.fromVersion, toVersion: tx.toVersion,
    state: tx.state, createdAt: tx.createdAt, updatedAt: tx.updatedAt,
    cancelPoints: [...tx.cancelPoints], rollbackPoint: tx.rollbackPoint,
    backupPath: tx.backupPath, stagingPath: tx.stagingPath,
    error: tx.error, events: tx.events.map((e) => ({ ...e }))
  });
}
