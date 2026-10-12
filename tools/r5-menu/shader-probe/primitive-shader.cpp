#include <bit>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <vector>
#include <rex/graphics/pipeline/shader/spirv.h>
#include <rex/string/buffer.h>

// Isolated probe using the SDK's own primitive expansion, not a game runtime patch.
int main(int argc, char** argv) {
  try {
    if (argc != 4) throw std::runtime_error("Usage: primitive-shader input.vert output.spv vertex|rectangle|point");
    const std::string profile(argv[3]);
    using namespace rex::graphics;
    Shader::HostVertexShaderType host_type;
    if (profile == "vertex") host_type = Shader::HostVertexShaderType::kVertex;
    else if (profile == "rectangle") host_type = Shader::HostVertexShaderType::kRectangleListAsTriangleStrip;
    else if (profile == "point") host_type = Shader::HostVertexShaderType::kPointListAsTriangleStrip;
    else throw std::runtime_error("Unknown primitive profile");
    std::filesystem::path input(argv[1]), output(argv[2]);
    if (input.extension() != ".vert") throw std::runtime_error("Only vertex microcode accepted");
    if (std::filesystem::equivalent(input.parent_path(), output.parent_path())) throw std::runtime_error("Separate output directory required");
    auto bytes = std::filesystem::file_size(input);
    if (!bytes || bytes % 4 || bytes > 1024 * 1024) throw std::runtime_error("Invalid microcode size");
    std::vector<uint32_t> words(bytes / 4);
    std::ifstream stream(input, std::ios::binary);
    if (!stream.read(reinterpret_cast<char*>(words.data()), bytes)) throw std::runtime_error("Input read failed");
    SpirvShader shader(xenos::ShaderType::kVertex, 0, words.data(), words.size(), std::endian::little);
    rex::string::StringBuffer disasm;
    shader.AnalyzeUcode(disasm);
    if (shader.uses_register_dynamic_addressing()) throw std::runtime_error("SQ_PROGRAM_CNTL required for dynamic registers");
    SpirvShaderTranslator::Features features(false);
    features.full_draw_index_uint32 = true;
    features.max_storage_buffer_range = 512 * 1024 * 1024;
    SpirvShaderTranslator translator(features, false, false, false);
    SpirvShaderTranslator::Modification mod(translator.GetDefaultVertexShaderModification(0));
    mod.vertex.interpolator_mask = 0xFFFF;
    mod.vertex.host_vertex_shader_type = host_type;
    auto* translation = shader.GetOrCreateTranslation(mod.value);
    const bool success = translator.TranslateAnalyzedShader(*translation);
    for (const auto& error : translation->errors()) std::cerr << (error.is_fatal ? "fatal: " : "warning: ") << error.message << '\n';
    if (!success || !translation->is_valid()) throw std::runtime_error("Translation failed");
    const auto& binary = translation->translated_binary();
    if (binary.size() < 20) throw std::runtime_error("Empty SPIR-V");
    std::ofstream dest(output, std::ios::binary);
    if (!dest.write(reinterpret_cast<const char*>(binary.data()), binary.size())) throw std::runtime_error("Output write failed");
    std::cout << "profile=" << profile << " bytes=" << binary.size() << " memexport="
              << unsigned(shader.memexport_eM_written()) << " modification=" << mod.value << '\n';
    return 0;
  } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
