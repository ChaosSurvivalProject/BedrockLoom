import { system, world } from "@minecraft/server";

export const CAPABILITY_STATUS = Object.freeze({
  SUPPORTED: "supported",
  UNSUPPORTED: "unsupported",
  UNKNOWN: "unknown",
  EXPERIMENTAL: "experimental",
  PLATFORM_DEPENDENT: "platform-dependent",
  DEGRADED: "degraded",
  PERMISSION_REQUIRED: "permission-required"
});

const RENDER_CAPABILITIES = Object.freeze([
  "resource.geometry",
  "resource.attachable",
  "resource.animation",
  "runtime.particle",
  "runtime.sound",
  "runtime.screen_ui",
  "runtime.entity_observation",
  "runtime.entity_attachment",
  "runtime.world_ui",
  "runtime.camera_effect",
  "render.material_override",
  "render.geometry_update",
  "render.shader",
  "render.framebuffer",
  "render.render_layer"
]);

function now() { return new Date().toISOString(); }
function cacheKey(input) {
  return [input.clientBuild || "unknown", input.adapterBuild || "unknown", input.resourceFingerprint || "unknown", input.quality || "unknown", input.graphicsBackend || "unknown"].join("|");
}

function result(capability, status, level, reason, evidence = [], fallback) {
  return { capability, status, level, reason, evidence, fallback };
}

/**
 * 只使用公开 Script API 和适配器能力快照；不读取私有内存，也不扫描二进制。
 * 没有安全的最小实验时返回 unknown，而不是根据版本号猜测。
 */
export function createCapabilityProbe({ adapter = {}, diagnostics = () => {}, environment = {} } = {}) {
  const detect = typeof adapter.detect === "function" ? adapter.detect() : {};
  const baseEvidence = (source, repeatable = true) => [{ kind: source, source: "public-runtime", observedAt: now(), repeatable }];

  function probePublicApi() {
    const canParticles = typeof world.getPlayers === "function";
    const canObserve = canParticles && Boolean(world.getPlayers()?.[0]?.dimension?.getEntities);
    return [
      result("resource.geometry", detect.geometry ? CAPABILITY_STATUS.EXPERIMENTAL : CAPABILITY_STATUS.UNKNOWN, "R0", "资源由客户端导入；平台注册不创建运行时实例", baseEvidence("runtime-api"), "原版模型或预打包资源"),
      result("resource.attachable", detect.attachable ? CAPABILITY_STATUS.EXPERIMENTAL : CAPABILITY_STATUS.UNKNOWN, "R0", "仅验证资源能力，不证明动态挂点", baseEvidence("runtime-api"), "静态资源挂点"),
      result("resource.animation", detect.animationController ? CAPABILITY_STATUS.EXPERIMENTAL : CAPABILITY_STATUS.UNKNOWN, "R0", "使用预声明 animation/controller", baseEvidence("runtime-api"), "静态模型"),
      result("runtime.particle", canParticles && detect.particles ? CAPABILITY_STATUS.SUPPORTED : CAPABILITY_STATUS.UNKNOWN, "R1", "公开粒子提交路径待场景验收", baseEvidence("runtime-api"), "无粒子"),
      result("runtime.sound", canParticles && detect.sounds ? CAPABILITY_STATUS.SUPPORTED : CAPABILITY_STATUS.UNKNOWN, "R1", "公开音效提交路径不等于渲染控制", baseEvidence("runtime-api"), "无音效"),
      result("runtime.screen_ui", detect.screenUi ? CAPABILITY_STATUS.SUPPORTED : CAPABILITY_STATUS.UNKNOWN, "R1", "当前仅承诺 action bar/toast", baseEvidence("runtime-api"), "无 UI"),
      result("runtime.entity_observation", canObserve ? CAPABILITY_STATUS.PLATFORM_DEPENDENT : CAPABILITY_STATUS.UNKNOWN, "R1", canObserve ? "getEntities 可调用，字段仍需版本实验" : "没有安全的公开观察接口", baseEvidence("runtime-api"), "返回 unavailable"),
      result("runtime.entity_attachment", CAPABILITY_STATUS.UNSUPPORTED, "R0", "运行时 attach 仅保存描述，未绑定引擎骨骼", baseEvidence("minimal-experiment", false), "预声明 attachable 或玩家中心"),
      result("runtime.world_ui", CAPABILITY_STATUS.UNSUPPORTED, "R1", "当前适配器无通用世界空间 UI 提交", baseEvidence("official-documentation", false), "action bar/toast"),
      result("runtime.camera_effect", CAPABILITY_STATUS.DEGRADED, "R1", "仅发本地事件，没有原生相机 Hook", baseEvidence("runtime-api"), "no-op"),
      result("render.material_override", CAPABILITY_STATUS.UNSUPPORTED, "R2", "无官方运行时材质覆盖扩展", baseEvidence("official-documentation", false), "预打包材质变体"),
      result("render.geometry_update", CAPABILITY_STATUS.UNSUPPORTED, "R2", "无公开顶点/几何缓冲提交接口", baseEvidence("official-documentation", false), "预生成 geometry"),
      result("render.shader", CAPABILITY_STATUS.UNSUPPORTED, "R3", "不扫描或修改私有 Shader", baseEvidence("official-documentation", false), "预打包资源"),
      result("render.framebuffer", CAPABILITY_STATUS.UNSUPPORTED, "R3", "无公开帧缓冲访问", baseEvidence("official-documentation", false), "关闭效果"),
      result("render.render_layer", CAPABILITY_STATUS.UNSUPPORTED, "R2", "无公开渲染层/排序注册", baseEvidence("official-documentation", false), "游戏默认排序")
    ];
  }

  return Object.freeze({
    capabilities: RENDER_CAPABILITIES,
    run() {
      const started = system.currentTick;
      let results;
      try { results = probePublicApi(); } catch (error) {
        diagnostics("capability_probe_failed", String(error));
        results = RENDER_CAPABILITIES.map((id) => result(id, CAPABILITY_STATUS.UNKNOWN, "R0", "公开探测异常，未猜测版本", [], "等待下次加载"));
      }
      const report = {
        schema: "bedrockloom.capability-report/v1",
        generatedAt: now(),
        distribution: { platform: environment.platform || adapter.id || "unknown", edition: environment.edition || "unknown", channel: environment.channel },
        client: { build: environment.clientBuild, adapter: adapter.id || "unknown", adapterBuild: environment.adapterBuild, apiVersion: environment.apiVersion },
        device: { class: environment.deviceClass || "unknown", memoryMb: environment.memoryMb, graphicsBackend: environment.graphicsBackend, quality: environment.quality },
        experiments: { enabled: environment.experiments || [], resourceFingerprint: environment.resourceFingerprint, cacheKey: cacheKey(environment) },
        results,
        invalidatedBy: ["clientBuild", "adapterBuild", "resourceFingerprint", "quality", "graphicsBackend"],
        durationTicks: Math.max(0, system.currentTick - started)
      };
      diagnostics("capability_report_ready", JSON.stringify({ cacheKey: report.experiments.cacheKey, count: results.length }));
      return report;
    }
  });
}
