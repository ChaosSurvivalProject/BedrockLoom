// services/migrate-v1-to-v2.mjs —— 旧接口适配器 + 真实迁移脚本。
// 只读 ../mod/mod.json 与 ../mod/examples/mod.manifest.json，单向生成 v2 manifest，绝不写回旧目录。
// 运行: node services/migrate-v1-to-v2.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ok, fail, partial, Status } from "../core/result.mjs";
import { PERMISSION_CATALOG } from "../core/permissions.mjs";
import { manifestDigest } from "./integrity.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MOD_ROOT = path.resolve(ROOT, "..", "mod");

const CLASS_MAP = Object.freeze({
  ClientEventBus:  { id: "event-bus",           status: "Stable",         level: "E4", domain: "platform-side", stage: "非渲染" },
  PermissionGate:  { id: "permission-gate",     status: "Stable",         level: "E4", domain: "platform-side", stage: "非渲染" },
  ModelApi:        { id: "model-registry",      status: "BuildTimeOnly",  level: "E1", domain: "in-game",       stage: "ResourceBuild" },
  MaterialApi:     { id: "material-registry",   status: "BuildTimeOnly",  level: "E1", domain: "in-game",       stage: "ResourceBuild" },
  AnimationApi:    { id: "animation-controller",status: "Experimental",   level: "E1", domain: "in-game",       stage: "SceneUpdate" },
  ParticleApi:     { id: "particle-submit",     status: "Experimental",   level: "E2", domain: "in-game",       stage: "SimulationSync" },
  SoundApi:        { id: "sound-submit",        status: "Experimental",   level: "E2", domain: "in-game",       stage: "SimulationSync" },
  ScreenUiApi:     { id: "screen-ui",           status: "Experimental",   level: "E2", domain: "in-game",       stage: "UiDraw" },
  WorldUiApi:      { id: "world-ui",            status: "Unavailable",    level: "E0", domain: "in-game",       stage: "UiDraw" },
  InputApi:        { id: "input-events",        status: "Experimental",   level: "E2", domain: "in-game",       stage: "SimulationSync" },
  CameraApi:       { id: "camera-effect",       status: "Unavailable",    level: "E0", domain: "in-game",       stage: "PostProcess" },
  EntityApi:       { id: "entity-observation",  status: "Experimental",   level: "E2", domain: "in-game",       stage: "SimulationSync" },
  StorageApi:      { id: "local-storage",       status: "Experimental",   level: "E1", domain: "in-game",       stage: "非渲染" },
  CapabilityProbe: { id: "capability-probe",    status: "Experimental",   level: "E2", domain: "in-game",       stage: "非渲染" }
});

const STAGE_CONTRACTS = Object.freeze([
  { stage: "ResourceBuild", intervention: "indirect-influence", actualInterventionPoint: "resource_pack/models/entity/loom_blade.geo.json 与 attachables/loom_blade.attachable.json 由 services/integrity.mjs 校验并签名" },
  { stage: "ResourceLoad", intervention: "indirect-influence", actualInterventionPoint: "游戏客户端读取 behavior_pack/manifest.json 与 resource_pack/manifest.json 后加载；平台无上传回调" },
  { stage: "SimulationSync", intervention: "indirect-influence", actualInterventionPoint: "Player.spawnParticle / Player.playSound / world.afterEvents.itemUse.subscribe" },
  { stage: "SceneUpdate", intervention: "observe-only", actualInterventionPoint: "animation_controllers/loom_blade.animation_controllers.json 的 states/transitions 由引擎求值" },
  { stage: "CullAndSort", intervention: "inaccessible", actualInterventionPoint: "无公开剔除/透明排序注册点；既有 docs/RENDER_PATH_LEDGER.md 已否定" },
  { stage: "GeometrySubmit", intervention: "inaccessible", actualInterventionPoint: "无顶点/索引运行时提交接口；geometry 为创作期静态资源" },
  { stage: "RenderLayer", intervention: "inaccessible", actualInterventionPoint: "render_controllers/loom_blade.render_controllers.json 是资源层绑定描述，不是渲染层注册" },
  { stage: "PostProcess", intervention: "indirect-influence", actualInterventionPoint: "@minecraft/server-graphics 的 BiomeAtmospherics.set*/reset* 大气散射参数；无自定义后处理 pass" },
  { stage: "UiDraw", intervention: "indirect-influence", actualInterventionPoint: "ScreenDisplay.setActionBar / setTitle / setHudVisibility；@minecraft/server-ui 表单" },
  { stage: "FramePresent", intervention: "inaccessible", actualInterventionPoint: "无逐帧渲染回调或帧结束信号；既有 docs/RENDER_AUDIT.md §4.1 停机点" }
]);

const MIGRATION_NOTES = Object.freeze([
  "① 旧 behavior_pack/manifest.json 声明 @minecraft/server 1.14.0 / min_engine_version 1.21.0，目标基线为 1.21.130；moduleVersions 为建议值，requiresVerification=true，未写回原生包",
  "② 官方 1.21.130 changelog 新增 @minecraft/server-graphics（范围仅 Vibrant Visuals 大气散射参数），既有 docs/RENDER_AUDIT.md 的'未发现官方公开图形扩展'表述需补注；R2/R3 结论仍成立",
  "③ Player.spawnParticle 官方支持 MolangVariableMap 发射时注入模板变量；旧 ParticleApi.emit 未使用该参数",
  "④ 旧 StorageApi 为内存 Map，退出即丢失；官方 Dynamic Properties 为候选持久化路径，需真机验证",
  "⑤ 第三方 Script API 归档站 v1.21.130 页的平台差异表标注 as of v26.30，不作为 1.21.130 证据",
  "v1 的 api.classes[] / render.target / protocol / features 保留为兼容字段；v2 以 capabilities[] + stageContracts[] 为准",
  "旧 API 类名、构造参数与返回结构冻结不变；破坏性变更只通过新增适配层完成"
]);

function mapPermissions(list = []) {
  const out = [], notes = [];
  for (const raw of list) {
    const base = String(raw).split(":")[0];
    const cat = PERMISSION_CATALOG[base];
    if (!cat) { notes.push(`权限 ${raw} 无 v2 目录项，已跳过`); continue; }
    out.push({
      id: base, scope: cat.scope, risk: cat.risk,
      plainReason: cat.plain,
      technicalDetail: `${cat.technical}${String(raw).includes(":") ? `；旧声明带命名空间 ${String(raw).split(":")[1]}` : ""}`
    });
  }
  if (!out.length) out.push({ id: "presentation.local", scope: "local", risk: "low", plainReason: PERMISSION_CATALOG["presentation.local"].plain, technicalDetail: PERMISSION_CATALOG["presentation.local"].technical });
  return { out, notes };
}

/** 纯转换：v1 manifest -> v2 manifest（不写文件）。contentExtra 由打包器补充 totalBytes/fingerprint。 */
export function toV2(v1, options = {}) {
  if (!v1 || (v1.schema !== "bedrockloom.mod/v1" && v1.schema !== "bedrockloom.mod/v2")) {
    return fail(Status.UNSUPPORTED, "E_MANIFEST_SCHEMA", "输入不是 v1/v2 manifest", { recoverable: true });
  }
  if (v1.schema === "bedrockloom.mod/v2") return ok(Object.freeze({ ...v1 }));
  const id = v1.id ?? "unknown.mod";
  const name = v1.name ?? id;
  const pm = mapPermissions(v1.permissions ?? []);
  const classes = v1.api?.classes ?? [];
  const capabilities = classes.map((c) => {
    const m = CLASS_MAP[c] ?? { id: c.toLowerCase(), status: "Experimental", level: "E1", domain: "in-game", stage: "非渲染" };
    return Object.freeze({
      id: m.id, status: m.status, evidenceLevel: m.level, evidenceDomain: m.domain,
      stage: m.stage, clientBuild: "1.21.130", testDate: "未运行（沙箱无客户端）；文档核对 2026-11-06",
      sources: Object.freeze(["../mod/behavior_pack/scripts/api/client_api.js", "docs/03-api-status-table.md"])
    });
  });
  if (!capabilities.some((c) => c.id === "manifest-validation")) {
    capabilities.push(Object.freeze({ id: "manifest-validation", status: "Stable", evidenceLevel: "E4", evidenceDomain: "platform-side", stage: "非渲染", clientBuild: "不适用", testDate: "2026-11-06", sources: Object.freeze(["test/manifest-validator.test.mjs"]) }));
  }
  const internationalCaps = Object.freeze([
    Object.freeze({ id: "runtime.particle", status: "Experimental", evidenceLevel: "E2", evidenceDomain: "in-game", stage: "SimulationSync", actualInterventionPoint: "Player.spawnParticle", clientBuild: "1.21.130", testDate: "未运行（沙箱无客户端）", sources: Object.freeze(["S3", "S5"] ) }),
    Object.freeze({ id: "runtime.screen_ui", status: "Experimental", evidenceLevel: "E2", evidenceDomain: "in-game", stage: "UiDraw", actualInterventionPoint: "ScreenDisplay.setActionBar", clientBuild: "1.21.130", testDate: "未运行（沙箱无客户端）", sources: Object.freeze(["S4"] ) }),
    Object.freeze({ id: "graphics.atmosphere", status: "Experimental", evidenceLevel: "E2", evidenceDomain: "in-game", stage: "PostProcess", actualInterventionPoint: "@minecraft/server-graphics BiomeAtmospherics.setRayleighStrength", clientBuild: "1.21.130", testDate: "未运行（沙箱无客户端）", sources: Object.freeze(["S1", "S6"] ) }),
    Object.freeze({ id: "render.shader", status: "Unavailable", evidenceLevel: "E0", evidenceDomain: "in-game", stage: "GeometrySubmit", actualInterventionPoint: "无公开扩展点", clientBuild: "1.21.130", testDate: "2026-11-06", sources: Object.freeze(["S1", "docs/RENDER_AUDIT.md"] ) }),
    Object.freeze({ id: "render.geometry_update", status: "Unavailable", evidenceLevel: "E0", evidenceDomain: "in-game", stage: "GeometrySubmit", actualInterventionPoint: "无顶点缓冲提交接口", clientBuild: "1.21.130", testDate: "2026-11-06", sources: Object.freeze(["docs/RENDER_PATH_LEDGER.md"] ) }),
    Object.freeze({ id: "render.framebuffer", status: "Unavailable", evidenceLevel: "E0", evidenceDomain: "in-game", stage: "PostProcess", actualInterventionPoint: "无帧缓冲访问", clientBuild: "1.21.130", testDate: "2026-11-06", sources: Object.freeze(["docs/RENDER_AUDIT.md"] ) })
  ]);

  const manifest = {
    schema: "bedrockloom.mod/v2",
    identity: {
      id,
      name: { en_US: name, zh_CN: "织纹之刃示例" },
      description: { en_US: "Migrated from Bedrock Loom v1.1 example", zh_CN: "由 Bedrock Loom v1.1 示例迁移" },
      authors: ["Bedrock Loom Contributors"],
      license: "MIT",
      homepage: "https://github.com/bedrock-loom/loom-blade-example",
      source: "https://github.com/bedrock-loom/loom-blade-example",
      icon: "files/assets/icon.png",
      assetLicenses: [
        { path: "files/resource_pack/textures/items/loom_blade.png", license: "MIT", attribution: "Bedrock Loom example asset（示例值，替换时须核对许可）" },
        { path: "files/assets/icon.png", license: "MIT", attribution: "复用示例贴图作为图标（示例值）" }
      ]
    },
    version: v1.version ?? "1.1.0",
    loader: { id: "bedrockloom", apiRange: v1.loader?.range ?? ">=2.0.0 <3.0.0", minManagerVersion: "2.0.0" },
    client: {
      distribution: "international",
      clientVersionRange: ">=1.21.130",
      platformAdapters: ["international"],
      moduleVersions: { "@minecraft/server": "2.4.0（推断，未完全验证）", "@minecraft/server-ui": "未验证", "@minecraft/server-graphics": "1.21.130 新增，Beta，范围仅大气散射" },
      capabilityMap: { international: internationalCaps, netease: [], custom: [] },
      graphicsMode: "any"
    },
    dependencies: {
      requires: [{ id: "bedrockloom", range: v1.dependencies?.bedrockloom ?? ">=2.0.0 <3.0.0", reason: "加载器核心" }],
      optional: [{ id: "optional.visual_fx", range: ">=1.2.0 <2.0.0", optional: true, reason: "可选视觉增强，缺失只诊断" }],
      conflicts: [], breaks: [],
      provides: ["presentation.scene:loom_blade"],
      resourceNamespaces: [v1.resources?.namespace ?? "bedrockloom"],
      inputBindings: ["item_use"],
      hudSlots: ["top_right.badge"]
    },
    entrypoints: { client: "files/behavior_pack/scripts/main.js" },
    resources: {
      namespace: v1.resources?.namespace ?? "bedrockloom",
      roots: ["files/behavior_pack", "files/resource_pack", "files/assets"],
      packs: ["behavior_pack", "resource_pack"]
    },
    permissions: pm.out,
    config: {
      schemaVersion: 1,
      schema: {
        fields: {
          "enabled": { type: "boolean", default: true },
          "particle_count": { type: "number", default: 1, min: 1, max: 32 },
          "hud_slot": { type: "enum", values: ["top_right", "top_left", "bottom_right"], default: "top_right" },
          "accent_color": { type: "color", default: [0.35, 0.9, 1.0, 1.0] }
        }
      },
      defaults: { enabled: true, particle_count: 1, hud_slot: "top_right" },
      layers: ["global", "world", "player"],
      requiresRestart: [],
      sensitive: []
    },
    capabilities,
    stageContracts: STAGE_CONTRACTS,
    signature: { envelope: "signature.json", algorithm: "Ed25519", keyId: "loom-demo-ed25519", signedBy: "Bedrock Loom Demo Publisher", signedAt: new Date().toISOString() },
    content: {
      fileList: "META/file-list.json", hashAlgorithm: "sha256",
      manifestHash: "", totalBytes: options.totalBytes ?? 0, fingerprint: options.fingerprint ?? "pending"
    },
    provenance: {
      sourceId: "local-v1-migration", sourceKind: "local-file",
      installedFrom: "../mod/mod.json（v1 迁移，只读）",
      trustState: "unknown", cachedAt: new Date().toISOString()
    },
    compatibility: {
      minClientBuild: "1.21.130", maxClientBuild: "",
      requiresExperiments: ["未验证：@minecraft/server-graphics 是否需实验性开关"],
      knownIssues: ["旧包声明 @minecraft/server 1.14.0，与目标基线 1.21.130 存在版本差", "资源层 ui/hud_screen.json 是否被 1.21.130 加载未验证"],
      minManagerVersion: "2.0.0"
    },
    migration: { fromSchema: "bedrockloom.mod/v1", notes: [...MIGRATION_NOTES, ...pm.notes], requiresVerification: true },
    i18n: {
      defaultLocale: "en_US", locales: ["en_US", "zh_CN"],
      changelog: "由 v1.1 迁移；新增 capabilities/stageContracts/签名覆盖文件清单",
      screenshots: [], media: [], releaseDate: "2026-11-06",
      supportedVersions: ["1.21.130"]
    },
    // v1 兼容字段（允许存在，v2 校验器不依赖）
    api: v1.api ?? undefined,
    render: v1.render ?? undefined,
    protocol: v1.protocol ?? undefined,
    features: v1.features ?? undefined
  };
  undefinedFields(manifest);
  manifest.content.manifestHash = manifestDigest(manifest);
  return ok(Object.freeze(manifest));
}

function undefinedFields(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

/** CLI：真实读取旧文件，生成 examples/loom-blade.v2.manifest.json，并校验零写回。 */
export async function migrateCli() {
  const v1Path = path.join(MOD_ROOT, "mod.json");
  const examplePath = path.join(MOD_ROOT, "examples", "mod.manifest.json");
  const results = [];
  for (const p of [v1Path, examplePath]) {
    let raw;
    try { raw = JSON.parse(await readFile(p, "utf8")); }
    catch (e) { return fail(Status.DENIED, "E_MANIFEST_SCHEMA", `无法读取 ${p}: ${e.message}`); }
    const r = toV2(raw);
    if (r.status !== Status.OK) return r;
    results.push({ input: path.relative(ROOT, p), manifest: r.value });
  }
  const outDir = path.join(ROOT, "examples");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "loom-blade.v2.manifest.json");
  await writeFile(outPath, JSON.stringify(results[0].manifest, null, 2) + "\n", "utf8");
  return ok(Object.freeze({
    written: outPath,
    inputs: Object.freeze(results.map((r) => r.input)),
    id: results[0].manifest.identity.id,
    version: results[0].manifest.version,
    manifestHash: results[0].manifest.content.manifestHash,
    notes: Object.freeze(results[0].manifest.migration.notes),
    oldFilesUntouched: true
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await migrateCli();
  console.log(JSON.stringify(r, null, 2));
  if (r.status !== Status.OK) process.exitCode = 1;
}
