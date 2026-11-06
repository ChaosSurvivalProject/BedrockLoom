// core/manifest-validator.mjs —— v2 manifest 纯逻辑校验（错误码见 schemas/validation-codes.md）
// 边界规则 B1：不 import node:*；验签与文件完整性在 services/ 中完成。
import { ok, fail, partial, Status } from "./result.mjs";
import { parse as parseSemver, validateRange } from "./semver.mjs";
import { PERMISSION_CATALOG } from "./permissions.mjs";

const ID_RE = /^[a-z0-9][a-z0-9._-]{2,95}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NS_RE = /^[a-z0-9_.-]+$/;
const LOCALE_RE = /^[a-z]{2}_[A-Z]{2}$/;
const V2 = "bedrockloom.mod/v2";
const V1 = "bedrockloom.mod/v1";
const BAD_POINTS = ["底层自动处理", "自动处理", "底层实现", "TODO", "tbd", "未来"];

const STATUSES = new Set(["Stable", "Candidate", "Experimental", "BuildTimeOnly", "PlatformRestricted", "CustomClientOnly", "Unavailable"]);
const LEVELS = new Set(["E0", "E1", "E2", "E3", "E4", "E5"]);
const DOMAINS = new Set(["platform-side", "in-game", "custom-client"]);
const STAGES = new Set(["ResourceBuild", "ResourceLoad", "SimulationSync", "SceneUpdate", "CullAndSort", "GeometrySubmit", "RenderLayer", "PostProcess", "UiDraw", "FramePresent"]);

function err(code, message, field, extra = {}) {
  return Object.freeze({ code, message, field, status: extra.status ?? Status.UNSUPPORTED, recoverable: extra.recoverable ?? true, suggestion: extra.suggestion ?? null });
}

/** 校验一个 manifest 对象。v1 manifest 不作为 v2 直接安装，但可被识别并交给迁移层。 */
export function validate(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return fail(Status.UNSUPPORTED, "E_MANIFEST_SCHEMA", "manifest 不是对象");
  if (manifest.schema === V1) return fail(Status.UNSUPPORTED, "E_MANIFEST_SCHEMA", "这是 v1 manifest，需先经 V1CompatAdapter.toV2 迁移", { recoverable: true, suggestion: "运行 services/migrate-v1-to-v2.mjs" });
  if (manifest.schema !== V2) return fail(Status.UNSUPPORTED, "E_MANIFEST_SCHEMA", `schema 必须为 ${V2}`, { field: "schema", recoverable: true });
  const errors = [];
  const warnings = [];
  const add = (code, message, field, extra) => errors.push(err(code, message, field, extra));

  // identity
  const idt = manifest.identity;
  if (!idt) add("E_MANIFEST_MISSING_FIELD", "缺少 identity", "identity");
  else {
    if (!ID_RE.test(idt.id ?? "")) add("E_ID_FORMAT", `稳定 ID 非法: ${idt.id}`, "identity.id", { status: Status.DENIED });
    if (!idt.name) add("E_MANIFEST_MISSING_FIELD", "缺少用户可见名称", "identity.name");
    if (typeof idt.name === "string" && idt.name === idt.id) add("E_ID_NAME_COUPLED", "稳定 ID 与可见名称未分离", "identity.name", { status: Status.DENIED });
    if (!Array.isArray(idt.authors) || !idt.authors.length) add("E_MANIFEST_MISSING_FIELD", "缺少作者", "identity.authors");
    if (!idt.license) add("E_LICENSE_MISSING", "缺少许可证", "identity.license", { status: Status.DENIED });
  }
  // version / loader
  if (!SEMVER_RE.test(manifest.version ?? "")) add("E_VERSION_SEMVER", `版本不是 SemVer: ${manifest.version}`, "version");
  const loader = manifest.loader;
  if (!loader) add("E_MANIFEST_MISSING_FIELD", "缺少 loader", "loader");
  else {
    if (loader.id !== "bedrockloom") add("E_LOADER_RANGE", "loader.id 必须为 bedrockloom", "loader.id");
    const r = validateRange(loader.apiRange);
    if (r.status !== Status.OK) add("E_LOADER_RANGE", "loader.apiRange 非法", "loader.apiRange");
  }
  // client
  const client = manifest.client;
  if (!client) add("E_MANIFEST_MISSING_FIELD", "缺少 client", "client");
  else {
    if (!["international", "netease", "custom"].includes(client.distribution)) add("E_CLIENT_RANGE", "distribution 非法", "client.distribution");
    if (!client.clientVersionRange || /x$/i.test(client.clientVersionRange) || !/\d+\.\d+\.\d+/.test(client.clientVersionRange)) {
      add("E_CLIENT_RANGE", "clientVersionRange 必须写明具体基线（如 >=1.21.130），不得写 1.21.x", "client.clientVersionRange");
    }
    if (!Array.isArray(client.platformAdapters) || !client.platformAdapters.length) add("E_PLATFORM_ADAPTER", "platformAdapters 为空", "client.platformAdapters", { status: Status.DENIED });
    else if (client.distribution === "international" && client.platformAdapters.some((a) => a !== "international")) {
      add("E_PLATFORM_ADAPTER", "国际版构建不得包含 netease/custom 适配器", "client.platformAdapters", { status: Status.DENIED });
    }
    for (const [plat, decls] of Object.entries(client.capabilityMap ?? {})) {
      for (const d of decls ?? []) {
        if (d.status === "Stable" && d.evidenceDomain === "in-game") {
          add("E_CAPABILITY_MIXED_EVIDENCE", `${plat}/${d.id}: in-game 能力在无真机 E4 证据时不得标 Stable`, `client.capabilityMap.${plat}`, { status: Status.DENIED });
        }
        if (!STATUSES.has(d.status)) add("E_MANIFEST_UNKNOWN_FIELD", `未知状态 ${d.status}`, `client.capabilityMap.${plat}`);
        if (!LEVELS.has(d.evidenceLevel)) add("E_MANIFEST_UNKNOWN_FIELD", `未知证据级别 ${d.evidenceLevel}`, `client.capabilityMap.${plat}`);
        if (!DOMAINS.has(d.evidenceDomain)) add("E_MANIFEST_UNKNOWN_FIELD", `未知证据域 ${d.evidenceDomain}`, `client.capabilityMap.${plat}`);
      }
    }
  }
  // dependencies
  const deps = manifest.dependencies;
  if (!deps) add("E_MANIFEST_MISSING_FIELD", "缺少 dependencies", "dependencies");
  else {
    for (const key of ["requires", "optional", "conflicts", "breaks"]) {
      for (const d of deps[key] ?? []) {
        if (!d?.id || !ID_RE.test(d.id)) add("E_ID_FORMAT", `依赖 ID 非法: ${d?.id}`, `dependencies.${key}`, { status: Status.DENIED });
        if (!d.range || validateRange(d.range).status !== Status.OK) add("E_LOADER_RANGE", `依赖范围非法: ${d?.range}`, `dependencies.${key}.range`);
      }
    }
  }
  // entrypoints / resources / namespace
  const ep = manifest.entrypoints?.client;
  if (!ep || !/^files\/[A-Za-z0-9._/-]+\.js$/.test(ep)) add("E_MANIFEST_MISSING_FIELD", "入口必须是 files/ 下的 .js", "entrypoints.client");
  const res = manifest.resources;
  if (!res) add("E_MANIFEST_MISSING_FIELD", "缺少 resources", "resources");
  else {
    if (!NS_RE.test(res.namespace ?? "")) add("E_NAMESPACE_MISMATCH", "资源命名空间非法", "resources.namespace", { status: Status.DENIED });
    if (!Array.isArray(res.roots) || !res.roots.length) add("E_NAMESPACE_MISMATCH", "resources.roots 为空", "resources.roots", { status: Status.DENIED });
    else if (!res.roots.every((r) => r.startsWith("files/"))) add("E_NAMESPACE_MISMATCH", "resources.roots 必须位于 files/ 下", "resources.roots", { status: Status.DENIED });
  }
  // permissions
  if (!Array.isArray(manifest.permissions)) add("E_MANIFEST_MISSING_FIELD", "缺少 permissions", "permissions");
  else for (const p of manifest.permissions) {
    const id = typeof p === "string" ? p : p?.id;
    if (!id || !PERMISSION_CATALOG[id]) add("E_PERMISSION_UNDECLARED", `未登记的权限: ${id}`, "permissions", { status: Status.DENIED });
    if (p && typeof p === "object") {
      const cat = PERMISSION_CATALOG[id];
      if (cat && p.risk && ["account", "native"].includes(p.scope) && p.risk === "low") {
        add("E_PERMISSION_SCOPE", `scope=${p.scope} 不得标为低风险`, "permissions[].risk", { status: Status.DENIED });
      }
      if (!p.plainReason || !p.technicalDetail) warnings.push({ code: "E_PERMISSION_DESCRIPTION", message: `权限 ${id} 缺少通俗或技术双层说明`, field: "permissions[]", recoverable: true });
    }
  }
  // capabilities / stageContracts
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.length) add("E_MANIFEST_MISSING_FIELD", "缺少 capabilities（取代 v1 的 api.classes[]）", "capabilities");
  else for (const c of manifest.capabilities) {
    if (!STATUSES.has(c?.status)) add("E_MANIFEST_UNKNOWN_FIELD", `能力状态非法: ${c?.status}`, "capabilities[].status");
    if (c?.status === "Stable" && c?.evidenceLevel !== "E4" && c?.evidenceLevel !== "E5") {
      add("E_CAPABILITY_MIXED_EVIDENCE", `能力 ${c?.id} 标 Stable 但证据级别为 ${c?.evidenceLevel}`, "capabilities[]", { status: Status.DENIED });
    }
    if (c?.status === "Stable" && c?.evidenceDomain !== "platform-side") {
      add("E_CAPABILITY_MIXED_EVIDENCE", `能力 ${c?.id} 为 in-game 却标 Stable`, "capabilities[]", { status: Status.DENIED });
    }
  }
  for (const s of manifest.stageContracts ?? []) {
    if (!STAGES.has(s?.stage)) add("E_MANIFEST_UNKNOWN_FIELD", `未知渲染阶段: ${s?.stage}`, "stageContracts[].stage");
    if (!s?.actualInterventionPoint || BAD_POINTS.some((b) => String(s.actualInterventionPoint).includes(b))) {
      add("E_STAGE_POINT_EMPTY", "actualInterventionPoint 必须点名具体函数/资源路径，不能写占位或模糊表述", "stageContracts[].actualInterventionPoint", { status: Status.DENIED });
    }
  }
  // signature / content / provenance
  if (manifest.signature?.algorithm !== "Ed25519" || manifest.signature?.envelope !== "signature.json") add("E_SIG_MISSING", "签名声明必须指向 signature.json 且算法为 Ed25519", "signature", { status: Status.DENIED });
  if (manifest.content?.fileList !== "META/file-list.json" || manifest.content?.hashAlgorithm !== "sha256") add("E_FILE_LIST_MISSING", "内容清单必须指向 META/file-list.json 且为 sha256", "content", { status: Status.DENIED });
  if (!/^[a-f0-9]{64}$/.test(manifest.content?.manifestHash ?? "")) errors.push(err("E_SIG_PAYLOAD_HASH", "manifestHash 必须是 64 位 sha256", "content.manifestHash", { status: Status.DENIED }));
  if (!manifest.provenance?.installedFrom) add("E_MANIFEST_MISSING_FIELD", "缺少实际安装来源", "provenance.installedFrom");
  // i18n / compat
  if (manifest.i18n?.defaultLocale && !LOCALE_RE.test(manifest.i18n.defaultLocale)) add("E_I18N_LOCALE", "defaultLocale 格式应为 xx_XX", "i18n.defaultLocale");
  if (manifest.config?.defaults) {
    for (const k of Object.keys(manifest.config.defaults)) {
      if (/(token|secret|api[_-]?key|password|private[_-]?key)/i.test(k)) add("E_SENSITIVE_IN_CONFIG", `疑似令牌写入普通配置: ${k}`, "config.defaults", { status: Status.DENIED });
    }
  }

  const report = Object.freeze({
    schema: V2,
    id: idt?.id ?? null, version: manifest.version ?? null,
    errors: Object.freeze(errors), warnings: Object.freeze(warnings),
    valid: errors.length === 0
  });
  if (errors.length) return partial(report, errors);
  return ok(report, { warnings });
}

/** 只做"是否可迁移"的轻量识别；不修改输入。 */
export function isV1(manifest) { return manifest?.schema === V1; }
export function isV2(manifest) { return manifest?.schema === V2; }
