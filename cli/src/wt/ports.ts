/** CRC de POSIX `cksum` (polinomio 0x04C11DB7, longitud al final, complemento). */
export function cksum(input: string): number {
  const bytes = Buffer.from(input, "utf8");
  let crc = 0;
  const update = (b: number): void => {
    crc ^= b << 24;
    for (let i = 0; i < 8; i++) crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1;
    crc >>>= 0;
  };
  for (const b of bytes) update(b);
  let len = bytes.length;
  while (len > 0) {
    update(len & 0xff);
    len = Math.floor(len / 256);
  }
  return ~crc >>> 0;
}

/** Puerto determinista: port_base + cksum(slug) % 100. */
export function portFor(slug: string, base = 3000): number {
  return base + (cksum(slug) % 100);
}

export const slugify = (branch: string): string =>
  branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
