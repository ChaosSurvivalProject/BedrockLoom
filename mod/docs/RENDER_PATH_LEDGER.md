# 渲染路径台账（v1 冻结草案）

字段缩写：`native` 原生公开支持；`composed` 组合模拟；`approx` 近似；`no` 当前不可实现。国际版结论基于普通附加包/Script API，不把资源显示误记为管线控制。

| 路径 | 公开 API | 国际版等级/结论 | 数据链路与每帧更新者 | 最小实验 / 自动断言 | 失败与回退 | 开销/风险/证据 |
|---|---|---|---|---|---|---|
| 模型实例 | `ModelApi.register` | R0，composed | geometry + attachable -> 游戏渲染器；游戏更新 | 手持标准模型；资源索引、可见截图 | 缺失 -> 原版物品；不承诺 runtime instance | 资源内存/中/待验证 |
| 骨骼挂点 | `EntityApi.attach`、资源 attachable | R0，experimental | 预设 attachable 跟随实体；游戏更新骨骼 | 右手随走转身；位置误差 <= 1 格 | 退回资源预设或玩家中心 | 低至中/高/仅文档 |
| 运行时换装 | `ModelApi` + 变体资源 | R0，experimental | 状态 -> 预声明 controller/attachable | 两状态切换，连续 30 tick | 保留默认皮肤 | 资源切换/高/待验证 |
| 材质覆盖 | `MaterialApi` | R0，资源层 | 资源定义 -> attachable material | tint/纹理变体资源加载 | 默认材质 | 纹理内存/高/仅文档 |
| 动态纹理 | 未冻结 | no | 无公开纹理上传句柄 | 负向探针不触发私有接口 | 预打包纹理 | 无/高/已否定 |
| 顶点/几何更新 | 未冻结 | no | 无公开顶点缓冲提交 | 负向探针 | 预生成 geometry | 无/高/已否定 |
| 骨骼程序化控制 | `AnimationApi.play` 仅描述 | experimental | controller/Molang 预设；游戏更新 | 固定 clip 时间线 | 静态/预设动画 | 每帧脚本成本/高/待验证 |
| 动画混合 | `AnimationApi.play` | R0/R1 候选 | 资源 controller；不保证脚本混合 | 攻击状态黄金图 | 单 clip | 资源解析/中/待验证 |
| 粒子实例 | `ParticleApi.emit` | R1 候选 | 脚本 -> `spawnParticle` -> 游戏粒子 | 近中远三点，数量断言 | 无粒子 | 生成率/中/待验证 |
| 自定义粒子参数 | `ParticleApi.emit` 有限字段 | R1 degraded | 只能选择模板，字段由资源固定 | 模板参数变化 | 预设模板 | 中/中/仅文档 |
| 屏幕粒子 | 无稳定 API | no/experimental | 无通用 screen-space emitter | 负向探针 | action bar | 无/高/已否定 |
| 空间音效同步特效 | `SoundApi` | 非渲染 R1 | tick/事件 -> playSound | 事件与粒子同 tick | 无音效 | 音频预算/低/待验证 |
| 世界文本 | `WorldUiApi` | no | 无公开通用世界文本绘制 | 负向探针 | action bar | 无/高/已否定 |
| billboard | 无稳定 API | composed/experimental | 资源实体近似；游戏朝向 | 固定相机三角 | 屏幕提示 | 对象数/高/待验证 |
| 轨迹 | `TrailComponent` 未实现 | composed/experimental | 脚本按 tick 产生有限粒子点 | 运动实体 60 tick | 少量粒子/关闭 | 每 tick 调用/高/待验证 |
| 贴花 | 无稳定 API | no | 无深度贴花提交 | 负向探针 | 预制方块/粒子 | 无/高/已否定 |
| 描边/高亮 | 无稳定 API | no/approx | 资源层状态或粒子近似 | 墙前后遮挡场景 | 标记粒子 | 无/高/已否定 |
| 范围面/路径线 | 无稳定 API | composed/experimental | 粒子、预置几何或方块标记 | 100 点预算场景 | action bar/关闭 | 更新和对象数/高/待验证 |
| 方块预览 | 资源/实体组合 | composed/experimental | 预声明 ghost 模型；脚本位置 | 方块网格场景 | 文本坐标 | 中/高/待验证 |
| 光照/阴影 | 无覆盖 API | no | 游戏光照器拥有控制权 | 负向探针 | 不改变光照 | 无/高/已否定 |
| 雾 | 无覆盖 API | no | 游戏环境设置 | 负向探针 | 资源预设 | 无/高/已否定 |
| 相机偏移/抖动 | `CameraApi.pulse` 事件 | no；事件不等于画面 | API -> 本地事件；无官方相机提交 | 断言“无画面承诺” | no-op | 低/高/仅代码 |
| FOV | 无稳定 API | no | 无公开 FOV Hook | 负向探针 | 资源/说明 | 无/高/已否定 |
| 闪白/晕影/色差/模糊/景深 | 无稳定 API | no/approx | 可用 UI 贴图仅是近似 | 固定屏幕遮罩（若官方 UI 允许） | 关闭 | UI 开销/高/待验证 |
| 色彩分级 | 无 Shader API | no | 无 LUT/后处理提交 | 负向探针 | 预处理纹理 | 无/高/已否定 |
| 自定义 Shader | 未冻结 | no，R3 | 无公开扩展 | 负向探针 + 仓库扫描 | 预打包材质 | 无/极高/已否定 |
| 遮挡/透明排序 | 无控制 API | no | 游戏深度/排序器 | 红绿蓝三层人工/黄金测试 | 不透明预设 | 不可控/高/待验证 |
| 渲染层 | 无注册 API | no | 游戏固定层 | 负向探针 | 资源预设 | 无/高/已否定 |
| 屏幕 UI | `ScreenUiApi.toast` | R1 候选 | `setActionBar` -> 游戏布局绘制 | 文本、DPI、焦点 | 无 UI | 低/中/待验证 |
| 世界空间 UI | `WorldUiApi.mount` | no | 当前显式 false | 必须断言 `not-supported` | action bar | 无/高/已验证（代码） |
| 光标/输入命中 | `InputApi` 物品事件 | R1 候选 | 官方 itemUse 事件 | 焦点、重复事件 | 默认物品事件 | 低/中/待验证 |

**台账纪律：**每项必须附 `evidence`、`fallback`、`disposal`、`validUntil`。没有最小实验和验收证据的项只能是 `pending`，不能进入稳定能力矩阵。
