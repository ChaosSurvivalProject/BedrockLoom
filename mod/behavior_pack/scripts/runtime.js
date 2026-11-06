import { system, world } from "@minecraft/server";

export const LIFECYCLE = Object.freeze({ DISCOVER: "discover", RESOLVE: "resolve", MERGE_RESOURCES: "merge_resources", CAPABILITIES: "capabilities", PRE_INIT: "pre_init", INIT: "init", WORLD_READY: "world_ready", TICK: "tick", WORLD_STOP: "world_stop", SHUTDOWN: "shutdown" });

const seenRequests = new Map();
const allowedKinds = new Set(["particle", "sound", "animation", "ui_notice", "camera_pulse"]);
const limits = { requestsPerTick: 16, maxDistance: 64, maxText: 96, maxAnimationBlendMs: 10000, maxCameraDuration: 40 };
let tickRequests = 0;
let lastTick = -1;

export function diagnostic(code, detail = "") {
  world.sendMessage(`[Bedrock Loom] ${code}${detail ? `: ${detail}` : ""}`);
}

export function capabilities() {
  return {
    scriptApi: true,
    localPresentation: true,
    renderLevels: { resource: "R0", runtime: "R1-candidate", extension: "unsupported", native: "unsupported" },
    model: { status: "experimental", evidence: "resource-path-only" },
    material: { status: "experimental", evidence: "resource-path-only" },
    animation: { status: "experimental", evidence: "controller-path-only" },
    particle: { status: "supported", evidence: "public-script-api" },
    sound: { status: "supported", evidence: "public-script-api" },
    screenUi: { status: "supported", scope: "actionbar-only" },
    worldUi: { status: "unsupported", fallback: "screen_toast" },
    input: { status: "supported", scope: "official-events" },
    camera: { status: "degraded", fallback: "noop" },
    entityAttachment: { status: "degraded", fallback: "resource-only" },
    entityObservation: { status: "platform-dependent", fallback: "unavailable" },
    localStorage: { status: "experimental", scope: "memory-compatibility" },
    blsp: ["blsp/1"]
  };
}

function validVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => Number.isFinite(n));
}

function withinDistance(player, position) {
  if (!validVector(position)) return false;
  const p = player.location;
  const dx = p.x - position[0]; const dy = p.y - position[1]; const dz = p.z - position[2];
  return dx * dx + dy * dy + dz * dz <= limits.maxDistance * limits.maxDistance;
}

export function acceptServerPresentation(player, request) {
  const tick = system.currentTick;
  if (lastTick !== tick) { lastTick = tick; tickRequests = 0; }
  if (!request || request.protocol !== "blsp/1" || !request.request_id || !allowedKinds.has(request.kind)) return false;
  if (tickRequests++ >= limits.requestsPerTick || (request.expires_at && request.expires_at < Math.floor(Date.now() / 1000))) return false;
  if (seenRequests.has(request.request_id)) return false;
  if (request.payload?.position && !withinDistance(player, request.payload.position)) return false;
  seenRequests.set(request.request_id, request.expires_at || Math.floor(Date.now() / 1000) + 30);
  if (seenRequests.size > 128) {
    for (const [id, expiry] of seenRequests) if (expiry < Math.floor(Date.now() / 1000)) seenRequests.delete(id);
  }
  return true;
}

export function startLifecycle(mod, handlers) {
  let phase = LIFECYCLE.DISCOVER;
  diagnostic("lifecycle", phase);
  phase = LIFECYCLE.RESOLVE; handlers.resolve?.();
  phase = LIFECYCLE.MERGE_RESOURCES; handlers.mergeResources?.();
  phase = LIFECYCLE.CAPABILITIES; handlers.capabilities?.(capabilities());
  phase = LIFECYCLE.PRE_INIT; handlers.preInit?.();
  phase = LIFECYCLE.INIT; handlers.init?.();
  world.afterEvents.worldLoad.subscribe(() => {
    phase = LIFECYCLE.WORLD_READY;
    handlers.worldReady?.();
    diagnostic("loaded", mod.id);
  });
  const tickHandle = system.runInterval(() => handlers.tick?.(system.currentTick), 1);
  return () => { phase = LIFECYCLE.SHUTDOWN; system.clearRun(tickHandle); handlers.shutdown?.(); };
}
