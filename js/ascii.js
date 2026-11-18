// Turns a luminance buffer into characters.
//
// Every cell of the page is sampled 2 x 3 times. The mean decides how dense a
// character to use and how strongly to shade it; the balance between the top,
// middle and bottom samples decides the faintest marks, so a thin line of light
// passing through the top of a cell becomes ' and through the bottom becomes .
//
// Characters are pre-rendered once into a sheet (one sprite per character per
// shade) so that painting a frame is nothing but blits.

export const SAMPLES_X = 2;
export const SAMPLES_Y = 3;

const SHADES = 24;
const BODY = ';tox%SX8#@'; // sorted by measured ink before use
export const FAINT = '`\'".,-:!';
const SOLID = 0.72; // from here up a cell flips: bright tile, dark character
const FAINT_BELOW = 0.2;
const SILENCE = 0.036;

function parseColor(value) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

function mix(a, b, t) {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export class GlyphSheet {
  // cw, ch: cell size in device pixels. ground, ink: any CSS colours.
  constructor(cw, ch, fontFamily, ground, ink) {
    this.cw = cw;
    this.ch = ch;
    const font = `500 ${Math.round(ch * 0.9)}px ${fontFamily}`;
    const groundRgb = parseColor(ground);
    const inkRgb = parseColor(ink);

    this.body = this.sortByInk(BODY, font);
    this.chars = FAINT + this.body;
    this.index = new Map([...this.chars].map((c, i) => [c, i]));
    this.bodyStart = FAINT.length;

    const sheet = document.createElement('canvas');
    sheet.width = cw * SHADES;
    sheet.height = ch * this.chars.length;
    const ctx = sheet.getContext('2d');
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const cap = ctx.measureText('X').actualBoundingBoxAscent || ch * 0.62;
    const baseline = Math.round(ch / 2 + cap / 2);
    const gap = Math.max(1, Math.round(cw / 14));

    for (let shade = 0; shade < SHADES; shade++) {
      const l = (shade + 0.5) / SHADES;
      let tile = null;
      let glyph;
      if (l >= SOLID) {
        tile = mix(groundRgb, inkRgb, 0.5 + 0.45 * ((l - SOLID) / (1 - SOLID)));
        glyph = mix(groundRgb, inkRgb, 0);
      } else {
        const t = l / SOLID;
        if (l > 0.16) tile = mix(groundRgb, inkRgb, 0.015 + 0.17 * ((l - 0.16) / (SOLID - 0.16)));
        glyph = mix(groundRgb, inkRgb, 0.26 + 0.64 * Math.pow(t, 0.85));
      }
      for (let g = 0; g < this.chars.length; g++) {
        const x = shade * cw;
        const y = g * ch;
        if (tile) {
          ctx.fillStyle = tile;
          ctx.fillRect(x, y, cw - gap, ch - gap);
        }
        ctx.fillStyle = glyph;
        ctx.fillText(this.chars[g], x + (cw - gap) / 2, y + baseline);
      }
    }
    this.canvas = sheet;
  }

  // Density is a property of the typeface, so measure it rather than assume.
  sortByInk(chars, font) {
    const size = 48;
    const probe = document.createElement('canvas');
    probe.width = probe.height = size;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.font = font.replace(/\d+px/, '32px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const ink = (c) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillText(c, size / 2, size / 2);
      const data = ctx.getImageData(0, 0, size, size).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      return sum;
    };
    return [...chars]
      .map((c) => [c, ink(c)])
      .sort((a, b) => a[1] - b[1])
      .map(([c]) => c)
      .join('');
  }
}

// light: RGBA bytes of the luminance buffer (cols*2 by rows*3).
// veil: per-cell multiplier that clears the picture around the words.
// grain: per-cell fixed noise, so flat tones break into mixed characters.
export function paint(ctx, sheet, light, grid, veil, grain) {
  const { cols, rows } = grid;
  const { cw, ch, canvas, index, body, bodyStart } = sheet;
  const stride = cols * SAMPLES_X * 4;
  const faint = (c) => index.get(c);
  const tick = faint('`');
  const apostrophe = faint("'");
  const quote = faint('"');
  const dot = faint('.');
  const comma = faint(',');
  const dash = faint('-');
  const colon = faint(':');
  const bang = faint('!');

  ctx.clearRect(0, 0, cols * cw, rows * ch);

  for (let r = 0; r < rows; r++) {
    const row0 = r * SAMPLES_Y * stride;
    for (let c = 0; c < cols; c++) {
      const i0 = row0 + c * SAMPLES_X * 4;
      const i1 = i0 + stride;
      const i2 = i1 + stride;
      const top = light[i0] + light[i0 + 4];
      const mid = light[i1] + light[i1 + 4];
      const bot = light[i2] + light[i2 + 4];
      const sum = top + mid + bot;
      if (sum < 18) continue;

      const cell = r * cols + c;
      let l = Math.pow(sum / 1530, 0.8) * veil[cell];
      l += (grain[cell] - 0.5) * 0.2 * Math.min(1, l * 2.5);
      if (l < SILENCE) continue;
      if (l > 1) l = 1;

      let g;
      if (l < FAINT_BELOW) {
        const s = l / FAINT_BELOW;
        if (top > bot * 1.7 && top >= mid * 0.8) g = s < 0.45 ? tick : s < 0.8 ? apostrophe : quote;
        else if (bot > top * 1.7 && bot >= mid * 0.8) g = s < 0.55 ? dot : comma;
        else if (mid > (top + bot) * 0.9) g = s < 0.4 ? dot : dash;
        else g = s < 0.3 ? dot : s < 0.72 ? colon : bang;
      } else {
        const t = (l - FAINT_BELOW) / (1 - FAINT_BELOW);
        g = bodyStart + Math.min(body.length - 1, Math.floor(t * body.length));
      }

      const shade = Math.min(SHADES - 1, Math.floor(l * SHADES));
      ctx.drawImage(canvas, shade * cw, g * ch, cw, ch, c * cw, r * ch, cw, ch);
    }
  }
}
