#pragma once
#include <cstdint>
// R3c: latido WebGPU de prueba del backend (no es un cuadro de GH3). Ver r3c_heartbeat.cpp.
namespace r3c {
bool Enabled();                  // G1_R3C=1 (página: ?r3c=1); requiere G1_CP_ASYNC=1
void Init(void (*on_ready)());   // asíncrona; on_ready corre en el hilo del CP al terminar
int State();                     // 0 apagado, 1 pendiente, 2 listo, 3 error (sigue como GPU nula)
void OnSwap(uint32_t swap_index);  // no bloquea; respeta las colas acotadas
}
