import test from "node:test";
import assert from "node:assert/strict";
import { merge, diff, migrate, exportProfile, importProfile } from "../core/config-merge.mjs";
import { Status } from "../core/result.mjs";

const schema = {
  schemaVersion: 1,
  fields: {
    enabled: { type: "boolean", default: true },
    count: { type: "number", default: 2, min: 1, max: 8 },
    theme: { type: "enum", values: ["light", "dark"], default: "light" },
    accent: { type: "color", default: [1, 1, 1, 1] },
    token: { type: "string", default: "", sensitive: true },
    bind: { type: "keybinding", default: "key.g", requiresRestart: true }
  }
};

test("S09 三层合并顺序：global < world < player，默认值补齐", () => {
  const r = merge({ global: { count: 3, enabled: false }, world: { count: 5 }, player: { theme: "dark" } }, schema);
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.values.count, 5);
  assert.equal(r.value.values.enabled, false);
  assert.equal(r.value.values.theme, "dark");
  assert.deepEqual(r.value.values.accent, [1, 1, 1, 1]);
  assert.deepEqual(r.value.layersApplied, ["global", "world", "player"]);
});

test("S09 无效值回落默认并逐条列出差异（部分成功）", () => {
  const r = merge({ global: { count: 99, theme: "neon" } }, schema);
  assert.equal(r.status, Status.PARTIAL);
  assert.equal(r.value.values.count, 2);
  assert.equal(r.value.values.theme, "light");
  assert.equal(r.value.invalid.length, 2);
  assert.ok(r.value.invalid.every((i) => i.reason && "fallback" in i));
});

test("S09 敏感项脱敏：令牌不写普通配置", () => {
  const r = merge({ global: { token: "super-secret-value" } }, schema);
  assert.equal(r.value.values.token, "***redacted***");
  assert.ok(r.value.sensitive.includes("token"));
  assert.ok(r.value.requiresRestart.includes("bind"));
});

test("S10 diff：新增/移除/类型变化/当前值冲突", () => {
  const newSchema = {
    schemaVersion: 2,
    fields: {
      enabled: { type: "boolean", default: true },
      count: { type: "number", default: 2, min: 2, max: 4 },
      theme: { type: "enum", values: ["light", "dark", "auto"], default: "auto" },
      newField: { type: "string", default: "x" }
    }
  };
  const d = diff({ count: 1, theme: "neon", bind: "key.g" }, schema, newSchema);
  assert.ok(d.added.some((a) => a.key === "newField"));
  assert.ok(d.removed.some((a) => a.key === "bind"));
  assert.ok(d.changed.some((c) => c.key === "theme" && c.enumChanged));
  assert.ok(d.conflicts.some((c) => c.key === "count" || c.key === "theme"));
  assert.equal(d.hasConflict, true);
});

test("S10 migrate：保留可迁移值，冲突回落新默认并列出，不静默丢弃", () => {
  const newSchema = { schemaVersion: 2, fields: { enabled: { type: "boolean", default: true }, count: { type: "number", default: 2, min: 2, max: 8 } } };
  const r = migrate({ enabled: false, count: 5 }, schema, newSchema);
  assert.equal(r.value.values.enabled, false);
  assert.equal(r.value.values.count, 5);
  assert.equal(r.value.fromVersion, 1);
  assert.equal(r.value.toVersion, 2);
});

test("S19 exportProfile：默认不导出模组文件，只导出 ID/版本/配置", () => {
  const r = exportProfile({ name: "探索预设", mods: [{ id: "a", version: "1.0.0", config: { x: 1 } }] });
  assert.equal(r.status, Status.OK);
  assert.equal(r.value.includeModFiles, false);
  assert.deepEqual(r.value.mods[0], { id: "a", version: "1.0.0", config: { x: 1 } });
  const withFiles = exportProfile({ name: "p", mods: [] }, { includeModFiles: true });
  assert.equal(withFiles.status, Status.DEGRADED);
  assert.match(withFiles.reason, /许可证/);
});

test("S19 importProfile：缺失模组与版本差异逐条说明，不静默补齐", () => {
  const file = { mods: [{ id: "a", version: "1.0.0" }, { id: "b", version: "2.0.0" }, { id: "missing", version: "1.0.0" }] };
  const r = importProfile(file, [{ id: "a", version: "1.0.0" }, { id: "b", version: "1.5.0" }]);
  assert.equal(r.status, Status.PARTIAL);
  assert.equal(r.value.missing.length, 1);
  assert.equal(r.value.missing[0].id, "missing");
  assert.equal(r.value.versionDiff.length, 1);
  assert.equal(r.value.versionDiff[0].requested, "2.0.0");
});
