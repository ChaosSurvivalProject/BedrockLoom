# ingame · 游戏内合规层 BP 骨架

> 本目录是**自包含**的行为包脚本骨架：不 import 任何 `node:*`、不依赖仓库其他目录、不含游戏资产、不含注入实现。
> 它**没有在任何真机加载过**，是骨架而非可导入成品。

## 1. 设计：host 注入 + 能力探测

游戏内不直接 `import "@minecraft/server"`。所有公开 API 通过 `createLoom(host)` 的 `host` 适配器注入：

```js
// 作者本机 BP 里（不进本仓库）提供绑定
const host = {
  getPlayerView: () => /* @minecraft/server 公开调用 */,
  setActionBar: (text) => /* ScreenDisplay.setActionBar */,
  setRayleighStrength: (v) => /* @minecraft/server-graphics 大气散射参数 */,
  ...
};
const loom = createLoom(host);
```

好处：

- **能力探测，不靠版本号盲猜**：`probe` 逐项检查 `host` 是否真的提供了绑定，缺失即 `unsupported`；
- 骨架可在 Node 里用 stub host 做自动化测试，不需要真机；
- 不把任何具体模块版本硬写进可分发代码（主项目已将 `@minecraft/server` 确切版本标为「未验证」）。

## 2. 三个命名空间

| 命名空间 | 文件 | 合规封装 | 明确不可用 |
| --- | --- | --- | --- |
| `loom.render.*` | `api-render.js` | `hud()`、`submitParticle()`、`submitSound()`、`setAtmospherics()`、`camera()` | 自定义 shader、后处理、RenderLayer、几何写入、相机矩阵、动态纹理推送 |
| `loom.world.*` | `api-world.js` | `playerView()`、`entities(filter)`、`sampleChunk(x,z)`、`config()` | FOV/near/far/视锥/包围盒读取；把客户端结果当多人权威操作 |
| `loom.assets.*` | `api-assets.js` | 受控 `ResourceHandle` 绑定/读取/释放 | 任意文件系统访问、运行时替换已提交纹理 |

`loom.runtime` 是移植进来的模块注册 / 生命周期 / 事件总线合规骨架（[docs/06](../docs/06-port-mapping.md)）。
`loom.bridge` 是协议常量与**否定声明**。

## 3. 关键硬事实（不倒退）

1. **基岩版客户端 Script API 没有 WebSocket / 文件写入能力**。「游戏内脚本直连 `ws://127.0.0.1`」不成立，见 `ws-bridge-protocol.js` 的 `BRIDGE_CONTRACT.directWebSocketFromScriptApi = false`。
2. `camera()` 的 `fovDegrees / near / far / frustum / bounds` **恒为 `null`**；伪造值返回 `denied`（沿用主项目 `render-intent` 采集器结论）。
3. `submitParticle` / `playSound` / `setActionBar` 是**提交请求**，不是控制渲染管线；`ok` 不等于画面可见。
4. `setAtmospherics()` 仅限 1.21.130 新增的 Vibrant Visuals 大气散射 set/reset 参数，**不是**自定义 shader、帧缓冲或后处理 pass。
5. 所有跨进程桥接方案标注「**未经真机验证**」。

## 4. manifest 说明

`manifest.json` 是骨架：`uuid` 为占位值、`@minecraft/server*` 模块依赖版本**故意留空**，需作者本机按已安装版本补全。本仓库不猜测版本、不生成可直接导入的改后包。

## 5. 层归属与禁止项

B（游戏内合规层）。**严禁**在本目录出现：

- 任何 `node:*` / `fs` / `crypto` / 网络模块；
- 任何私有符号、偏移、模块基址、Hook、注入；
- 任何「直接控制 RenderDragon」的接口名（只作为 `unsupported` 字符串常量列出，不是可调用函数）；
- 任何游戏提取资源或改后文件。

`test/boundaries.test.mjs` 会对以上做静态扫描断言。

## 6. 相关

- [bridge/README.md](../bridge/README.md) · [docs/06 移植映射](../docs/06-port-mapping.md) · [docs/07 研究笔记](../docs/07-research-notes.md)
