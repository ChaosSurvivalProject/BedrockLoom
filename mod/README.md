# Bedrock Loom

面向 Minecraft 基岩版 1.21 的开源客户端模组平台设计与最小示例。当前 API 版本为 1.1，提供 13 个可组合客户端 API 类，优先保障单人本地视觉表现。

> **渲染边界声明**：普通国际版实现目前只覆盖 R0 内容表达，以及少量由公开 Script API 提交的 R1 候选路径；没有自定义 Shader、帧缓冲、顶点缓冲、渲染层或原生渲染 Hook。资源显示不等于获得渲染管线控制权。所有能力以本机 [CapabilityProbe](docs/CAPABILITY_PROBE.md) 报告和 [渲染审查](docs/RENDER_AUDIT.md) 为准。

## 快速验证

1. 将行为包和资源包导入基岩版 1.21，并在世界设置中同时启用。
2. 创建单人世界，在创造菜单取得 `bedrockloom:loom_blade`。
3. 手持它观察自定义模型、待机摆动、使用/攻击动画、粒子、音效和本地 HUD。
4. 关闭所有服务器连接重新进入单人世界；示例不依赖外部服务器。

架构、manifest、API、协议、适配器和降级矩阵见 [docs/PLATFORM.md](docs/PLATFORM.md)。

- [Manifest 规范](docs/MANIFEST.md)
- [统一 API 与客户端类](docs/API.md)
- [BLSP/1 协议](docs/PROTOCOL.md)
- [示例平台 Manifest](examples/mod.manifest.json)
- [能力降级矩阵](docs/CAPABILITY_MATRIX.md)
- [渲染审查结论](docs/RENDER_AUDIT.md)
- [渲染路径台账](docs/RENDER_PATH_LEDGER.md)
- [CapabilityProbe 与报告 Schema](docs/CAPABILITY_PROBE.md)
- [八个标准探针场景](docs/PROBE_SCENARIOS.md)
- [渲染诊断、预算与合入门槛](docs/RENDER_OPERATIONS.md)
- [Render Extension SPI v0](docs/RENDER_SPI.md)
- [国际版适配器](platform/international/adapter.js)
- [网易预留适配器](platform/netease/adapter.js)
