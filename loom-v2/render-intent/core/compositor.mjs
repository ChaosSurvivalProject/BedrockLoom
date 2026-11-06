// render-intent/core/compositor.mjs —— 外部合成器（纯逻辑，无 node:*）
// 说明：这里的「画」发生在合成器自己的 Canvas/窗口，由宿主注入 drawFn / encodePng。
// 本文件不产生任何游戏内像素，也不接触游戏帧缓冲。

import { Status, ok, fail, degraded } from "../../core/result.mjs";
import { coalesceIntents, validateIntent, validateFrame } from "./intent.mjs";

// 局部定义有限数判定，保持 core 无隐式全局依赖。
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const isVec3 = (v) => Boolean(v) && finite(v.x) && finite(v.y) && finite(v.z);

export const COMPOSITOR_BUDGET = Object.freeze({
  maxIntentsPerFrame: 64,
  drawTimeoutMs: 16,
  coalesceByBatchKey: true,
  dropExpired: true
});

/**
 * 创建合成器。
 * @param {{ now?: () => number, encodePng?: (frame: unknown) => Uint8Array }} options
 */
export function createCompositor(options = {}) {
  const clock = typeof options.now === "function" ? options.now : () => Date.now();
  const encodePng = options.encodePng ?? null;
  let disposed = false;
  let seq = 0;
  let latestFrame = null;
  const pending = [];

  const guard = () => disposed
    ? fail(Status.DENIED, "E_RI_DISPOSED", "合成器已销毁，拒绝继续提交", { recoverable: false })
    : null;

  const frameView = (intents, droppedExpired) => Object.freeze({
    seq,
    generatedAt: new Date(clock()).toISOString(),
    intents: Object.freeze(intents),
    latestFrame,
    droppedExpired,
    degradedReason: latestFrame?.caveats?.length
      ? `采集帧附带限制：${latestFrame.caveats.join("；")}`
      : null
  });

  return Object.freeze({
    get disposed() { return disposed; },
    get pendingCount() { return pending.length; },

    ingest(frame) {
      const g = guard(); if (g) return g;
      const checked = validateFrame(frame);
      if (checked.status !== Status.OK) return checked;
      latestFrame = checked.value;
      return ok(frameView([], 0));
    },

    submit(intent) {
      const g = guard(); if (g) return g;
      const checked = validateIntent(intent);
      if (checked.status !== Status.OK) return checked;
      if (pending.length >= COMPOSITOR_BUDGET.maxIntentsPerFrame) {
        return fail(Status.RESOURCE_EXHAUSTED, "E_RI_TOO_MANY_INTENTS",
          `单帧意图数超过 ${COMPOSITOR_BUDGET.maxIntentsPerFrame}`, {
            field: "intents", recoverable: true, suggestion: "按 batchKey 合并或降低提交频率"
          });
      }
      pending.push(checked.value);
      return ok(frameView([], 0));
    },

    /** 统一批量绘制：过期丢弃 + batchKey 合并，然后调用宿主注入的绘制函数。 */
    drawFrame(drawFn) {
      const g = guard(); if (g) return g;
      if (typeof drawFn !== "function") return fail(Status.DENIED, "E_RI_NO_DRAWFN", "drawFn 必须是函数", { field: "drawFn" });
      const { intents, droppedExpired } = coalesceIntents(pending, clock());
      pending.length = 0;
      seq += 1;
      const view = frameView([...intents], droppedExpired);
      const t0 = clock();
      try {
        drawFn(view);
      } catch (e) {
        return fail(Status.DENIED, "E_RI_DRAW_FAILED", `绘制回调异常：${String(e?.message ?? e)}`, { recoverable: false });
      }
      if (clock() - t0 > COMPOSITOR_BUDGET.drawTimeoutMs) {
        return fail(Status.TIMEOUT, "E_RI_DRAW_TIMEOUT",
          `绘制超过 ${COMPOSITOR_BUDGET.drawTimeoutMs}ms 预算`, { recoverable: true, suggestion: "降低分辨率或合并批次" });
      }
      if (view.degradedReason) {
        return degraded(view, view.degradedReason, "2D 正交投影，未使用游戏视锥（FOV 不可读）");
      }
      return ok(view);
    },

    /**
     * 平台侧 2D 正交投影（小地图 / 监控屏）。
     * 不使用 FOV / near / far，也不宣称是游戏视锥。
     */
    projectMinimap(radius, viewport, extraPoints = []) {
      const g = guard(); if (g) return g;
      if (!finite(radius) || radius <= 0) return fail(Status.DENIED, "E_RI_BAD_RADIUS", "radius 必须为正数", { field: "radius" });
      const v = viewport;
      if (!v || ![v.x, v.y, v.w, v.h].every(finite) || v.w <= 0 || v.h <= 0) {
        return fail(Status.DENIED, "E_RI_BAD_VIEWPORT", "viewport 必须是正数尺寸", { field: "viewport" });
      }
      if (!latestFrame || !latestFrame.camera) {
        return fail(Status.UNSUPPORTED, "E_RI_NO_CAMERA", "没有采集帧，无法投影；不会用猜测值伪造中心点", {
          recoverable: true, suggestion: "先 ingest() 一个含 camera 的采集帧"
        });
      }
      const c = latestFrame.camera.position;
      const halfW = v.w / 2;
      const halfH = v.h / 2;
      const project = (p) => {
        const nx = (p.x - c.x) / radius;
        const nz = (p.z - c.z) / radius;
        return {
          x: v.x + halfW + nx * halfW,
          y: v.y + halfH + nz * halfH,
          visible: Math.abs(nx) <= 1 && Math.abs(nz) <= 1
        };
      };
      const points = [{ id: "player", ...project(c), kind: "player" }];
      for (const e of latestFrame.entities) {
        const q = project(e.position);
        points.push({ id: e.id, ...q, kind: "entity" });
      }
      for (const a of extraPoints) {
        if (!isVec3(a.position)) continue;
        const q = project(a.position);
        points.push({ id: a.id ?? "anchor", ...q, kind: "anchor" });
      }
      const clippedCount = points.filter((p) => !p.visible).length;
      return degraded(
        Object.freeze({ center: c, radius, points: Object.freeze(points), viewport: v, clippedCount }),
        "正交投影不是游戏视锥；FOV / near / far 官方不可读",
        "按半径裁剪的 2D 小地图"
      );
    },

    snapshot() {
      const g = guard(); if (g) return g;
      if (!encodePng) {
        return fail(Status.UNSUPPORTED, "E_RI_NO_ENCODER",
          "未提供 PNG 编码器；本层不伪造图像字节", {
            recoverable: true, suggestion: "浏览器用 canvas.toDataURL()，Node 侧注入 encodePng"
          });
      }
      const bytes = encodePng(latestFrame);
      if (!(bytes instanceof Uint8Array)) return fail(Status.DENIED, "E_RI_BAD_ENCODER", "编码器必须返回 Uint8Array");
      return ok(bytes);
    },

    dispose() {
      if (disposed) return ok(null);
      disposed = true;
      pending.length = 0;
      latestFrame = null;
      return ok(null);
    }
  });
}
