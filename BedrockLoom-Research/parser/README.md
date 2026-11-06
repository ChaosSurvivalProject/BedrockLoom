# parser · 原创通用解析器骨架

> 本目录**不含任何游戏格式知识、真实偏移、私有符号或样本**。
> 目标：给作者本机的静态解析提供一个「只读、可拒绝、不输出样本内容」的通用骨架。

## 1. 设计要点

| 约束 | 落实 |
| --- | --- |
| 路径由环境变量传入 | 只认 `BLR_TARGET_DIR`，缺失返回 `denied`；不猜默认路径、不扫全盘 |
| 读偏移/头/块 | `headers.mjs` 的块表读取器**必须由调用方传入 descriptor**；仓库里只有合成 fixture 用的假 descriptor |
| 偏移不硬写 | 真实 descriptor 由作者在本机以环境变量/文件提供，**不进仓库** |
| 不附样本进仓库 | `layout.mjs` 只输出文件名/大小/SHA-256/扩展名分布；`strings.mjs` 只输出计数与长度直方图 |
| 未知格式 | 一律 `unsupported`，不伪造字段含义 |
| 资源上限 | `BLR_MAX_FILES`（默认 2000）、`BLR_MAX_BYTES`（默认 64 MiB），超出 `resource-exhausted` |
| 只读 | 不写回源目录、不联网、不解析图片/音频内容 |

## 2. 三个模块

| 文件 | 职责 |
| --- | --- |
| `headers.mjs` | 通用魔数分类、通用文件头读取、**参数化块表读取**（descriptor 外部传入） |
| `layout.mjs` | 目录树静态扫描（CLI 入口），输出元数据清单 |
| `strings.mjs` | 字符串表**统计**（计数 + 长度直方图），不返回任何字符串内容 |

## 3. 使用

```bash
# 只列元数据，不给路径就拒绝
BLR_TARGET_DIR=/path/on/authors/own/machine/extracted node parser/layout.mjs

# 可选上限
BLR_MAX_FILES=500 BLR_MAX_BYTES=33554432 BLR_TARGET_DIR=/path/... node parser/layout.mjs
```

块表 descriptor 的形态（**示例为合成假数据，不代表任何真实格式**）：

```json
{
  "endianness": "le",
  "entries": [
    { "name": "length", "offset": 0, "size": 4, "kind": "u32" },
    { "name": "count",  "offset": 4, "size": 4, "kind": "u32" }
  ]
}
```

`readBlockTable(buffer, descriptor)` 只返回每个字段的**数值与是否越界**，不返回原始字节、不解释字段含义。

## 4. 明确不做

- ❌ 不解析 `material.bin` 的结构、字段、版本表
- ❌ 不反汇编、不反编译、不输出源码或字符串内容
- ❌ 不推断「这个块是 PBR 材质 / 渲染通道」
- ❌ 不写任何真实符号、RVA、模块基址、pattern 字节
- ❌ 不生成改后文件

## 5. 层归属

C（可公开仓库层）。它读的是「任意目录」，不是「游戏」；把它用在游戏解包目录上是作者本机的行为，解析器本身不感知目标含义。

相关：[docs/01 门禁](../docs/01-local-path-gate.md) · [docs/03 结构假设](../docs/03-pack-layout-hypothesis.md)
