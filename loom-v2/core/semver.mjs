// core/semver.mjs —— SemVer 解析、范围匹配、兼容候选排序。
// 边界规则 B1：不 import node:*。支持 AND（空格）、OR（||）、比较符、^、~、*、精确版本。
import { ok, fail, Status } from "./result.mjs";

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

export function parse(version) {
  if (typeof version !== "string") return null;
  const m = SEMVER_RE.exec(version.trim());
  if (!m) return null;
  return Object.freeze({
    major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
    build: m[5] ?? null,
    raw: version.trim()
  });
}

function cmpPrerelease(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;   // 正式版 > 预发布
  if (b.length === 0) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i], y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
    if (xn && yn) { const d = Number(x) - Number(y); if (d) return d > 0 ? 1 : -1; }
    else if (xn) return -1;
    else if (yn) return 1;
    else if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function compare(aRaw, bRaw) {
  const a = parse(aRaw), b = parse(bRaw);
  if (!a || !b) throw new TypeError(`invalid semver: ${aRaw} / ${bRaw}`);
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return cmpPrerelease(a.prerelease, b.prerelease);
}

function parseComparator(token) {
  const m = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(token.trim());
  if (!m) return null;
  const op = m[1] || "=";
  const body = m[2].trim();
  if (body === "*" || body === "x" || body === "X") return { op: "any" };
  const v = parse(body);
  if (!v) return null;
  return { op, v };
}

function caretUpper(v) {
  if (v.major > 0) return `${v.major + 1}.0.0`;
  if (v.minor > 0) return `0.${v.minor + 1}.0`;
  return `0.0.${v.patch + 1}`;
}
function tildeUpper(v) { return `${v.major}.${v.minor + 1}.0`; }

function matchComparator(version, c) {
  if (c.op === "any") return true;
  const d = compare(version, c.v.raw);
  switch (c.op) {
    case "=": return d === 0;
    case ">": return d > 0;
    case ">=": return d >= 0;
    case "<": return d < 0;
    case "<=": return d <= 0;
    case "^": return d >= 0 && compare(version, caretUpper(c.v)) < 0;
    case "~": return d >= 0 && compare(version, tildeUpper(c.v)) < 0;
    default: return false;
  }
}

/** 范围可含 `||`（OR）；每个 OR 分支内空格分隔为 AND。预发布版本默认不匹配无预发布的范围。 */
export function satisfies(version, range) {
  const v = parse(version);
  if (!v) return false;
  if (typeof range !== "string" || !range.trim()) return false;
  const branches = range.split("||").map((b) => b.trim()).filter(Boolean);
  for (const branch of branches) {
    const tokens = branch.split(/\s+/).filter(Boolean);
    const comparators = tokens.map(parseComparator);
    if (comparators.some((c) => c === null)) continue;
    const hasPrereleaseInRange = tokens.some((t) => /-/.test(t));
    if (v.prerelease.length > 0 && !hasPrereleaseInRange) continue;
    if (comparators.every((c) => matchComparator(v.raw, c))) return true;
  }
  return false;
}

/**
 * 候选版本排序：先过滤满足约束者，再按 SemVer 降序；不满足的排在后面并给出原因。
 * constraints: { loaderApiRange, clientVersionRange, minManagerVersion, allowBreaking, skipVersions:Set }
 */
export function rankCandidates(candidates, constraints = {}) {
  const items = (Array.isArray(candidates) ? candidates : []).map((c) => {
    const version = typeof c === "string" ? c : c.version;
    return { version, meta: typeof c === "string" ? {} : c };
  });
  const skip = constraints.skipVersions instanceof Set ? constraints.skipVersions : new Set(constraints.skipVersions ?? []);
  const evaluated = items.map((it) => {
    const v = parse(it.version);
    if (!v) return { ...it, compatible: false, reason: "版本号不是 SemVer" };
    if (skip.has(it.version)) return { ...it, compatible: false, reason: "用户已跳过该版本" };
    if (constraints.loaderApiRange && !satisfies(it.version, constraints.loaderApiRange)) {
      return { ...it, compatible: false, reason: `不满足加载器 API 范围 ${constraints.loaderApiRange}` };
    }
    if (constraints.clientVersionRange && it.meta.clientVersion && !satisfies(it.meta.clientVersion, constraints.clientVersionRange)) {
      return { ...it, compatible: false, reason: `不兼容当前客户端 ${it.meta.clientVersion}` };
    }
    if (constraints.allowBreaking === false && it.meta.breaking) {
      return { ...it, compatible: false, reason: "含破坏性变更，需二次确认" };
    }
    return { ...it, compatible: true, reason: "兼容" };
  });
  const compatible = evaluated.filter((e) => e.compatible).sort((a, b) => compare(b.version, a.version));
  const rejected = evaluated.filter((e) => !e.compatible);
  return Object.freeze([...compatible, ...rejected]);
}

export function highestSatisfying(versions, range) {
  const matches = versions.filter((v) => satisfies(v, range));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => compare(b, a))[0];
}

export function validateRange(range) {
  if (typeof range !== "string" || !range.trim()) return fail(Status.UNSUPPORTED, "E_LOADER_RANGE", "版本范围为空", { field: "range", recoverable: true });
  const bad = range.split("||").flatMap((b) => b.trim().split(/\s+/).filter(Boolean)).find((t) => parseComparator(t) === null);
  if (bad) return fail(Status.UNSUPPORTED, "E_LOADER_RANGE", `无法解析的范围片段: ${bad}`, { field: "range", recoverable: true });
  return ok(range);
}
