/**
 * loom.runtime —— 移植进新框架的合规运行时骨架（中文注释）。
 *
 * 覆盖：模组注册 / 生命周期 / 事件总线 / 确定性销毁。
 * 约束：无 node:*、无 fs/crypto/网络、无全局可变状态（状态在闭包内）、无隐式加载顺序。
 * 事务 / 签名 / 依赖等需要平台侧能力的模块通过服务契约引用，见 docs/06-port-mapping.md。
 */

import { Status, ok, fail, makeResourceHandle } from "./result.js";

export const MAX_MODS = 256;
export const MAX_HANDLERS_PER_EVENT = 32;

export function createRuntime(host = {}) {
  const mods = new Map();          // id -> { record, state, handle }
  const listeners = new Map();     // event -> Set<fn>
  let disposed = false;

  const guard = () => {
    if (disposed) return fail(Status.DENIED, "E_RUNTIME_DISPOSED", "运行时已销毁");
    return null;
  };

  return Object.freeze({
    /** 注册模组；重复 ID、缺字段一律拒绝，不静默覆盖。 */
    register(mod) {
      const g = guard();
      if (g) return g;
      if (!mod || typeof mod.id !== "string" || !/^[a-z0-9._-]{2,64}$/.test(mod.id)) {
        return fail(Status.DENIED, "E_MOD_ID", "模组 id 不合法");
      }
      if (typeof mod.name !== "string" || mod.name.length === 0) {
        return fail(Status.DENIED, "E_MOD_NAME", "模组缺少名称");
      }
      if (mods.has(mod.id)) return fail(Status.DENIED, "E_MOD_DUP", `模组已注册：${mod.id}`);
      if (mods.size >= MAX_MODS) return fail(Status.RESOURCE_EXHAUSTED, "E_MOD_LIMIT", "模组数达到上限");
      mods.set(mod.id, Object.freeze({
        record: Object.freeze({ id: mod.id, name: mod.name,
          version: typeof mod.version === "string" ? mod.version : "0.0.0" }),
        state: "registered",
        handle: null
      }));
      return ok(Object.freeze({ id: mod.id, state: "registered" }));
    },

    /** 启用：创建可追踪 ResourceHandle，禁用时必须释放。 */
    start(id) {
      const g = guard();
      if (g) return g;
      const m = mods.get(id);
      if (!m) return fail(Status.DENIED, "E_MOD_UNKNOWN", `未注册模组：${id}`);
      if (m.state === "running") return ok({ id, state: "running", already: true });
      const h = makeResourceHandle(`mod-${id}`, () => {});
      mods.set(id, Object.freeze({ ...m, state: "running", handle: h }));
      return ok(Object.freeze({ id, state: "running", handle: h.id }));
    },

    /** 禁用：释放资源，不允许只隐藏按钮。 */
    stop(id) {
      const g = guard();
      if (g) return g;
      const m = mods.get(id);
      if (!m) return fail(Status.DENIED, "E_MOD_UNKNOWN", `未注册模组：${id}`);
      if (m.handle) m.handle.dispose();
      mods.set(id, Object.freeze({ ...m, state: "stopped", handle: null }));
      return ok(Object.freeze({ id, state: "stopped", resourcesReleased: true }));
    },

    /** 订阅事件；返回取消订阅函数。 */
    on(event, fn) {
      const g = guard();
      if (g) return g;
      if (typeof event !== "string" || event.length === 0) return fail(Status.DENIED, "E_EVENT_NAME", "事件名不合法");
      if (typeof fn !== "function") return fail(Status.DENIED, "E_HANDLER_TYPE", "处理器必须是函数");
      const set = listeners.get(event) ?? new Set();
      if (set.size >= MAX_HANDLERS_PER_EVENT) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_HANDLER_LIMIT", "单事件处理器数达到上限");
      }
      set.add(fn);
      listeners.set(event, set);
      return ok(Object.freeze({
        unsubscribe() { set.delete(fn); if (set.size === 0) listeners.delete(event); }
      }));
    },

    /**
     * 同步分发。单个处理器抛错被隔离，不影响其他处理器与加载器。
     * 诚实说明：同步分发没有抢占式超时；需要超时的场景由平台侧 withTimeout 包装。
     */
    emit(event, payload) {
      const g = guard();
      if (g) return g;
      const set = listeners.get(event);
      if (!set || set.size === 0) return ok({ event, delivered: 0, failed: 0 });
      let delivered = 0;
      const failures = [];
      for (const fn of [...set]) {
        try { fn(payload); delivered += 1; }
        catch { failures.push("handler-threw"); }
      }
      const value = Object.freeze({ event, delivered, failed: failures.length,
        note: failures.length ? "故障已隔离，未影响其他处理器" : "全部成功" });
      return failures.length > 0
        ? { status: Status.DEGRADED, code: "E_HANDLER_ISOLATED", message: "部分处理器抛错，已隔离", value }
        : ok(value);
    },

    /** 幂等销毁：回收全部模组句柄与订阅。 */
    dispose() {
      if (disposed) return ok({ already: true, reclaimed: 0 });
      let n = 0;
      for (const m of mods.values()) { if (m.handle) { m.handle.dispose(); n += 1; } }
      mods.clear();
      listeners.clear();
      disposed = true;
      return ok({ reclaimed: n });
    },

    /** 只读诊断。 */
    stats() {
      return Object.freeze({
        mods: mods.size,
        running: [...mods.values()].filter((m) => m.state === "running").length,
        events: listeners.size,
        disposed
      });
    },

    /** host 仅用于将来注入平台侧服务，当前不使用、不探测版本。 */
    hostBound: typeof host === "object" && host !== null
  });
}
