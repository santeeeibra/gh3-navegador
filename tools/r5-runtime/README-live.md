# R5 live local diagnostic

This is a partial draw consumer for the measured video shader pair. It does not
render the menu UI or 3D, play a song, provide audible audio, or implement online.
It uses the actual CP snapshot API. Two producer slots bound the async consumer
queue; slots are released after GPU completion and bitmap delivery, never on error.
Translucent draws are counted as unsupported because prior framebuffer contents
are not captured by this diagnostic. All other unsupported states fail terminally.

Preparation (no downloads):

    node tools/r5-runtime/check-snapshot-reader.mjs
    node tools/r5-runtime/check-intro-adapter.mjs
    node tools/r5-runtime/build-live.mjs
    node tools/r5-runtime/verify-live.mjs 230 edge-live

Manual local test:

    node tools/r5-runtime/serve-live.mjs 5189

Open the printed link in Edge, choose the Xbox 360 folder, set GPU to null and
seconds to 230 or more, then start. The URL schedules START at 150 and 175 seconds.
The generated files live in artifacts/r5-live and must never be published:
r5snap-codex.js embeds converted game shaders; gh3-web.wasm contains game code.
Only loopback HTTP is allowed in the automated test. DATA is loaded via the
existing directory picker/WORKERFS and is not uploaded or served.

prepare-intro-snapshot.mjs derives the 528-byte system uniform from guest
registers for a tightly guarded state, removes row padding from linear planes,
compacts the pixel constants, and remaps vfetch95 to the copied 80-byte SSBO.
It contains no captured system constants, resource bytes or shader text.
The same native run5 fixture produces identical bytes for all 8 GPU resources.
The fixture now models TextureInfo accurately: widths/heights are size minus one
and depth is zero for unstacked 2D planes. The reader checks consistency with
raw fetch fields rather than rejecting zero-sized encoded dimensions.

This diagnostic reuses its renderer when the complete manifest is unchanged and
updates all four planes, vertex bytes and uniforms in queue order. It renders
to a worker-owned WebGPU OffscreenCanvas and transfers its ImageBitmap without
CPU readback. Counts pipelineBuilds/reused/readbacks expose which path ran.
The pixel comparison test exercises this same presentation API against native
RGBA bytes, including changed constants/textures and restoration.
It is intentionally not the final swap/render-target backend;
its cadence and performance cannot be called game FPS. Other CP draws are omitted.

Isolated builds: R5_LIVE_OUT selects the output directory; R5_RUNTIME_JS selects
the runtime JS to copy in build-live. R5_RUNTIME_WASM selects the wasm served by
serve-live/verify-live. Use matching JS/wasm copies from one completed Claude build.
waitmulti/audiotap URL parameters now pass through the generated page. No audio
consumer is included in this graphics-only page.
