#include <bit>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
#include <rex/graphics/pipeline/shader/spirv.h>
#include <rex/string/buffer.h>

// Standalone probe. Reads rexglue DumpUcode output, never the original game directory.
int main(int argc, char** argv) {
  try {
    if (argc != 3 && argc != 4) throw std::runtime_error("Usage: xenos-to-spirv input.ucode.bin.vert|frag output.spv [--single-memory]");
    const bool single_memory = argc == 4 && std::string(argv[3]) == "--single-memory";
    if (argc == 4 && !single_memory) throw std::runtime_error("Unknown profile");
    std::filesystem::path input(argv[1]), output(argv[2]);
    if (std::filesystem::equivalent(input.parent_path(), output.parent_path()))
      throw std::runtime_error("Output must be in a separate existing directory");
    const auto ext = input.extension().string();
    if (ext != ".vert" && ext != ".frag") throw std::runtime_error("Unknown shader stage");
    auto bytes = std::filesystem::file_size(input);
    if (!bytes || bytes % 4 || bytes > 1024 * 1024) throw std::runtime_error("Invalid microcode size");
    std::vector<uint32_t> words(bytes / 4);
    std::ifstream stream(input, std::ios::binary);
    if (!stream.read(reinterpret_cast<char*>(words.data()), bytes)) throw std::runtime_error("Read failed");
    using namespace rex::graphics;
    // DumpUcode writes native host words; the native GH3 dump was made on Windows x64.
    SpirvShader shader(ext == ".vert" ? xenos::ShaderType::kVertex : xenos::ShaderType::kPixel,
                       0, words.data(), words.size(), std::endian::little);
    rex::string::StringBuffer disasm;
    shader.AnalyzeUcode(disasm);
    // Exact upload order, from the same analyzer used by the translator.
    std::cout << "constants=";
    bool separator = false;
    for (uint32_t i = 0; i < 256; ++i) {
      if (shader.constant_register_map().GetPackedFloatConstantIndex(i) == UINT32_MAX) continue;
      if (separator) std::cout << ',';
      std::cout << i;
      separator = true;
    }
    std::cout << '\n';
    // Raw dumps alone don't specify SQ_PROGRAM_CNTL for dynamic addressing.
    // Refuse to invent that draw state; report this as a missing input.
    if (shader.uses_register_dynamic_addressing())
      throw std::runtime_error("Missing draw state: SQ_PROGRAM_CNTL for dynamic registers");
    SpirvShaderTranslator::Features features(false);
    features.full_draw_index_uint32 = true;
    // Experimental WebGPU desktop profile: one storage binding for guest physical memory.
    // Requires maxStorageBufferBindingSize >=512 MiB; not a portable/mobile claim.
    if (single_memory) features.max_storage_buffer_range = 512 * 1024 * 1024;
    SpirvShaderTranslator translator(features, false, false, false);
    SpirvShaderTranslator::Modification mod(ext == ".vert" ?
        translator.GetDefaultVertexShaderModification(0) : translator.GetDefaultPixelShaderModification(0));
    // Baseline interface, not a claim of compatibility with the recorded draw pairs.
    if (ext == ".vert") mod.vertex.interpolator_mask = 0xFFFF;
    else mod.pixel.interpolator_mask = 0xFFFF;
    auto* translation = shader.GetOrCreateTranslation(mod.value);
    const bool success = translator.TranslateAnalyzedShader(*translation);
    for (const auto& error : translation->errors()) std::cerr << (error.is_fatal ? "fatal: " : "warning: ") << error.message << '\n';
    if (!success || !translation->is_valid()) throw std::runtime_error("Xenos to SPIR-V translation failed");
    const auto& binary = translation->translated_binary();
    if (binary.size() < 20) throw std::runtime_error("Empty or truncated SPIR-V");
    std::ofstream dest(output, std::ios::binary);
    if (!dest.write(reinterpret_cast<const char*>(binary.data()), binary.size())) throw std::runtime_error("Write failed");
    std::cout << "stage=" << ext << " bytes=" << binary.size() << " memexport="
              << unsigned(shader.memexport_eM_written()) << " modification=" << mod.value << '\n';
    return 0;
  } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
