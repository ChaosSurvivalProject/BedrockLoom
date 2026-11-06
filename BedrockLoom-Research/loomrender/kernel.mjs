/**
 * LoomRender 本机内核骨架（原创，中文注释）。
 *
 * 定位：**只有契约与状态，没有把帧写回游戏呈现链路的实现**。
 *
 * 五个契约：init / submit / present / set_camera / push_texture
 * - init         : 建立内核对象（skeleton-only，明确 attachedToGame=false）
 * - submit       : 接「渲染意图」纯数据，交给**外部合成器**算帧（合规 C 层）
 * - present      : 恒 unsupported —— 帧回灌到游戏交换链属 A 私有层，本仓库不实现
 * - set_camera   : 恒 unsupported —— FOV/near/far/视锥官方不可读
 * - push_texture : 恒 unsupported —— 运行时动态纹理替换主项目已判 Unavailable
 *
 * 所有 A 层方法带：host-private / research-hypothesis / version-drift-risk。
 */

import { Status, ok, fail, makeResourceHandle } from "./result.mjs";

export const KERNEL_CONTRACT = Object.freeze([
  Object.freeze({ name: "init", layer: "platform-side", status: "skeleton-only",
    note: "只建立对象，不附着任何游戏进程" }),
  Object.freeze({ name: "submit", layer: "platform-side", status: "compliant",
    note: "意图纯数据 → 外部合成器算帧；frameWrittenToGame 恒 false" }),
  Object.freeze({ name: "present", layer: "host-private", status: "unsupported",
    note: "帧回灌游戏交换链；本仓库不实现" }),
  Object.freeze({ name: "set_camera", layer: "host-private", status: "unsupported",
    note: "官方 Script API 无 FOV/near/far/视锥读取" }),
  Object.freeze({ name: "push_texture", layer: "host-private", status: "unsupported",
    note: "运行时动态纹理替换 = Unavailable" })
]);

/** 研究标记，出现在每个 A 层返回值里。 */
const A_LAYER_TAGS = Object.freeze({
  layer: "host-private",
  classification: "research-hypothesis",
  drift: "version-drift-risk",
  verification: "需作者本机合法包与调试环境；本仓库不提供实现"
});

/** 意图体积上限，防止过量分配。 */
export const MAX_INTENT_BYTES = 256 * 1024;
export const MAX_PENDING = 64;

export function createKernel({ now = () => Date.now(), maxPending = MAX_PENDING } = {}) {
  let initialized = false;
  let disposed = false;
  let compositor = null;              // 外部合成器回调（平台侧，合规）
  const handles = new Set();          // 可追踪资源句柄
  let submitted = 0;

  const guard = () => {
    if (disposed) return fail(Status.DENIED, "E_KERNEL_DISPOSED", "内核已销毁");
    if (!initialized) return fail(Status.DENIED, "E_KERNEL_NOT_INIT", "请先调用 init()");
    return null;
  };

  return Object.freeze({
    /** 建立内核对象；不附着游戏、不加载任何原生模块、不开线程。 */
    init() {
      if (disposed) return fail(Status.DENIED, "E_KERNEL_DISPOSED", "内核已销毁");
      if (initialized) return ok({ already: true, mode: "skeleton-only" });
      initialized = true;
      return ok(Object.freeze({
        mode: "skeleton-only",
        attachedToGame: false,
        nativeModulesLoaded: false,
        frameWrittenToGame: false,
        note: "这是骨架，不是可运行渲染内核；A 层方法恒 unsupported"
      }));
    },

    /** 注入外部合成器（C 层合规）；只接受函数，不加载原生扩展。 */
    attachCompositor(fn) {
      const g = guard();
      if (g) return g;
      if (typeof fn !== "function") {
        return fail(Status.DENIED, "E_COMPOSITOR_TYPE", "合成器必须是函数");
      }
      compositor = fn;
      return ok(Object.freeze({ attached: true, layer: "platform-side" }));
    },

    /**
     * 提交渲染意图（纯数据）。交给外部合成器在**游戏外**算帧。
     * 不产生像素到游戏、不写交换链、不上传纹理。
     */
    submit(intent) {
      const g = guard();
      if (g) return g;
      if (!intent || typeof intent !== "object") {
        return fail(Status.DENIED, "E_INTENT_SHAPE", "意图必须是对象");
      }
      let bytes;
      try { bytes = new TextEncoder().encode(JSON.stringify(intent)).length; }
      catch { return fail(Status.DENIED, "E_INTENT_SERIALIZE", "意图无法序列化"); }
      if (bytes > MAX_INTENT_BYTES) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_INTENT_TOO_LARGE",
          `意图 ${bytes} 字节超过 ${MAX_INTENT_BYTES} 上限`);
      }
      if (handles.size >= maxPending) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_PENDING_FULL", "待处理帧数达到上限");
      }
      submitted += 1;
      const h = makeResourceHandle(`ri-${submitted}`, () => handles.delete(h));
      handles.add(h);

      if (!compositor) {
        h.dispose();
        return { status: Status.DEGRADED, code: "E_NO_COMPOSITOR",
          message: "未挂载外部合成器；意图已被接收但未产生画面",
          value: Object.freeze({ seq: submitted, frameWrittenToGame: false }) };
      }
      let frame;
      try { frame = compositor(intent); }
      catch { h.dispose(); return fail(Status.DEGRADED, "E_COMPOSITOR_FAILED", "外部合成器抛错，已隔离并回收句柄"); }
      h.dispose();
      return ok(Object.freeze({
        seq: submitted,
        bytes,
        composedExternally: frame !== undefined,
        frameWrittenToGame: false,     // 关键：永远不写回游戏
        note: "帧只在平台侧/外部窗口存在，不进入游戏呈现链路"
      }));
    },

    /** A 层：帧回灌。本仓库恒不支持。 */
    present() {
      const g = guard();
      if (g) return g;
      return fail(Status.UNSUPPORTED, "E_PRESENT_NO_IMPL",
        "不提供把帧写回游戏交换链的实现", { ...A_LAYER_TAGS });
    },

    /** A 层：相机矩阵写入/读取。官方无接口，恒不支持。 */
    set_camera() {
      const g = guard();
      if (g) return g;
      return fail(Status.UNSUPPORTED, "E_CAMERA_NO_IMPL",
        "FOV/near/far/视锥/矩阵在官方 Script API 不可读，也不提供写入", { ...A_LAYER_TAGS });
    },

    /** A 层：运行时动态纹理推送。主项目已判 Unavailable，恒不支持。 */
    push_texture() {
      const g = guard();
      if (g) return g;
      return fail(Status.UNSUPPORTED, "E_TEXTURE_NO_IMPL",
        "运行时动态纹理替换属 Unavailable；仅支持创作期资源包静态纹理", { ...A_LAYER_TAGS });
    },

    /** 确定性销毁：强制回收全部句柄，幂等。 */
    dispose() {
      if (disposed) return ok({ already: true, reclaimed: 0 });
      const n = handles.size;
      for (const h of handles) h.dispose();
      handles.clear();
      compositor = null;
      initialized = false;
      disposed = true;
      return ok(Object.freeze({ reclaimed: n, submitted, closedAt: now() }));
    },

    /** 只读诊断，便于测试与脱敏报告。 */
    stats() {
      return Object.freeze({ initialized, disposed, pendingHandles: handles.size,
        submitted, compositorAttached: compositor !== null });
    }
  });
}
