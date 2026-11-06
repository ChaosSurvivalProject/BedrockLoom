// core/permissions.mjs —— 权限分级、信任中心判定、运行时新增权限再确认、可撤销同意。
// 纪律：高风险权限不能用"继续"掩盖；不收集遥测，除非单独、明确、可撤销同意。
// 边界规则 B1：不 import node:*。
import { ok, fail, degraded, Status } from "./result.mjs";

export const RISK = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high", CRITICAL: "critical" });
const RISK_RANK = Object.freeze({ low: 1, medium: 2, high: 3, critical: 4 });

/** 权限目录：每项同时具备通俗说明与技术实现说明（双层描述）。 */
export const PERMISSION_CATALOG = Object.freeze({
  "resource.read":        { scope: "local",       risk: RISK.LOW,      plain: "读取本模组自带的模型、贴图和音效资源",           technical: "受控 ResourceHandle，仅索引本模组命名空间内文件" },
  "presentation.local":   { scope: "local",       risk: RISK.LOW,      plain: "只在你自己的屏幕上显示本地视觉效果",             technical: "提交到公开 Script API；不改变多人世界权威状态" },
  "audio.local":          { scope: "local",       risk: RISK.LOW,      plain: "播放本模组的音效",                               technical: "Player.playSound + sound_definitions 白名单" },
  "ui.screen":            { scope: "local",       risk: RISK.LOW,      plain: "在屏幕上显示提示文字",                           technical: "ScreenDisplay.setActionBar / setTitle / 模态表单" },
  "input.local":          { scope: "input",       risk: RISK.MEDIUM,   plain: "感知你在游戏内的物品使用操作",                   technical: "订阅官方 world.afterEvents.itemUse 等事件" },
  "entity.observe.local": { scope: "local",       risk: RISK.MEDIUM,   plain: "只读查看附近实体的位置信息",                     technical: "Dimension.getEntities 快照，位置来源标 sampled" },
  "graphics.settings":    { scope: "local",       risk: RISK.MEDIUM,   plain: "改变画面观感（天空、光照氛围）",                 technical: "@minecraft/server-graphics 大气散射参数；需 Vibrant Visuals" },
  "storage.mod":          { scope: "world",       risk: RISK.MEDIUM,   plain: "保存本模组自己的设置",                           technical: "命名空间隔离的本地配置，配额与 Schema 版本管理" },
  "storage.world":        { scope: "world",       risk: RISK.MEDIUM,   plain: "在当前存档中保存本模组数据",                     technical: "本地世界命名空间；服务端不可写" },
  "storage.player":       { scope: "player",      risk: RISK.MEDIUM,   plain: "保存与你本机玩家相关的数据",                     technical: "本地玩家命名空间，不上传" },
  "network.presentation": { scope: "network",     risk: RISK.HIGH,     plain: "连接服务器以接收/发送视觉表现请求",               technical: "可选 BLSP/1；离线单人模式完全不依赖；断线不影响本地" },
  "notification.system":  { scope: "notification",risk: RISK.MEDIUM,   plain: "显示系统通知",                                   technical: "本地通知通道，需玩家可关闭" },
  "account.identity":     { scope: "account",     risk: RISK.CRITICAL, plain: "访问与账号身份相关的信息",                       technical: "默认拒绝；需单独明确可撤销同意" },
  "native.module":        { scope: "native",      risk: RISK.CRITICAL, plain: "加载原生扩展模块（风险最高）",                   technical: "默认拒绝；仅签名清单 + 崩溃隔离 + 可撤销" },
  "telemetry.collect":    { scope: "network",     risk: RISK.CRITICAL, plain: "收集使用数据并发送",                             technical: "默认不收集；除非单独、明确、可撤销同意" }
});

export function catalogEntry(permission) { return PERMISSION_CATALOG[permission] ?? null; }

export const Decision = Object.freeze({ ALLOW: "allow", DENY: "deny", RECONFIRM: "reconfirm", DEGRADE: "degrade" });

/**
 * evaluate: 判定单个权限请求。
 * request: { permission, modId, granted: string[], consent: {id:{grantedAt,revoked}}, sourceTrust, runtimeAdded }
 */
export function evaluate(request = {}) {
  const p = request.permission;
  const entry = catalogEntry(p);
  if (!entry) return fail(Status.DENIED, "E_PERM_UNKNOWN", `未知权限: ${p}`, { recoverable: false });
  const granted = new Set(request.granted ?? []);
  const consent = request.consent ?? {};
  const trust = request.sourceTrust ?? "unknown";
  const reasons = [];
  const base = Object.freeze({ permission: p, modId: request.modId ?? "unknown", risk: entry.risk, plain: entry.plain, technical: entry.technical });

  if (p === "telemetry.collect") {
    const c = consent["telemetry.collect"];
    if (!c || c.revoked || !c.explicit || !c.separate) {
      return ok(Object.freeze({ ...base, decision: Decision.DENY, reasons: Object.freeze(["遥测默认不收集；需单独、明确、可撤销同意"]), requiresConfirm: false }));
    }
    return ok(Object.freeze({ ...base, decision: Decision.ALLOW, reasons: Object.freeze(["已获得单独、明确、可撤销同意"]), requiresConfirm: false }));
  }
  if (trust === "revoked") return ok(Object.freeze({ ...base, decision: Decision.DENY, reasons: Object.freeze(["来源已被撤销"]), requiresConfirm: false }));
  if (trust === "untrusted") return ok(Object.freeze({ ...base, decision: Decision.DENY, reasons: Object.freeze(["源不可信：必须显示警告，不允许静默降级或一键继续"]), requiresConfirm: true }));
  if (entry.risk === RISK.CRITICAL) {
    return ok(Object.freeze({ ...base, decision: Decision.RECONFIRM, reasons: Object.freeze([`高风险权限（${entry.risk}）需强化确认，不能用普通"继续"按钮掩盖`]), requiresConfirm: true }));
  }
  if (request.runtimeAdded && !granted.has(p)) {
    return ok(Object.freeze({ ...base, decision: Decision.RECONFIRM, reasons: Object.freeze(["运行时新增权限必须重新确认"]), requiresConfirm: true }));
  }
  if (!granted.has(p)) {
    return ok(Object.freeze({ ...base, decision: Decision.DENY, reasons: Object.freeze([`权限 ${p} 未在 manifest 声明或已被撤销`]), requiresConfirm: false }));
  }
  if (entry.scope === "network" && request.offline === true) {
    return ok(Object.freeze({ ...base, decision: Decision.DEGRADE, reasons: Object.freeze(["离线模式：网络能力降级，本地功能不受影响"]), requiresConfirm: false, fallback: "本地表现继续可用" }));
  }
  return ok(Object.freeze({ ...base, decision: Decision.ALLOW, reasons: Object.freeze(["权限已声明且已获同意"]), requiresConfirm: false }));
}

/** 批量评估：返回逐项决定 + 汇总风险 + 是否需要强化确认界面。 */
export function evaluateAll(perms = [], context = {}) {
  const decisions = perms.map((p) => evaluate({ ...context, permission: p }));
  const list = decisions.map((d) => d.value).filter(Boolean);
  const maxRisk = list.reduce((m, d) => Math.max(m, RISK_RANK[d.risk] ?? 0), 0);
  const needsStrongConfirm = list.some((d) => d.decision === Decision.RECONFIRM);
  const denied = list.filter((d) => d.decision === Decision.DENY);
  return ok(Object.freeze({
    decisions: Object.freeze(list), maxRisk,
    needsStrongConfirm,
    denied: Object.freeze(denied),
    allAllowed: denied.length === 0 && !needsStrongConfirm,
    summary: denied.length ? `${denied.length} 项被拒绝` : needsStrongConfirm ? "存在需强化确认的高风险项" : "全部允许"
  }));
}

/** 运行时新增权限的再确认，产出可撤销同意记录与审计说明。 */
export function reconfirm(modId, added = [], { consented = true, explicit = true } = {}) {
  const record = Object.freeze({
    modId, added: Object.freeze([...added]), at: new Date().toISOString(),
    consented, explicit, revocable: true,
    riskStatement: added.map((p) => `${p}: ${catalogEntry(p)?.technical ?? "未知"}`),
    audit: "运行时新增权限已重新确认并记录；用户可在信任中心撤销"
  });
  if (!consented || !explicit) return fail(Status.DENIED, "E_PERM_NEW_AT_RUNTIME", "新增权限未获明确重新确认", { recoverable: true, suggestion: "展示权限差异并再次征得同意" });
  return ok(record);
}

export function revoke(consent, permission) {
  const next = { ...(consent ?? {}) };
  if (!next[permission]) return fail(Status.DENIED, "E_PERM_REVOKED", `权限 ${permission} 无同意记录`);
  next[permission] = Object.freeze({ ...next[permission], revoked: true, revokedAt: new Date().toISOString() });
  return ok(Object.freeze(next));
}

/** 信任摘要：签名、作者、来源、审计、已知问题、许可证与供应链状态。 */
export function trustSummary(mod) {
  const flags = [];
  if (!mod?.signature?.keyId) flags.push("未签名");
  if (mod?.provenance?.trustState === "untrusted") flags.push("来源不可信");
  if (mod?.provenance?.trustState === "revoked") flags.push("来源已撤销");
  if ((mod?.compatibility?.knownIssues ?? []).length) flags.push("存在已知问题");
  if (!mod?.identity?.license) flags.push("缺少许可证");
  const high = (mod?.permissions ?? []).filter((p) => {
    const e = catalogEntry(typeof p === "string" ? p : p.id);
    return e && RISK_RANK[e.risk] >= 3;
  });
  return Object.freeze({
    modId: mod?.identity?.id ?? mod?.id ?? "unknown",
    signed: Boolean(mod?.signature?.keyId),
    keyId: mod?.signature?.keyId ?? null,
    author: mod?.identity?.authors?.[0] ?? null,
    source: mod?.provenance?.installedFrom ?? null,
    sourceKind: mod?.provenance?.sourceKind ?? null,
    license: mod?.identity?.license ?? null,
    knownIssues: Object.freeze([...(mod?.compatibility?.knownIssues ?? [])]),
    highRiskPermissions: Object.freeze(high),
    flags: Object.freeze(flags),
    telemetry: "默认不收集",
    level: flags.length ? "需审阅" : high.length ? "高风险需强化确认" : "常规"
  });
}
