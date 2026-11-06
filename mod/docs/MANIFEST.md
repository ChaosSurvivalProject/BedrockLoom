# Bedrock Loom Manifest 规范

平台 manifest 与原生行为包/资源包 manifest 分开：原生 manifest 负责让 Minecraft 识别包，平台 manifest 负责发现、依赖、资源、权限和协议元数据。

```json
{
  "schema": "bedrockloom.mod/v1",
  "id": "example.loom_blade",
  "name": "Loom Blade Example",
  "version": "1.1.0",
  "loader": {"id": "bedrockloom", "range": ">=1.0.0 <2.0.0"},
  "entrypoints": {"client": "scripts/main.js"},
  "dependencies": {"bedrockloom": ">=1.0.0", "optional.visual_fx": "^1.2.0"},
  "resources": {"namespace": "bedrockloom", "roots": ["resource_pack", "behavior_pack"]},
  "permissions": ["presentation.local", "storage.world:example.loom_blade", "input.local", "entity.attach.local"],
  "api": {"version": "1.1", "classes": ["ClientEventBus", "PermissionGate", "ModelApi", "MaterialApi", "AnimationApi", "ParticleApi", "SoundApi", "ScreenUiApi", "WorldUiApi", "InputApi", "CameraApi", "EntityApi", "StorageApi", "CapabilityProbe"]},
  "render": {"target": "R0", "international": "R1-candidate", "netease": "platform-dependent", "custom": "R2-R3-by-authorization"},
  "protocol": {"accept": ["blsp/1"], "server_requests": ["particle", "sound", "animation", "ui_notice", "camera_pulse"]},
  "features": {"netease": false}
}
```

## 约束

- `id` 由小写字母、数字、点、下划线和连字符组成，必须全局唯一。
- 版本使用 SemVer；依赖范围不满足时模组不加载，`optional` 依赖缺失只生成诊断。
- `resources.namespace` 必须与资源路径第一段一致，禁止跨命名空间覆盖。
- 权限按最小能力声明；`presentation.local` 不包含世界权威写入。
- 服务器协议必须同时声明接受版本和请求类型；未声明的请求类型永远丢弃。
- `replace` 只能由宿主安装器处理，运行时不能覆盖其他模组文件。
