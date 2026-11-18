// Wires the page together: sizes the character grid to the screen, runs the
// scene, and keeps the sky clear around the words.

import { Horizon, STEPS_PER_SECOND } from './horizon.js';
import { GlyphSheet, paint, SAMPLES_X, SAMPLES_Y } from './ascii.js';
import { hash2 } from './rng.js';

const host = document.querySelector('.scene');
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const light = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const soft = document.createElement('canvas').getContext('2d');
const stillness = matchMedia('(prefers-reduced-motion: reduce)');
const STEP_MS = 1000 / STEPS_PER_SECOND;
const seed = (Math.random() * 2 ** 32) >>> 0;

let grid = null;
let sheet = null;
let scene = null;
let veil = null;
let grain = null;
let raf = 0;
let last = 0;
let owed = 0;
let seededWidth = 0;

function layout() {
  const width = host.clientWidth;
  const height = host.clientHeight;
  if (!width || !height) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const unit = width < 600 ? 2.5 : width > 1900 ? 3.5 : 3;
  const cw = Math.round(unit * SAMPLES_X * dpr);
  const ch = Math.round(unit * SAMPLES_Y * dpr);
  const cols = Math.ceil((width * dpr) / cw);
  const rows = Math.ceil((height * dpr) / ch);

  grid = { cols, rows, cellW: cw / dpr, cellH: ch / dpr, width: (cols * cw) / dpr, height: (rows * ch) / dpr };

  canvas.width = cols * cw;
  canvas.height = rows * ch;
  canvas.style.width = `${grid.width}px`;
  canvas.style.height = `${grid.height}px`;
  canvas.style.setProperty('--cell-w', `${grid.cellW}px`);
  canvas.style.setProperty('--cell-h', `${grid.cellH}px`);

  light.canvas.width = cols * SAMPLES_X;
  light.canvas.height = rows * SAMPLES_Y;
  soft.canvas.width = Math.ceil(light.canvas.width / 2);
  soft.canvas.height = Math.ceil(light.canvas.height / 2);

  const style = getComputedStyle(document.documentElement);
  const ground = style.getPropertyValue('--ground').trim() || '#0a0a0a';
  const ink = style.getPropertyValue('--ink').trim() || '#ffffff';
  sheet = new GlyphSheet(cw, ch, getComputedStyle(document.body).fontFamily, ground, ink);

  grain = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grain[r * cols + c] = hash2(c, r);

  // The bears are sized to the screen, so a real change of width (rotation, a
  // resized window) starts the walk afresh; a phone's address bar sliding
  // away does not.
  if (!scene || Math.abs(width - seededWidth) > seededWidth * 0.12) {
    scene = new Horizon(grid.width, grid.height, seed);
    seededWidth = width;
  } else {
    scene.resize(grid.width, grid.height);
  }

  clearAroundWords();
  render();
}

// The veil is 0 on a word, 1 a few cells away, and eased between.
function clearAroundWords() {
  if (!grid) return;
  const { cols, rows, cellW, cellH } = grid;
  veil = new Float32Array(cols * rows).fill(1);
  const near = 5;
  const far = 4.2 * cellH;
  for (const word of document.querySelectorAll('main > *')) {
    const box = word.getBoundingClientRect();
    const c0 = Math.max(0, Math.floor((box.left - far) / cellW));
    const c1 = Math.min(cols - 1, Math.ceil((box.right + far) / cellW));
    const r0 = Math.max(0, Math.floor((box.top - far) / cellH));
    const r1 = Math.min(rows - 1, Math.ceil((box.bottom + far) / cellH));
    for (let r = r0; r <= r1; r++) {
      const y = (r + 0.5) * cellH;
      const dy = Math.max(box.top - y, 0, y - box.bottom);
      for (let c = c0; c <= c1; c++) {
        const x = (c + 0.5) * cellW;
        const dx = Math.max(box.left - x, 0, x - box.right);
        const t = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - near) / (far - near)));
        const clear = t * t * (3 - 2 * t);
        const cell = r * cols + c;
        if (clear < veil[cell]) veil[cell] = clear;
      }
    }
  }
}

function render() {
  if (!scene) return;
  scene.draw(light, soft);
  const data = light.getImageData(0, 0, light.canvas.width, light.canvas.height).data;
  paint(ctx, sheet, data, grid, veil, grain);
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  owed += Math.min(now - last, 120);
  last = now;
  let moved = false;
  while (owed >= STEP_MS) {
    scene.step();
    owed -= STEP_MS;
    moved = true;
  }
  if (moved) render();
}

function run() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (!scene) return;
  if (stillness.matches || document.hidden) {
    scene.pointer = null;
    render();
    return;
  }
  last = performance.now();
  owed = 0;
  raf = requestAnimationFrame(frame);
}

let pending = 0;
function schedule(task) {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(task);
}

window.addEventListener('resize', () => schedule(layout));
window.addEventListener(
  'scroll',
  () =>
    schedule(() => {
      clearAroundWords();
      if (!raf) render();
    }),
  { passive: true },
);
document.addEventListener('visibilitychange', run);
stillness.addEventListener('change', run);

// The bears notice the pointer when it comes close.
window.addEventListener('pointermove', (event) => {
  if (!scene || stillness.matches) return;
  scene.pointer = { x: event.clientX, y: event.clientY };
});
for (const type of ['pointerleave', 'pointercancel', 'pointerup', 'blur']) {
  window.addEventListener(type, (event) => {
    if (scene && (type !== 'pointerup' || event.pointerType !== 'mouse')) scene.pointer = null;
  });
}
document.documentElement.addEventListener('mouseleave', () => {
  if (scene) scene.pointer = null;
});

layout();
run();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
