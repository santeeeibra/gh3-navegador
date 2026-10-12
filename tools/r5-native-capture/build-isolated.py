from pathlib import Path
import json, hashlib, subprocess
root=Path(__file__).resolve().parents[2]
out=root/'artifacts/r5-native-capture'
sdk=root/'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090'
build=root/'artifacts/xex-adapt/paso-b/build/gh3'
src=sdk/'src/graphics/d3d12/command_processor.cpp'
s=src.read_text()
s=s.replace('namespace rex::graphics::d3d12 {', '#include "capture.inc"\n\nnamespace rex::graphics::d3d12 {',1)
entry='bool D3D12CommandProcessor::IssueDraw('
a=s.index(entry); b=s.index('  const RegisterFile& regs = *register_file_;', a)
s=s[:b]+r'''  if (r5capture::dir) {
    static uint32_t entered=0;
    if (entered++<4) r5capture::note("{\"issueDrawEntered\":true}");
  }
'''+s[b:]
anchor='  // Draw.\n'
hook=r'''  // One bounded snapshot immediately before this draw is recorded.
  if (r5capture::dir) {
    if (r5capture::pending) ++r5capture::subsequent_draws;
    if (!r5capture::taken && vertex_shader->ucode_data_hash() == 0x57F6448DAC5BEB74ULL &&
        pixel_shader && pixel_shader->ucode_data_hash() == 0xAB008EF1D1A8CB6DULL && r5capture::detailed(memory_, regs)) {
      r5capture::taken = true;
      r5capture::pending = true;
      r5capture::save("registers.bin", regs.values, sizeof(regs.values));
      r5capture::save("dxbc-system-constants.bin", &system_constants_, sizeof(system_constants_));
      r5capture::save("vs.ucode.bin", vertex_shader->ucode_data().data(), vertex_shader->ucode_data().size()*4);
      r5capture::save("ps.ucode.bin", pixel_shader->ucode_data().data(), pixel_shader->ucode_data().size()*4);
      r5capture::note("{\"draw\":true,\"vs\":\"57F6448DAC5BEB74\",\"ps\":\"AB008EF1D1A8CB6D\",\"guestPrimitive\":" +
        std::to_string(uint32_t(primitive_type)) + ",\"indexCount\":" + std::to_string(index_count) +
        ",\"hostTopology\":" + std::to_string(uint32_t(primitive_topology)) +
        ",\"hostVertexCount\":" + std::to_string(primitive_processing_result.host_draw_vertex_count) +
        ",\"hostIndexType\":" + std::to_string(uint32_t(primitive_processing_result.index_buffer_type)) + "}");
      for (uint32_t i=0; i<32; ++i) if (used_texture_mask & (1u<<i)) {
        auto t=regs.GetTextureFetch(i);
        r5capture::save("texture-fetch-"+std::to_string(i)+".bin", &t, sizeof(t));
        if (t.dimension != xenos::DataDimension::k2DOrStacked || t.tiled || t.stacked ||
            t.format != xenos::TextureFormat::k_8 || t.mip_max_level != 0) {
          r5capture::note("{\"error\":\"unsupported_texture\",\"slot\":"+std::to_string(i)+"}"); continue;
        }
        auto layout=texture_util::GetGuestTextureLayout(t.dimension, t.pitch, t.size_2d.width+1,
          t.size_2d.height+1, 1, t.tiled, t.format, t.packed_mips, t.base_address!=0, 0);
        r5capture::note("{\"texture\":"+std::to_string(i)+",\"width\":"+std::to_string(t.size_2d.width+1)+
          ",\"height\":"+std::to_string(t.size_2d.height+1)+",\"pitchBytes\":"+std::to_string(layout.base.row_pitch_bytes)+
          ",\"format\":"+std::to_string(uint32_t(t.format))+",\"endian\":"+std::to_string(uint32_t(t.endianness))+
          ",\"swizzle\":"+std::to_string(t.swizzle)+"}");
        r5capture::guest(memory_, "texture-"+std::to_string(i)+".bin", (t.base_address&0x1FFFF)<<12, layout.base.level_data_extent_bytes);
      }
      for (uint32_t i=0;i<96;++i) if (constant_map_vertex.vertex_fetch_bitmap[i/32] & (1u<<(i%32))) {
        auto v=regs.GetVertexFetch(i);
        r5capture::save("vertex-fetch-"+std::to_string(i)+".bin", &v, sizeof(v));
        r5capture::guest(memory_, "vertices-"+std::to_string(i)+".bin", (v.address<<2)&0x1FFFFFFF, size_t(v.size)*4);
      }
      if (index_buffer_info && index_buffer_info->length) {
        r5capture::note("{\"indexFormat\":"+std::to_string(uint32_t(index_buffer_info->format))+
          ",\"indexEndian\":"+std::to_string(uint32_t(index_buffer_info->endianness))+"}");
        r5capture::guest(memory_, "indices.bin", index_buffer_info->guest_base, index_buffer_info->length);
      }
    }
  }
'''
assert s.count(anchor)==1
s=s.replace(anchor,hook+anchor)
mode='  ReadbackResolveMode readback_mode = GetReadbackResolveMode(REXCVAR_GET(d3d12_readback_resolve));'
assert s.count(mode)==2
s=s.replace(mode,mode+'\n  if (r5capture::pending) readback_mode = ReadbackResolveMode::kFull;')
anchor='  rb.current_index = 1 - rb.current_index;'
ref=r'''  if (r5capture::pending && rb.mapped_data[read_index] && written_length <= rb.sizes[read_index]) {
    r5capture::save("native-resolve.bin", rb.mapped_data[read_index], written_length);
    r5capture::save("resolve-registers.bin", register_file_->values, sizeof(register_file_->values));
    r5capture::note("{\"reference\":true,\"address\":"+std::to_string(written_address)+
      ",\"length\":"+std::to_string(written_length)+",\"subsequentDraws\":"+std::to_string(r5capture::subsequent_draws)+
      ",\"readbackMode\":\"full\"}");
    r5capture::pending = false;
    std::ofstream(std::filesystem::path(r5capture::dir)/"complete.txt") << "GPU resolve captured; see events.jsonl for completeness";
  }
'''
assert s.count(anchor)==1
s=s.replace(anchor,ref+anchor)
(out/'src').mkdir(exist_ok=True)
(out/'src/command_processor.cpp').write_text(s)
(out/'src/capture.inc').write_bytes((root/'tools/r5-native-capture/capture.inc').read_bytes())
entries=json.loads((out/'compile-database.json').read_text())
e=next(e for e in entries if e['file'].replace('\\','/').endswith('/src/graphics/d3d12/command_processor.cpp'))
obj=str(out/'capture.obj').replace('\\','/')
command=e['command'].replace(e['output'],'"'+obj+'"').replace(e['file'],'"'+str(out/'src/command_processor.cpp').replace('\\','/')+'"')
command=command.replace('\"\"D:/guitar hero/artifacts/r5-native-capture/src/command_processor.cpp\"\"', '\"D:/guitar hero/artifacts/r5-native-capture/src/command_processor.cpp\"')
import re
command=re.sub(r'-MF \S+', '-MF \"'+str(out/'capture.d').replace('\\','/')+'\"', command)
command+=' -I\"'+str(sdk/'src/graphics/d3d12').replace('\\','/')+'\"'
lines=(out/'build-commands.txt').read_text().splitlines()
link=lines[-1]
for name in ('rexgpu-xenos.dll','rexgpu-xenos.lib','rexgpu-xenos.pdb'):
    link=link.replace(str(sdk/'out/win-amd64'/name),str(out/name))
    link=link.replace(' -o '+name+' ', ' -o \"'+str(out/name)+'\" ')
    link=link.replace('/implib:'+name, '/implib:\"'+str(out/name)+'\"')
    link=link.replace('/pdb:'+name, '/pdb:\"'+str(out/name)+'\"')
link=link.replace('rexglue-sdk/src/graphics/CMakeFiles/rexgpu-xenos.dir/d3d12/command_processor.cpp.obj','"'+obj+'"')
vc=r'D:\Archivos de programa\ProductoVisualStudio2026\VC\Auxiliary\Build\vcvars64.bat'
bat='@echo off\nset \"PATH='+str(root/'artifacts/xex-adapt/paso-b/toolbin')+';%PATH%\"\ncall "'+vc+'" >nul\ncd /d "'+str(build)+'"\n'+command+'\nif errorlevel 1 exit /b 1\n'+link+'\nif errorlevel 1 exit /b 1\n'
(out/'build-isolated.cmd').write_text(bat)
(out/'baseline-source.json').write_text(json.dumps({'source':str(src),'sha256':hashlib.sha256(src.read_bytes()).hexdigest()},indent=2))
print(command)
