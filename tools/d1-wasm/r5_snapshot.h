// R5snap: productor DIAGNÓSTICO de snapshots de draws para el backend WebGPU (contrato v1:
// artifacts/r5-runtime-claude/CONTRATO-SNAPSHOT-V1.md). Apagado por defecto. Solo con
// G1_R5SNAP=1 + G1_CP_ASYNC=1 (página: ?r5snap=1&cpasync=1). Todo corre en el hilo del CP.
#pragma once
#include <cstddef>
#include <cstdint>
#include <rex/graphics/command_processor.h>

namespace r5snap {

// Layout binario v1 (little-endian host; offsets relativos al inicio del slot).
struct HeaderV1 {
  uint32_t magic;               // 0   0x31533552 "R5S1"
  uint16_t version;             // 4   1
  uint16_t header_bytes;        // 6   192
  uint32_t used_bytes;          // 8
  uint32_t status;              // 12  0 ok, 1 unsupported
  uint32_t reason;              // 16
  uint32_t slot_index;          // 20
  uint64_t event_seq;           // 24
  uint32_t draw_index;          // 32
  uint32_t swap_index;          // 36
  uint32_t skipped_since_prev;  // 40
  uint32_t vgt_draw_initiator;  // 44
  uint32_t prim_type;           // 48
  uint32_t index_count;         // 52
  uint32_t major_mode_explicit; // 56
  uint32_t index_source;        // 60  0 auto, 1 dma
  uint32_t index_format;        // 64  0 = 16 bits, 1 = 32 bits
  uint32_t index_endian;        // 68
  uint32_t index_phys;          // 72
  uint32_t index_bytes;         // 76
  uint32_t index_offset;        // 80
  uint32_t regs_offset;         // 84
  uint32_t regs_dwords;         // 88
  uint32_t vs_ucode_offset;     // 92
  uint32_t vs_ucode_dwords;     // 96
  uint32_t ps_ucode_offset;     // 100
  uint32_t ps_ucode_dwords;     // 104
  uint32_t vfetch_count;        // 108
  uint64_t vs_hash;             // 112
  uint64_t ps_hash;             // 120
  uint64_t index_hash;          // 128
  uint32_t vfetch_table_offset; // 136
  uint32_t tfetch_count;        // 140
  uint32_t tfetch_table_offset; // 144
  uint32_t reserved[11];        // 148..191
};
struct VFetchV1 {
  uint32_t fetch_slot;   // 0
  uint32_t raw0, raw1;   // 4, 8
  uint32_t endian;       // 12
  uint32_t phys;         // 16
  uint32_t bytes;        // 20
  uint32_t data_offset;  // 24
  uint32_t reserved0;    // 28
  uint64_t data_hash;    // 32
  uint64_t reserved1;    // 40
};
struct TFetchV1 {
  uint32_t fetch_slot;   // 0
  uint32_t raw[6];       // 4..27
  uint32_t format;       // 28
  uint32_t endian;       // 32
  uint32_t dimension;    // 36
  uint32_t width;        // 40
  uint32_t height;       // 44
  uint32_t depth;        // 48
  uint32_t pitch;        // 52
  uint32_t tiled;        // 56
  uint32_t mip_min;      // 60
  uint32_t mip_max;      // 64
  uint32_t packed_mips;  // 68
  uint32_t base_phys;    // 72
  uint32_t base_bytes;   // 76
  uint32_t base_offset;  // 80
  uint32_t mip_phys;     // 84
  uint32_t mip_bytes;    // 88
  uint32_t mip_offset;   // 92
  uint64_t base_hash;    // 96
  uint64_t mip_hash;     // 104
};
static_assert(sizeof(HeaderV1) == 192 && offsetof(HeaderV1, event_seq) == 24 &&
              offsetof(HeaderV1, index_offset) == 80 && offsetof(HeaderV1, vfetch_count) == 108 &&
              offsetof(HeaderV1, vs_hash) == 112 && offsetof(HeaderV1, index_hash) == 128 &&
              offsetof(HeaderV1, vfetch_table_offset) == 136 &&
              offsetof(HeaderV1, tfetch_table_offset) == 144 && offsetof(HeaderV1, reserved) == 148);
static_assert(sizeof(VFetchV1) == 48 && offsetof(VFetchV1, data_offset) == 24 &&
              offsetof(VFetchV1, data_hash) == 32);
static_assert(sizeof(TFetchV1) == 112 && offsetof(TFetchV1, format) == 28 &&
              offsetof(TFetchV1, base_phys) == 72 && offsetof(TFetchV1, mip_offset) == 92 &&
              offsetof(TFetchV1, base_hash) == 96 && offsetof(TFetchV1, mip_hash) == 104);

using rex::graphics::CommandProcessor;
using rex::graphics::RegisterFile;
using rex::graphics::Shader;

bool Requested();  // G1_R5SNAP=1 (sin mirar async)
bool Enabled();    // Requested() y G1_CP_ASYNC=1; si falta async avisa una vez y queda apagado
void Init(CommandProcessor* cp, const RegisterFile* regs);  // en el hilo del CP (modo async)
uint64_t HashUcode(int type, const uint32_t* guest_be, uint32_t dwords);  // XXH3 de los bytes BE del guest; lo registra
CommandProcessor::BackendStatus Gate(uint32_t opcode, Shader* vs, Shader* ps);
struct IndexDesc {  // copia de IndexBufferInfo (protegido en CommandProcessor)
  bool dma = false;
  uint32_t format = 0, endian = 0, phys = 0, bytes = 0;
};
void OnDraw(uint32_t vgt_draw_initiator, uint32_t prim_type, uint32_t index_count,
            const IndexDesc& ib, bool major_mode_explicit, Shader* vs, Shader* ps);
void OnCopy();
void OnSwap();
void OnDrawEnd(int end);  // CommandProcessor::DrawEnd como entero
void Report();

}  // namespace r5snap
