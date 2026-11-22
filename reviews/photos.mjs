export const uploadMaxBytes = 8_000_000;
const storedMaxBytes = 1_000_000;
const photoMaxPixels = 30_000_000;
const webpChunks = new Set(['VP8X', 'ALPH', 'VP8 ', 'VP8L']);

function fourCC(bytes, offset) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

export function photoType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (fourCC(bytes, 0) === '\x89PNG' && fourCC(bytes, 4) === '\r\n\x1a\n') return 'image/png';
  if (fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP') return 'image/webp';
  return null;
}

function webpPixelsOnly(bytes) {
  if (photoType(bytes) !== 'image/webp' || bytes.length < 20) return null;
  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (source.getUint32(4, true) + 8 !== bytes.length) return null;

  const clean = new Uint8Array(bytes.length);
  clean.set(bytes.subarray(0, 12));
  let written = 12;
  let hasPixels = false;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) return null;
    const type = fourCC(bytes, offset);
    const length = source.getUint32(offset + 4, true);
    const next = offset + 8 + length + (length % 2);
    if (next > bytes.length) return null;
    if (webpChunks.has(type)) {
      clean.set(bytes.subarray(offset, next), written);
      if (type === 'VP8X') {
        if (length !== 10 || (clean[written + 8] & 0x02)) return null;
        // Keep only the alpha flag. Color profiles, EXIF, and XMP are omitted.
        clean[written + 8] &= 0x10;
      }
      if (type === 'VP8 ' || type === 'VP8L') hasPixels = true;
      written += next - offset;
    }
    offset = next;
  }
  if (!hasPixels || written > storedMaxBytes) return null;
  new DataView(clean.buffer).setUint32(4, written - 8, true);
  return clean.slice(0, written);
}

export async function resizePhoto(file, images) {
  try {
    const info = await images.info(file.stream());
    if (!Number.isInteger(info.width) || !Number.isInteger(info.height)
        || info.width < 1 || info.height < 1 || info.width * info.height > photoMaxPixels) return null;
    const output = await images.input(file.stream())
      .transform({ width: 1200, height: 1200, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: 80, anim: false });
    const response = output.response();
    if (!response.ok) return null;
    return webpPixelsOnly(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}
