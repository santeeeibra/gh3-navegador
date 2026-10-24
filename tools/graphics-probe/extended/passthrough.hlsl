struct Output {float4 position : POSITION;float2 uv : TEXCOORD0;};
Output main(float4 position : POSITION, float2 uv : TEXCOORD0) {
 Output o; o.position=position;o.uv=uv;return o;
}
