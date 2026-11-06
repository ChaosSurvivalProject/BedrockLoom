// core/config-merge.mjs —— 全局/存档/玩家分层配置合并、Schema 校验与迁移、差异展示、敏感项脱敏。
// 纪律：不静默覆盖；冲突展示差异；令牌不写普通配置；无效值回落默认但必须列出。
// 边界规则 B1：不 import node:*。
import { ok, fail, partial, degraded, Status } from "./result.mjs";

export const LAYER_ORDER = Object.freeze(["global", "world", "player"]);

const TOKEN_PATTERN = /(token|secret|api[_-]?key|password|bearer|credential|private[_-]?key)/i;

function fieldSpec(schema, key) { return schema?.fields?.[key] ?? null; }

function validateValue(key, value, spec) {
  if (!spec) return { value, valid: true, reason: null };
  if (spec.type === "boolean" && typeof value !== "boolean") return { value: spec.default, valid: false, reason: `${key} 需要布尔值` };
  if (spec.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { value: spec.default, valid: false, reason: `${key} 需要有限数值` };
    if (spec.min !== undefined && value < spec.min) return { value: spec.default, valid: false, reason: `${key} 低于下限 ${spec.min}` };
    if (spec.max !== undefined && value > spec.max) return { value: spec.default, valid: false, reason: `${key} 高于上限 ${spec.max}` };
  }
  if (spec.type === "string" && typeof value !== "string") return { value: spec.default, valid: false, reason: `${key} 需要字符串` };
  if (spec.type === "enum" && !spec.values?.includes(value)) return { value: spec.default, valid: false, reason: `${key} 不在枚举 ${spec.values?.join("/")} 中` };
  if (spec.type === "color" && !(Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n)))) return { value: spec.default, valid: false, reason: `${key} 需要 [r,g,b,a]` };
  if (spec.type === "keybinding" && typeof value !== "string") return { value: spec.default, valid: false, reason: `${key} 需要按键名` };
  if (spec.type === "file" && (typeof value !== "string" || value.includes("..") || value.startsWith("/"))) return { value: spec.default, valid: false, reason: `${key} 不是受控资源路径` };
  return { value, valid: true, reason: null };
}

/** 合并三层；返回 MergedConfig { values, invalid, sensitive, requiresRestart }。 */
export function merge(layers = {}, schema = {}) {
  const specs = schema.fields ?? {};
  const values = {};
  const invalid = [];
  const sensitive = [];
  const requiresRestart = new Set();
  for (const key of Object.keys(specs)) {
    const spec = specs[key];
    if (spec.default !== undefined) values[key] = spec.default;
    if (spec.sensitive || TOKEN_PATTERN.test(key)) sensitive.push(key);
    if (spec.requiresRestart) requiresRestart.add(key);
  }
  for (const layer of LAYER_ORDER) {
    const src = layers[layer] ?? {};
    for (const [key, raw] of Object.entries(src)) {
      const spec = fieldSpec(schema, key);
      const checked = validateValue(key, raw, spec);
      if (!checked.valid) invalid.push({ key, layer, value: raw, reason: checked.reason, fallback: checked.value });
      values[key] = checked.value;
    }
  }
  for (const key of sensitive) {
    if (key in values && typeof values[key] === "string" && TOKEN_PATTERN.test(key)) {
      // 令牌不得写入普通配置：只保留脱敏标记，值由密钥存储持有
      values[key] = "***redacted***";
    }
  }
  const result = Object.freeze({
    schemaVersion: schema.schemaVersion ?? 1,
    values: Object.freeze(values),
    invalid: Object.freeze(invalid),
    sensitive: Object.freeze([...new Set(sensitive)]),
    requiresRestart: Object.freeze([...requiresRestart]),
    layersApplied: Object.freeze(LAYER_ORDER.filter((l) => layers[l] && Object.keys(layers[l]).length))
  });
  if (invalid.length) return partial(result, invalid);
  return ok(result);
}

/** Schema 差异：新增/移除/类型变化/默认值变化，供升级时展示而非静默覆盖。 */
export function diff(oldValues = {}, oldSchema = {}, newSchema = {}) {
  const a = oldSchema.fields ?? {}, b = newSchema.fields ?? {};
  const added = [], removed = [], changed = [], conflicts = [];
  for (const key of Object.keys(b)) {
    if (!(key in a)) { added.push({ key, spec: b[key] }); continue; }
    const oldSpec = a[key], newSpec = b[key];
    const typeChanged = oldSpec.type !== newSpec.type;
    const defaultChanged = JSON.stringify(oldSpec.default) !== JSON.stringify(newSpec.default);
    const enumChanged = JSON.stringify(oldSpec.values ?? null) !== JSON.stringify(newSpec.values ?? null);
    if (typeChanged || defaultChanged || enumChanged) changed.push({ key, oldSpec, newSpec, typeChanged, defaultChanged, enumChanged });
    const current = oldValues[key];
    if (current !== undefined) {
      const checked = validateValue(key, current, newSpec);
      if (!checked.valid) conflicts.push({ key, current, reason: checked.reason, fallback: checked.value });
    }
  }
  for (const key of Object.keys(a)) if (!(key in b)) removed.push({ key, spec: a[key], lastValue: oldValues[key] });
  return Object.freeze({ fromVersion: oldSchema.schemaVersion ?? 1, toVersion: newSchema.schemaVersion ?? 1, added, removed, changed, conflicts, hasConflict: conflicts.length > 0 });
}

/** 迁移：保留可迁移值，冲突项回落到新默认值并逐条列出；不静默丢弃。 */
export function migrate(oldValues = {}, oldSchema = {}, newSchema = {}) {
  const d = diff(oldValues, oldSchema, newSchema);
  const merged = merge({ global: oldValues }, newSchema);
  const values = { ...(merged.value?.values ?? {}) };
  const report = Object.freeze({
    fromVersion: d.fromVersion, toVersion: d.toVersion,
    kept: Object.keys(values).filter((k) => k in (newSchema.fields ?? {}) && !(k in oldValues) === false),
    dropped: d.removed.map((r) => r.key),
    conflicts: d.conflicts,
    values: Object.freeze(values)
  });
  if (d.hasConflict) return partial(report, d.conflicts);
  return ok(report);
}

/** 配置值导出（供配置集）；许可证不允许再分发的模组文件不导出，只导出 ID/版本/配置。 */
export function exportProfile(profile, { includeModFiles = false } = {}) {
  const body = Object.freeze({
    schema: "bedrockloom.profile/v1",
    name: profile.name,
    createdAt: new Date().toISOString(),
    mods: (profile.mods ?? []).map((m) => Object.freeze({ id: m.id, version: m.version, config: m.config ?? {} })),
    includeModFiles
  });
  if (includeModFiles) return degraded(body, "包含模组文件需逐项核对许可证", "仅导出 ID/版本/配置", { requiresLicenseCheck: true });
  return ok(body);
}

/** 导入配置集：跨设备差异与缺失模组必须逐条说明，不允许静默补齐。 */
export function importProfile(file, installed = []) {
  const byId = new Map(installed.map((m) => [m.id, m]));
  const missing = [], versionDiff = [], matched = [];
  for (const m of file?.mods ?? []) {
    const local = byId.get(m.id);
    if (!local) { missing.push({ id: m.id, version: m.version }); continue; }
    if (local.version !== m.version) versionDiff.push({ id: m.id, local: local.version, requested: m.version });
    matched.push({ id: m.id, version: local.version });
  }
  const report = Object.freeze({ missing, versionDiff, matched, total: (file?.mods ?? []).length });
  if (missing.length || versionDiff.length) return partial(report, [...missing, ...versionDiff]);
  return ok(report);
}
