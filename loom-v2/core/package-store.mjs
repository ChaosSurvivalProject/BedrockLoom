// core/package-store.mjs —— 模组库内存数据模型：卡片、来源、配置集、状态、搜索筛选排序、收藏与分组。
// 纪律：不默认上传玩家已安装模组或游玩数据；所有长任务状态可查询。
// 边界规则 B1：不 import node:*；持久化由 services/ 落盘。
import { ok, fail, partial, Status } from "./result.mjs";

export const ModState = Object.freeze({
  INSTALLED: "installed", BUILTIN: "builtin", EXTERNAL: "external",
  UPDATE_AVAILABLE: "update-available", DISABLED: "disabled", CORRUPT: "corrupt",
  INCOMPATIBLE: "incompatible", BLOCKED: "blocked"
});

export const SourceKind = Object.freeze({ OFFICIAL: "official", COMMUNITY: "community", PRIVATE: "private", LOCAL: "local-file" });

function now() { return new Date().toISOString(); }

export class PackageStore {
  constructor(seed = []) {
    this.mods = new Map();
    this.sources = new Map();
    this.profiles = new Map();
    this.audit = [];
    for (const m of seed) this.upsert(m);
  }

  static record(input) {
    return Object.freeze({
      id: input.id,
      name: input.name ?? input.id,
      version: input.version ?? "0.0.0",
      state: input.state ?? ModState.INSTALLED,
      author: input.author ?? null,
      license: input.license ?? null,
      description: input.description ?? "",
      tags: Object.freeze([...(input.tags ?? [])]),
      category: input.category ?? "misc",
      sizeBytes: input.sizeBytes ?? 0,
      permissions: Object.freeze([...(input.permissions ?? [])]),
      capabilities: Object.freeze([...(input.capabilities ?? [])]),
      platform: input.platform ?? "international",
      dependencies: Object.freeze({ ...(input.dependencies ?? {}) }),
      provides: Object.freeze([...(input.provides ?? [])]),
      resourceNamespaces: Object.freeze([...(input.resourceNamespaces ?? [])]),
      inputBindings: Object.freeze([...(input.inputBindings ?? [])]),
      hudSlots: Object.freeze([...(input.hudSlots ?? [])]),
      screenshots: Object.freeze([...(input.screenshots ?? [])]),
      media: Object.freeze([...(input.media ?? [])]),
      changelog: input.changelog ?? "",
      releaseDate: input.releaseDate ?? null,
      supportedVersions: Object.freeze([...(input.supportedVersions ?? [])]),
      favorite: Boolean(input.favorite),
      groups: Object.freeze([...(input.groups ?? [])]),
      sourceId: input.sourceId ?? "local",
      actualSource: input.actualSource ?? input.sourceId ?? "local-file",
      installedAt: input.installedAt ?? now(),
      knownIssues: Object.freeze([...(input.knownIssues ?? [])]),
      lastError: input.lastError ?? null,
      contribution: Object.freeze({ frameMs: 0, objects: 0, memoryKb: 0, errors: 0, ...(input.contribution ?? {}) })
    });
  }

  upsert(input) {
    if (!input?.id) return fail(Status.DENIED, "E_ID_FORMAT", "模组缺少 ID");
    const rec = PackageStore.record(input);
    this.mods.set(rec.id, rec);
    return ok(rec);
  }

  get(id) { return this.mods.get(id) ?? null; }

  remove(id) {
    if (!this.mods.has(id)) return fail(Status.UNSUPPORTED, "E_DEP_MISSING", `模组 ${id} 不存在`);
    this.mods.delete(id);
    this.audit.push({ at: now(), action: "remove", id });
    return ok({ id, removed: true });
  }

  setState(id, state, reason = "") {
    const cur = this.mods.get(id);
    if (!cur) return fail(Status.UNSUPPORTED, "E_DEP_MISSING", `模组 ${id} 不存在`);
    if (!Object.values(ModState).includes(state)) return fail(Status.DENIED, "E_MANIFEST_UNKNOWN_FIELD", `未知状态 ${state}`);
    const next = Object.freeze({ ...cur, state, lastError: reason || null });
    this.mods.set(id, next);
    this.audit.push({ at: now(), action: "setState", id, from: cur.state, to: state, reason });
    return ok(next);
  }

  addSource(source) {
    if (!source?.id) return fail(Status.DENIED, "E_ID_FORMAT", "源缺少 ID");
    this.sources.set(source.id, Object.freeze({ ...source }));
    return ok(this.sources.get(source.id));
  }

  getSource(id) { return this.sources.get(id) ?? null; }

  /** 一个模组可有多个候选来源，但已安装记录必须明确唯一实际来源。 */
  candidateSources(modId) {
    const out = [];
    for (const s of this.sources.values()) {
      if ((s.entries ?? []).some((e) => e.modId === modId)) out.push({ id: s.id, kind: s.kind, trust: s.trust, priority: s.priority });
    }
    return Object.freeze(out.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)));
  }

  /**
   * 查询：search / tags / category / states / favorite / group / sort。
   * sort: name | version | size | installedAt | state
   */
  list(query = {}) {
    let items = [...this.mods.values()];
    if (query.search) {
      const q = String(query.search).toLowerCase();
      items = items.filter((m) => `${m.name} ${m.id} ${m.description} ${m.tags.join(" ")}`.toLowerCase().includes(q));
    }
    if (query.states?.length) items = items.filter((m) => query.states.includes(m.state));
    if (query.tags?.length) items = items.filter((m) => query.tags.some((t) => m.tags.includes(t)));
    if (query.category) items = items.filter((m) => m.category === query.category);
    if (query.favorite === true) items = items.filter((m) => m.favorite);
    if (query.group) items = items.filter((m) => m.groups.includes(query.group));
    const key = query.sort ?? "name";
    items.sort((a, b) => {
      if (key === "version") return b.version.localeCompare(a.version);
      if (key === "size") return b.sizeBytes - a.sizeBytes;
      if (key === "installedAt") return b.installedAt.localeCompare(a.installedAt);
      if (key === "state") return a.state.localeCompare(b.state) || a.id.localeCompare(b.id);
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
    if (query.offset) items = items.slice(query.offset);
    if (query.limit) items = items.slice(0, query.limit);
    return ok(Object.freeze({ total: this.mods.size, items: Object.freeze(items) }));
  }

  createProfile(name, modIds = []) {
    const profile = Object.freeze({
      id: `profile-${this.profiles.size + 1}`, name, createdAt: now(),
      mods: Object.freeze(modIds.map((id) => {
        const m = this.mods.get(id);
        return Object.freeze({ id, version: m?.version ?? null, config: Object.freeze({ ...(m?.config ?? {}) }) });
      }))
    });
    this.profiles.set(profile.id, profile);
    return ok(profile);
  }

  getProfile(id) { return this.profiles.get(id) ?? null; }
  listProfiles() { return ok(Object.freeze([...this.profiles.values()])); }

  /** 可撤销操作记录：所有安装来源与用户强制覆盖都落审计，不含遥测。 */
  auditLog() { return Object.freeze([...this.audit]); }

  /** 诊断贡献度：每个模组对帧时间/内存/对象数/错误的贡献，不输出用户文件或完整坐标。 */
  contributions() {
    const rows = [...this.mods.values()].map((m) => Object.freeze({ id: m.id, ...m.contribution }));
    return ok(Object.freeze({ rows: Object.freeze(rows), totalFrameMs: rows.reduce((s, r) => s + r.frameMs, 0) }));
  }

  snapshot() {
    return Object.freeze({
      mods: Object.freeze([...this.mods.values()]),
      sources: Object.freeze([...this.sources.values()]),
      profiles: Object.freeze([...this.profiles.values()]),
      audit: this.auditLog()
    });
  }
}
