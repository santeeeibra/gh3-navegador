#pragma once
// G1e: control programable para el GH3 wasm. Es un mando conectado en la ranura 0 que pulsa los botones
// pedidos durante un rato. Se usa de dos formas:
//   - Calendario fijo (argumento "press"): "150:start,160:a" pulsa START a los 150 s y A a los 160 s
//     (los segundos se cuentan desde el arranque del programa).
//   - En vivo: g1e_press(botones, ms) se puede llamar desde JS (botón de la página en Edge).
//   - C1, estado en vivo: la página (gh3-input.js) escribe los botones mantenidos, gatillos y palancas
//     en memoria compartida (g1e_live_ptr) y el juego los lee en cada consulta. Se suma al calendario.
// Cada pulsación se escribe en el log como "[g1e] press ..." para relacionarla con los archivos que abre.
#include <memory>
#include <rex/input/input_driver.h>

namespace g1e {
std::unique_ptr<rex::input::InputDriver> Create(const char* schedule);
}
extern "C" void g1e_press(int buttons, int ms);
extern "C" void* g1e_live_ptr();
