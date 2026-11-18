// The horizon: a mother bear walks along the bottom of the page and her cubs
// trail behind, dawdle, and run to catch up. The camera walks with her, so the
// land scrolls past and she never arrives.
//
// Everything is drawn as white light into a small luminance buffer; ascii.js
// turns that buffer into characters. Nothing here knows about characters.

import { mulberry32, hash2 } from './rng.js';

export const STEPS_PER_SECOND = 30;

const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => t * t * (3 - 2 * t);

function noise1(x, salt) {
  const i = Math.floor(x);
  const f = x - i;
  return mix(hash2(i, salt), hash2(i + 1, salt), smooth(f));
}

function fbm(x, salt) {
  return noise1(x, salt) * 0.6 + noise1(x * 2.3 + 11, salt) * 0.28 + noise1(x * 5.1 + 29, salt) * 0.12;
}

// --- Gaits -----------------------------------------------------------------
// Legs are numbered: 0 near hind, 1 near fore, 2 far hind, 3 far fore.
// `offsets` is when each foot starts its step within the cycle, `duty` is the
// share of the cycle a foot spends on the ground, `stride` how far the body
// travels over one planted foot (in body lengths), `lift` how high a foot swings.
const WALK = { offsets: [0, 0.22, 0.5, 0.72], duty: 0.68, stride: 0.44, lift: 0.065 };
const BOUND = { offsets: [0, 0.46, 0.1, 0.56], duty: 0.42, stride: 0.6, lift: 0.14 };

// --- Anatomy, in body lengths; x forward, y up from the ground --------------
// `outline` is the trunk, neck and head in profile, clockwise from the tail.
// The third number says how much a point belongs to the head (0 trunk, 1 head)
// and so how far it moves when the head is raised, lowered or turned.
const ADULT = {
  outline: [
    [-0.5, 0.5, 0], [-0.47, 0.62, 0], [-0.38, 0.7, 0], [-0.22, 0.735, 0], [-0.05, 0.725, 0],
    [0.08, 0.76, 0], [0.18, 0.8, 0], [0.28, 0.775, 0.1], [0.37, 0.71, 0.3], [0.45, 0.665, 0.65],
    [0.53, 0.655, 1], [0.6, 0.63, 1], [0.655, 0.575, 1], [0.72, 0.535, 1], [0.775, 0.5, 1],
    [0.79, 0.465, 1], [0.775, 0.43, 1], [0.7, 0.415, 1], [0.62, 0.4, 1], [0.55, 0.385, 0.9],
    [0.47, 0.36, 0.55], [0.4, 0.31, 0.2], [0.3, 0.275, 0], [0.15, 0.285, 0], [-0.05, 0.3, 0],
    [-0.22, 0.31, 0], [-0.36, 0.3, 0], [-0.46, 0.36, 0], [-0.505, 0.44, 0],
  ],
  pivot: [0.34, 0.55],
  carry: -0.16, // how the head hangs at a walk, in radians below level
  skull: [0.585, 0.53, 0.112],
  ears: { r: 0.046, near: [-0.085, 0.15], far: [-0.035, 0.162], spread: 0.1 },
  eye: [0.05, 0.05],
  nose: [0.2, -0.065],
  hip: [-0.27, 0.46],
  shoulder: [0.23, 0.45],
  hind: { upper: 0.27, lower: 0.24, r: [0.15, 0.095, 0.062], home: 0.01 },
  fore: { upper: 0.26, lower: 0.24, r: [0.115, 0.085, 0.062], home: 0.03 },
  paw: { len: 0.11, r: 0.048 },
};

const CUB = {
  outline: [
    [-0.42, 0.48, 0], [-0.4, 0.6, 0], [-0.31, 0.68, 0], [-0.17, 0.71, 0], [-0.03, 0.7, 0],
    [0.08, 0.72, 0], [0.16, 0.745, 0.1], [0.24, 0.74, 0.4], [0.3, 0.76, 0.8], [0.38, 0.8, 1],
    [0.47, 0.79, 1], [0.545, 0.735, 1], [0.6, 0.675, 1], [0.655, 0.635, 1], [0.685, 0.595, 1],
    [0.68, 0.555, 1], [0.63, 0.53, 1], [0.55, 0.5, 1], [0.46, 0.47, 1], [0.38, 0.43, 0.7],
    [0.31, 0.36, 0.3], [0.24, 0.3, 0], [0.1, 0.275, 0], [-0.06, 0.28, 0], [-0.2, 0.285, 0],
    [-0.31, 0.29, 0], [-0.39, 0.34, 0], [-0.425, 0.41, 0],
  ],
  pivot: [0.24, 0.55],
  carry: -0.1,
  skull: [0.46, 0.635, 0.155],
  ears: { r: 0.068, near: [-0.1, 0.165], far: [0.03, 0.185], spread: 0.14 },
  eye: [0.075, 0.045],
  nose: [0.22, -0.045],
  hip: [-0.22, 0.44],
  shoulder: [0.17, 0.43],
  hind: { upper: 0.26, lower: 0.23, r: [0.15, 0.105, 0.075], home: 0.01 },
  fore: { upper: 0.25, lower: 0.23, r: [0.125, 0.095, 0.075], home: 0.03 },
  paw: { len: 0.11, r: 0.058 },
};

// Adds the outline of two circles and the skin stretched between them.
// Every outline winds the same way, so overlapping parts fill as one shape.
function capsule(path, x1, y1, r1, x2, y2, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(r1 - r2) + 1e-6) {
    const big = r1 >= r2;
    const cx = big ? x1 : x2;
    const cy = big ? y1 : y2;
    const r = Math.max(r1, r2);
    path.moveTo(cx + r, cy);
    path.arc(cx, cy, r, 0, TAU);
    path.closePath();
    return;
  }
  const a = Math.atan2(dy, dx);
  const phi = Math.acos((r1 - r2) / d);
  path.moveTo(x1 + r1 * Math.cos(a + phi), y1 + r1 * Math.sin(a + phi));
  path.arc(x1, y1, r1, a + phi, a - phi + TAU);
  path.arc(x2, y2, r2, a - phi, a + phi);
  path.closePath();
}

class Bear {
  constructor(rand, shape, size, x, lane) {
    this.shape = shape;
    this.s = size;
    this.x = x;
    this.lane = lane;
    this.phase = rand();
    this.seed = rand() * TAU;
    this.v = 0;
    this.vTarget = 0;
    this.run = 0;
    this.runTarget = 0;
    this.lift = 0; // head: -1 nose to the ground, 0 carried level, 1 raised
    this.liftTarget = 0;
    this.turn = 0; // head: 0 in profile, 1 turned to face the viewer
    this.turnTarget = 0;
    this.moving = 0;
    this.coat = Math.floor(rand() * 100000);
    this.feet = [0, 1, 2, 3].map(() => ({ ax: 0, ay: 0, tx: 0, ty: 0 }));
  }

  step(world) {
    this.v += (this.vTarget - this.v) * 0.06;
    this.run += (this.runTarget - this.run) * 0.07;
    this.lift += (this.liftTarget - this.lift) * 0.06;
    this.turn += (this.turnTarget - this.turn) * 0.07;

    const { s, shape, run } = this;
    const duty = mix(WALK.duty, BOUND.duty, run);
    const stride = mix(WALK.stride, BOUND.stride, run) * s;
    // The phase advances with distance covered, so a planted foot stays put
    // on the ground however fast or slow the animal goes.
    this.phase = (this.phase + this.v / (stride / duty)) % 1;
    this.x += this.v;
    this.moving = Math.min(1, this.v / (s * 0.004));
    const swing = mix(WALK.lift, BOUND.lift, run) * s * this.moving;
    const paw = shape.paw.len * s;
    const pad = shape.paw.r * s;

    for (let i = 0; i < 4; i++) {
      const hind = i % 2 === 0;
      const joint = hind ? shape.hip : shape.shoulder;
      const leg = hind ? shape.hind : shape.fore;
      const p = (this.phase + mix(WALK.offsets[i], BOUND.offsets[i], run)) % 1;
      const foot = this.feet[i];
      const home = this.x + (joint[0] + leg.home + (i > 1 ? 0.04 : 0)) * s;
      if (p < duty) {
        // Planted. Near the end of the step the heel peels up off the toe.
        const q = p / duty;
        const heel = home + stride * (0.5 - q);
        const ground = world.terrain(heel) + this.lane;
        const peel = q > 0.78 ? ((q - 0.78) / 0.22) * 0.55 * this.moving : 0;
        foot.tx = heel + paw;
        foot.ty = ground - pad;
        foot.ax = foot.tx - paw * Math.cos(peel);
        foot.ay = foot.ty - paw * Math.sin(peel);
      } else {
        // Swinging forward, toes hanging.
        const u = (p - duty) / (1 - duty);
        const heel = home + stride * (smooth(u) - 0.5);
        const ground = world.terrain(heel) + this.lane;
        const droop = 0.6 * Math.sin(Math.PI * u) * (1 - u) * this.moving;
        foot.ax = heel;
        foot.ay = ground - pad - swing * Math.sin(Math.PI * u);
        foot.tx = foot.ax + paw * Math.cos(droop);
        foot.ty = foot.ay + paw * Math.sin(droop);
      }
    }

    // How the trunk rides on the legs this instant.
    const wave = TAU * this.phase;
    this.groundHip = world.terrain(this.x + shape.hip[0] * s);
    this.groundShoulder = world.terrain(this.x + shape.shoulder[0] * s);
    this.bob =
      s * 0.01 * Math.cos(2 * wave) * this.moving * (1 - run) + run * s * 0.075 * Math.max(0, Math.sin(wave + 0.5));
    this.hipDip = s * 0.012 * Math.cos(2 * wave + 0.6) * this.moving;
    this.shoulderDip = s * 0.012 * Math.cos(2 * (wave + TAU * 0.22) + 0.6) * this.moving;
    this.pitch = run * 0.2 * Math.sin(wave + 2.2);
    // The shoulder blade of the planted near fore leg rides up under the skin.
    const nearFore = (this.phase + mix(WALK.offsets[1], BOUND.offsets[1], run)) % 1;
    this.roll = 0.022 * Math.cos(TAU * (nearFore - WALK.duty / 2)) * this.moving;
    // The head nods with the stride, and swings on the neck when raised or lowered.
    this.headAngle =
      shape.carry + (this.lift >= 0 ? this.lift * 0.5 : this.lift * 0.66) + 0.03 * Math.cos(2 * wave + 1.2) * this.moving;
    this.yaw = mix(1, 0.12, smooth(clamp(this.turn, 0, 1)));
  }

  // Body coordinates (in body lengths) to scene pixels.
  at(bx, by) {
    const { shape, s } = this;
    const t = (bx - shape.hip[0]) / (shape.shoulder[0] - shape.hip[0]);
    const ground = mix(this.groundHip, this.groundShoulder, clamp(t, -0.7, 1.7)) + this.lane;
    const dip = mix(this.hipDip, this.shoulderDip, clamp(t, 0, 1));
    return [this.x + bx * s, ground - by * s - this.bob - dip - bx * s * this.pitch];
  }

  // Where a point of the neck or head is once the head has been turned and swung.
  posed(x, y, weight, foreshorten = true) {
    if (!weight) return this.at(x, y);
    const { pivot, skull } = this.shape;
    if (foreshorten) x = skull[0] + (x - skull[0]) * mix(1, this.yaw, weight * weight);
    const angle = this.headAngle * weight;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    return this.at(pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos);
  }

  // Adds one leg to `path` and returns its bones as [x1, y1, r1, x2, y2, r2] pairs.
  addLeg(path, i) {
    const { shape, s } = this;
    const hind = i % 2 === 0;
    const leg = hind ? shape.hind : shape.fore;
    const joint = hind ? shape.hip : shape.shoulder;
    const foot = this.feet[i];
    const [jx, jy] = this.at(joint[0] + (i > 1 ? 0.04 : 0), joint[1]);
    const a = leg.upper * s;
    const b = leg.lower * s;
    let dx = foot.ax - jx;
    let dy = foot.ay - jy;
    const reach = Math.hypot(dx, dy) || 1;
    const d = clamp(reach, Math.abs(a - b) + 0.5, a + b - 0.5);
    dx = (dx / reach) * d;
    dy = (dy / reach) * d;
    const ax = jx + dx;
    const ay = jy + dy;
    // Two-bone solve. A bear's knee points forward, its elbow back.
    const bend = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1)) * (hind ? -1 : 1);
    const base = Math.atan2(dy, dx);
    const kx = jx + a * Math.cos(base + bend);
    const ky = jy + a * Math.sin(base + bend);
    capsule(path, jx, jy, leg.r[0] * s, kx, ky, leg.r[1] * s);
    capsule(path, kx, ky, leg.r[1] * s, ax, ay, leg.r[2] * s);
    capsule(path, ax, ay, leg.r[2] * s * 0.9, foot.tx + (ax - foot.ax), foot.ty + (ay - foot.ay), shape.paw.r * s);
    return [
      [jx, jy, leg.r[0] * s, kx, ky, leg.r[1] * s],
      [kx, ky, leg.r[1] * s, ax, ay, leg.r[2] * s],
    ];
  }

  // One tuft of fur: a sliver rooted just inside the edge at (px, py), lying
  // outward along the normal (nx, ny) and swept back and down the way a coat
  // lies. Every tuft has a number, so its length never changes between frames.
  // Tufts on the animal's upper edges also go into `glow`, a little longer.
  tuft(fur, glow, px, py, nx, ny, scale, k) {
    const s = this.s;
    const len = s * 0.04 * (0.4 + 1.2 * hash2(k, this.coat)) * scale;
    let dx = nx * 0.75 - 0.75;
    let dy = ny * 0.75 + 0.4;
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy /= m;
    if (dx * nx + dy * ny < 0.2) {
      dx = nx;
      dy = ny;
    }
    const half = Math.max(s * 0.011, 2.2);
    const tx = -ny;
    const ty = nx;
    const rx = px - nx * half;
    const ry = py - ny * half;
    fur.moveTo(rx - tx * half, ry - ty * half);
    fur.lineTo(px + dx * len, py + dy * len);
    fur.lineTo(rx + tx * half, ry + ty * half);
    fur.closePath();
    if (glow && ny < -0.2) {
      const reach = len * 1.3 + s * 0.01;
      glow.moveTo(rx - tx * half * 1.3, ry - ty * half * 1.3);
      glow.lineTo(px + dx * reach, py + dy * reach);
      glow.lineTo(rx + tx * half * 1.3, ry + ty * half * 1.3);
      glow.closePath();
    }
  }

  // The bear is made of characters, and of nothing else: no lines inside it,
  // no edges round its legs. Its shape comes from tone alone. Moonlight sits
  // in the fur along its back, the coat darkens down towards the belly and
  // legs, and the two legs on its far side are a shade dimmer than the near.
  draw(ctx, sceneX) {
    const { shape, s } = this;
    ctx.save();
    ctx.translate(sceneX - this.x, 0);

    const body = new Path2D();
    const fur = new Path2D();
    const far = new Path2D();
    const farFur = new Path2D();
    const glow = new Path2D();
    const crest = new Path2D();
    let k = 0;

    // Trunk, neck and head: one smooth closed curve through the outline.
    const outline = shape.outline;
    const pts = outline.map(([x, y, w]) => {
      const lifted = w === 0 && y > 0.7 ? y + this.roll * Math.exp(-Math.pow((x - 0.17) / 0.13, 2)) : y;
      return this.posed(x, lifted, w);
    });
    const n = pts.length;
    body.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) {
      const next = pts[(i + 1) % n];
      body.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + next[0]) / 2, (pts[i][1] + next[1]) / 2);
    }
    body.closePath();

    // Fur all the way round it: long under the belly, short on the face.
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const el = Math.hypot(ex, ey) || 1;
      const nx = ey / el;
      const ny = -ex / el;
      const face = (outline[i][2] + outline[(i + 1) % n][2]) / 2;
      const scale = (ny > 0.5 ? 1.35 : 1) * mix(1, 0.35, face * face);
      for (let j = 0; j < 7; j++) {
        const t = (j + 0.5) / 7;
        this.tuft(fur, glow, a[0] + ex * t, a[1] + ey * t, nx, ny, scale, k++);
      }
      if (ny < -0.25) {
        crest.moveTo(a[0], a[1]);
        crest.lineTo(b[0], b[1]);
      }
    }

    // The skull keeps the head round when it turns towards the viewer, and
    // the ears swing apart as it does.
    const [sx0, sy0, sr] = shape.skull;
    const [hx, hy] = this.posed(sx0, sy0, 1);
    body.moveTo(hx + sr * s, hy);
    body.arc(hx, hy, sr * s, 0, TAU);
    body.closePath();
    const facing = 1 - this.yaw;
    const E = shape.ears;
    for (const [ex, ey, side] of [[E.far[0], E.far[1], 1], [E.near[0], E.near[1], -1]]) {
      const [cx, cy] = this.posed(sx0 + mix(ex, side * E.spread, facing), sy0 + ey, 1, false);
      body.moveTo(cx + E.r * s, cy);
      body.arc(cx, cy, E.r * s, 0, TAU);
      body.closePath();
      for (let j = 0; j < 6; j++) {
        const a = Math.PI * (1.05 + (0.9 * j) / 5);
        this.tuft(fur, glow, cx + Math.cos(a) * E.r * s, cy + Math.sin(a) * E.r * s, Math.cos(a), Math.sin(a), 0.4, k++);
      }
    }

    // Legs: shaggy down both sides, shorter than the body's coat.
    for (let i = 0; i < 4; i++) {
      const near = i < 2;
      for (const [x1, y1, r1, x2, y2, r2] of this.addLeg(near ? body : far, i)) {
        const ux = x2 - x1;
        const uy = y2 - y1;
        const ul = Math.hypot(ux, uy) || 1;
        for (const side of [1, -1]) {
          const nx = (-uy / ul) * side;
          const ny = (ux / ul) * side;
          for (let j = 0; j < 4; j++) {
            const t = (j + 0.5) / 4;
            const r = mix(r1, r2, t);
            this.tuft(near ? fur : farFur, null, x1 + ux * t + nx * r, y1 + uy * t + ny * r, nx, ny, 0.6, k++);
          }
        }
      }
    }

    const groundY = Math.max(this.groundHip, this.groundShoulder) + this.lane;
    const coat = (strength) => {
      const g = ctx.createLinearGradient(0, groundY - s * 0.8, 0, groundY);
      g.addColorStop(0, `rgba(255,255,255,${0.82 * strength})`);
      g.addColorStop(0.35, `rgba(255,255,255,${0.66 * strength})`);
      g.addColorStop(0.7, `rgba(255,255,255,${0.56 * strength})`);
      g.addColorStop(1, `rgba(255,255,255,${0.52 * strength})`);
      return g;
    };
    const lay = (shapePath, furPath, strength) => {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fill(shapePath);
      ctx.fillStyle = coat(strength);
      ctx.fill(shapePath);
      ctx.fill(furPath);
    };

    lay(far, farFur, 0.5);

    // Moonlight goes down first and the coat over it, so what is left is the
    // tips of the fur along the back, shining.
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.9;
    ctx.fill(glow);
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(s * 0.07, 10);
    ctx.globalAlpha = 0.95;
    ctx.stroke(crest);
    lay(body, fur, 1);

    // Tufts within the coat, a little lighter or darker than the fur around them.
    ctx.save();
    ctx.clip(body);
    ctx.lineWidth = Math.max(s * 0.016, 2.6);
    for (let i = 0; i < 90; i++) {
      const [fx, fy] = this.at(-0.5 + 1.1 * hash2(i, this.coat + 1), 0.26 + 0.52 * hash2(i, this.coat + 2));
      const len = s * (0.025 + 0.04 * hash2(i, this.coat + 3));
      const dark = hash2(i, this.coat + 4) < 0.6;
      ctx.strokeStyle = dark ? '#000' : '#fff';
      ctx.globalAlpha = dark ? 0.22 : 0.16;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx - len * 0.75, fy + len * 0.65);
      ctx.stroke();
    }
    // One dark eye.
    const [eyeX, eyeY] = this.posed(sx0 + shape.eye[0], sy0 + shape.eye[1], 1);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, Math.max(s * 0.02, 2.4), 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

export class Horizon {
  constructor(width, height, seed) {
    this.rand = mulberry32(seed);
    const rand = this.rand;
    this.time = 0;
    this.pointer = null;
    this.dir = rand() < 0.5 ? 1 : -1; // which way the family is heading
    this.salt = Math.floor(rand() * 100000);
    this.wobble = [rand() * TAU, rand() * TAU, rand() * TAU];
    this.resize(width, height);

    // One body length for the mother; everything else is measured against it.
    const narrow = width < 600;
    this.L = Math.max(60, Math.min(width * (narrow ? 0.52 : 0.36), height * 0.42, 480));
    const L = this.L;
    this.amp = L * 0.03;
    this.cruise = (L * 0.32) / STEPS_PER_SECOND;

    this.mother = new Bear(rand, ADULT, L, 0, 0);
    this.mother.state = 'walk';
    this.mother.waited = 0;
    this.mother.v = this.cruise;

    const litter = width > 900 && rand() < 0.45 ? 3 : 2;
    const lanes = [0.02, -0.014, 0.034];
    this.cubs = [];
    for (let i = 0; i < litter; i++) {
      const cub = new Bear(rand, CUB, L * (0.52 + rand() * 0.06), 0, L * lanes[i]);
      // On a wide screen the cubs string out behind her. On a narrow one the
      // first cub keeps right at her heels, so there is always one in view.
      cub.gap = L * ((narrow ? 0.72 : 0.94) + i * 0.75 + rand() * 0.08);
      cub.x = -cub.gap;
      cub.v = this.cruise;
      cub.state = 'follow';
      cub.timer = 120 + rand() * 300;
      cub.cooldown = 0;
      cub.pose = 0;
      this.cubs.push(cub);
    }
    this.cam = this.mother.x - this.lead();

    this.stars = [];
    const count = Math.round((width * height) / 8500);
    for (let i = 0; i < count; i++) {
      this.stars.push({ x: rand(), y: rand() * 0.74, a: 0.3 + rand() * 0.6, w: 0.01 + rand() * 0.05, p: rand() * TAU });
    }
    this.moon = { phase: 0.45 + rand() * 0.9 };

    // Let the family fall into step before anyone looks.
    for (let i = 0; i < 240; i++) this.step();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.ground = height * 0.86;
  }

  // Where on the screen the mother walks: placed so the whole family is
  // centred when it fits, and otherwise as far forward as her nose allows.
  lead() {
    return Math.min(this.width / 2 + this.L * 0.61, this.width - this.L * 0.86);
  }

  // Height of the land (scene y, pixels) at a world x.
  terrain(x) {
    const [a, b, c] = this.wobble;
    return this.ground + this.amp * (0.6 * Math.sin(x * 0.0041 + a) + 0.3 * Math.sin(x * 0.0127 + b) + 0.1 * Math.sin(x * 0.031 + c));
  }

  // The pointer in world coordinates, or null.
  pointerInWorld() {
    if (!this.pointer) return null;
    const sx = this.dir > 0 ? this.pointer.x : this.width - this.pointer.x;
    return { x: sx + this.cam, y: this.pointer.y };
  }

  step() {
    this.time++;
    const { mother, L, rand } = this;
    const pointer = this.pointerInWorld();
    const close = (bear, reach) =>
      pointer && Math.hypot(pointer.x - (bear.x + bear.s * 0.3), pointer.y - (this.terrain(bear.x) - bear.s * 0.5)) < reach;

    let furthest = 0;
    for (const cub of this.cubs) {
      const gap = cub.gap + L * 0.07 * Math.sin(this.time * 0.008 + cub.seed);
      const behind = mother.x - gap - cub.x; // > 0: further back than it should be
      cub.timer--;
      cub.cooldown--;
      const noticed = close(cub, L * 0.55);
      if (cub.state !== 'curious' && noticed && cub.cooldown <= 0) {
        cub.state = 'curious';
        cub.timer = 110;
      }
      if (cub.state === 'follow') {
        cub.vTarget = clamp(mother.v + behind * 0.03, 0, this.cruise * 1.5);
        cub.runTarget = 0;
        cub.liftTarget = 0;
        cub.turnTarget = 0;
        if (behind > L * 0.75) cub.state = 'hurry';
        else if (cub.timer <= 0 && mother.state === 'walk') {
          // Something on the ground is more interesting than keeping up.
          cub.state = 'dawdle';
          cub.timer = 50 + rand() * 95;
          cub.pose = rand() < 0.65 ? -1 : 0.85;
        }
      } else if (cub.state === 'dawdle') {
        cub.vTarget = 0;
        cub.runTarget = 0;
        cub.liftTarget = cub.pose;
        if (cub.timer <= 0) cub.state = 'hurry';
      } else if (cub.state === 'curious') {
        cub.vTarget = 0;
        cub.runTarget = 0;
        cub.liftTarget = 1;
        cub.turnTarget = 1;
        if (cub.timer <= 0 || !noticed) {
          cub.state = 'hurry';
          cub.cooldown = 260;
        }
      } else {
        // hurry: bound after the others until back in place
        cub.vTarget = this.cruise * 2.4;
        cub.runTarget = 1;
        cub.liftTarget = 0.25;
        cub.turnTarget = 0;
        if (behind < L * 0.12) {
          cub.state = 'follow';
          cub.timer = 150 + rand() * 340;
        }
      }
      cub.step(this);
      furthest = Math.max(furthest, behind);
    }

    if (mother.state === 'walk') {
      mother.vTarget = this.cruise;
      mother.turnTarget = 0;
      // Mostly head carried level; now and then nose down to the ground.
      const sniff = Math.pow(Math.max(0, Math.sin(this.time * 0.006 + mother.seed)), 6);
      mother.liftTarget = close(mother, L * 0.7) ? 0.75 : -0.7 * sniff;
      if (furthest > L * 1.5) {
        mother.state = 'wait';
        mother.waited = 0;
      }
    } else {
      // A cub is too far back: stop, lift her head, look round, and wait for it.
      mother.vTarget = 0;
      mother.turnTarget = 1;
      mother.liftTarget = 0.7;
      mother.waited++;
      if (furthest < L * 0.45 && mother.waited > 45) mother.state = 'walk';
    }
    mother.step(this);

    // Follow smoothly, but lead by her speed so she does not slide off her mark.
    this.cam += (mother.x + mother.v * 15.7 - this.lead() - this.cam) * 0.06;
  }

  // An evergreen far taller than the screen: a trunk, and tier on tier of
  // drooping boughs with a ragged underside. Only its lower part is ever in
  // view. `tone` is how much light it gives; it is always faint.
  evergreen(ctx, x, base, h, tone, id) {
    const { width, height } = this;
    const spread = h * 0.2;
    const trunk = h * 0.015;
    if (x + spread < -20 || x - spread > width + 20) return;

    const bole = new Path2D();
    bole.moveTo(x - trunk, base);
    bole.lineTo(x - trunk * 0.35, base - h);
    bole.lineTo(x + trunk * 0.35, base - h);
    bole.lineTo(x + trunk, base);
    bole.closePath();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fill(bole);
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = tone * 0.85;
    ctx.fill(bole);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(trunk * 0.3, 2.5);
    ctx.globalAlpha = tone * 1.5;
    ctx.beginPath();
    ctx.moveTo(x - trunk * 0.7, base);
    ctx.lineTo(x - trunk * 0.25, base - h);
    ctx.stroke();

    // Boughs: a spine sweeping out and down from the trunk, hung with strands
    // of needles. Nothing is filled in, so the sky shows through.
    const tiers = 14;
    const gap = (h * 0.8) / tiers;
    ctx.lineCap = 'round';
    for (let j = 1; j <= tiers; j++) {
      const f = j / tiers;
      const tipY = base - h * 0.2 - (1 - f) * h * 0.8;
      if (tipY < -gap || tipY - gap * 1.4 > height) continue;
      for (const side of [-1, 1]) {
        const pick = hash2(id * 31 + j, this.salt + (side > 0 ? 80 : 81));
        const reach = spread * (0.1 + 0.9 * f) * (0.8 + 0.35 * pick);
        const rootY = tipY - gap * (0.75 + 0.3 * pick);
        const spine = (t) => {
          // out along the bough: rises a little, then droops to its tip
          const u = 1 - t;
          const cx = x + side * reach * 0.5;
          const cy = rootY - gap * 0.12;
          return [u * u * x + 2 * u * t * cx + t * t * (x + side * reach), u * u * rootY + 2 * u * t * cy + t * t * tipY];
        };
        ctx.lineWidth = 3;
        ctx.globalAlpha = tone * 2.2;
        ctx.beginPath();
        ctx.moveTo(x, rootY);
        ctx.quadraticCurveTo(x + side * reach * 0.5, rootY - gap * 0.12, x + side * reach, tipY);
        ctx.stroke();

        const strands = Math.max(4, Math.round(reach / 15));
        ctx.lineWidth = 2.6;
        for (let q = 1; q <= strands; q++) {
          const t = (q - 0.5 * hash2(id * 131 + j * 17 + q, this.salt + 83)) / strands;
          const [px, py] = spine(t);
          const drop = gap * (0.25 + 0.75 * hash2(id * 131 + j * 17 + q, this.salt + 82)) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
          const sway = Math.sin(this.time * 0.02 + px * 0.01 + j) * gap * 0.03;
          ctx.globalAlpha = tone * (1.6 + 2.2 * hash2(id * 131 + j * 17 + q, this.salt + 84));
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px + side * drop * 0.1, py + drop * 0.6, px + side * drop * 0.16 + sway, py + drop);
          ctx.stroke();
        }
      }
    }
  }

  // Trees stand at fixed places in their own layer; only the ones in view are drawn.
  drawForest(ctx, { parallax, spacing, chance, low, high, tone, salt }) {
    const offset = this.cam * parallax;
    const margin = this.height * high * 0.2 + 40;
    const first = Math.floor((offset - margin) / spacing);
    const last = Math.ceil((offset + this.width + margin) / spacing);
    for (let k = first; k <= last; k++) {
      if (hash2(k, this.salt + salt) > chance) continue;
      const sx = k * spacing + hash2(k, this.salt + salt + 1) * spacing * 0.6 - offset;
      const h = this.height * mix(low, high, hash2(k, this.salt + salt + 2));
      this.evergreen(ctx, sx, this.ground + this.amp, h, tone * (0.8 + 0.4 * hash2(k, this.salt + salt + 3)), k);
    }
  }

  // Mist lying along the ground: soft patches that drift, thickest low down.
  // It is what the bears are seen against.
  drawMist(ctx, { parallax, spacing, rise, strength, salt, drift }) {
    const { L } = this;
    const offset = this.cam * parallax + this.time * drift;
    const first = Math.floor((offset - L) / spacing);
    const last = Math.ceil((offset + this.width + L) / spacing);
    ctx.fillStyle = '#fff';
    for (let k = first; k <= last; k++) {
      const a = hash2(k, this.salt + salt);
      const b = hash2(k, this.salt + salt + 1);
      const c = hash2(k, this.salt + salt + 2);
      const rx = L * (0.3 + 0.5 * b);
      const ry = rx * (0.22 + 0.2 * c);
      const cx = k * spacing + a * spacing - offset;
      const cy = this.ground - L * rise * a * a - ry * 0.2;
      const puff = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      puff.addColorStop(0, 'rgba(255,255,255,1)');
      puff.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.globalAlpha = strength * (0.45 + 0.55 * c) * (1 - 0.5 * a);
      ctx.fillStyle = puff;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawSky(ctx) {
    const { width, height, moon } = this;
    const mx = width * 0.15;
    const my = height * 0.17;
    const r = clamp(Math.min(width, height) * 0.075, 24, 70);

    ctx.fillStyle = '#fff';
    for (const star of this.stars) {
      const sx = star.x * width;
      const sy = star.y * height;
      if (sy > this.ground - 12) continue;
      if (Math.hypot(sx - mx, sy - my) < r * 1.6) continue;
      ctx.globalAlpha = star.a * (0.55 + 0.45 * Math.sin(this.time * star.w + star.p));
      ctx.fillRect(sx, sy, 3.6, 3.6);
    }

  }

  drawMoon(ctx) {
    const { width, height, moon } = this;
    const mx = width * 0.15;
    const my = height * 0.17;
    const r = clamp(Math.min(width, height) * 0.075, 24, 70);
    ctx.fillStyle = '#fff';
    // The moon: a lit disc with the shadow of its phase laid over it.
    const disc = new Path2D();
    disc.arc(mx, my, r, 0, TAU);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fill(disc);
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.92;
    ctx.fill(disc);
    ctx.save();
    ctx.clip(disc);
    ctx.fillStyle = '#000';
    ctx.globalAlpha = 0.22;
    for (const [dx, dy, dr] of [[-0.3, -0.25, 0.3], [0.1, 0.3, 0.24], [-0.45, 0.3, 0.16], [0.25, -0.4, 0.14]]) {
      ctx.beginPath();
      ctx.arc(mx + dx * r, my + dy * r, dr * r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.arc(mx + r * moon.phase, my - r * 0.12, r * 1.04, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawGround(ctx) {
    const { width, height, cam } = this;
    const edge = new Path2D();
    for (let x = -8; x <= width + 8; x += 6) {
      const y = this.terrain(x + cam);
      if (x === -8) edge.moveTo(x, y);
      else edge.lineTo(x, y);
    }
    const land = new Path2D(edge);
    land.lineTo(width + 8, height);
    land.lineTo(-8, height);
    land.closePath();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fill(land);
    const soil = ctx.createLinearGradient(0, this.ground - this.amp, 0, this.ground + height * 0.15);
    soil.addColorStop(0, 'rgba(255,255,255,0.16)');
    soil.addColorStop(0.14, 'rgba(255,255,255,0.03)');
    soil.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = soil;
    ctx.fill(land);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.62;
    ctx.stroke(edge);

    // Stones in the soil, and now and then a boulder on it.
    ctx.fillStyle = '#fff';
    const first = Math.floor((cam - 20) / 6);
    const last = Math.ceil((cam + width + 20) / 6);
    for (let k = first; k <= last; k++) {
      if (hash2(k, this.salt + 40) > 0.5) continue;
      const wx = k * 6 + hash2(k, this.salt + 41) * 5;
      const deep = Math.pow(hash2(k, this.salt + 42), 1.7);
      const depth = 7 + deep * height * 0.13;
      ctx.globalAlpha = (0.2 + 0.5 * hash2(k, this.salt + 43)) * (1 - deep);
      ctx.fillRect(wx - cam, this.terrain(wx) + depth, 4, 4);
    }
    const span = Math.max(360, this.L * 1.5);
    for (let k = Math.floor((cam - 200) / span); k <= Math.ceil((cam + width + 200) / span); k++) {
      if (hash2(k, this.salt + 50) > 0.55) continue;
      const wx = k * span + hash2(k, this.salt + 51) * span * 0.6;
      const rx = this.L * (0.06 + 0.1 * hash2(k, this.salt + 52));
      const ry = rx * (0.5 + 0.25 * hash2(k, this.salt + 53));
      const y = this.terrain(wx) + ry * 0.25;
      const rock = new Path2D();
      rock.ellipse(wx - cam, y, rx, ry, 0, Math.PI, TAU);
      rock.closePath();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fill(rock);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.2;
      ctx.fill(rock);
      ctx.globalAlpha = 0.62;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(wx - cam, y, rx, ry, 0, Math.PI * 1.08, Math.PI * 1.7);
      ctx.stroke();
    }
  }

  // Blades stand at fixed places along the ground, taller in patches, and lean in the wind.
  drawGrass(ctx, front) {
    const { cam, width, L } = this;
    const spacing = front ? 21 : 7;
    const scale = L / 300;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.4;
    const first = Math.floor((cam - 20) / spacing);
    const last = Math.ceil((cam + width + 20) / spacing);
    for (let k = first; k <= last; k++) {
      const pick = hash2(k, this.salt + (front ? 60 : 70));
      if (pick > (front ? 0.36 : 0.62)) continue;
      const wx = k * spacing + hash2(k, this.salt + 61) * spacing * 0.8;
      const patch = noise1(wx * 0.004, this.salt + 62);
      const tall = front ? 4 + 7 * hash2(k, this.salt + 63) : (3 + 11 * hash2(k, this.salt + 63)) * (0.5 + 2.2 * patch * patch);
      const h = tall * scale;
      const sway = Math.sin(this.time * 0.045 + wx * 0.02) * h * 0.14;
      const lean = (hash2(k, this.salt + 64) - 0.5) * h * 0.7 + sway;
      const y = this.terrain(wx) + (front ? L * 0.045 : 1);
      ctx.globalAlpha = front ? 0.5 : 0.26 + 0.3 * pick;
      ctx.beginPath();
      ctx.moveTo(wx - cam, y);
      ctx.quadraticCurveTo(wx - cam + lean * 0.3, y - h * 0.6, wx - cam + lean, y - h);
      ctx.stroke();
    }
  }

  // `light` is the buffer the characters are made from. Only the moon's glow
  // goes through `soft`, at half resolution, so it comes out blurred.
  draw(light, soft) {
    const { width, height } = this;
    const aim = (ctx) => {
      const sx = ctx.canvas.width / width;
      const sy = ctx.canvas.height / height;
      // Heading left is the same scene, mirrored.
      if (this.dir > 0) ctx.setTransform(sx, 0, 0, sy, 0, 0);
      else ctx.setTransform(-sx, 0, 0, sy, ctx.canvas.width, 0);
    };

    soft.setTransform(1, 0, 0, 1, 0, 0);
    soft.globalAlpha = 1;
    soft.fillStyle = '#000';
    soft.fillRect(0, 0, soft.canvas.width, soft.canvas.height);
    aim(soft);
    const mx = width * 0.15;
    const my = height * 0.17;
    const r = clamp(Math.min(width, height) * 0.075, 24, 70);
    const glow = soft.createRadialGradient(mx, my, r * 0.9, mx, my, r * 2.2);
    glow.addColorStop(0, 'rgba(255,255,255,0.07)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    soft.fillStyle = glow;
    soft.fillRect(mx - r * 4, my - r * 4, r * 8, r * 8);

    light.setTransform(1, 0, 0, 1, 0, 0);
    light.globalAlpha = 1;
    light.imageSmoothingEnabled = true;
    light.drawImage(soft.canvas, 0, 0, light.canvas.width, light.canvas.height);
    aim(light);

    // Back to front: sky, the forest, mist, the ground, the family, more mist.
    const stand = Math.max(width, 720);
    this.drawSky(light);
    this.drawForest(light, { parallax: 0.3, spacing: stand * 0.36, chance: 0.72, low: 1.25, high: 1.7, tone: 0.06, salt: 10 });
    this.drawForest(light, { parallax: 0.6, spacing: stand * 0.58, chance: 0.7, low: 1.9, high: 2.6, tone: 0.11, salt: 20 });
    this.drawMoon(light);
    // A faint glow low down, and drifting patches of mist over it. Both stay
    // dimmer than the bears, who walk in front of them.
    const band = light.createLinearGradient(0, this.ground - this.L * 0.85, 0, this.ground);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(1, 'rgba(255,255,255,0.05)');
    light.globalAlpha = 1;
    light.fillStyle = band;
    light.fillRect(-8, this.ground - this.L * 0.85, width + 16, this.L * 0.85 + this.amp * 2);
    this.drawMist(light, { parallax: 0.75, spacing: this.L * 0.26, rise: 0.9, strength: 0.15, salt: 30, drift: 0.12 });
    this.drawGround(light);
    this.drawGrass(light, false);
    const family = [this.mother, ...this.cubs].sort((a, b) => a.lane - b.lane);
    for (const bear of family) bear.draw(light, bear.x - this.cam);
    this.drawMist(light, { parallax: 1.1, spacing: this.L * 0.9, rise: 0.12, strength: 0.07, salt: 35, drift: 0.2 });
    this.drawGrass(light, true);
    light.globalAlpha = 1;
  }
}
