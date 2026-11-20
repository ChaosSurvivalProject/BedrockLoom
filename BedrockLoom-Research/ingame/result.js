/**
 * 七态结果（游戏内合规层自包含版本，中文注释）。
 * 与主项目 core/result.mjs 语义一致；独立一份是为了让本目录可作为 BP scripts 直接复制，
 * 不依赖仓库其他目录、不 import 任何 node: 模块。
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

export function ok(value, extra = {}) {
  return Object.freeze({ status: Status.OK, value, ...extra });
}

export function fail(status, code, message, extra = {}) {
  return Object.freeze({ status, code, message, ...extra });
}

/** 幂等资源句柄：禁用模组/退出世界时可强制回收。 */
export function makeResourceHandle(id, disposeFn) {
  let done = false;
  return Object.freeze({
    id,
    get disposed() { return done; },
    dispose() {
      if (done) return ok({ already: true });
      done = true;
      try { disposeFn?.(); } catch { return fail(Status.DEGRADED, "E_DISPOSE_THREW", "清理回调抛错，句柄已标记销毁"); }
      return ok({ reclaimed: true });
    }
  });
}
