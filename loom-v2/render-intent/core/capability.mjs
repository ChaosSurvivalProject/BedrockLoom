// render-intent/core/capability.mjs —— 能力审计表的可运行版本（纯逻辑，无 node:*）
// 与 ../capability-table.ts 字段一一对应；test/render-intent.test.mjs 会校验两份表的 id 集一致。

export const LABEL_TO_PROJECT_STATUS = Object.freeze({
  stable: "Stable", beta: "Experimental", unsupported: "Unavailable"
});

export const LABEL_TO_EVIDENCE_CEILING = Object.freeze({
  stable: "E4", beta: "E2", unsupported: "E0"
});

// id / api / label / layer / projectStatus / evidence / stage / summary / reason
export const CAPABILITY_TABLE = Object.freeze([
  // ---- 采集（in-game，只产生数据） ----
  { id: "RI-C01", api: "loom.render.camera", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "none", summary: "Player.location / getViewDirection() / getRotation()", reason: "FOV、near、far 无公开读取接口，恒为 null，结果为 degraded。" },
  { id: "RI-C02", api: "loom.render.entities", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "none", summary: "Dimension.getEntities() / Entity.location", reason: "无包围盒读取接口，bounds 恒为 null。" },
  { id: "RI-C03", api: "loom.render.chunk", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "none", summary: "Dimension.getBlock() 逐方块采样", reason: "超预算返回 resource-exhausted，不得静默截断。" },
  { id: "RI-C04", api: "loom.render.playerView", label: "unsupported", layer: "in-game", projectStatus: "Unavailable", evidence: "E0", stage: "none", summary: "视锥读取", reason: "视锥依赖 FOV，官方无公开读取接口，不得用猜测值伪装。" },
  { id: "RI-C05", api: "loom.render.publish", label: "unsupported", layer: "in-game", projectStatus: "Unavailable", evidence: "E0", stage: "none", summary: "游戏内直连 WS / 写文件", reason: "国际版 1.21.130 客户端 Script API 无网络与任意文件访问能力。" },
  { id: "RI-C06", api: "loom.render.writeDynamicProperty", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "SimulationSync", summary: "World.setDynamicProperty() 写出采集帧", reason: "公开 API 但有容量上限且非实时，属于数据写出而非渲染提交。" },

  // ---- 总线（platform-side 为主） ----
  { id: "RI-B01", api: "bus.file", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "loom-v2/runtime/intent.jsonl 文件管道，离线可用", reason: "平台侧文件读写，有自动化往返测试。" },
  { id: "RI-B02", api: "bus.sse", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "Node 内置 http + 浏览器原生 EventSource，零依赖", reason: "平台侧本机回环，有集成测试。" },
  { id: "RI-B03", api: "bus.ws", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "Node 内置 http 实现 RFC6455 文本帧，仅绑定 127.0.0.1", reason: "平台侧本机回环，有握手与帧测试。" },
  { id: "RI-B04", api: "bus.bds-http", label: "beta", layer: "in-game", projectStatus: "PlatformRestricted", evidence: "E2", stage: "none", summary: "BDS 侧 @minecraft/server-net 转发到本机桥接器", reason: "仅服务端可用，客户端单人模式不适用，未经真机验证。" },
  { id: "RI-B05", api: "bus.in-game-direct", label: "unsupported", layer: "in-game", projectStatus: "Unavailable", evidence: "E0", stage: "none", summary: "游戏内脚本直连 localhost WS", reason: "客户端 Script API 不提供网络能力，必须由平台侧桥接。" },

  // ---- 桥接输入 ----
  { id: "RI-BR01", api: "bridge.bds-http-forward", label: "beta", layer: "in-game", projectStatus: "PlatformRestricted", evidence: "E2", stage: "none", summary: "BDS HTTP POST 转发采集帧", reason: "仅 BDS 可用，需真机验证。" },
  { id: "RI-BR02", api: "bridge.world-save-readonly", label: "beta", layer: "platform-side", projectStatus: "Experimental", evidence: "E2", stage: "none", summary: "只读解析世界存档公开状态", reason: "零侵入但非实时，存档格式未经官方承诺稳定。" },
  { id: "RI-BR03", api: "bridge.dynamic-property-export", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "none", summary: "游戏内 dynamic property 写出、平台侧读取", reason: "有容量上限与非实时特性，需真机复核。" },
  { id: "RI-BR04", api: "bridge.manual-paste", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "调试/人工验收时粘贴或导入采集 JSON", reason: "平台侧纯数据导入，可自动化测试。" },
  { id: "RI-BR05", api: "bridge.private-memory", label: "unsupported", layer: "custom-client", projectStatus: "Unavailable", evidence: "E0", stage: "none", summary: "读取游戏私有内存/固定偏移", reason: "验收硬门槛禁止项，任何形式都不属于本项目。" },

  // ---- 意图 API ----
  { id: "RI-I01", api: "loom.intent.hud", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "向外部合成器提交 HUD 元素与批量键", reason: "提交意图数据，像素由合成器绘制，不调用游戏内 ScreenDisplay。" },
  { id: "RI-I02", api: "loom.intent.texture", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "PNG Base64 推给合成器或构建期资源生成器", reason: "target=compositor 只影响外部窗口；resource-pack-build 只生成构建期文件。" },
  { id: "RI-I03", api: "loom.intent.worldAnchor", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "登记世界坐标锚点与贴图槽位", reason: "锚点是数据；游戏内可见性依赖预建资源，另标 beta 且未验证。" },
  { id: "RI-I04", api: "loom.intent.overlay", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "外部叠加层的 zIndex / opacity / clickThrough", reason: "作用于外部窗口，由操作系统合成，不是游戏 Overlay 渲染层。" },
  { id: "RI-I05", api: "loom.intent.gameDraw", label: "unsupported", layer: "in-game", projectStatus: "Unavailable", evidence: "E0", stage: "GeometrySubmit", summary: "在游戏内直接绘制三角形", reason: "国际版 1.21.130 无 render() 公开接口，伪造该能力违反验收硬门槛。" },

  // ---- 合成器 ----
  { id: "RI-CP01", api: "compositor.canvas", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "外部 Canvas / WebGL 表面绘制 HUD、小地图", reason: "纯平台侧像素，不触及任何游戏渲染阶段。" },
  { id: "RI-CP02", api: "compositor.overlayWindow", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "透明置顶窗口或第二屏显示", reason: "外部进程窗口，不是游戏 Overlay 渲染层。" },
  { id: "RI-CP03", api: "compositor.snapshotPng", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "导出合成器自身缓冲为 PNG 字节", reason: "不是游戏帧缓冲截图；需宿主注入编码器。" },
  { id: "RI-CP04", api: "compositor.projectMinimap", label: "stable", layer: "platform-side", projectStatus: "Stable", evidence: "E4", stage: "none", summary: "用采集帧位置做 2D 正交投影", reason: "纯数学，未使用不可读的 FOV/near/far，不伪装成游戏视锥。" },
  { id: "RI-CP05", api: "compositor.injectPresent", label: "unsupported", layer: "custom-client", projectStatus: "Unavailable", evidence: "E0", stage: "FramePresent", summary: "在 FramePresent 注入像素或回调", reason: "需要 Hook 未公开函数或注入二进制，属验收硬门槛禁止项。" },
  { id: "RI-CP06", api: "compositor.readGameFramebuffer", label: "unsupported", layer: "custom-client", projectStatus: "Unavailable", evidence: "E0", stage: "PostProcess", summary: "读取游戏帧缓冲做后处理", reason: "私有内存与固定偏移被明确禁止。" },

  // ---- 资源包投影 ----
  { id: "RI-P01", api: "loom.pack.bindTexture", label: "stable", layer: "platform-side", projectStatus: "BuildTimeOnly", evidence: "E4", stage: "ResourceBuild", summary: "构建期把 PNG 写成资源包纹理并生成引用", reason: "平台侧文件生成，只影响 ResourceBuild，不控制加载后的管线。" },
  { id: "RI-P02", api: "loom.pack.spawnBillboard", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "ResourceBuild", summary: "生成公告板实体所需资源定义", reason: "依赖预建 geometry/attachable，运行期动态纹理不可用，未经真机验证。" },
  { id: "RI-P03", api: "loom.pack.updateLight", label: "beta", layer: "in-game", projectStatus: "Experimental", evidence: "E2", stage: "ResourceBuild", summary: "生成 Vibrant Visuals / Deferred 实验资源参数", reason: "实验性资源包配置，非公开 Script API，runtimeEffect=false。" },
  { id: "RI-P04", api: "loom.pack.runtimeTextureSwap", label: "unsupported", layer: "in-game", projectStatus: "Unavailable", evidence: "E0", stage: "ResourceLoad", summary: "运行时替换已加载纹理", reason: "国际版 1.21.130 公开 Script API 无运行时纹理上传接口。" },
  { id: "RI-P05", api: "loom.pack.writeMaterialBin", label: "unsupported", layer: "custom-client", projectStatus: "Unavailable", evidence: "E0", stage: "GeometrySubmit", summary: "改写 material.bin / 自定义 Shader", reason: "需改写游戏资源并绕过资源校验，用户明确排除。" }
].map(Object.freeze));

/** 表级自检：返回错误列表，空数组表示全部合规。 */
export function auditCapabilityTable(rows = CAPABILITY_TABLE) {
  const errors = [];
  const ids = new Set();
  for (const r of rows) {
    if (ids.has(r.id)) errors.push(`重复 id: ${r.id}`);
    ids.add(r.id);
    if (r.label === "unsupported" && !String(r.reason ?? "").trim()) errors.push(`${r.id} unsupported 缺少审计理由`);
    if (r.label === "beta" && r.projectStatus === "Stable") errors.push(`${r.id} beta 不得标为项目 Stable`);
    if (r.label === "stable" && r.layer !== "platform-side") errors.push(`${r.id} stable 只能出现在 platform-side`);
    if (r.label === "unsupported" && !["E0", "E1"].includes(r.evidence)) errors.push(`${r.id} unsupported 证据级别不得高于 E1`);
    if (/render\.(drawTriangle|present|setMaterial|hookPresent)/.test(r.api)) errors.push(`${r.id} 出现被禁止的伪接口声明`);
  }
  return Object.freeze(errors);
}

export function countByLabel(rows = CAPABILITY_TABLE) {
  return Object.freeze(rows.reduce((acc, r) => ({ ...acc, [r.label]: (acc[r.label] ?? 0) + 1 }), {}));
}

/** 明确禁止出现在源码/文档里的伪接口名。 */
export const FORBIDDEN_API_NAMES = Object.freeze([
  "render.drawTriangle", "render.present", "render.setMaterial",
  "render.hookPresent", "render.setRenderLayer", "render.writeMaterialBin",
  "runtimeTextureSwap", "BetterRenderDragon"
]);
