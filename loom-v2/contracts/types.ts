/**
 * Bedrock Loom v2 —— 核心数据类型（契约层，不参与运行时）
 * 判定法见 docs/01-freeze-definition.md；状态总表见 docs/03-api-status-table.md。
 */

export type ApiStatus =
  | "Stable" | "Candidate" | "Experimental" | "BuildTimeOnly"
  | "PlatformRestricted" | "CustomClientOnly" | "Unavailable";

export type EvidenceLevel = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";
export type EvidenceDomain = "platform-side" | "in-game" | "custom-client";

export type RenderStage =
  | "ResourceBuild" | "ResourceLoad" | "SimulationSync" | "SceneUpdate"
  | "CullAndSort" | "GeometrySubmit" | "RenderLayer" | "PostProcess"
  | "UiDraw" | "FramePresent";

export type Intervention = "direct-control" | "indirect-influence" | "observe-only" | "inaccessible";

export type Distribution = "international" | "netease" | "custom";
export type PlatformAdapter = Distribution;

export type ResultStatus =
  | "ok" | "partial" | "unsupported" | "denied"
  | "timeout" | "resource-exhausted" | "degraded";

export interface StructuredErrorShape {
  code: string;
  message: string;
  status: ResultStatus;
  field?: string | null;
  recoverable: boolean;
  suggestion?: string | null;
  details?: unknown;
}

export interface Result<T> {
  status: ResultStatus;
  value?: T;
  code?: string;
  message?: string;
  failures?: StructuredErrorShape[];
  reason?: string;
  fallback?: string;
}

/** 七个不允许国际版 Stable 的能力（只作为枚举登记，用于界面灰掉，不提供实现）。 */
export enum UnavailableCapability {
  CustomShader = "render.shader",
  RuntimeGeometrySubmit = "render.geometry_update",
  FramebufferPostProcess = "render.framebuffer",
  RenderLayerControl = "render.render_layer",
  PerFrameBoneWrite = "render.bone_write",
  RuntimePointLight = "render.point_light",
  NativeCameraHook = "render.camera_hook",
  WorldSpaceUi = "render.world_ui",
  DepthDecal = "render.decal",
  DynamicTextureUpload = "render.texture_stream",
  ScreenSpaceEmitter = "render.screen_emitter",
  FrameCallback = "render.frame_callback"
}

export interface I18nText { [locale: string]: string }

export interface CapabilityDecl {
  id: string;
  status: ApiStatus;
  evidenceLevel: EvidenceLevel;
  evidenceDomain: EvidenceDomain;
  stage?: RenderStage | "非渲染";
  intervention?: Intervention;
  actualInterventionPoint?: string;
  clientBuild?: string;
  device?: string;
  worldStorage?: string;
  testDate?: string;
  sources?: string[];
}

export interface StageContract {
  stage: RenderStage;
  intervention: Intervention;
  /** 必须点名具体函数或资源路径；禁止写"底层自动处理"。 */
  actualInterventionPoint: string;
}

export interface PermissionDecl {
  id: string;
  scope: "local" | "world" | "player" | "network" | "account" | "input" | "notification" | "native";
  risk: "low" | "medium" | "high" | "critical";
  plainReason: string;
  technicalDetail: string;
}

export interface DependencyDecl { id: string; range: string; optional?: boolean; reason?: string }

export interface ManifestV2 {
  schema: "bedrockloom.mod/v2";
  identity: {
    id: string;
    name: I18nText | string;
    description?: I18nText | string;
    authors: string[];
    license: string;
    homepage?: string;
    source?: string;
    icon?: string;
    assetLicenses?: { path: string; license: string; attribution?: string }[];
  };
  version: string;
  loader: { id: "bedrockloom"; apiRange: string; minManagerVersion?: string };
  client: {
    distribution: Distribution;
    clientVersionRange: string;
    platformAdapters: PlatformAdapter[];
    moduleVersions?: Record<string, string>;
    capabilityMap: Partial<Record<Distribution, CapabilityDecl[]>>;
    graphicsMode?: "default" | "vibrant-visuals" | "any";
  };
  dependencies: {
    requires: DependencyDecl[];
    optional?: DependencyDecl[];
    conflicts?: DependencyDecl[];
    breaks?: DependencyDecl[];
    provides?: string[];
    resourceNamespaces?: string[];
    inputBindings?: string[];
    hudSlots?: string[];
  };
  entrypoints: { client: string; additional?: Record<string, string> };
  resources: { namespace: string; roots: string[]; packs?: string[] };
  permissions: PermissionDecl[];
  config?: ConfigSchema;
  capabilities: CapabilityDecl[];
  stageContracts?: StageContract[];
  signature: { envelope: "signature.json"; algorithm: "Ed25519"; keyId: string; signedBy?: string; signedAt?: string };
  content: { fileList: "META/file-list.json"; hashAlgorithm: "sha256"; manifestHash: string; totalBytes: number; fingerprint: string };
  provenance: {
    sourceId: string;
    sourceKind: "official" | "community" | "private" | "local-file" | "drag-drop" | "clipboard";
    installedFrom: string;
    trustState?: "trusted" | "untrusted" | "unknown" | "revoked";
  };
  compatibility?: {
    minClientBuild?: string; maxClientBuild?: string;
    requiresExperiments?: string[]; knownIssues?: string[];
    deprecatedSince?: string; replacedBy?: string; minManagerVersion?: string;
  };
  migration?: { fromSchema?: string; notes?: string[]; requiresVerification?: boolean };
  i18n?: { defaultLocale?: string; locales?: string[]; changelog?: string; screenshots?: string[]; media?: string[]; releaseDate?: string; supportedVersions?: string[] };
}

export type ModState =
  | "installed" | "builtin" | "external" | "update-available"
  | "disabled" | "corrupt" | "incompatible" | "blocked";

export interface ModRecord {
  id: string;
  name: string;
  version: string;
  state: ModState;
  author?: string | null;
  license?: string | null;
  description?: string;
  tags?: string[];
  category?: string;
  sizeBytes?: number;
  permissions?: string[];
  capabilities?: CapabilityDecl[];
  platform?: Distribution;
  dependencies?: ManifestV2["dependencies"];
  favorite?: boolean;
  groups?: string[];
  actualSource?: string;
  screenshots?: string[];
  media?: string[];
  changelog?: string;
  releaseDate?: string;
  supportedVersions?: string[];
  knownIssues?: string[];
  contribution?: { frameMs: number; memoryKb: number; objects: number; errors: number };
}

export interface SourceDescriptor {
  id: string;
  kind: "official" | "community" | "private";
  trust: "trusted" | "untrusted" | "unknown" | "revoked";
  priority: number;
  signatureKeys: { keyId: string; publicKey: string; fingerprint: string }[];
  mirrors?: string[];
  offlineCache?: { cachedAt: string; staleAfterHours: number };
}

export interface RepositoryIndex {
  schema: "bedrockloom.repo-index/v2";
  source: SourceDescriptor;
  generatedAt: string;
  sequence: number;
  delta: boolean;
  entries: {
    modId: string; version: string; action: "publish" | "update" | "revoke";
    artifact: { path: string; sha256: string; size: number; resumeSupported: boolean };
    sourceOfRecord: string;
    breaking?: boolean;
    permissions?: string[];
  }[];
  revocations?: { modId: string; version: string; reason: string; revokedAt: string }[];
  indexSignature?: string;
}

export interface ConflictIssue {
  code: string;
  modId: string;
  detail: string;
  involved: string[];
  forced?: boolean;
}

export interface HumanExplanation {
  code: string;
  modId: string;
  title: string;
  why: string;
  involved: string[];
  suggestions: string[];
}

export interface ResolutionPlan {
  order: string[];
  enabled: string[];
  actions: { type: "install" | "upgrade" | "enable" | "disable"; id: string; version?: string }[];
  issues: ConflictIssue[];
  forced: ConflictIssue[];
  audit: { at: string; code: string; modId: string; risk: string; rollbackPoint: string }[];
  ok: boolean;
  explanations: HumanExplanation[];
}

export interface ConfigSchema {
  schemaVersion: number;
  fields: Record<string, {
    type: "boolean" | "number" | "string" | "enum" | "color" | "keybinding" | "file" | "list";
    default?: unknown;
    min?: number; max?: number; values?: unknown[];
    sensitive?: boolean; requiresRestart?: boolean;
  }>;
}

export interface MergedConfig {
  schemaVersion: number;
  values: Record<string, unknown>;
  invalid: { key: string; layer: string; reason: string; fallback: unknown }[];
  sensitive: string[];
  requiresRestart: string[];
}

export interface ConfigDiff {
  fromVersion: number; toVersion: number;
  added: { key: string; spec: unknown }[];
  removed: { key: string; spec: unknown; lastValue?: unknown }[];
  changed: { key: string; oldSpec: unknown; newSpec: unknown }[];
  conflicts: { key: string; current: unknown; reason: string; fallback: unknown }[];
}

export type TxState =
  | "INIT" | "PRECHECK" | "STAGING" | "BACKUP" | "COMMIT_PENDING"
  | "COMMITTED" | "VERIFY" | "DONE" | "ABORTING" | "ABORTED"
  | "RECOVERY_REQUIRED" | "SAFE_MODE";

export type TxKind =
  | "install" | "upgrade" | "uninstall" | "enable" | "disable"
  | "dependency-repair" | "resource-load" | "world-enter" | "world-exit" | "adapter-switch";

export interface Transaction {
  txId: string;
  kind: TxKind;
  modId: string;
  state: TxState;
  fromVersion?: string | null;
  toVersion?: string | null;
  createdAt: string;
  updatedAt: string;
  cancelPoints: TxState[];
  rollbackPoint: string;
  backupPath?: string | null;
  stagingPath?: string | null;
  error?: { code: string; message: string; phase: string } | null;
  events: { at: string; from: TxState | null; to: TxState; event: string; detail?: string; canCancel: boolean }[];
}

export interface RecoveryPlan {
  txId: string;
  action: "ROLLBACK_FROM_BACKUP" | "REPLAY_COMMIT" | "FINISH_ROLLBACK" | "VERIFY_ONLY" | "ENTER_SAFE_MODE";
  targetState: TxState;
  safeMode: boolean;
  reason: string;
}

export interface Progress { state: string; pct: number; at: string; detail?: string }
export interface LongTaskOptions { signal?: AbortSignal; onProgress?: (p: Progress) => void }
export interface Disposable { dispose(): boolean; readonly disposed: boolean }
export interface ResourceHandle extends Disposable {
  readonly id: string;
  readonly refs: number;
  readonly state: "active" | "release-pending" | "released";
  retain(): number;
  release(): string;
}

export interface InstallResult { txId: string; modId: string; installedPath: string; backupCreated: boolean }
export interface UpdatePlan {
  version: string;
  compatible: boolean;
  higher: boolean;
  majorChange: boolean;
  permissionIncrease: string[];
  requiresSecondConfirm: boolean;
  reason: string;
}

export type PermissionDecisionKind = "allow" | "deny" | "reconfirm" | "degrade";
export interface PermissionDecision {
  permission: string; modId: string;
  risk: "low" | "medium" | "high" | "critical";
  plain: string; technical: string;
  decision: PermissionDecisionKind;
  reasons: string[];
  requiresConfirm: boolean;
  fallback?: string;
}
export interface ConsentRecord {
  modId: string; added: string[]; at: string;
  consented: boolean; explicit: boolean; revocable: boolean;
  riskStatement: string[]; audit: string;
}
export interface TrustSummary {
  modId: string; signed: boolean; keyId: string | null;
  author: string | null; source: string | null; license: string | null;
  knownIssues: string[]; highRiskPermissions: unknown[];
  flags: string[]; telemetry: string; level: string;
}

export interface DiagnosticBundle {
  schema: "bedrockloom.diagnostic/v1";
  generatedAt: string;
  environment: { clientBuild: string; distribution: Distribution; device: string; worldStorage: string; testDate: string };
  counts: { installed: number; byState: Record<string, number>; errors: number };
  errors: { code: string; message: string; category: string; recoverable: boolean }[];
  contributions: { id: string; frameMs: number; memoryKb: number; objects: number; errors: number }[];
  redaction: { excluded: string[]; telemetry: string };
}

export interface ProfileFile {
  schema: "bedrockloom.profile/v1";
  name: string;
  createdAt: string;
  mods: { id: string; version: string; config: Record<string, unknown> }[];
  includeModFiles: boolean;
}
