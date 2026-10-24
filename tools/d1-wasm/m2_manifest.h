// Manifiesto por canción, paso 2 (Claude): registro DIAGNÓSTICO de qué usa el juego.
// Apagado por defecto. G1_M2=1 (página ?m2=1). Solo escribe líneas de registro por stderr:
//   [m2-read]  path / offset / pedido / leído           (hilo que lee; ver xboxkrnl_io.cpp del build manifest2)
//   [m2-tex]   descriptor de cada textura nueva (una vez)
//   [m2-shader]/[m2-ucode] cada shader nuevo (una vez) y su ucode en hex, igual que el volcado nativo
//   [m2-win]   cada G1_M2_WIN swaps (60): reloj de la canción, draws y pares VS/PS con conteo, ids de texturas
// No cambia el estado del juego ni del CP.
#pragma once
#include <cstdint>
#include <string>

namespace rex::graphics { class RegisterFile; class Shader; }

namespace m2 {
bool Enabled();
void OnDraw(const rex::graphics::RegisterFile& regs, rex::graphics::Shader* vs, rex::graphics::Shader* ps);
void OnSwap();
void OnRead(const std::string& path, uint64_t offset, uint32_t requested, uint32_t got, uint32_t status);
}  // namespace m2
