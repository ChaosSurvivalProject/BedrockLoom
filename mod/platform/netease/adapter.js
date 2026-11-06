// 网易版预留适配器：只登记公开 SDK 能力，不引入网易 SDK、游戏文件或平台二进制。
export const neteaseAdapter = {
  id: "netease",
  version: "0.0.0-placeholder",
  enabled: false,
  detect() {
    return {
      platform: "netease",
      available: false,
      sdk: false,
      evidence: "official-sdk-and-formal-response-required",
      nativeRenderHook: "unknown",
      renderLevels: { resource: "unknown", runtime: "unknown", extension: "unknown", native: "unknown" },
      blsp: []
    };
  },
  downgrade(request) { return { status: "unknown", request, reason: "netease_adapter_not_enabled" }; }
};
