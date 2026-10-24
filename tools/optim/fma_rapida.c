// Claude 2026-10-15 (recorte CPU): wasm no tiene fma propia y la de la biblioteca (musl, por software) costaba ~6 % del
// CPU del juego (fma + normalize). Esta versión multiplica y suma en double: puede diferir en el último bit del
// resultado fusionado de PowerPC; casi todas las llamadas redondean después a float (fmadds), donde a*b es exacto.
double fma(double x, double y, double z) { return x * y + z; }
float fmaf(float x, float y, float z) { return (float)((double)x * y + z); }
