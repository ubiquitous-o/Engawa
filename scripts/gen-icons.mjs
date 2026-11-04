// 拡張アイコン (PNG) を依存なしで生成する。 `npm run icons`
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(fileURLToPath(new URL('.', import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 角丸四角の内側判定（アンチエイリアス付き）
function roundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const d = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, r - d + 0.5));
}

const lerp = (a, b, t) => a + (b - a) * t;

// 抽象的な縁側: 緑の庭（背景）に、茶色の板（縁側）が左から張り出す。
const C = {
  grassA: [0x7a, 0xb8, 0x62],
  grassB: [0x3a, 0x7a, 0x3c],
  deckA: [0xb8, 0x80, 0x4a],
  deckB: [0x8a, 0x58, 0x2c],
  plank: [0x64, 0x3e, 0x1e],
  shadow: [0x2c, 0x5c, 0x2e],
};
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

for (const size of [16, 32, 48, 128]) {
  const s = size;
  const deckX1 = s * 0.5;                // 縁側の右端
  const deckY0 = s * 0.18, deckY1 = s * 0.82;
  const deckR = s * 0.08;
  const plankW = Math.max(1, s * 0.035);
  const plankGap = (deckY1 - deckY0) / 3;
  const buf = png(s, (x, y) => {
    const bg = roundedRect(x, y, 0, 0, s, s, s * 0.22);
    // 庭: 左上が明るく右下が深い緑
    let c = mix(C.grassA, C.grassB, (x + y) / (2 * s));
    // 縁側の影（右と下に少し落とす）
    const sh = roundedRect(x - s * 0.03, y - s * 0.03, -s, deckY0, deckX1, deckY1, deckR);
    c = mix(c, C.shadow, sh * 0.35);
    // 縁側本体: 左端から張り出す（左は角丸にしない）
    const deck = roundedRect(x, y, -s, deckY0, deckX1, deckY1, deckR);
    let d = mix(C.deckA, C.deckB, (y - deckY0) / (deckY1 - deckY0));
    if (s >= 32) {
      // 板の継ぎ目（横線 2 本）
      for (let i = 1; i < 3; i++) {
        const ly = deckY0 + plankGap * i;
        if (Math.abs(y - ly) < plankW / 2) d = mix(d, C.plank, 0.8);
      }
    }
    c = mix(c, d, deck);
    return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), Math.round(bg * 255)];
  });
  writeFileSync(resolve(out, `icon${s}.png`), buf);
}
console.log('icons written to', out);
