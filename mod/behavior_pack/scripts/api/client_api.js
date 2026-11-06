import { system, world } from "@minecraft/server";

const DEFAULT_LIMITS = Object.freeze({
  maxText: 96,
  maxDistance: 64,
  maxStorageBytes: 8192,
  maxBindings: 32,
  maxRegistryEntries: 128
});

function finiteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function vector3(value) {
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) return value.slice();
  if (value && ["x", "y", "z"].every((key) => Number.isFinite(value[key]))) return [value.x, value.y, value.z];
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeId(value) {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,96}$/.test(value);
}

export class ClientEventBus {
  #listeners = new Map();

  on(event, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set());
    const listeners = this.#listeners.get(event);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  emit(event, payload) {
    for (const listener of this.#listeners.get(event) || []) {
      try { listener(payload); } catch (error) { this.emit("diagnostic", { code: "listener_error", detail: String(error) }); }
    }
  }

  clear() { this.#listeners.clear(); }
}

export class PermissionGate {
  constructor(permissions = []) { this.permissions = new Set(permissions); }
  allows(permission) { return this.permissions.has(permission); }
  require(permission) {
    if (!this.allows(permission)) throw new Error(`permission_denied:${permission}`);
    return true;
  }
}

export class ClientRegistry {
  constructor(kind, limits = DEFAULT_LIMITS) { this.kind = kind; this.limits = limits; this.entries = new Map(); }

  register(definition) {
    if (!definition || !safeId(definition.id)) throw new Error(`${this.kind}_invalid_id`);
    if (!this.entries.has(definition.id) && this.entries.size >= this.limits.maxRegistryEntries) throw new Error(`${this.kind}_limit_reached`);
    this.entries.set(definition.id, Object.freeze({ ...definition }));
    return this.entries.get(definition.id);
  }

  get(id) { return this.entries.get(id); }
  has(id) { return this.entries.has(id); }
  list() { return [...this.entries.values()]; }
  clear() { this.entries.clear(); }
}

export class ModelApi extends ClientRegistry {
  constructor(limits) { super("model", limits); }
  register(definition) { return super.register({ attachPoint: "right_hand", ...definition }); }
}

export class MaterialApi extends ClientRegistry {
  constructor(limits) { super("material", limits); }
}

export class AnimationApi extends ClientRegistry {
  constructor(limits) { super("animation", limits); }

  play({ target, clip, loop = false, blendMs = 0 } = {}) {
    if (!safeId(clip)) throw new Error("animation_invalid_clip");
    return Object.freeze({ status: "degraded", level: "R0", target, clip, loop: Boolean(loop), blendMs: clamp(finiteNumber(blendMs), 0, 10000), visualGuarantee: "resource-controller-only" });
  }
}

export class ParticleApi {
  constructor({ limits, diagnostics }) { this.limits = limits; this.diagnostics = diagnostics; this.whitelist = new Set(); }
  allow(effect) { if (safeId(effect)) this.whitelist.add(effect); return this; }

  emit({ player, effect, position, count = 1, maxDistance = this.limits.maxDistance } = {}) {
    if (!player || !safeId(effect) || (this.whitelist.size > 0 && !this.whitelist.has(effect))) return false;
    const vector = vector3(position || player.location);
    if (!vector || !withinDistance(player, vector, maxDistance)) return false;
    try {
      for (let i = 0; i < clamp(Math.floor(finiteNumber(count, 1)), 1, 32); i += 1) {
        player.spawnParticle(effect, { x: vector[0], y: vector[1], z: vector[2] });
      }
      return true;
    } catch (error) { this.diagnostics("particle_degraded", String(error)); return false; }
  }
}

export class SoundApi {
  constructor({ limits, diagnostics }) { this.limits = limits; this.diagnostics = diagnostics; this.whitelist = new Set(); }
  allow(sound) { if (safeId(sound)) this.whitelist.add(sound); return this; }

  play({ player, sound, position, volume = 1, pitch = 1 } = {}) {
    if (!player || !safeId(sound) || (this.whitelist.size > 0 && !this.whitelist.has(sound))) return false;
    const vector = vector3(position || player.location);
    if (!vector || !withinDistance(player, vector, this.limits.maxDistance)) return false;
    try {
      player.playSound(sound, { location: { x: vector[0], y: vector[1], z: vector[2] }, volume: clamp(finiteNumber(volume, 1), 0, 4), pitch: clamp(finiteNumber(pitch, 1), 0.25, 4) });
      return true;
    } catch (error) { this.diagnostics("sound_degraded", String(error)); return false; }
  }
}

export class ScreenUiApi {
  constructor({ limits, diagnostics }) { this.limits = limits; this.diagnostics = diagnostics; this.active = new Map(); }

  toast({ player, id, text, textKey, ttlTicks = 60 } = {}) {
    if (!player || !safeId(id)) return false;
    const message = String(textKey || text || "").slice(0, this.limits.maxText);
    if (!message) return false;
    try {
      player.onScreenDisplay.setActionBar(message);
      this.active.set(`${player.id}:${id}`, { id, message, expires: system.currentTick + clamp(Math.floor(ttlTicks), 1, 1200) });
      return true;
    } catch (error) { this.diagnostics("screen_ui_degraded", String(error)); return false; }
  }

  clear(player, id) { return this.active.delete(`${player.id}:${id}`); }
  clearAll() { this.active.clear(); }
}

export class WorldUiApi {
  constructor({ diagnostics }) { this.diagnostics = diagnostics; this.mounts = new Map(); }
  mount(definition = {}) {
    if (!safeId(definition.id) || !safeId(definition.anchor || "player")) return false;
    this.mounts.set(definition.id, Object.freeze({ ...definition, ttlTicks: clamp(Math.floor(finiteNumber(definition.ttlTicks, 60)), 1, 1200) }));
    this.diagnostics("world_ui_deferred", "普通国际版使用屏幕 UI 降级");
    return false;
  }
  unmount(id) { return this.mounts.delete(id); }
}

export class InputApi {
  constructor({ events, limits }) { this.events = events; this.limits = limits; this.bindings = new Map(); }
  bind({ id, key = "item_use", itemType, onPress } = {}) {
    if (!safeId(id) || typeof onPress !== "function" || this.bindings.size >= this.limits.maxBindings) return () => {};
    const binding = { id, key, itemType, onPress };
    this.bindings.set(id, binding);
    const off = this.events.on("input", (event) => {
      if (event.key === key && (!itemType || event.itemType === itemType)) onPress(event);
    });
    return () => { off(); this.bindings.delete(id); };
  }
  clear() { this.bindings.clear(); }
}

export class CameraApi {
  constructor({ events, diagnostics }) { this.events = events; this.diagnostics = diagnostics; }
  pulse({ amplitude = 0.1, durationTicks = 4 } = {}) {
    const effect = Object.freeze({ status: "degraded", level: "R1", amplitude: clamp(finiteNumber(amplitude), 0, 1), durationTicks: clamp(Math.floor(finiteNumber(durationTicks, 4)), 1, 40), visualGuarantee: "none" });
    this.events.emit("camera", effect);
    this.diagnostics("camera_local_only", "普通国际版只保留本地事件，不产生相机画面承诺");
    return effect;
  }
}

export class EntityApi {
  constructor({ diagnostics }) { this.diagnostics = diagnostics; this.attachments = new Map(); this.watchers = new Map(); }
  attach({ entityId, bone = "root", offset = [0, 0, 0], rotation = [0, 0, 0], visibleTo = "self" } = {}) {
    if (!safeId(entityId) || !safeId(bone) || !vector3(offset) || !vector3(rotation)) return { status: "invalid-argument" };
    if (!["self", "local", "all"].includes(visibleTo)) return { status: "invalid-argument" };
    const attachment = Object.freeze({ status: "degraded", level: "R0", entityId, bone, offset: vector3(offset), rotation: vector3(rotation), visibleTo, visualGuarantee: "resource-only" });
    this.attachments.set(`${entityId}:${bone}`, attachment);
    this.diagnostics("entity_attachment_deferred", "运行时挂点仅保存请求；实际可见性依赖预声明 attachable");
    return attachment;
  }
  detach(entityId, bone = "root") { return this.attachments.delete(`${entityId}:${bone}`); }
  observe(player, { radius = 32, typeId, onChange } = {}) {
    if (!player || typeof onChange !== "function") return () => {};
    const range = clamp(finiteNumber(radius, 32), 1, 64);
    const key = `${player.id}:${typeId || "*"}`;
    this.watchers.get(key)?.();
    const tick = () => {
      try {
        const entities = player.dimension?.getEntities?.({ location: player.location, maxDistance: range, type: typeId });
        if (!entities) { onChange({ status: "unavailable", entities: [] }); return; }
        onChange({ status: "ok", entities: entities.map((entity) => ({ id: entity.id, typeId: entity.typeId, location: entity.location })) });
      } catch (error) { this.diagnostics("entity_observation_degraded", String(error)); onChange({ status: "not-supported", entities: [] }); }
    };
    tick();
    const handle = system.runInterval(tick, 10);
    const stop = () => { system.clearRun(handle); this.watchers.delete(key); };
    this.watchers.set(key, stop);
    return stop;
  }
  clear() { for (const stop of this.watchers.values()) stop(); this.watchers.clear(); this.attachments.clear(); }
}

export class StorageApi {
  constructor({ namespace, limits, diagnostics }) { this.namespace = namespace; this.limits = limits; this.diagnostics = diagnostics; this.memory = new Map(); }

  async open(name, version = 1) {
    if (!safeId(name)) throw new Error("storage_invalid_name");
    return new StorageHandle(this, name, version);
  }

  _key(name, key) { return `${this.namespace}:${name}:${key}`; }
}

class StorageHandle {
  constructor(owner, name, version) { this.owner = owner; this.name = name; this.version = version; }
  get(key, fallback = null) { return this.owner.memory.get(this.owner._key(this.name, key)) ?? fallback; }
  set(key, value) {
    const encoded = JSON.stringify(value);
    if (encoded.length > this.owner.limits.maxStorageBytes) throw new Error("storage_limit_reached");
    this.owner.memory.set(this.owner._key(this.name, key), value);
    return value;
  }
  delete(key) { return this.owner.memory.delete(this.owner._key(this.name, key)); }
  clear() {
    const prefix = `${this.owner.namespace}:${this.name}:`;
    for (const key of this.owner.memory.keys()) if (key.startsWith(prefix)) this.owner.memory.delete(key);
  }
  snapshot() {
    const prefix = `${this.owner.namespace}:${this.name}:`;
    return Object.freeze(Object.fromEntries([...this.owner.memory.entries()].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value])));
  }
}

function withinDistance(player, position, maxDistance) {
  const location = player?.location;
  if (!location) return false;
  const dx = location.x - position[0]; const dy = location.y - position[1]; const dz = location.z - position[2];
  return dx * dx + dy * dy + dz * dz <= maxDistance * maxDistance;
}

export function createClientApi({ namespace = "bedrockloom", permissions = [], limits = {}, diagnostics = () => {} } = {}) {
  const mergedLimits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
  const events = new ClientEventBus();
  const gate = new PermissionGate(permissions);
  const api = {
    events,
    permissions: gate,
    model: new ModelApi(mergedLimits),
    material: new MaterialApi(mergedLimits),
    animation: new AnimationApi(mergedLimits),
    particle: new ParticleApi({ limits: mergedLimits, diagnostics }),
    sound: new SoundApi({ limits: mergedLimits, diagnostics }),
    ui: {
      screen: new ScreenUiApi({ limits: mergedLimits, diagnostics }),
      world: new WorldUiApi({ diagnostics })
    },
    input: new InputApi({ events, limits: mergedLimits }),
    camera: new CameraApi({ events, diagnostics }),
    entity: new EntityApi({ diagnostics }),
    storage: new StorageApi({ namespace, limits: mergedLimits, diagnostics }),
    world: {
      getPlayers: () => world.getPlayers(),
      currentTick: () => system.currentTick
    },
    dispose: () => {
      events.clear();
      api.input.clear();
      api.model.clear();
      api.material.clear();
      api.animation.clear();
      api.ui.screen.clearAll();
      api.ui.world.mounts?.clear?.();
      api.entity.clear();
    }
  };
  return Object.freeze(api);
}

export function dispatchItemUse(api, event) {
  api.events.emit("input", { key: "item_use", itemType: event.itemStack?.typeId, player: event.source, itemStack: event.itemStack });
}
