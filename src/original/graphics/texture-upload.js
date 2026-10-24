/**
 * Upload linear RGBA8 pixels on a dedicated asynchronous GPU owner.
 * Callers keep source bytes immutable until the returned promise settles, and own
 * (must destroy) the returned texture. Serialize calls on this device because
 * validation error scopes belong to the device, not individual JS tasks.
 * This does not decode Xbox tiling, endian swaps, compression or guest shaders.
 */
export async function uploadRgba8(device, {width, height, data, bytesPerRow = width * 4,
  label = 'guest-rgba8', timeoutMs = 5000}) {
  const integer = value => Number.isSafeInteger(value) && value > 0;
  if (!integer(width) || !integer(height)) throw new RangeError('Invalid texture dimensions');
  if (width > device.limits.maxTextureDimension2D || height > device.limits.maxTextureDimension2D)
    throw new RangeError('Texture exceeds GPU dimension limit');
  if (!integer(bytesPerRow) || bytesPerRow < width * 4 || bytesPerRow % 4)
    throw new RangeError('Invalid RGBA8 row pitch');
  if (!(data instanceof Uint8Array)) throw new TypeError('Expected Uint8Array pixels');
  const required = bytesPerRow * (height - 1) + width * 4;
  if (!Number.isSafeInteger(required) || data.byteLength < required)
    throw new RangeError('Incomplete texture pixels');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid upload timeout');

  let texture, timer;
  device.pushErrorScope('validation');
  let scopeOpen = true;
  try {
    texture = device.createTexture({label, size: [width, height], format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING});
    // writeTexture accepts padded rows without copy-buffer's 256-byte row alignment.
    device.queue.writeTexture({texture}, data, {bytesPerRow, rowsPerImage: height}, [width, height]);
    const validation = device.popErrorScope(); scopeOpen = false;
    const completion = Promise.all([validation, device.queue.onSubmittedWorkDone()]).then(([error]) => {
      if (error) throw new Error(error.message);
    });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('GPU texture upload timed out')), timeoutMs);
    });
    await Promise.race([completion, timeout]);
    return texture;
  } catch (error) {
    texture?.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
    if (scopeOpen) await device.popErrorScope();
  }
}

