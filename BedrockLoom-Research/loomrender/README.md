# loomrender · LoomRender 本机内核骨架

> **只有契约与状态，没有把帧写回游戏呈现链路的实现。**

## 1. 五个契约

| 方法 | 层 | 返回 | 说明 |
| --- | --- | --- | --- |
| `init()` | 平台侧 | `ok` | 建立 `skeleton-only` 对象；`attachedToGame=false`、`nativeModulesLoaded=false` |
| `attachCompositor(fn)` | 平台侧 | `ok` / `denied` | 挂载**外部合成器**回调；不加载原生扩展 |
| `submit(intent)` | 平台侧 | `ok` / `degraded` / `denied` / `resource-exhausted` | 接渲染意图纯数据 → 外部合成器算帧；`frameWrittenToGame` **恒 false** |
| `present()` | **A 本机私有** | **`unsupported`** | 帧回灌游戏交换链 —— **不实现** |
| `set_camera()` | **A 本机私有** | **`unsupported`** | FOV / near / far / 视锥 / 矩阵官方不可读，**不实现** |
| `push_texture()` | **A 本机私有** | **`unsupported`** | 运行时动态纹理替换主项目已判 `Unavailable`，**不实现** |

`dispose()` 幂等并强制回收全部 `ResourceHandle`；`stats()` 供脱敏诊断。

## 2. 链路切分

```
[B 游戏内合规]  RenderIntent 纯数据
      │
      ▼
[C 平台侧]  submit(intent) → 外部合成器（Canvas/WebGL/独立进程）算帧
      │            ✅ 这一半有骨架，合规、可测
      ▼
[A 本机私有]  present() → 写回游戏交换链
               ✖ 恒 unsupported，本仓库不实现
```

**「外部合成器算帧 → 回灌为 overlay 或动态纹理」中的「回灌」在本仓库停在桩。** 外部窗口/第二屏/透明 overlay 属于平台侧显示，不需要、也不应写回游戏进程。

## 3. 为什么 present 恒不支持（不是「还没做」）

1. 把帧写回商业游戏的呈现链路需要进程内介入，与硬边界「不绕过登录/签名/沙箱/反作弊」冲突。
2. 禁止项要求「给可编译骨架，**不给完整改包成品**」「禁止看起来能跑但越界的一键脚本」。
3. 门禁未命中本机包（[docs/01](../docs/01-local-path-gate.md)），没有真实目标时任何「能跑」的呈现代码都是编造。
4. 项目定调：「Hook Present / 改 material.bin → 不在 BedrockLoom 范围」。

A 层返回里强制带 `host-private` / `research-hypothesis` / `version-drift-risk` / `verification`。

## 4. 资源与错误隔离

- 意图体积上限 `256 KiB`、待处理帧上限 `64`，超出返回 `resource-exhausted`；
- 外部合成器抛错 → `degraded`，**隔离并回收句柄**，不影响内核与其他调用；
- 每次 `submit` 都创建可追踪 `ResourceHandle`，`dispose()` 强制回收；
- 无全局可变状态、无隐式加载顺序、无原生模块加载。

## 5. 层归属

`init` / `submit` / `attachCompositor` / `dispose` 属 C（可公开仓库层）；
`present` / `set_camera` / `push_texture` 是 A 层的**契约与桩**，可公开但不可实现。

相关：[docs/04 可观测面](../docs/04-observable-surface.md) · [bridge/README.md](../bridge/README.md)
