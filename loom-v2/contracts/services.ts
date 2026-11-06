/**
 * Bedrock Loom v2 —— 九个核心服务 TypeScript 接口。
 * 纪律：所有长任务可取消、可观察进度、原子提交、返回结构化错误；界面层不得直接操作文件系统。
 * 本文件只声明契约，运行时实现见 ../core/*.mjs 与 ../services/*.mjs。
 * 证据级别 E4 / platform-side；状态 Stable（见 docs/03-api-status-table.md 的 20 个接口）。
 */
import type {
  ManifestV2, Result, ModRecord, ModState, SourceDescriptor, RepositoryIndex,
  ResolutionPlan, ConflictIssue, HumanExplanation, ConfigSchema, MergedConfig, ConfigDiff,
  Transaction, TxKind, TxState, RecoveryPlan, Progress, LongTaskOptions, Disposable,
  ResourceHandle, InstallResult, UpdatePlan, PermissionDecision, ConsentRecord,
  TrustSummary, DiagnosticBundle, ProfileFile, StructuredErrorShape
} from "./types";

/** 结构化错误：任何服务不得抛出裸 Error 给界面层。 */
export interface ServiceError extends StructuredErrorShape {}

/** 模组库：卡片、详情、搜索筛选排序、来源、收藏与分组；不默认上传玩家数据。 */
export interface ModRepositoryService {
  list(query: {
    search?: string; states?: ModState[]; tags?: string[]; category?: string;
    favorite?: boolean; group?: string; sort?: "name" | "version" | "size" | "installedAt" | "state";
    offset?: number; limit?: number;
  }): Promise<Result<{ total: number; items: ModRecord[] }>>;
  get(id: string): Promise<Result<ModRecord>>;
  getDetail(id: string): Promise<Result<{
    record: ModRecord;
    manifest: ManifestV2;
    trust: TrustSummary;
    candidateSources: SourceDescriptor[];
    actualSource: string;
  }>>;
  setFavorite(id: string, favorite: boolean): Promise<Result<ModRecord>>;
  setGroup(id: string, group: string, add: boolean): Promise<Result<ModRecord>>;
  /** 源不可信时必须警告，不静默降级。 */
  listSources(): Promise<Result<SourceDescriptor[]>>;
  applyRepositoryIndex(index: RepositoryIndex): Promise<Result<{ applied: number; warnings: string[] }>>;
}

/** 安装与导入：预检、用户确认、原子安装、失败回滚、来源记录与可撤销。 */
export interface InstallationService {
  /** 长任务：可取消、可观察进度、原子提交。 */
  install(pack: { manifest: ManifestV2; fileList: unknown; files: Map<string, Uint8Array | string> },
          options: LongTaskOptions & { sourceId: string; confirmed: boolean }): Promise<Result<InstallResult>>;
  precheck(pack: { manifest: ManifestV2 }): Promise<Result<{
    signature: boolean; integrity: boolean; dependencies: ConflictIssue[];
    permissions: PermissionDecision[]; conflicts: ConflictIssue[];
    requiresConfirmation: boolean;
  }>>;
  importFrom(source: { kind: "local-file" | "directory" | "drag-drop" | "clipboard"; uri: string },
             options: LongTaskOptions): Promise<Result<{ packId: string; duplicate: boolean }>>;
  uninstall(id: string, options: LongTaskOptions): Promise<Result<{ txId: string; removed: boolean }>>;
  rollback(txId: string): Promise<Result<{ txId: string; state: TxState }>>;
  /** 任何中断都不留不可启动状态；无法恢复进入安全模式并解释原因。 */
  recoverCrash(): Promise<Result<{ recovered: number; safeMode: boolean }>>;
}

/** 更新管理：候选排序、跳过、回退、二次确认、更新前备份、失败回滚。 */
export interface UpdateService {
  checkUpdates(id: string | "all", options: { offline?: boolean }): Promise<Result<UpdatePlan[]>>;
  planUpdate(id: string, targetVersion: string, options: LongTaskOptions): Promise<Result<{
    requiresSecondConfirm: boolean; majorChange: boolean; permissionIncrease: string[];
    backupPath: string; smokeTest: string[];
  }>>;
  applyUpdate(id: string, targetVersion: string, options: LongTaskOptions & { confirmed: boolean }): Promise<Result<InstallResult>>;
  skipVersion(id: string, version: string): Promise<Result<{ skipped: string }>>;
  rollbackVersion(id: string, options: LongTaskOptions): Promise<Result<{ restoredVersion: string }>>;
  /** 自动更新默认关闭；后台更新不得直接替换正在使用文件。 */
  setAutoUpdate(enabled: boolean): Promise<Result<{ enabled: boolean }>>;
}

/** 依赖与冲突解决：拓扑排序、版本范围、软依赖、六类冲突、可理解原因与可执行建议。 */
export interface DependencyResolver {
  resolve(state: { installed: ModRecord[] }, request: {
    install?: ModRecord; enable?: string[]; disable?: string[]; forceOverrides?: string[];
  }): Promise<Result<ResolutionPlan>>;
  resolveLoadOrder(mods: ModRecord[]): Promise<Result<{ order: string[]; issues: ConflictIssue[] }>>;
  explain(issue: ConflictIssue): HumanExplanation;
  /** 用户强制覆盖必须有风险说明、审计记录与回退点，不允许静默挑选胜者。 */
  forceOverride(issueCode: string, options: { acknowledgedRisk: boolean }): Promise<Result<{ auditId: string; rollbackPoint: string }>>;
}

/** 运行控制：全局/单存档/单人多人独立配置、安全模式、故障隔离、禁用必须释放资源。 */
export interface ModRuntimeController {
  setEnabled(id: string, scope: "global" | "world" | "player" | "singleplayer" | "multiplayer",
             enabled: boolean, options: LongTaskOptions): Promise<Result<{ id: string; enabled: boolean; resourcesReleased: boolean }>>;
  getLoadOrder(): Promise<Result<{ order: string[]; conflicts: HumanExplanation[] }>>;
  enterSafeMode(options: { all: boolean; ids?: string[] }): Promise<Result<{ isolated: string[]; reason: string }>>;
  /** 上次导致启动失败的模组自动隔离，不反复崩溃。 */
  isolateFaulty(id: string, reason: string): Promise<Result<{ isolated: boolean; faultCount: number }>>;
  listFaults(): Promise<Result<{ id: string; count: number; state: "isolated" | "recovering" | "circuit-open" }[]>>;
}

/** 配置管理：自动生成界面、分层、默认值、迁移、脱敏、热应用能力。 */
export interface ConfigService {
  getSchema(id: string): Promise<Result<ConfigSchema>>;
  get(id: string, scope: "global" | "world" | "player"): Promise<Result<MergedConfig>>;
  set(id: string, scope: "global" | "world" | "player", patch: Record<string, unknown>): Promise<Result<MergedConfig>>;
  reset(id: string, scope: "global" | "world" | "player"): Promise<Result<MergedConfig>>;
  importConfig(id: string, file: unknown): Promise<Result<MergedConfig>>;
  exportConfig(id: string, options: { redactSensitive: boolean }): Promise<Result<Record<string, unknown>>>;
  diffOnUpgrade(id: string, newSchema: ConfigSchema): Promise<Result<ConfigDiff>>;
  /** 令牌不写入普通配置；敏感项脱敏。 */
  listSensitive(id: string): Promise<Result<string[]>>;
}

/** 诊断与修复：脱敏诊断包、贡献度、问题分类、可执行修复动作。 */
export interface DiagnosticsService {
  collect(options: { includeScreenshot?: boolean }): Promise<Result<DiagnosticBundle>>;
  copyToClipboard(bundle: DiagnosticBundle): Promise<Result<{ text: string }>>;
  classify(error: ServiceError): "mod-bug" | "adapter-limit" | "client-limit" | "network" | "unknown";
  repair(actions: string[], options: LongTaskOptions): Promise<Result<{ applied: string[]; safeMode: boolean }>>;
  contributions(): Promise<Result<{ rows: { id: string; frameMs: number; memoryKb: number; objects: number; errors: number }[] }>>;
}

/** 配置文件集：保存启用模组/版本/配置，导出导入、跨设备差异、不做默认再分发。 */
export interface ProfileService {
  create(name: string, modIds: string[]): Promise<Result<ProfileFile>>;
  list(): Promise<Result<ProfileFile[]>>;
  apply(id: string, options: LongTaskOptions): Promise<Result<{ enabled: string[]; missing: string[] }>>;
  export(id: string, options: { includeModFiles: boolean }): Promise<Result<ProfileFile>>;
  import(file: ProfileFile): Promise<Result<{ missing: string[]; versionDiff: string[]; matched: string[] }>>;
  diffAcrossDevices(local: ProfileFile, remote: ProfileFile): Promise<Result<{ missing: string[]; versionDiff: string[] }>>;
}

/** 权限与信任中心：分级、安装前声明、运行时新增权限再确认、可撤销、不收集遥测。 */
export interface PermissionService {
  evaluate(permission: string, context: {
    modId: string; granted: string[]; sourceTrust: string; runtimeAdded?: boolean; offline?: boolean;
  }): Promise<Result<PermissionDecision>>;
  evaluateAll(permissions: string[], context: object): Promise<Result<{
    decisions: PermissionDecision[]; needsStrongConfirm: boolean; denied: PermissionDecision[];
  }>>;
  reconfirm(modId: string, added: string[], options: { consented: boolean; explicit: boolean }): Promise<Result<ConsentRecord>>;
  revoke(modId: string, permission: string): Promise<Result<{ revoked: boolean }>>;
  trustSummary(mod: ManifestV2): Promise<Result<TrustSummary>>;
  /** 不收集遥测，除非单独、明确、可撤销同意。 */
  telemetryConsent(): Promise<Result<{ enabled: false }>>;
}

/** 受控资源句柄：不提供任意文件系统访问；退出世界后强制回收。 */
export interface ResourceService {
  open(id: string): Promise<Result<ResourceHandle>>;
  releaseAllOnWorldExit(): Promise<Result<{ released: number; leaked: number }>>;
  budget(): { maxObjects: number; maxFrameMs: number; maxMemoryKb: number };
}

/** 事件总线：同步深度上限、异步取消、超时与错误隔离；禁止直接读其他模组内部文件。 */
export interface EventBusService {
  on(topic: string, handler: (payload: unknown) => void, options?: { timeoutMs?: number; priority?: number }): Disposable;
  emit(topic: string, payload: unknown): Promise<Result<{ delivered: number; failed: number; timedOut: number }>>;
  cancelAll(modId: string): Promise<Result<{ cancelled: number }>>;
}

/** 事务：所有状态转换走此接口，崩溃恢复只依赖事务日志与备份。 */
export interface TransactionService {
  begin(kind: TxKind, plan: { modId: string }): Promise<Result<Transaction>>;
  transition(txId: string, event: "advance" | "cancel" | "fail" | "rollback" | "crash"): Promise<Result<Transaction>>;
  recover(log: Transaction): Promise<Result<RecoveryPlan>>;
  log(): Promise<Result<{ transactions: Transaction[] }>>;
}

/** 界面层约束：只持有下列契约，不持有 fs / path / crypto / 子进程能力。 */
export interface ManagerUiApi {
  repository: ModRepositoryService;
  installation: InstallationService;
  updates: UpdateService;
  resolver: DependencyResolver;
  runtime: ModRuntimeController;
  config: ConfigService;
  diagnostics: DiagnosticsService;
  profiles: ProfileService;
  permissions: PermissionService;
  resources: ResourceService;
  events: EventBusService;
  transactions: TransactionService;
}
