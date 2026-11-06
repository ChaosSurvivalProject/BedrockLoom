# Render Extension SPI v0（定制客户端授权草案）

这是定制客户端所有者提供的授权边界草案，不是普通国际版实现，不绑定具体引擎，也不允许裸指针。

## 能力与版本

```c
#define BL_RENDER_SPI_V0 "bedrockloom.render/0"
typedef struct { uint32_t major, minor; const char *client_build; } bl_render_abi;
typedef enum { BL_STAGE_BEGIN_FRAME, BL_STAGE_WORLD, BL_STAGE_UI, BL_STAGE_POST, BL_STAGE_END_FRAME } bl_frame_stage;
typedef enum { BL_CAP_GEOMETRY=1, BL_CAP_MATERIAL=2, BL_CAP_SHADER=4, BL_CAP_CAMERA=8, BL_CAP_POST=16 } bl_render_cap;
typedef struct { uint64_t token; uint32_t generation; } bl_handle;
typedef struct { const void *bytes; uint32_t size; const char *mime; } bl_blob_view;
typedef struct { uint32_t size; uint32_t alignment; uint32_t flags; } bl_buffer_desc;
typedef struct { int (*retain)(bl_handle); int (*release)(bl_handle); } bl_resource_lifetime;
typedef struct { uint32_t size; bl_frame_stage stage; uint64_t frame_id; } bl_frame_context;
typedef int (*bl_frame_callback)(const bl_frame_context *, void *user);
```

实际 ABI 必须由定制客户端签发的头文件、符号版本和签名清单确定。上面不暴露设备指针、引擎对象、地址、命令列表裸句柄或任意内存读写。

## 生命周期与沙箱

1. 宿主先验证签名、哈希、客户端构建、ABI 和能力许可。
2. 适配器在受限 worker/进程初始化，登记资源句柄和预算。
3. 每帧只获得明确阶段的只读 `bl_frame_context`；写入必须通过宿主提供的验证命令编码器。
4. Shader、材质、几何和后处理均为声明式对象，限制字节数、线程、GPU 时间和资源来源。
5. 插件异常、超时、预算超限或 ABI 不符立即撤销本帧并回退 R0/R1；崩溃由宿主隔离并可禁用适配器。
6. 卸载采用 generation + 引用计数，世界切换和设备重建时全部句柄失效并通知适配器。

## 最低安全要求

- 不允许任意指针、裸内存、动态加载可写目录库或自动执行未签名库。
- 许可必须可撤销，用户能看到来源、签名、哈希、版本、权限和已加载时间。
- 资源、Shader 和命令有 schema 验证、大小上限、超时、GPU/CPU 预算。
- API 版本化且向后兼容；不把国际版或网易 SDK 类型暴露到上层。
- 失败回退必须维持游戏可运行，禁止插件错误拖垮宿主。
