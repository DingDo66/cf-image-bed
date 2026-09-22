// Bounded header parsing for accepted raster formats; no unbounded box traversal.
export function dimensions(
  b: Uint8Array,
  mime: string,
): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const result = (w: number, h: number) =>
    w > 0 && h > 0 && w <= 100000 && h <= 100000
      ? { width: w, height: h }
      : null;
  try {
    if (mime === "image/png") return result(v.getUint32(16), v.getUint32(20));
    if (mime === "image/gif")
      return result(v.getUint16(6, true), v.getUint16(8, true));
    if (mime === "image/webp") {
      const le24 = (p: number) => b[p]! | (b[p + 1]! << 8) | (b[p + 2]! << 16);
      const tag = String.fromCharCode(...b.slice(12, 16));
      if (tag === "VP8X") return result(1 + le24(24), 1 + le24(27));
      if (tag === "VP8 ")
        return result(
          v.getUint16(26, true) & 16383,
          v.getUint16(28, true) & 16383,
        );
      if (tag === "VP8L") {
        const n = v.getUint32(21, true);
        return result((n & 16383) + 1, ((n >>> 14) & 16383) + 1);
      }
    }
    if (mime === "image/jpeg")
      for (let p = 2; p + 8 < b.length;) {
        if (b[p] !== 255) return null;
        const tag = b[p + 1]!;
        if (tag === 255) {
          p++;
          continue;
        }
        if (tag === 217 || tag === 218) break;
        const length = v.getUint16(p + 2);
        if (length < 2) return null;
        if (
          [
            192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
          ].includes(tag)
        )
          return result(v.getUint16(p + 7), v.getUint16(p + 5));
        p += 2 + length;
      }
  } catch {
    /* Truncated input */
  }
  return null;
}
