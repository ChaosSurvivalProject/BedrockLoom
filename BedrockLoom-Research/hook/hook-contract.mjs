/**
 * Hook 候选契约与研究桩（原创，纯逻辑）。
 *
 * 本模块只做三件事：校验候选条目必须带三标记、拒绝任何私有符号字段、
 * 让 attach/detach/onFrame 恒返回 unsupported。它不接触任何进程或图形 API。
 */

import { Status, ok, fail } from "../loomrender/result.mjs";

export const REQUIRED = Object.freeze({
  layer: "host-private",
  classification: "research-hypothesis",
  drift: "version-drift-risk",
  status: "unsupported"
});

export const LEVELS = Object.freeze(["low", "medium", "high"]);
export const CATEGORIES = Object.freeze(["present", "texture-bind", "camera-update"]);

/** 任何形似私有符号/偏移的字段都不得进入候选表或 descriptor。 */
export const FORBIDDEN_FIELDS = Object.freeze([
  "symbol", "rva", "moduleBase", "baseAddress", "pattern", "sigscan",
  "vtableIndex", "dllPath", "signature", "offsetBytes", "hookAddress"
]);

/** 校验一条候选记录。 */
export function validateCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return fail(Status.DENIED, "E_HOOK_SHAPE", "候选记录必须是对象");
  }
  for (const [k, v] of Object.entries(REQUIRED)) {
    if (candidate[k] !== v) {
      return fail(Status.DENIED, "E_HOOK_TAG",
        `缺少或错误的标记 ${k}=${v}（实际 ${String(candidate[k])}）`);
    }
  }
  if (!CATEGORIES.includes(candidate.category)) {
    return fail(Status.DENIED, "E_HOOK_CATEGORY", "分类必须是 present/texture-bind/camera-update");
  }
  if (!LEVELS.includes(candidate.level)) {
    return fail(Status.DENIED, "E_HOOK_LEVEL", "级别必须是 low/medium/high");
  }
  if (typeof candidate.id !== "string" || !/^H-[A-Z]+-\d{2}$/.test(candidate.id)) {
    return fail(Status.DENIED, "E_HOOK_ID", "候选 ID 格式不合法");
  }
  if (candidate.implementedInRepo !== false) {
    return fail(Status.DENIED, "E_HOOK_IMPL", "候选不得声称本仓库有实现");
  }
  for (const key of Object.keys(candidate)) {
    if (FORBIDDEN_FIELDS.includes(key)) {
      return fail(Status.DENIED, "E_HOOK_PRIVATE_SYMBOL",
        `候选表不得包含私有符号/偏移字段：${key}`);
    }
  }
  return ok(Object.freeze({
    id: candidate.id,
    layer: candidate.layer,
    status: candidate.status,
    note: "仅为研究假设分类，不对应任何真实观测实现"
  }));
}

/** 校验整张表：条目数、ID 唯一、3×3 覆盖。 */
export function validateCandidateTable(table) {
  if (!table || !Array.isArray(table.candidates)) {
    return fail(Status.DENIED, "E_TABLE_SHAPE", "缺少 candidates 数组");
  }
  const ids = new Set();
  const combos = new Set();
  for (const c of table.candidates) {
    const r = validateCandidate(c);
    if (r.status !== Status.OK) return r;
    if (ids.has(c.id)) return fail(Status.DENIED, "E_TABLE_DUP_ID", `重复 ID：${c.id}`);
    ids.add(c.id);
    combos.add(`${c.category}/${c.level}`);
  }
  if (combos.size !== CATEGORIES.length * LEVELS.length) {
    return fail(Status.DENIED, "E_TABLE_COVERAGE",
      `需覆盖 ${CATEGORIES.length * LEVELS.length} 个分类×级别组合，实际 ${combos.size}`);
  }
  return ok(Object.freeze({
    count: ids.size,
    coverage: combos.size,
    note: "全部条目 status=unsupported，本仓库无任何注入实现"
  }));
}

/**
 * 研究桩：所有操作恒返回 unsupported。
 * 提供它是为了让「attach 是否被调用」可测，而不是让 Hook 生效。
 */
export function createProbe() {
  const calls = [];
  return Object.freeze({
    calls,
    attach(pointId) {
      calls.push(Object.freeze({ op: "attach", pointId: String(pointId) }));
      return fail(Status.UNSUPPORTED, "E_HOOK_NO_IMPL",
        "本仓库不提供进程内 Hook 实现（host-private / research-hypothesis / version-drift-risk）");
    },
    detach(pointId) {
      calls.push(Object.freeze({ op: "detach", pointId: String(pointId) }));
      return fail(Status.UNSUPPORTED, "E_HOOK_NO_IMPL", "同上：无实现");
    },
    onFrame() {
      calls.push(Object.freeze({ op: "onFrame" }));
      return fail(Status.UNSUPPORTED, "E_HOOK_NO_IMPL", "同上：不产生像素、不写回交换链");
    },
    dispose() { calls.length = 0; }
  });
}
