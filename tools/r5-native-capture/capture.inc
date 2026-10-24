// Optional, single-draw local diagnostic. Included only by the isolated build.
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <vector>
#include <rex/graphics/pipeline/texture/util.h>
namespace r5capture {
static const char* dir = std::getenv("GH3_R5_CAPTURE_DIR");
static bool taken = false, pending = false;
static const bool require_opaque = std::getenv("GH3_R5_REQUIRE_OPAQUE") != nullptr;
static const bool require_detail = std::getenv("GH3_R5_REQUIRE_DETAIL") != nullptr;
static size_t bytes = 0;
static uint32_t subsequent_draws = 0;
static constexpr size_t cap = 16 * 1024 * 1024;
static void note(const std::string& s) {
  if (!dir) return;
  std::ofstream(std::filesystem::path(dir) / "events.jsonl", std::ios::app) << s << '\n';
}
static bool save(const std::string& name, const void* p, size_t n) {
  if (!dir || !p || !n || n > cap - bytes) { note("{\"error\":\"dump_limit_or_null\"}"); return false; }
  std::ofstream f(std::filesystem::path(dir) / name, std::ios::binary);
  f.write(static_cast<const char*>(p), n);
  if (!f) { note("{\"error\":\"write_failed\"}"); return false; }
  bytes += n; return true;
}
static bool detailed(rex::memory::Memory* memory, const rex::graphics::RegisterFile& regs) {
  if (!require_detail && !require_opaque) return true;
  auto t=regs.GetTextureFetch(0);
  if (t.format != rex::graphics::xenos::TextureFormat::k_8 || t.tiled || t.stacked || t.mip_max_level) return false;
  uint32_t address=(t.base_address&0x1FFFF)<<12;
  size_t width=t.size_2d.width+1, height=t.size_2d.height+1;
  size_t pitch=((size_t(t.pitch)*32+255)/256)*256;
  size_t n=pitch*(height-1)+width;
  if (!width || !height || width>pitch || n>2*1024*1024 || n>0x20000000-address) return false;
  auto p=memory->TranslatePhysical(address);
  if (!p) return false;
  bool detail=false;
  for (size_t y=0;y<height && !detail;++y) for(size_t x=0;x<width;++x)
    if(p[y*pitch+x]!=p[0]) {detail=true;break;}
  if (require_detail && !detail) return false;
  if (require_opaque) {
    auto alpha=regs.GetTextureFetch(3);
    if(alpha.format!=t.format || alpha.tiled || alpha.stacked || alpha.mip_max_level ||
       alpha.endianness!=rex::graphics::xenos::Endian::kNone || alpha.size_2d.width!=t.size_2d.width ||
       alpha.size_2d.height!=t.size_2d.height || alpha.pitch!=t.pitch) return false;
    auto ap=memory->TranslatePhysical((alpha.base_address&0x1FFFF)<<12);
    if(!ap) return false;
    for(size_t y=0;y<height;++y) for(size_t x=0;x<width;++x) if(ap[y*pitch+x]!=255) return false;
  }
  return true;
}
static bool guest(rex::memory::Memory* memory, const std::string& name, uint32_t address, size_t length) {
  if (address >= 0x20000000 || length > 0x20000000 - address || length > cap - bytes) {
    note("{\"error\":\"guest_range\"}"); return false;
  }
  auto p = memory->TranslatePhysical(address);
  if (!p) return false;
  std::vector<uint8_t> copy(length);
  std::memcpy(copy.data(), p, length);
  bool stable = std::memcmp(copy.data(), p, length) == 0;
  note("{\"resource\":\"" + name + "\",\"address\":" + std::to_string(address) +
       ",\"length\":" + std::to_string(length) + ",\"immediateSecondReadEqual\":" + (stable ? "true}" : "false}"));
  return save(name, copy.data(), copy.size());
}
}
