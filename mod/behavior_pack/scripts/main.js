import { world } from "@minecraft/server";
import { startLifecycle, diagnostic, acceptServerPresentation } from "./runtime.js";
import { createClientApi, dispatchItemUse } from "./api/client_api.js";
import { createCapabilityProbe } from "./api/capability_probe.js";
import { runApiSelfTest } from "./api/self_test.js";

const MOD = { id: "example.loom_blade", version: "1.1.0" };
const localPlayers = new Set();
let clientApi;
let inputOff;
let itemUseHandler;
let playerSpawnHandler;

function playLocalPresentation(player) {
  const p = player.location;
  clientApi.particle.emit({ player, effect: "bedrockloom:loom_spark", position: [p.x, p.y + 1.1, p.z], count: 1 });
  clientApi.sound.play({ player, sound: "bedrockloom.loom_blade.swing", volume: 0.8, pitch: 1.05 });
  clientApi.ui.screen.toast({ player, id: "loom_blade_ready", text: "§bBedrock Loom §7· §fLoom Blade ready", ttlTicks: 40 });
  clientApi.animation.play({ target: player.id, clip: "bedrockloom:loom_blade_attack", blendMs: 80 });
}

startLifecycle(MOD, {
  resolve: () => diagnostic("dependencies", "bedrockloom >=1.0.0 satisfied"),
  mergeResources: () => diagnostic("resources", "namespace bedrockloom locked"),
  capabilities: () => {
    const adapter = { id: "international", detect: () => ({ geometry: true, attachable: true, animationController: true, particles: true, sounds: true, screenUi: true }) };
    const report = createCapabilityProbe({ adapter, diagnostics: diagnostic, environment: { platform: "international", edition: "bedrock", apiVersion: "1.14.0" } }).run();
    diagnostic("capabilities", JSON.stringify({ renderLevels: report.results.reduce((out, item) => ({ ...out, [item.capability]: item.level }), {}) }));
  },
  preInit: () => {
    clientApi = createClientApi({
      namespace: MOD.id,
      permissions: ["presentation.local", "storage.world:example.loom_blade"],
      diagnostics: diagnostic
    });
    clientApi.model.register({ id: "bedrockloom:loom_blade", geometry: "geometry.bedrockloom.loom_blade", texture: "textures/items/loom_blade" });
    clientApi.material.register({ id: "bedrockloom:loom_blade.default", texture: "textures/items/loom_blade", tint: [1, 1, 1, 1] });
    clientApi.particle.allow("bedrockloom:loom_spark");
    clientApi.sound.allow("bedrockloom.loom_blade.swing");
    void clientApi.storage.open("example.loom_blade", 1).then((storage) => storage.set("api_version", "1.1.0"));
    void runApiSelfTest({ createApi: createClientApi, diagnostics: diagnostic }).catch((error) => diagnostic("api_self_test_failed", String(error)));
  },
  init: () => {
    inputOff = clientApi.input.bind({ id: "loom_blade_use", key: "item_use", itemType: "bedrockloom:loom_blade", onPress: ({ player }) => {
      localPlayers.add(player.id);
      playLocalPresentation(player);
    } });
    itemUseHandler = (event) => dispatchItemUse(clientApi, event);
    playerSpawnHandler = ({ player }) => {
      clientApi.ui.screen.toast({ player, id: "platform_active", text: "§bBedrock Loom §7· §fLocal client module active", ttlTicks: 80 });
    };
    world.afterEvents.itemUse.subscribe(itemUseHandler);
    world.afterEvents.playerSpawn.subscribe(playerSpawnHandler);
  },
  worldReady: () => diagnostic("world_ready", "single-player safe mode available"),
  tick: (tick) => {
    if (tick % 100 === 0 && localPlayers.size > 0) {
      for (const player of world.getPlayers()) if (localPlayers.has(player.id)) {
        clientApi.ui.screen.toast({ player, id: "local_visuals", text: "§bLoom Blade §7· §fvisuals are local", ttlTicks: 40 });
      }
    }
  },
  shutdown: () => {
    inputOff?.();
    world.afterEvents.itemUse.unsubscribe?.(itemUseHandler);
    world.afterEvents.playerSpawn.unsubscribe?.(playerSpawnHandler);
    clientApi?.dispose();
    localPlayers.clear();
    diagnostic("shutdown", "subscriptions released");
  }
});

// 服务端协议入口预留：实际网络桥接由兼容适配器提供，这里只保留安全校验。
export function handleServerPresentation(player, request) {
  if (!acceptServerPresentation(player, request)) return false;
  if (request.kind === "particle") return clientApi.particle.emit({ player, ...request.payload });
  if (request.kind === "sound") return clientApi.sound.play({ player, ...request.payload });
  if (request.kind === "ui_notice") return clientApi.ui.screen.toast({ player, id: request.request_id, ...request.payload });
  if (request.kind === "animation") return clientApi.animation.play(request.payload).status === "submitted";
  if (request.kind === "camera_pulse") return clientApi.camera.pulse(request.payload).status === "submitted";
  return false;
}
