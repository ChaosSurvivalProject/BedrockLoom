// Bedrock Loom 国际版适配器：只使用公开附加包/Script API，不执行远端代码。
export const internationalAdapter = {
  id: "international",
  version: "1.0.0",
  detect() {
    return {
      platform: "international",
      scriptApi: true,
      attachable: true,
      geometry: true,
      animationController: true,
      particles: true,
      sounds: true,
      screenUi: true,
      worldUi: false,
      input: true,
      camera: false,
      entityAttachment: "resource-only",
      localStorage: "memory-compatibility",
      nativeRenderHook: false,
      renderLevels: { resource: "R0", runtime: "R1-candidate", extension: "unsupported", native: "unsupported" },
      evidencePolicy: "probe-required",
      blsp: ["blsp/1"]
    };
  },
  downgrade(request, capabilities) {
    if (request.kind === "world_ui" && !capabilities.worldUi) return { status: "degraded", kind: "screen_toast", payload: request.payload };
    if (request.kind === "camera_pulse" && !capabilities.camera) return { status: "degraded", kind: "noop", reason: "no_public_camera_hook" };
    return { status: "submitted", ...request };
  }
};
