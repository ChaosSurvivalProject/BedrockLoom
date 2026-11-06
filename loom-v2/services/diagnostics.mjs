// services/diagnostics.mjs —— 脱敏诊断包、错误分类、贡献度、可执行修复动作。
// 纪律：默认不收集遥测；排除聊天、账号、IP、跨平台 ID、完整坐标轨迹、无关文件与用户路径。
import { ok, fail, Status } from "../core/result.mjs";

const REDACT_KEYS = /(chat|message|account|xuid|playerId|ip|address|token|secret|password|credential|coord|position|location|worldName|absolutePath|homeDir|telemetry)/i;
const CLIENT_LIMIT_CODES = /^E_CAP_|^E_SIG_KEY|^E_FILE_UNLISTED|^E_PLATFORM_ADAPTER/;
const ADAPTER_LIMIT_CODES = /^E_CAP_ADAPTER|^E_CAP_PROBE|^E_CAP_RESTRICTED/;
const NETWORK_CODES = /^E_TX_NETWORK|^E_TX_HASH_RETRY|BLSP|network/i;

export function classify(error = {}) {
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  if (NETWORK_CODES.test(code) || NETWORK_CODES.test(msg)) return "network";
  if (ADAPTER_LIMIT_CODES.test(code)) return "adapter-limit";
  if (CLIENT_LIMIT_CODES.test(code) || /unsupported|not-supported/i.test(msg)) return "client-limit";
  if (/^E_CFG_|^E_DEP_|^E_PERM_|^E_MANIFEST_|^E_FILE_|^E_SIG_/.test(code)) return "mod-bug";
  return "unknown";
}

function redact(value, depth = 0) {
  if (depth > 6) return "[depth-truncated]";
  if (value === null || typeof value !== "object") return typeof value === "string" && /(token|secret|password|bearer)=/i.test(value) ? "***redacted***" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (REDACT_KEYS.test(k)) { out[k] = "***redacted***"; continue; }
    out[k] = redact(v, depth + 1);
  }
  return out;
}

/** 一键复制的脱敏诊断包；不含玩家已安装模组清单的上传，只在本地生成文本。 */
export function collect({ store = null, capabilityReport = null, errors = [], performance = {}, includeScreenshot = false } = {}) {
  const mods = store ? [...store.mods.values()] : [];
  const bundle = Object.freeze({
    schema: "bedrockloom.diagnostic/v1",
    generatedAt: new Date().toISOString(),
    environment: Object.freeze({ clientBuild: "1.21.130", distribution: "international", device: "未验证", worldStorage: "未验证", testDate: "未运行（沙箱无客户端）" }),
    capability: capabilityReport ? redact(capabilityReport) : null,
    counts: Object.freeze({
      installed: mods.length,
      byState: Object.freeze(mods.reduce((o, m) => ({ ...o, [m.state]: (o[m.state] ?? 0) + 1 }), {})),
      errors: errors.length
    }),
    errors: Object.freeze(errors.map((e) => Object.freeze({
      code: e.code ?? "E_UNKNOWN", message: String(e.message ?? e).slice(0, 300),
      category: classify(e), phase: e.phase ?? null, recoverable: Boolean(e.recoverable)
    }))),
    performance: Object.freeze(redact(performance)),
    contributions: Object.freeze(mods.map((m) => Object.freeze({ id: m.id, ...m.contribution }))),
    screenshotIncluded: includeScreenshot,
    redaction: Object.freeze({ excluded: Object.freeze(["聊天", "账号", "IP", "跨平台 ID", "完整坐标轨迹", "无关文件", "用户绝对路径"]), telemetry: "默认不收集" })
  });
  return ok(bundle);
}

export function toClipboardText(bundle) {
  const lines = [
    "Bedrock Loom 脱敏诊断包",
    `生成时间: ${bundle.generatedAt}`,
    `客户端: ${bundle.environment.clientBuild} / ${bundle.environment.distribution}`,
    `设备/存档/测试日期: ${bundle.environment.device} / ${bundle.environment.worldStorage} / ${bundle.environment.testDate}`,
    `已安装 ${bundle.counts.installed} 个模组；错误 ${bundle.counts.errors} 条`,
    "",
    "错误（按来源分类）:"
  ];
  for (const e of bundle.errors) lines.push(`  [${e.category}] ${e.code}: ${e.message}`);
  lines.push("", "各模组贡献度（帧时间/内存/对象/错误）:");
  for (const c of bundle.contributions) lines.push(`  ${c.id}: ${c.frameMs}ms / ${c.memoryKb}KB / ${c.objects} obj / ${c.errors} err`);
  lines.push("", `遥测: ${bundle.redaction.telemetry}`, `已排除: ${bundle.redaction.excluded.join("、")}`);
  return lines.join("\n");
}

/** 定位重复模组、缺依赖、坏文件、缓存损坏、配置错误，并给出可执行修复动作。 */
export function repairActions(issues = []) {
  const actions = [];
  for (const i of issues) {
    const code = i.code ?? "";
    if (code === "E_DEP_DUPLICATE_ID") actions.push({ code, action: "去重", detail: "在模组库中查看实际来源，保留一个并撤销其余安装", risk: "low" });
    else if (code === "E_DEP_MISSING" || code === "E_DEP_VERSION") actions.push({ code, action: "安装/更新依赖", detail: "从可信源安装兼容候选版本", risk: "low" });
    else if (code === "E_FILE_HASH_MISMATCH" || code === "E_CFG_CORRUPT") actions.push({ code, action: "重新下载或从备份恢复", detail: "校验失败重试上限 3 次；仍失败则隔离损坏文件", risk: "medium" });
    else if (code === "E_FILE_UNLISTED") actions.push({ code, action: "拒绝并删除未列文件", detail: "签名覆盖文件清单，未列文件不可安装", risk: "critical" });
    else if (code === "E_CFG_SCHEMA_VERSION" || code === "E_CFG_MIGRATION_CONFLICT") actions.push({ code, action: "展示配置差异并迁移", detail: "保留可迁移配置，冲突项由用户选择", risk: "medium" });
    else if (code.startsWith("E_DEP_")) actions.push({ code, action: "依赖修复", detail: "按冲突解释调整启用集合，不允许静默覆盖", risk: "medium" });
    else actions.push({ code, action: "清理缓存并回滚最近变更", detail: "无法自动修复时进入安全模式并说明原因", risk: "medium" });
  }
  return ok(Object.freeze({ actions: Object.freeze(actions), autoSafe: actions.every((a) => a.risk !== "critical") }));
}
