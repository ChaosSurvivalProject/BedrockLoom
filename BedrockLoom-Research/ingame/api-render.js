/**
 * loom.render.* —— 公开 Script API 的合规封装（中文注释）。
 *
 * 全部是「提交请求 / 设置参数 / 只读状态」，不画像素、不控制渲染管线。
 * host 未提供的能力一律返回 unsupported，不伪造、不降级成假实现。
 */

import { Status, ok, fail } from "./result.js";

/** 明确不可用、且**不是可调用函数**的伪接口名（仅作为否定清单字符串）。 */
export const UNAVAILABLE_RENDER_CALLS = Object.freeze([
  "drawTriangle", "setShader", "postProcessPass", "renderLayer",
  "writeGeometry", "setCameraMatrix", "pushDynamicTexture", "hookPresent",
  "setFramebuffer", "setTransparentSort", "writeBoneTransform"
]);

export const ATMOSPHERICS_KEYS = Object.freeze([
  "rayleighStrength", "sunMieStrength", "moonMieStrength", "skyZenithColor"
]);

function need(host, key) {
  return typeof host?.[key] === "function";
}

export function createRenderApi(host = {}) {
  return Object.freeze({
    /** 文本 HUD / ActionBar：仅文本，不是任意屏幕像素绘制。 */
    hud(spec) {
      if (!spec || typeof spec.text !== "string" || spec.text.length > 256) {
        return fail(Status.DENIED, "E_HUD_SPEC", "hud 需要 text 且长度 <= 256");
      }
      if (/<script|javascript:/i.test(spec.text)) {
        return fail(Status.DENIED, "E_HUD_UNSAFE", "HUD 文本不得含可执行片段");
      }
      if (!need(host, "setActionBar")) {
        return fail(Status.UNSUPPORTED, "E_HUD_NO_BINDING", "host 未提供 setActionBar 绑定");
      }
      try {
        host.setActionBar(spec.text);
        return ok(Object.freeze({ submitted: true, visualGuarantee: "none" }),
          { note: "提交请求成功，不等于画面可见" });
      } catch {
        return fail(Status.DEGRADED, "E_HUD_THREW", "提交抛错，已隔离");
      }
    },

    /** 表单/简单 UI：@minecraft/server-ui 合规封装。 */
    form(spec) {
      if (!need(host, "showForm")) {
        return fail(Status.UNSUPPORTED, "E_FORM_NO_BINDING", "host 未提供 showForm 绑定");
      }
      if (!spec || typeof spec !== "object") return fail(Status.DENIED, "E_FORM_SPEC", "表单规格不合法");
      try { host.showForm(spec); return ok({ submitted: true, visualGuarantee: "none" }); }
      catch { return fail(Status.DEGRADED, "E_FORM_THREW", "表单提交抛错，已隔离"); }
    },

    /** 粒子提交请求：不控制粒子渲染实现。 */
    submitParticle(spec) {
      if (!need(host, "spawnParticle")) return fail(Status.UNSUPPORTED, "E_PARTICLE_NO_BINDING", "host 未提供 spawnParticle");
      if (!spec || typeof spec.type !== "string") return fail(Status.DENIED, "E_PARTICLE_SPEC", "缺少粒子类型");
      try { host.spawnParticle(spec); return ok({ submitted: true, visualGuarantee: "none" }); }
      catch { return fail(Status.DEGRADED, "E_PARTICLE_THREW", "粒子提交抛错，已隔离"); }
    },

    /** 音效提交请求。 */
    submitSound(spec) {
      if (!need(host, "playSound")) return fail(Status.UNSUPPORTED, "E_SOUND_NO_BINDING", "host 未提供 playSound");
      try { host.playSound(spec ?? {}); return ok({ submitted: true }); }
      catch { return fail(Status.DEGRADED, "E_SOUND_THREW", "音效提交抛错，已隔离"); }
    },

    /**
     * 1.21.130 新增 @minecraft/server-graphics：仅 Vibrant Visuals 大气散射参数。
     * 不是自定义 shader、帧缓冲、渲染层或后处理 pass。
     */
    setAtmospherics(params) {
      if (!params || typeof params !== "object") return fail(Status.DENIED, "E_ATM_SPEC", "参数不合法");
      const known = Object.keys(params).filter((k) => ATMOSPHERICS_KEYS.includes(k));
      const unknown = Object.keys(params).filter((k) => !ATMOSPHERICS_KEYS.includes(k));
      if (unknown.length > 0) {
        return fail(Status.DENIED, "E_ATM_UNKNOWN_KEY", `不支持的大气散射参数：${unknown.join(",")}`);
      }
      const atmBindings = ["setRayleighStrength", "setSunMieStrength", "setMoonMieStrength", "setSkyZenithColor"];
      if (!atmBindings.some((k) => need(host, k))) {
        return fail(Status.UNSUPPORTED, "E_ATM_NO_BINDING", "host 未提供任何 server-graphics 大气散射绑定");
      }
      try {
        for (const k of known) {
          const fn = host[`set${k[0].toUpperCase()}${k.slice(1)}`];
          if (typeof fn === "function") fn(params[k]);
        }
        return ok(Object.freeze({ applied: known, scope: "Vibrant Visuals 大气散射参数" }),
          { note: "只设置引擎图形参数，不是渲染管线控制" });
      } catch { return fail(Status.DEGRADED, "E_ATM_THREW", "参数设置抛错，已隔离"); }
    },

    /** 只读相机状态。FOV/near/far/视锥/包围盒恒 null，伪造值一律 denied。 */
    camera() {
      const base = Object.freeze({
        fovDegrees: null, near: null, far: null, frustum: null, bounds: null,
        caveat: "官方 Script API 不提供 FOV/near/far/视锥/包围盒；这些字段恒为 null"
      });
      if (!need(host, "getPlayerView")) {
        return fail(Status.UNSUPPORTED, "E_CAMERA_NO_BINDING", "host 未提供 getPlayerView", { value: base });
      }
      let view;
      try { view = host.getPlayerView(); }
      catch { return fail(Status.DEGRADED, "E_CAMERA_THREW", "读取玩家视图抛错", { value: base }); }
      // 若适配器试图塞入 FOV 等字段，视为伪造证据，直接拒绝
      if (view && (view.fovDegrees != null || view.frustum != null || view.bounds != null)) {
        return fail(Status.DENIED, "E_CAMERA_FABRICATED",
          "适配器返回了官方不可读的字段，拒绝接受伪造证据", { value: base });
      }
      return ok(Object.freeze({
        position: view?.position ?? null,
        viewDirection: view?.viewDirection ?? null,
        ...base
      }), { note: "位置/朝向可用于正交投影小地图，不是视锥" });
    },

    /** 否定清单（只读常量，不是可调用接口）。 */
    unavailable: UNAVAILABLE_RENDER_CALLS
  });
}
