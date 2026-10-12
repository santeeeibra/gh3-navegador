# R5 renderer local (first intro case)

intro-renderer.mjs takes a caller-owned GPUDevice and prepared resource bytes.
It does not load files, use DOM or own the device. Input resources are copied
before the first await. Caller owns the source snapshot's global coherence.
Returned API: draw() -> readback RGBA, writePixelConstants(80-byte Uint8Array),
update(preparedInput), present(rgba8unorm GPUCanvasContext), dispose().
update validates and owns all bytes before queue writes; incompatible manifest
requires a new renderer. present waits for submitted work without CPU readback.
Explicit rejection of overlapping draws/updates; no pending CP contract here.
Only the captured opaque intro case is implemented. System constants and physical
range remapping are provided by the replay preparer or prepareIntroSnapshot.

Run: node tools/r5-runtime/run-worker.mjs
Evidence: artifacts/r5-runtime/worker-check.json
Existing replay: node tools/r5-replay/run.mjs

extract-renderer.py is the one-time migration script used in this batch.
Do NOT rerun against the already refactored sources.
No downloads, publication, game data embedded in these tool sources, or CPU edits.
All captured assets remain under artifacts/, excluded from publication.
