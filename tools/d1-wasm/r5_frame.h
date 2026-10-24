// R5F: captura DIAGNÓSTICA de cuadros completos (contrato artifacts/r5-runtime-claude/CONTRATO-R5F-V1.md).
// Apagado por defecto. G1_R5FRAME=at:<ms>[,frames:<n>] | swap:<N>[,frames:<n>]; página ?r5frame=...
// Todo corre en el hilo del CP. El CP no espera: el archivo se entrega por tandas a un sumidero
// sincrónico que copia (Node: archivo; web: página -> descarga).
#pragma once
#include <cstdint>
#include <rex/graphics/command_processor.h>

namespace rex::memory { class Memory; }
namespace rex::graphics { class TraceWriter; }

namespace r5frame {
struct Ctx {
  const rex::graphics::RegisterFile* regs;
  const rex::memory::Memory* memory;
  rex::graphics::TraceWriter* trace_writer;
  rex::graphics::Shader* vs;
  rex::graphics::Shader* ps;
};
struct IndexDesc { bool dma = false; uint32_t format = 0, endian = 0, phys = 0, bytes = 0; };

bool Enabled();  // lee G1_R5FRAME una vez; apagado si falta o si G1_R5SNAP=1
void OnDraw(const Ctx& c, uint32_t initiator, uint32_t prim, uint32_t count, const IndexDesc& ib, bool major_explicit);
void OnCopy(const Ctx& c);
void OnDrawEnd(const Ctx& c, int end);  // CommandProcessor::DrawEnd como entero
void OnSwap(const Ctx& c, uint32_t frontbuffer, uint32_t width, uint32_t height);
void Report();
}  // namespace r5frame
