/** About 1 MB. The browser targets 1 MB; this allows a little multipart slack. */
export const MAX_JPEG_BYTES = 1_200_000;

/**
 * Drop JPEG metadata segments (EXIF/GPS, XMP, ICC, IPTC, comments).
 * Returns a new JPEG, or null when the bytes are not a JPEG we can keep.
 */
export function stripJpegMetadata(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const out = [0xff, 0xd8];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return null;
    const marker = bytes[i];
    i += 1;

    // Start of scan: the rest is compressed image data, copied as-is.
    if (marker === 0xda) {
      out.push(0xff, marker);
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]);
      const stripped = new Uint8Array(out);
      if (!stripped.includes(0xd9)) return null;
      return stripped;
    }

    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return new Uint8Array(out);
    }

    // Standalone markers (TEM, RSTn) have no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      continue;
    }

    if (i + 1 >= bytes.length) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;

    // APP1–APP15 and COM hold EXIF, GPS, XMP, ICC, and comments.
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) {
      out.push(0xff, marker);
      for (let j = 0; j < length; j += 1) out.push(bytes[i + j]);
    }
    i += length;
  }

  return null;
}

export function prepareJpeg(bytes) {
  const stripped = stripJpegMetadata(bytes);
  if (!stripped) return { error: "Use a JPEG photo. Other file types are not accepted." };
  if (stripped.byteLength < 100) return { error: "That photo could not be read." };
  if (stripped.byteLength > MAX_JPEG_BYTES) {
    return { error: "That photo is too large. Use one about 1 MB or smaller." };
  }
  return { bytes: stripped };
}
