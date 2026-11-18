// paint() only needs something with drawImage/clearRect and a description of
// the sprite sheet, so the choice of character can be checked without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paint, FAINT, SAMPLES_X, SAMPLES_Y } from '../js/ascii.js';

const BODY = ';txoSX%#8@';
const chars = FAINT + BODY;
const sheet = { cw: 10, ch: 15, canvas: null, body: BODY, bodyStart: FAINT.length, index: new Map([...chars].map((c, i) => [c, i])) };

// One cell; `rows` is the brightness (0-255) of its top, middle and bottom samples.
function drawn(rows, veil = 1) {
  const light = new Uint8ClampedArray(SAMPLES_X * SAMPLES_Y * 4);
  rows.forEach((v, r) => {
    for (let x = 0; x < SAMPLES_X; x++) light[(r * SAMPLES_X + x) * 4] = v;
  });
  const calls = [];
  const ctx = { clearRect() {}, drawImage: (...args) => calls.push(args) };
  paint(ctx, sheet, light, { cols: 1, rows: 1 }, new Float32Array([veil]), new Float32Array([0.5]));
  if (!calls.length) return null;
  const [, sx, sy] = calls[0];
  return { char: chars[sy / sheet.ch], shade: sx / sheet.cw };
}

test('darkness draws nothing', () => {
  assert.equal(drawn([0, 0, 0]), null);
  assert.equal(drawn([2, 2, 2]), null);
});

test('a word clears the sky around it', () => {
  assert.equal(drawn([255, 255, 255], 0), null);
});

test('faint light at the top of a cell sits high, at the bottom sits low', () => {
  assert.ok('`\'"'.includes(drawn([40, 0, 0]).char));
  assert.ok('.,'.includes(drawn([0, 0, 40]).char));
});

test('faint light through the whole cell becomes a vertical mark', () => {
  assert.ok('.:!'.includes(drawn([14, 14, 14]).char));
});

test('more light, denser character, stronger shade', () => {
  const steps = [30, 80, 130, 180, 230, 255].map((v) => drawn([v, v, v]));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(chars.indexOf(steps[i].char) >= chars.indexOf(steps[i - 1].char));
    assert.ok(steps[i].shade >= steps[i - 1].shade);
  }
  assert.equal(steps.at(-1).char, '@');
});

test('full brightness stays inside the sprite sheet', () => {
  const top = drawn([255, 255, 255]);
  assert.ok(Number.isInteger(top.shade) && top.shade <= 23);
});
