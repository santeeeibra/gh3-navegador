// MSAA sample-position constants from rexglue src/graphics/util/draw.cpp.
// Copyright 2023 Ben Vanik; adapted by Tom Clay, 2026.
// BSD-3-Clause, see LICENSE.rexglue.txt. No game code or data.
#include <rex/graphics/util/draw.h>
namespace rex::graphics::draw_util {
const int8_t kD3D10StandardSamplePositions2x[2][2] = {{4, 4}, {-4, -4}};
const int8_t kD3D10StandardSamplePositions4x[4][2] = {{-2, -6}, {6, -2}, {-6, 2}, {2, 6}};
}
