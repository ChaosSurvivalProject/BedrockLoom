// render-intent/runtime/pack-bridge.mjs —— 资源包投影（Node 侧，允许 node:*）
// 只做「构建期生成资源包内容」：PNG 校验、SHA-256、texture_list.json 引用、实验参数 JSON。
// 绝不做运行时纹理替换、绝改写 material.bin；这两项明确返回 unsupported。

import { createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { Status, ok, fail, degraded } from "../../core/result.mjs";
import { validateSlot } from "../core/intent.mjs";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_TEXTURE_BYTES = 2 * 1024 * 1024;
export const PACK_TEXTURE_DIR = "textures/loom";

export function slotToPackPath(slot) {
  const name = slot.replace(/^dynamic:\/\//, "").replace(/[^a-z0-9._-]/g, "_");
  return `${PACK_TEXTURE_DIR}/${name}.png`;
}

export async function bindTexture(slot, pngBytes, { outDir = null } = {}) {
  const s = validateSlot(slot);
  if (s.status !== Status.OK) return s;
  if (!(pngBytes instanceof Uint8Array)) {
    return fail(Status.DENIED, "E_RI_NOT_BYTES", "pngBytes 必须是 Uint8Array", { field: "pngBytes" });
  }
  const buf = Buffer.from(pngBytes);
  if (buf.length < PNG_MAGIC.length || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
    return fail(Status.DENIED, "E_RI_NOT_PNG", "不是合法 PNG（缺少 PNG 文件头）", { field: "pngBytes" });
  }
  if (buf.length > MAX_TEXTURE_BYTES) {
    return fail(Status.RESOURCE_EXHAUSTED, "E_RI_TEXTURE_TOO_LARGE", `纹理超过 ${MAX_TEXTURE_BYTES} 字节`, { field: "pngBytes" });
  }
  const packPath = slotToPackPath(slot);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  let written = false;
  if (outDir) {
    const target = path.join(outDir, packPath);
    await mkdir(path.dirname(target), { recursive: true });
    // 原子写入：临时文件 + rename，避免留下半张纹理
    const tmp = `${target}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, target);
    const listPath = path.join(outDir, "textures", "texture_list.json");
    await mkdir(path.dirname(listPath), { recursive: true });
    await writeFile(listPath, `${JSON.stringify([packPath], null, 2)}\n`, "utf8");
    written = true;
  }
  return ok(Object.freeze({
    slot, packPath, sha256, bytes: buf.length,
    phase: "build-time", written,
    note: "仅构建期产物；运行时替换已加载纹理不可用"
  }));
}

/** beta：只生成资源定义，不承诺运行时动态纹理。 */
export function spawnBillboard(position, slot, dimensionId, { anchorId = "anchor-1", billboard = true } = {}) {
  const s = validateSlot(slot);
  if (s.status !== Status.OK) return s;
  const p = position;
  if (!p || !["x", "y", "z"].every((k) => Number.isFinite(p[k]))) {
    return fail(Status.DENIED, "E_RI_BAD_VEC3", "position 必须是有限 Vec3", { field: "position" });
  }
  if (typeof dimensionId !== "string" || !dimensionId) {
    return fail(Status.DENIED, "E_RI_BAD_DIM", "dimensionId 缺失", { field: "dimensionId" });
  }
  return degraded(
    Object.freeze({ anchorId, position: p, dimensionId, billboard, textureSlot: slot, requiresPrebuiltGeometry: true }),
    "需要预建 geometry / attachable / entity 定义；1.21.130 无运行时动态纹理接口",
    "仅生成资源包静态定义，游戏内可见性未经真机验证"
  );
}

/** beta：实验性资源参数，runtimeEffect 恒为 false。 */
export function updateLight(spec) {
  if (!spec || typeof spec !== "object") return fail(Status.DENIED, "E_RI_BAD_LIGHT", "spec 必须是对象");
  if (!["vibrant-visuals-atmospherics", "deferred-pbr-resource", "fog-resource"].includes(spec.target)) {
    return fail(Status.DENIED, "E_RI_BAD_LIGHT_TARGET", "target 非法", { field: "target" });
  }
  if (spec.runtimeEffect !== false) {
    return fail(Status.DENIED, "E_RI_RUNTIME_LIGHT", "不得声明运行时光照效果；只允许静态资源参数", { field: "runtimeEffect" });
  }
  if (!spec.parameters || typeof spec.parameters !== "object") {
    return fail(Status.DENIED, "E_RI_BAD_LIGHT_PARAMS", "parameters 必须是对象", { field: "parameters" });
  }
  return degraded(
    Object.freeze({ ...spec, experimental: true, emittedAs: "resource-config-only", runtimeEffect: false }),
    "Deferred / Vibrant Visuals 属实验性资源包配置，非公开 Script API；需实验开关且不承诺跨设备",
    "只写出静态资源参数，不在运行时修改场景光照"
  );
}

/** unsupported：运行时替换已加载纹理。 */
export function runtimeTextureSwap() {
  return fail(Status.UNSUPPORTED, "E_RI_RUNTIME_TEXTURE_UNSUPPORTED",
    "国际版 1.21.130 公开 Script API 无运行时纹理上传接口", { recoverable: false });
}

/** unsupported：用户明确排除 material.bin 改写与自定义 Shader。 */
export function writeMaterialBin() {
  return fail(Status.UNSUPPORTED, "E_RI_MATERIAL_BIN_UNSUPPORTED",
    "改写 material.bin / 自定义 Shader 需要绕过资源校验，不属于 BedrockLoom 范围", { recoverable: false });
}

/** 生成 texture_list.json 内容（公开资源包格式：路径字符串数组）。 */
export function buildTextureList(packPaths) {
  if (!Array.isArray(packPaths) || packPaths.some((p) => typeof p !== "string" || p.includes(".."))) {
    return fail(Status.DENIED, "E_RI_BAD_LIST", "路径数组非法或含路径穿越", { field: "packPaths" });
  }
  return ok(Object.freeze([...packPaths]));
}
