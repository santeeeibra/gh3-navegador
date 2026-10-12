float4 main(float2 uv : TEXCOORD0) : COLOR0 {
    return float4(uv.x, uv.y, 0.25, 1.0);
}
