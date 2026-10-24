#include <cstddef>
#include <cstdio>
#include <rex/graphics/pipeline/shader/dxbc_translator.h>
using S=rex::graphics::DxbcShaderTranslator::SystemConstants;
int main(){printf("{\"bytes\":%zu,\"offsets\":{",sizeof(S));
#define O(n) printf("\"" #n "\":%zu,",offsetof(S,n));
O(flags) O(line_loop_closing_index) O(vertex_index_endian) O(vertex_index_offset)
O(vertex_index_min) O(vertex_index_max) O(ndc_scale) O(ndc_offset)
O(texture_swizzled_signs) O(textures_resolution_scaled) O(alpha_test_reference)
printf("\"color_exp_bias\":%zu}}",offsetof(S,color_exp_bias));}
