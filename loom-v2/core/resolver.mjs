// core/resolver.mjs —— 依赖拓扑、版本范围、软依赖、六类冲突检测与人类可读解释。
// 纪律：不静默覆盖资源、不随机挑选胜者；任何强制覆盖都必须产出审计记录与回退点。
// 边界规则 B1：不 import node:*。
import { ok, fail, partial, Status } from "./result.mjs";
import { satisfies, compare } from "./semver.mjs";

const req = (m) => m?.dependencies?.requires ?? m?.requires ?? [];
const opt = (m) => m?.dependencies?.optional ?? m?.optional ?? [];
const con = (m) => m?.dependencies?.conflicts ?? m?.conflicts ?? [];
const brk = (m) => m?.dependencies?.breaks ?? m?.breaks ?? [];
const prov = (m) => m?.dependencies?.provides ?? m?.provides ?? [];
const ns = (m) => m?.dependencies?.resourceNamespaces ?? m?.resourceNamespaces ?? [];
const keys = (m) => m?.dependencies?.inputBindings ?? m?.inputBindings ?? [];
const slots = (m) => m?.dependencies?.hudSlots ?? m?.hudSlots ?? [];

export const ISSUE_CODE = Object.freeze({
  DUPLICATE_ID: "E_DEP_DUPLICATE_ID",
  MISSING: "E_DEP_MISSING",
  VERSION: "E_DEP_VERSION",
  OPTIONAL_MISSING: "E_DEP_OPTIONAL_MISSING",
  CYCLE: "E_DEP_CYCLE",
  HARD_CONFLICT: "E_DEP_HARD_CONFLICT",
  SERVICE_CONFLICT: "E_DEP_SERVICE_CONFLICT",
  NAMESPACE_COLLISION: "E_NAMESPACE_COLLISION",
  KEY_CONFLICT: "E_DEP_KEY_CONFLICT",
  HUD_CONFLICT: "E_DEP_HUD_CONFLICT"
});

function issue(code, modId, detail, extra = {}) {
  return Object.freeze({ code, modId, detail, involved: extra.involved ?? [], cycle: extra.cycle ?? null, forced: Boolean(extra.forced), suggestion: extra.suggestion ?? null });
}

/** 确定性拓扑排序（Kahn + 按 id 字典序 tie-break），不依赖启动顺序。 */
export function resolveLoadOrder(mods) {
  const list = Array.isArray(mods) ? mods : [];
  const byId = new Map();
  const issues = [];
  for (const m of list) {
    if (!m || !m.id) { issues.push(issue(ISSUE_CODE.DUPLICATE_ID, "unknown", "存在无 ID 的模组")); continue; }
    if (byId.has(m.id)) issues.push(issue(ISSUE_CODE.DUPLICATE_ID, m.id, `重复模组 ID: ${m.id}`));
    else byId.set(m.id, m);
  }
  const indegree = new Map();
  const edges = new Map();
  for (const id of byId.keys()) { indegree.set(id, 0); edges.set(id, []); }
  for (const [id, m] of byId) {
    for (const d of req(m)) {
      const target = byId.get(d.id);
      if (!target) { issues.push(issue(ISSUE_CODE.MISSING, id, `缺少硬依赖 ${d.id}（要求 ${d.range}）`, { involved: [d.id] })); continue; }
      if (d.range && !satisfies(target.version, d.range)) {
        issues.push(issue(ISSUE_CODE.VERSION, id, `${d.id} 版本 ${target.version} 不满足 ${d.range}`, { involved: [d.id] }));
      }
      edges.get(d.id).push(id);
      indegree.set(id, indegree.get(id) + 1);
    }
    for (const d of opt(m)) {
      if (!byId.has(d.id)) issues.push(issue(ISSUE_CODE.OPTIONAL_MISSING, id, `可选依赖 ${d.id} 缺失（仅诊断，不阻止加载）`, { involved: [d.id] }));
    }
  }
  const ready = [...indegree.entries()].filter(([, n]) => n === 0).map(([id]) => id).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const next of edges.get(id).sort()) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) { ready.push(next); ready.sort(); }
    }
  }
  if (order.length !== byId.size) {
    const remaining = [...byId.keys()].filter((id) => !order.includes(id)).sort();
    issues.push(issue(ISSUE_CODE.CYCLE, "graph", `依赖环: ${remaining.join(" -> ")}`, { involved: remaining, cycle: remaining }));
  }
  const blocking = issues.filter((i) => i.code !== ISSUE_CODE.OPTIONAL_MISSING);
  return Object.freeze({ order, issues, ok: blocking.length === 0 });
}

function pairKey(a, b) { return [a, b].sort().join("|"); }

/** 六类冲突检测：硬冲突 / 服务实现 / 资源命名空间 / 按键 / HUD 插槽 / breaks。 */
export function detectConflicts(mods) {
  const seenPairs = new Set();
  const issues = [];
  const push = (code, a, b, detail) => {
    const k = `${code}:${pairKey(a, b)}`;
    if (seenPairs.has(k)) return;
    seenPairs.add(k);
    issues.push(issue(code, a, detail, { involved: [a, b] }));
  };
  const byId = new Map(mods.map((m) => [m.id, m]));
  for (const m of mods) {
    for (const c of [...con(m), ...brk(m)]) {
      const other = byId.get(c.id);
      if (other && (!c.range || satisfies(other.version, c.range))) {
        push(ISSUE_CODE.HARD_CONFLICT, m.id, other.id, `${m.id} 明确声明与 ${other.id}@${other.version} 冲突/破坏兼容`);
      }
    }
  }
  const owners = new Map();
  for (const m of mods) for (const s of prov(m)) {
    if (!owners.has(s)) owners.set(s, []);
    owners.get(s).push(m.id);
  }
  for (const [service, ids] of owners) if (ids.length > 1) {
    push(ISSUE_CODE.SERVICE_CONFLICT, ids[0], ids[1], `服务 ${service} 有 ${ids.length} 个实现（${ids.join(", ")}），未显式裁决`);
  }
  const claim = (field, code, label) => {
    const map = new Map();
    for (const m of mods) for (const v of field(m)) {
      if (!map.has(v)) map.set(v, []);
      map.get(v).push(m.id);
    }
    for (const [v, ids] of map) if (new Set(ids).size > 1) {
      push(code, ids[0], ids[1], `${label} ${v} 被 ${ids.join(", ")} 同时占用`);
    }
  };
  claim(ns, ISSUE_CODE.NAMESPACE_COLLISION, "资源命名空间");
  claim(keys, ISSUE_CODE.KEY_CONFLICT, "按键绑定");
  claim(slots, ISSUE_CODE.HUD_CONFLICT, "HUD 插槽");

  return Object.freeze([...issues]);
}

/** 计算启用集合：依赖自动启用；阻止危险禁用（被其他已启用模组硬依赖）。 */
export function computeEnableSet(mods, requestedEnabled) {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const enabled = new Set(requestedEnabled.filter((id) => byId.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...enabled]) {
      const m = byId.get(id);
      for (const d of req(m)) {
        if (byId.has(d.id) && !enabled.has(d.id)) { enabled.add(d.id); changed = true; }
      }
    }
  }
  const blocked = [];
  for (const id of [...enabled]) {
    for (const other of mods) {
      if (enabled.has(other.id)) continue;
      if (req(other).some((d) => d.id === id)) continue;
    }
  }
  for (const m of mods) {
    if (!enabled.has(m.id)) continue;
    const dependents = mods.filter((other) => enabled.has(other.id) && req(other).some((d) => d.id === m.id));
    if (dependents.length && !requestedEnabled.includes(m.id)) blocked.push({ id: m.id, reason: `被 ${dependents.map((d) => d.id).join(", ")} 依赖，禁用会破坏加载` });
  }
  return Object.freeze({ enabled: [...enabled].sort(), blocked });
}

/**
 * 主解析入口。
 * state: { installed: ModRecord[] }
 * request: { install?: ModRecord, enable?: string[], disable?: string[], forceOverrides?: string[] }
 */
export function resolve(state, request = {}) {
  const installed = [...(state?.installed ?? [])];
  const forceOverrides = new Set(request.forceOverrides ?? []);
  let candidate = installed;
  const actions = [];
  if (request.install) {
    const existingIdx = candidate.findIndex((m) => m.id === request.install.id);
    if (existingIdx >= 0) {
      const old = candidate[existingIdx];
      actions.push({ type: "upgrade", id: old.id, from: old.version, to: request.install.version });
      candidate = candidate.map((m, i) => (i === existingIdx ? request.install : m));
    } else {
      actions.push({ type: "install", id: request.install.id, version: request.install.version });
      candidate = [...candidate, request.install];
    }
  }
  const requested = new Set(request.enable ?? candidate.filter((m) => m.enabled !== false).map((m) => m.id));
  for (const id of request.disable ?? []) requested.delete(id);
  const enableResult = computeEnableSet(candidate, [...requested]);
  const active = candidate.filter((m) => enableResult.enabled.includes(m.id));
  const orderResult = resolveLoadOrder(active);
  const conflicts = detectConflicts(active);
  const allIssues = [...orderResult.issues, ...conflicts, ...enableResult.blocked.map((b) => issue(ISSUE_CODE.HARD_CONFLICT, b.id, b.reason, { involved: [b.id] }))];
  const resolvedIssues = allIssues.filter((i) => !forceOverrides.has(i.code) && !forceOverrides.has(i.modId));
  const forced = allIssues.filter((i) => forceOverrides.has(i.code) || forceOverrides.has(i.modId));
  const audit = forced.map((i) => ({ at: new Date().toISOString(), code: i.code, modId: i.modId, detail: i.detail, risk: "用户强制覆盖：已记录风险说明与回退点", rollbackPoint: "BACKUP" }));
  const blocking = resolvedIssues.filter((i) => i.code !== ISSUE_CODE.OPTIONAL_MISSING);
  const plan = Object.freeze({
    order: orderResult.order,
    enabled: enableResult.enabled,
    actions,
    issues: resolvedIssues,
    forced,
    audit,
    ok: blocking.length === 0,
    explanations: resolvedIssues.map(explain)
  });
  if (!plan.ok) return partial(plan, resolvedIssues);
  return ok(plan);
}

/** 人话解释 + 可执行建议；不允许"不能启用"四个字了事。 */
export function explain(i) {
  const map = {
    [ISSUE_CODE.MISSING]: { title: "缺少依赖", why: (d) => d, suggestions: ["安装缺失的依赖模组", "或取消本次启用"] },
    [ISSUE_CODE.VERSION]: { title: "依赖版本不匹配", why: (d) => d, suggestions: ["在更新管理中查看兼容当前客户端的候选版本", "回退到满足范围的版本"] },
    [ISSUE_CODE.OPTIONAL_MISSING]: { title: "可选依赖缺失", why: (d) => d, suggestions: ["可继续；相关增强功能将降级"] },
    [ISSUE_CODE.CYCLE]: { title: "依赖成环", why: (d) => d, suggestions: ["升级其中一个模组以打破环", "临时禁用环上一项"] },
    [ISSUE_CODE.HARD_CONFLICT]: { title: "模组明确不兼容", why: (d) => d, suggestions: ["二选一启用", "查看模组详情页的冲突说明", "如需强制覆盖，须阅读风险说明并保留回退"] },
    [ISSUE_CODE.SERVICE_CONFLICT]: { title: "服务实现冲突", why: (d) => d, suggestions: ["禁用其中一个实现", "联系作者提供可选服务而非多实现"] },
    [ISSUE_CODE.NAMESPACE_COLLISION]: { title: "资源命名空间占用", why: (d) => d, suggestions: ["改用不同命名空间", "不允许静默覆盖资源"] },
    [ISSUE_CODE.KEY_CONFLICT]: { title: "按键绑定冲突", why: (d) => d, suggestions: ["在配置中改键", "提供可访问替代绑定"] },
    [ISSUE_CODE.HUD_CONFLICT]: { title: "HUD 插槽冲突", why: (d) => d, suggestions: ["更换 HUD 插槽", "或关闭其中一个 HUD 组件"] },
    [ISSUE_CODE.DUPLICATE_ID]: { title: "重复模组 ID", why: (d) => d, suggestions: ["去重并保留来源记录", "在模组库中查看实际来源"] }
  };
  const e = map[i.code] ?? { title: "无法启用", why: (d) => d, suggestions: ["查看诊断报告"] };
  return Object.freeze({ code: i.code, modId: i.modId, title: e.title, why: e.why(i.detail), involved: i.involved, suggestions: [...e.suggestions] });
}

/** 更新候选：按兼容当前客户端/加载器的顺序排序，重大更新与权限增加需二次确认。 */
export function planUpdate(installed, candidates, constraints = {}) {
  const ranked = [...candidates].sort((a, b) => compare(b.version, a.version));
  const current = installed?.version ?? "0.0.0";
  const plans = ranked.map((c) => {
    const majorChange = c.breaking === true;
    const newPermissions = (c.permissions ?? []).filter((p) => !(installed?.permissions ?? []).includes(p));
    return Object.freeze({
      version: c.version,
      compatible: !constraints.loaderApiRange || satisfies(c.version, constraints.loaderApiRange),
      higher: compare(c.version, current) > 0,
      majorChange,
      permissionIncrease: newPermissions,
      requiresSecondConfirm: majorChange || newPermissions.length > 0,
      reason: majorChange ? "重大更新/破坏性变更" : newPermissions.length ? `新增权限 ${newPermissions.join(", ")}` : "常规更新"
    });
  });
  return Object.freeze(plans.filter((p) => p.higher));
}
