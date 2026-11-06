// core/result.mjs —— 七态结果语义、结构化错误、幂等 Disposable、超时封装。
// 边界规则 B1：本文件不得 import 任何 node:* 模块，浏览器与 Node 均可运行。

export const Status = Object.freeze({
  OK: "ok",
  PARTIAL: "partial",
  UNSUPPORTED: "unsupported",
  DENIED: "denied",
  TIMEOUT: "timeout",
  RESOURCE_EXHAUSTED: "resource-exhausted",
  DEGRADED: "degraded"
});

export const ALL_STATUSES = Object.freeze(Object.values(Status));

export class StructuredError extends Error {
  constructor(code, message, { status = Status.DENIED, field, recoverable = false, suggestion, details } = {}) {
    super(message);
    this.name = "StructuredError";
    this.code = code;
    this.status = status;
    this.field = field;
    this.recoverable = recoverable;
    this.suggestion = suggestion;
    this.details = details;
  }
}

export function isResult(value) {
  return Boolean(value) && typeof value === "object" && ALL_STATUSES.includes(value.status);
}

export function ok(value, meta = {}) {
  return Object.freeze({ status: Status.OK, value, ...meta });
}

export function fail(status, code, message, extra = {}) {
  return Object.freeze({
    status,
    code,
    message,
    recoverable: Boolean(extra.recoverable),
    suggestion: extra.suggestion ?? null,
    field: extra.field ?? null,
    details: extra.details ?? null,
    error: new StructuredError(code, message, { status, ...extra })
  });
}

export function partial(value, failures, meta = {}) {
  const list = Array.isArray(failures) ? failures : [failures];
  return Object.freeze({ status: Status.PARTIAL, value, failures: list, ...meta });
}

export function degraded(value, reason, fallback, meta = {}) {
  return Object.freeze({ status: Status.DEGRADED, value, reason, fallback, ...meta });
}

export function unwrap(result) {
  if (!isResult(result)) throw new StructuredError("E_NOT_A_RESULT", "不是合法的 Result 对象");
  if (result.status === Status.OK) return result.value;
  const err = result.error ?? new StructuredError(result.code ?? "E_RESULT_FAILED", result.message ?? "操作未成功", { status: result.status });
  throw err;
}

/** 幂等销毁句柄：重复 dispose() 不抛错、不重复执行 cleanup。 */
export function makeDisposable(cleanup, { id, onDispose } = {}) {
  if (typeof cleanup !== "function") throw new TypeError("cleanup must be a function");
  let disposed = false;
  const handle = {
    id: id ?? null,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return false;
      disposed = true;
      try { cleanup(); } finally { onDispose?.(id); }
      return true;
    }
  };
  return Object.freeze(handle);
}

/** 引用计数资源句柄；release-pending 与 released 分离，不承诺 GPU 立即回收。 */
export function makeResourceHandle(id, { release, namespace = "bedrockloom" } = {}) {
  let refs = 1;
  let state = "active";
  return Object.freeze({
    id,
    namespace,
    get refs() { return refs; },
    get state() { return state; },
    retain() { if (state === "active") refs += 1; return refs; },
    release() {
      if (state !== "active") return state;
      refs -= 1;
      if (refs <= 0) {
        state = "release-pending";
        try { release?.(); } finally { state = "released"; }
      }
      return state;
    },
    forceRelease() {
      refs = 0;
      state = "release-pending";
      try { release?.(); } finally { state = "released"; }
      return state;
    }
  });
}

/** 超时封装，返回 Result；不吞掉取消信号。 */
export function withTimeout(promise, ms, { code = "E_TX_NETWORK", signal } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; resolve(r); } };
    const timer = setTimeout(() => finish(fail(Status.TIMEOUT, code, `操作超时（${ms}ms）`, { recoverable: true, suggestion: "检查网络或稍后重试" })), ms);
    const onAbort = () => finish(fail(Status.PARTIAL, "E_TX_CANCELLED", "操作被取消", { recoverable: true }));
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); finish(isResult(v) ? v : ok(v)); },
      (e) => { clearTimeout(timer); finish(fail(Status.DENIED, e?.code ?? "E_UNKNOWN", String(e?.message ?? e), { recoverable: false })); }
    );
  });
}
