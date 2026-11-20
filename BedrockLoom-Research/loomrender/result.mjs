/**
 * 七态结果（原创，与 ../loom-v2/core/result.mjs 语义同构但独立实现）。
 * 独立实现是为了避免「本机私有层」与「主项目平台层」产生隐式运行时依赖。
 */

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

/** 成功结果。extra 里的字段挂在顶层，便于调用方直接读取。 */
export function ok(value, extra = {}) {
  return Object.freeze({ status: Status.OK, value, ...extra });
}

/** 结构化失败结果。 */
export function fail(status, code, message, extra = {}) {
  if (!ALL_STATUSES.includes(status)) {
    throw new TypeError(`非法状态：${status}`);
  }
  return Object.freeze({ status, code, message, ...extra });
}

/** 幂等销毁包装：dispose() 多次调用只执行一次真正清理。 */
export function makeDisposable(value, disposeFn) {
  let done = false;
  return Object.freeze({
    value,
    get disposed() { return done; },
    dispose() {
      if (done) return { status: Status.OK, value: false, note: "已销毁，幂等返回" };
      done = true;
      try { disposeFn?.(); }
      catch { return { status: Status.DEGRADED, value: true, note: "清理回调抛错，但状态已标记销毁" }; }
      return { status: Status.OK, value: true };
    }
  });
}

/** 资源句柄：可追踪、退出世界时可强制回收。 */
export function makeResourceHandle(id, disposeFn) {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("资源句柄需要非空 id");
  }
  const wrapped = makeDisposable({ id }, disposeFn);
  return Object.freeze({
    id,
    get disposed() { return wrapped.disposed; },
    dispose: wrapped.dispose
  });
}
