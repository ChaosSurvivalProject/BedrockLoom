// IHookProbe.hpp —— 研究桩：纯抽象接口（原创，中文注释）
//
// 本头文件**可编译但不做任何事**：可用 `g++ -std=c++17 -fsyntax-only IHookProbe.hpp` 检查。
// 刻意不含：
//   - 任何游戏模块名、函数名、RVA、模块基址、vtable 索引、pattern/签名扫描字节；
//   - 任何 detour / trampoline / 函数指针替换 / 内存补丁；
//   - 任何进程附加、DLL 注入、远程线程、apk/so 修改。
//
// 存在的唯一目的：给「可观测点」一个可编译的*契约形状*，并让默认实现
// 恒返回 Unsupported，从而保证本仓库不提供任何可用的注入成品。
//
// 层：A（本机私有）的契约；标记：host-private / research-hypothesis / version-drift-risk。

#pragma once

#include <cstdint>
#include <string_view>

namespace bedrockloom_research {

// 七态结果，与主项目 core/result.mjs 的语义一致（跨语言同构，不共享实现）。
enum class ProbeStatus : std::uint8_t {
  Ok = 0,
  Partial,
  Unsupported,
  Denied,
  Timeout,
  ResourceExhausted,
  Degraded
};

// 抽象帧信息：只有平台侧序号与单调时钟，不含任何地址、句柄或私有指针。
struct ProbeFrameInfo {
  std::uint64_t frameIndex;   // 抽象帧序号
  std::uint64_t timestampNs;  // 平台侧单调时钟，不是游戏内时间
};

// 纯抽象观测接口。pointId 只是候选表里的抽象 ID（例如 "H-PRESENT-01"），
// 不是符号名，也不映射到任何真实地址。
class IHookProbe {
 public:
  virtual ~IHookProbe() = default;

  // 注册/注销观测点。研究桩恒返回 Unsupported。
  virtual ProbeStatus attach(std::string_view pointId) = 0;
  virtual ProbeStatus detach(std::string_view pointId) = 0;

  // 帧回调占位。研究桩不产生任何像素、不写回任何交换链。
  virtual ProbeStatus onFrame(const ProbeFrameInfo& info) = 0;
};

// 空实现：所有操作都明确不支持。这是本仓库唯一提供的实现。
class NullProbe final : public IHookProbe {
 public:
  ProbeStatus attach(std::string_view /*pointId*/) override {
    return ProbeStatus::Unsupported;
  }
  ProbeStatus detach(std::string_view /*pointId*/) override {
    return ProbeStatus::Unsupported;
  }
  ProbeStatus onFrame(const ProbeFrameInfo& /*info*/) override {
    return ProbeStatus::Unsupported;
  }
};

// 显式声明：本仓库不提供「可写回游戏呈现链路」的接口。
// 若将来作者在本机做私有研究，应另建不入库的本地工程，不得把实现合入本仓库。
static_assert(static_cast<std::uint8_t>(ProbeStatus::Unsupported) == 2,
              "七态枚举顺序与主项目语义保持一致");

}  // namespace bedrockloom_research
