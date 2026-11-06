# BLSP/1 服务端表现协议

BLSP/1 是可选的多人表现通道，不是玩法同步协议。

## 协商

客户端发送 `{protocols:["blsp/1"], features:[...], limits:{requestsPerTick:16,maxDistance:64}}`，服务器回复允许的协议版本、表现类型和预算。没有回复、版本不兼容或服务器拒绝时，客户端继续使用纯本地功能。

## 请求结构

```json
{
  "protocol":"blsp/1",
  "server_id":"sha256:...",
  "request_id":"round-42-hit-0007",
  "expires_at":1730000000,
  "budget":{"ticks":10,"count":1},
  "kind":"particle",
  "payload":{"effect":"bedrockloom:loom_spark","position":[0,64,0],"count":4}
}
```

`request_id` 在本地缓存到过期；同一 ID 幂等。服务器不能指定任意资源路径，只能引用客户端已声明的白名单 ID。粒子、音效、UI、相机和动画请求都执行距离、字段、频率和权限检查。`camera_pulse` 的幅度不超过 1、时长不超过 40 tick，且普通国际版无原生相机 Hook 时只生成 `degraded/no-op` 结果，不得声称画面发生抖动。拒绝只影响该请求，不影响本地模组；服务器请求不会提升 R0/R1 到 R2/R3。

## 降级策略

- 不支持 BLSP：忽略远端表现，保留本地动画/粒子/音效/UI。
- 仅支持部分类型：按类型过滤，输出一次诊断。
- 预算不足：截断到预算，不补发、不排队跨 tick。
- 能力缺失：映射到更低能力（例如屏幕 toast 替代世界 UI），否则安全丢弃。
