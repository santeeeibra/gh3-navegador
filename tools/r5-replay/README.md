# R5 captured draw replay (local only)

Uses real captured vertex/pixel microcode already converted to WGSL by R4, unmodified
shader logic. Draw resources live under artifacts/ and must never be published.
No CPU/CP wasm integration or changes to Claude's files.

1. `python tools/r5-replay/build-offsets.py`, then generated build-offsets.cmd:
   C++ offsetof helper against native DXBC SystemConstants, no game code executed.
2. `python tools/r5-native-capture/validate-capture.py artifacts/r5-native-capture/run5`.
3. `python tools/r5-replay/prepare.py artifacts/r5-native-capture/run5`.
4. `python tools/r5-replay/decode-reference.py artifacts/r5-native-capture/run5`.
5. `node tools/r5-replay/run.mjs`: loopback-only server, Edge, one draw + negative control,
   closes browser/server, JSON and raw GPU output under artifacts/r5-replay/.

Draw is a triangle strip of four vertices. Shader vertex fetch95 is mapped from its
physical guest range to byte zero in an 80-byte replay storage buffer. That remapping
changes the fetch address in the copied constant buffer, preserves the fetched bytes
and shader arithmetic, and is NOT a runtime implementation of the 512 MiB guest memory.
Other fetch constants remain unchanged. The replay does not claim mobile compatibility.

System constants map by name from captured DXBC fields or derived captured states;
flags have different bit positions in DXBC and SPIR-V. Every field actually consumed
by these two WGSL modules must have a mapping. Unconsumed fields are explicitly zero.
The native viewport is an unclipped 8192 square; the replay mathematically rescales NDC
for its 1280x720 target viewport, preserving half-pixel position. Vulkan Y convention
and the Naga entry Y flip are both accounted for. map and original values in manifest.json.

Float pixel constants use compact ascending c0,c1,c2,c3,c255 from the native pixel
register bank. Measured samplers are linear/clamp-to-edge. Four linear k_8/endian0 planes
are uploaded as r8unorm 2D-array views with shader swizzles from fetch constants.
Native blend, color write mask and raster state are decoded, unsupported states rejected.
The chosen case must be opaque to avoid dependence on the uncaptured framebuffer history.

Reference decoder implements SDK/Xenia 2D tile addresses, rejecting overlaps/out-of-bounds,
and checks format/endian/array/pitch. It inverses copy_dest_swap to compare pre-resolve RGB.
License and attribution in LICENSE.rexglue.txt. The decoder does not support other formats.

The GPU canvas displays pixels actually read from the render attachment; no original
screenshot is painted into that canvas. Native reference is used only for comparison.
An intentional c0.w+0.125 control must substantially worsen RGB error. Keep all raw errors;
do not silently loosen comparison tolerance or claim zero differences without measurement.
