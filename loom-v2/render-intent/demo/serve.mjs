// demo/serve.mjs —— 一键启动本地意图总线（零第三方依赖，仅绑定 127.0.0.1）
// 用法：node render-intent/demo/serve.mjs [--port=8787] [--no-demo]
// 说明：本脚本注入的是「合成演示数据」，不是真机采集；真机链路见 collector/ 与 docs/14-render-intent.md。

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalBus } from "../runtime/bus.mjs";
import { makeFrame, createIntent, CAMERA_SCHEMA } from "../core/intent.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const overlayPath = path.join(HERE, "overlay.html");
const filePath = path.resolve(HERE, "../../runtime/intent.jsonl");

const args = process.argv.slice(2);
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 8787;
const noDemo = args.includes("--no-demo");

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("非法端口，使用 --port=8787 或 --port=0（系统分配）");
  process.exit(1);
}

/** 与 core/compositor.mjs 的 projectMinimap 同构的输入数据，纯合成。 */
export function demoFrame(t) {
  const angle = (t / 20) % (Math.PI * 2);
  const dim = "minecraft:overworld";
  const camera = {
    schema: CAMERA_SCHEMA,
    tick: t,
    capturedAt: new Date().toISOString(),
    dimensionId: dim,
    position: { x: Math.cos(angle) * 24, y: 64, z: Math.sin(angle) * 24 },
    viewDirection: { x: -Math.sin(angle), y: 0, z: Math.cos(angle) },
    rotation: { x: 0, y: (angle * 180 / Math.PI) % 360 },
    fovDegrees: null, near: null, far: null,
    unreadableFields: ["fovDegrees", "near", "far"],
    precision: "approximate"
  };
  const entities = [
    { id: "e-zombie", typeId: "minecraft:zombie", dimensionId: dim, position: { x: 8, y: 64, z: 6 }, bounds: null, boundsSource: "unavailable", tags: ["hostile"] },
    { id: "e-villager", typeId: "minecraft:villager_v2", dimensionId: dim, position: { x: -14, y: 64, z: -10 }, bounds: null, boundsSource: "unavailable", tags: ["passive"] },
    { id: "e-anchor", typeId: "minecraft:armor_stand", dimensionId: dim, position: { x: 30, y: 64, z: 18 }, bounds: null, boundsSource: "unavailable", tags: ["loom-anchor"] }
  ];
  return makeFrame({
    camera,
    entities,
    source: "synthetic-demo",
    tick: t,
    caveats: [
      "FOV / near / far 官方不可读，恒为 null",
      "包围盒官方不可读，bounds 恒为 null",
      "本帧是合成演示数据，不是 1.21.130 真机采集"
    ]
  });
}

const bus = createLocalBus({ port, overlayPath, filePath, loopbackOnly: true });
const addr = await bus.start();
const base = `http://127.0.0.1:${addr.port}`;

console.log("BedrockLoom Render-Intent Bus v2.1.0");
console.log(`  仅绑定本机回环：${base}`);
console.log(`  演示页：${base}/  （或直接用浏览器打开 demo/overlay.html）`);
console.log(`  WS：ws://127.0.0.1:${addr.port}/   SSE：${base}/events`);
console.log(`  文件管道：${filePath}`);
console.log(`  健康检查：${base}/health   能力表：${base}/capabilities`);
console.log("  数据源：合成演示（非真机）。按 Ctrl+C 退出。");

let tick = 0;
let timer = null;
if (!noDemo) {
  timer = setInterval(async () => {
    tick += 1;
    const f = demoFrame(tick);
    if (f.status === "ok") await bus.publish(f.value, "frame");
    if (tick % 6 === 0) {
      const hud = createIntent("hud", {
        elementId: "hud-status",
        rect: { x: 12, y: 12, w: 280, h: 28 },
        content: { kind: "text", data: `帧 ${tick} · 外部合成器（非游戏内绘制）` },
        anchor: "safe-area",
        batchKey: "status"
      });
      if (hud.status === "ok") await bus.publish(hud.value, "intent");
    }
  }, 500);
  timer.unref?.();
}

const shutdown = async () => {
  if (timer) clearInterval(timer);
  await bus.close();
  console.log("总线已关闭。");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
