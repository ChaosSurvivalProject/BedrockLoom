# 统一客户端表现 API

Bedrock Loom 1.1 将客户端 API 按职责拆成可组合的类。接口是平台契约，不要求普通国际版客户端拥有原生渲染 Hook；国际版适配器把它映射到资源包、Molang、动画控制器、粒子、声音和受限 UI。资源或脚本调用成功不等于画面必然可见；创建、提交、首次可见和稳定可见必须由能力报告与探针分别证明。未来授权适配器可以复用上层调用，但不承诺跨平台画面一致。

## 创建 API 上下文

```js
import { createClientApi } from "./api/client_api.js";

const api = createClientApi({
  namespace: "example.loom_blade",
  permissions: ["presentation.local", "storage.world:example.loom_blade"],
  diagnostics: (code, detail) => console.warn(code, detail)
});
```

上下文包含以下类：

| 类 | 用途 | 国际版 1.21 映射 |
|---|---|---|
| `ClientEventBus` | 模组内事件和输入分发 | Script API 事件桥 |
| `PermissionGate` | 本地权限最小化检查 | manifest `permissions` |
| `ModelApi` | 注册 geometry、贴图和挂点 | attachable + geometry |
| `MaterialApi` | 注册材质、贴图和颜色 | attachable material |
| `AnimationApi` | 播放白名单动画片段 | animation + controller |
| `ParticleApi` | 在距离和数量预算内生成粒子 | `spawnParticle` |
| `SoundApi` | 播放白名单音效 | `playSound` + sound definitions |
| `ScreenUiApi` | action bar/toast 生命周期 | `onScreenDisplay` |
| `WorldUiApi` | 世界空间 UI 挂载请求 | 普通客户端降级为屏幕 UI |
| `InputApi` | 本地物品使用输入绑定 | `world.afterEvents.itemUse` |
| `CameraApi` | 有界相机请求事件 | 普通国际版无画面承诺，默认 degraded/no-op |
| `EntityApi` | 有界只读观察；运行时挂点为 experimental | `dimension.getEntities`（能力依赖）；挂点优先使用预声明 attachable |
| `StorageApi` | 模组命名空间本地存档 | 当前为内存兼容层，可接持久化扩展；退出可能丢失 |
| `CapabilityProbe` | 运行最小公开能力探测并生成报告 | `platform/international/adapter.js` + 公开 Script API；不猜版本、不访问私有内存 |

## API 示例

```js
api.model.register({
  id: "bedrockloom:loom_blade",
  geometry: "geometry.bedrockloom.loom_blade",
  texture: "textures/items/loom_blade",
  attachPoint: "right_hand"
});
api.material.register({
  id: "bedrockloom:loom_blade.default",
  texture: "textures/items/loom_blade",
  tint: [1, 1, 1, 1]
});
api.particle.allow("bedrockloom:loom_spark");
api.sound.allow("bedrockloom.loom_blade.swing");

api.input.bind({
  id: "loom_blade_use",
  key: "item_use",
  itemType: "bedrockloom:loom_blade",
  onPress: ({ player }) => {
    api.particle.emit({ player, effect: "bedrockloom:loom_spark", count: 1 });
    api.sound.play({ player, sound: "bedrockloom.loom_blade.swing", volume: 0.8 });
    api.animation.play({ target: player.id, clip: "bedrockloom:loom_blade_attack", blendMs: 80 }); // 返回 resource-controller-only 的降级状态
  }
});

const save = await api.storage.open("example.loom_blade", 1);
save.set("api_version", "1.1.0");

// 画面能力必须以报告为准；R2/R3 不因资源注册或函数返回值自动成立。
const capabilityProbe = new CapabilityProbe({ adapter: internationalAdapter });
const report = capabilityProbe.run();
console.log(report.results.filter((item) => item.status !== "unsupported"));
```

## 生命周期和释放

`createClientApi` 应在 `PRE_INIT` 创建，在 `INIT` 注册输入和资源，在 `SHUTDOWN` 调用 `api.dispose()`。`ClientEventBus` 的 `on` 和 `InputApi.bind` 都返回取消函数；模组卸载时必须调用，避免世界切换后重复触发。

## 权限边界

`model/material/animation/particle/sound/ui/camera/entity.attach` 默认只影响本地玩家可见表现；不能写方块、实体生命值、库存或世界随机种子。输入回调若要改变多人结果，必须发起权威服务端请求并由服务端验证。`storage` 是本地存档命名空间，带大小上限和迁移版本；服务端不能写入该命名空间。

所有客户端资源 ID 都必须先注册或加入白名单。粒子、音效、文本、距离、数量、动画混合时间和相机时长由 API 限制；非法输入返回 `false` 或抛出可诊断错误，不会执行任意脚本。涉及画面的调用应记录 `created`、`submitted`、`first_visible`、`stable_visible` 或 `degraded`，不能把 `true` 解释成稳定可见。详见 [渲染审查](RENDER_AUDIT.md)。

## 资源合并

资源以 `<namespace>/<kind>/<path>` 建立索引。优先级只解决显式声明的同命名空间替换；跨命名空间同路径视为错误。解析完成后生成不可变资源快照，运行时 API 只能引用快照 ID。
