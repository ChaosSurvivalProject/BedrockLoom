# Bedrock Loom：基岩版客户端模组平台

Bedrock Loom 是面向 Minecraft 基岩版 1.21 的开源客户端模组平台设计。它不假设存在 Java/Fabric/Forge 式原生渲染 Hook，第一实现形态使用官方附加包、Script API、客户端实体、Molang、动画控制器、粒子、音效和 UI 组合完成本地表现。

## 目标与边界

- **单人优先**：行为包脚本在单人世界本地运行；关闭服务器连接后，模组仍可初始化、合并资源并提供视觉表现。
- **多人可选**：连接服务器时先做能力协商；服务端只能请求有界的客户端表现，不能获得任意脚本或渲染执行权。
- **权威分层**：模型、材质、动画、粒子、音效、UI、相机和挂点属于本地视觉层；改变多人世界结果的玩法必须交给权威服务端验证。
- **国际版适配器**：`platform/international` 是 1.21 的主实现面；网易版只实现同一接口的空实现和特性开关，不引入网易 SDK。

## 运行时分层

```text
Bedrock Loom Runtime
├── bootstrap       读取 manifest，创建生命周期上下文
├── resolver        依赖解析、版本范围、冲突检测、拓扑排序
├── resources       命名空间资源合并、覆盖策略、校验与诊断
├── capability      国际版/网易版能力探测与降级
├── presentation    统一客户端表现 API（本地权限边界）
├── protocol        可选 BLSP/1 协议：协商、幂等、有界指令、安全降级
└── storage         世界维度的本地存档命名空间与迁移
```

普通国际版加载项不能动态注入任意新的渲染管线，因此平台的资源合并发生在安装/打包阶段，运行时只读取已声明的资源。当前实现最多影响渲染数据和少量公开运行时对象请求，不拥有 R2/R3 管线控制。未来获得正式授权的定制客户端可实现 [Render Extension SPI v0](RENDER_SPI.md)，但上层 API 仍必须通过能力探测和降级；“上层 API 不变”不代表每个平台的画面结果相同。

## 生命周期

1. `DISCOVER`：扫描 `bedrock_loom/mods/<id>/manifest.json`。
2. `RESOLVE`：校验 ID、版本、依赖、可选依赖和加载器范围。
3. `MERGE_RESOURCES`：按命名空间合并资源；同路径冲突必须由 manifest 的 `replace` 或优先级明确解决。
4. `CAPABILITIES`：检测 Script API、客户端 UI、粒子、声音、动画控制器、协议版本等能力。
5. `PRE_INIT`：创建只读能力快照与存档句柄；禁止世界副作用。
6. `INIT`：注册表现资源、输入绑定、UI 页面和协议处理器。
7. `WORLD_READY`：绑定当前世界；单人模式直接启用本地表现，多人模式等待协商。
8. `TICK`：只执行预算内的本地任务和已授权表现指令。
9. `WORLD_STOP`：保存命名空间数据，取消定时器和订阅。
10. `SHUTDOWN`：释放资源并写诊断摘要。

任何阶段失败都必须隔离失败模组，保留其他模组和纯本地功能；不得因为服务端不兼容而卸载本地资源。

## 最小目录约定

```text
mod.json                         # 平台 manifest
behavior_pack/scripts/           # 本地生命周期与玩法桥接
resource_pack/attachables/       # 手持模型/材质绑定
resource_pack/models/             # geometry.json
resource_pack/animations/        # 动画
resource_pack/animation_controllers/
resource_pack/ui/                 # world-space/screen UI 组合
platform/international/           # 国际版适配器
platform/netease/                 # 空实现与特性开关
```

## 安全模型

BLSP（Bedrock Loom Sync Protocol）只允许 `particle`、`sound`、`ui_notice`、`camera_pulse`、`animation` 五类表现请求。每条消息包含 `protocol`、`server_id`、`request_id`、`expires_at`、`budget`、`kind` 和有界 payload。客户端检查：来源、协议版本、过期时间、请求 ID 去重、单 tick 数量、距离、粒子/音效白名单和本地玩家权限。未知类型、越界字段、预算耗尽或能力缺失都安全丢弃并记录诊断。

服务端永远不能：运行客户端脚本、写入本地存档、发起任意 UI、改变客户端资源、授予玩法权限或绕过玩家设置。

## 验证场景

启用本示例后进入单人世界，在创造菜单取得 `bedrockloom:loom_blade`。它拥有自定义手持 attachable、待机和攻击动画、攻击粒子、音效及右侧本地 HUD 卡片。断开所有服务器连接后重复进入单人世界，表现不依赖任何服务器。
