// The walk has no DOM in it, so it can be exercised directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Horizon } from '../js/horizon.js';

const family = (world) => [world.mother, ...world.cubs];

function everyNumber(world) {
  const out = [world.cam];
  for (const bear of family(world)) {
    out.push(bear.x, bear.v, bear.phase, bear.run, bear.lift, bear.turn, bear.bob, bear.pitch, bear.headAngle);
    for (const foot of bear.feet) out.push(foot.ax, foot.ay, foot.tx, foot.ty);
  }
  return out;
}

test('the same seed gives the same walk', () => {
  assert.deepEqual(everyNumber(new Horizon(1200, 800, 7)), everyNumber(new Horizon(1200, 800, 7)));
});

test('different seeds give different walks', () => {
  assert.notDeepEqual(everyNumber(new Horizon(1200, 800, 1)), everyNumber(new Horizon(1200, 800, 2)));
});

test('ten minutes of walking: nothing goes non-finite and no cub is lost', () => {
  const world = new Horizon(1440, 900, 99);
  const start = world.mother.x;
  let hurries = 0;
  for (let i = 0; i < 30 * 600; i++) {
    world.step();
    for (const cub of world.cubs) {
      if (cub.state === 'hurry') hurries++;
      const behind = world.mother.x - cub.x;
      assert.ok(behind > -world.L * 0.5, `cub ran ahead of its mother by ${-behind}`);
      assert.ok(behind < world.L * 5, `cub left ${behind}px behind`);
    }
  }
  for (const n of everyNumber(world)) assert.ok(Number.isFinite(n));
  assert.ok(world.mother.x > start + world.L * 20, 'the mother keeps travelling');
  assert.ok(hurries > 0, 'cubs fall behind and run to catch up');
});

test('a planted foot does not slide along the ground', () => {
  const world = new Horizon(1440, 900, 4);
  const bear = world.mother;
  const offsets = [0, 0.22, 0.5, 0.72];
  const duty = 0.68;
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    const before = bear.feet.map((foot) => foot.tx);
    const was = offsets.map((o) => (bear.phase + o) % 1);
    world.step();
    if (bear.run > 0.001) continue;
    bear.feet.forEach((foot, k) => {
      const now = (bear.phase + offsets[k]) % 1;
      // Both ends of this step inside the same stance: the toe must not have moved.
      if (was[k] > 0.03 && now > was[k] && now < duty - 0.03) {
        assert.ok(Math.abs(foot.tx - before[k]) < 0.01, `foot ${k} slid ${foot.tx - before[k]}px`);
        checked++;
      }
    });
  }
  assert.ok(checked > 500, `only ${checked} planted steps were checked`);
});

test('the mother stops and waits when a cub is far behind, then walks on', () => {
  const world = new Horizon(1440, 900, 11);
  const cub = world.cubs[0];
  cub.x -= world.L * 2.2; // drop a cub well behind
  cub.state = 'dawdle';
  cub.timer = 60;
  let waited = false;
  let resumed = false;
  for (let i = 0; i < 1200; i++) {
    world.step();
    if (world.mother.state === 'wait') waited = true;
    if (waited && world.mother.state === 'walk') resumed = true;
  }
  assert.ok(waited, 'she waited');
  assert.ok(resumed, 'she set off again once it caught up');
});

test('odd screens still work: tiny, very wide, very tall, phone', () => {
  for (const [w, h] of [[1, 1], [4000, 120], [120, 4000], [320, 568], [375, 812]]) {
    const world = new Horizon(w, h, 5);
    for (let i = 0; i < 300; i++) world.step();
    for (const n of everyNumber(world)) assert.ok(Number.isFinite(n), `${w}x${h}`);
  }
});

test('a pointer anywhere, even exactly on a cub, never produces NaN', () => {
  const world = new Horizon(800, 600, 3);
  const cub = world.cubs[0];
  for (const [x, y] of [[cub.x - world.cam, world.terrain(cub.x)], [-9999, 9999], [0, 0], [400, 300]]) {
    world.pointer = { x, y };
    for (let i = 0; i < 150; i++) world.step();
  }
  for (const n of everyNumber(world)) assert.ok(Number.isFinite(n));
});

test('a cub notices a pointer held over it and stops to look', () => {
  const world = new Horizon(1440, 900, 21);
  world.dir = 1;
  const cub = world.cubs[0];
  cub.state = 'follow';
  cub.cooldown = 0;
  let looked = false;
  for (let i = 0; i < 60; i++) {
    world.pointer = { x: cub.x + cub.s * 0.3 - world.cam, y: world.terrain(cub.x) - cub.s * 0.5 };
    world.step();
    if (cub.state === 'curious') looked = true;
  }
  assert.ok(looked);
});

test('resizing keeps the family and moves the ground', () => {
  const world = new Horizon(800, 600, 3);
  const count = world.cubs.length;
  world.resize(800, 520);
  for (let i = 0; i < 60; i++) world.step();
  assert.equal(world.cubs.length, count);
  assert.equal(world.height, 520);
  assert.ok(world.ground < 520);
});
