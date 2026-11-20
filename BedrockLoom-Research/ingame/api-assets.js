/**
 * loom.assets.* —— 受控资源引用（中文注释）。
 *
 * 只提供创作期资源包静态资源的受控 ResourceHandle：
 * - 不提供任意文件系统访问；
 * - 路径穿越 / 绝对路径一律拒绝；
 * - 运行时替换已提交纹理、写 material.bin = Unavailable，恒返回 unsupported；
 * - 句柄可追踪，退出世界/dispose 时强制回收。
 */

import { Status, ok, fail, makeResourceHandle } from "./result.js";

/** 只允许资源包命名空间内的相对引用。 */
const SLOT_RE = /^pack:\/\/[a-z0-9._/-]{1,128}$/;

export const UNAVAILABLE_ASSET_CALLS = Object.freeze([
  "arbitraryFileAccess", "runtimeTextureSwap", "writeMaterialBin",
  "uploadDynamicTexture", "patchShaderBinary"
]);

export function createAssetsApi(host = {}) {
  const handles = new Set();
  let seq = 0;
  let disposed = false;

  const guard = () => {
    if (disposed) return fail(Status.DENIED, "E_ASSETS_DISPOSED", "资产层已销毁");
    return null;
  };

  return Object.freeze({
    /** 绑定一个受控静态资源引用，返回可追踪句柄。 */
    bind(slot) {
      const g = guard();
      if (g) return g;
      if (typeof slot !== "string" || !SLOT_RE.test(slot)) {
        return fail(Status.DENIED, "E_SLOT_SHAPE", "slot 必须形如 pack://namespace/path，且不含 .. 或绝对路径");
      }
      if (slot.includes("..") || slot.startsWith("/")) {
        return fail(Status.DENIED, "E_PATH_TRAVERSAL", "拒绝路径穿越");
      }
      if (handles.size >= 128) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_HANDLE_LIMIT", "句柄数达到 128 上限");
      }
      seq += 1;
      const h = makeResourceHandle(`asset-${seq}`, () => handles.delete(h));
      handles.add(h);
      return ok(Object.freeze({ slot, handle: h.id, kind: "static-pack-asset" }),
        { note: "创作期静态资源引用；不是运行期可写纹理" });
    },

    /** 受控读取：只经 host 适配器，且不返回原始字节给游戏内逻辑之外。 */
    read(ref, handleId) {
      const g = guard();
      if (g) return g;
      if (typeof handleId !== "string" || ![...handles].some((h) => h.id === handleId)) {
        return fail(Status.DENIED, "E_HANDLE_UNKNOWN", "句柄不存在或已释放");
      }
      if (typeof host?.readAsset !== "function") {
        return fail(Status.UNSUPPORTED, "E_READ_NO_BINDING", "host 未提供 readAsset");
      }
      if (typeof ref !== "string" || ref.includes("..") || ref.startsWith("/")) {
        return fail(Status.DENIED, "E_REF_TRAVERSAL", "拒绝路径穿越或绝对路径");
      }
      try {
        const meta = host.readAsset(ref);
        return ok(Object.freeze({ ref, bytes: meta?.bytes ?? null, sha256: meta?.sha256 ?? null,
          caveat: "只返回元数据，不输出资源内容样本" }));
      } catch { return fail(Status.DEGRADED, "E_READ_THREW", "读取抛错，已隔离"); }
    },

    /** 幂等释放单个句柄。 */
    release(handleId) {
      const h = [...handles].find((x) => x.id === handleId);
      if (!h) return fail(Status.DENIED, "E_HANDLE_UNKNOWN", "句柄不存在");
      h.dispose();
      handles.delete(h);
      return ok({ released: handleId });
    },

    /** 运行时动态纹理推送：恒不支持（主项目已判 Unavailable）。 */
    pushDynamicTexture() {
      return fail(Status.UNSUPPORTED, "E_DYNAMIC_TEXTURE_UNAVAILABLE",
        "运行时替换已提交纹理不可用；仅支持创作期资源包静态纹理",
        { layer: "host-private", classification: "research-hypothesis", drift: "version-drift-risk" });
    },

    unavailable: UNAVAILABLE_ASSET_CALLS,

    /** 退出世界时强制回收全部句柄，幂等。 */
    dispose() {
      if (disposed) return ok({ already: true, reclaimed: 0 });
      const n = handles.size;
      for (const h of handles) h.dispose();
      handles.clear();
      disposed = true;
      return ok({ reclaimed: n });
    }
  });
}
