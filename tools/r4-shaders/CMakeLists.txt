cmake_minimum_required(VERSION 3.24)
set(CMAKE_C_FLAGS_INIT "--ld-path=\"${CMAKE_CURRENT_LIST_DIR}/../../artifacts/xex-adapt/paso-b/toolbin/lld-link.exe\"")
set(CMAKE_CXX_FLAGS_INIT "${CMAKE_C_FLAGS_INIT}")
project(r4_shader_probe LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY MultiThreadedDLL)
set(REX_SDK "${CMAKE_CURRENT_LIST_DIR}/../../artifacts/xex-adapt/paso-b/src/rexglue-sdk-090" CACHE PATH "Existing rexglue SDK checkout; read only")
set(SDK_LIB "${REX_SDK}/out/win-amd64")
set(BUILD_EXTERNAL OFF CACHE BOOL "" FORCE)
set(ENABLE_GLSLANG_BINARIES OFF CACHE BOOL "" FORCE)
set(ENABLE_SPVREMAPPER OFF CACHE BOOL "" FORCE)
set(ENABLE_OPT OFF CACHE BOOL "" FORCE)
set(SKIP_GLSLANG_INSTALL ON CACHE BOOL "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)
add_subdirectory("${REX_SDK}/thirdparty/glslang" glslang EXCLUDE_FROM_ALL)
set(SH "${REX_SDK}/src/graphics/pipeline/shader")
add_executable(xenos-to-spirv xenos-to-spirv.cpp
  msaa-constants.cpp "${REX_SDK}/src/graphics/flags.cpp" "${REX_SDK}/src/graphics/format/ucode.cpp"
  "${SH}/shader.cpp" "${SH}/translator.cpp" "${SH}/translator_disasm.cpp"
  "${SH}/spirv.cpp" "${SH}/spirv_builder.cpp" "${SH}/spirv_translator.cpp"
  "${SH}/spirv_translator_alu.cpp" "${SH}/spirv_translator_fetch.cpp"
  "${SH}/spirv_translator_memexport.cpp" "${SH}/spirv_translator_rb.cpp")
target_compile_definitions(xenos-to-spirv PRIVATE REXGLUE_BUILD_CONFIG="Release" NOMINMAX WIN32_LEAN_AND_MEAN)
target_include_directories(xenos-to-spirv PRIVATE "${REX_SDK}/include" "${REX_SDK}/thirdparty/glslang"
  "${REX_SDK}/thirdparty/vulkan-headers/include" "${REX_SDK}/thirdparty/volk"
  "${REX_SDK}/thirdparty/fmt/include" "${REX_SDK}/thirdparty/spdlog/include"
  "${REX_SDK}/thirdparty/xxHash" "${REX_SDK}/thirdparty/simde" "${REX_SDK}/thirdparty/utfcpp/source" "${REX_SDK}/thirdparty/tomlplusplus/include" "${REX_SDK}/thirdparty/renderdoc")
target_link_libraries(xenos-to-spirv PRIVATE SPIRV "${SDK_LIB}/rexruntime.lib" "${SDK_LIB}/fmt.lib" "${SDK_LIB}/xxhash.lib")
add_custom_command(TARGET xenos-to-spirv POST_BUILD COMMAND ${CMAKE_COMMAND} -E copy_if_different
  "${SDK_LIB}/rexruntime.dll" "$<TARGET_FILE_DIR:xenos-to-spirv>")





