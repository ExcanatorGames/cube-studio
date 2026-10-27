import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cube } from '../web/cube-solver.js';
import {
  sampleRandomState,
  generateRandomScramble,
} from '../web/random-state.js';
import { createScrambler } from '../web/scrambler.js';

const parity = (values) =>
  values.reduce(
    (sum, value, i) =>
      sum + values.slice(i + 1).filter((other) => other < value).length,
    0,
  ) % 2;
test('random states preserve legal permutations, orientation sums and matching parity', () => {
  const states = new Set();
  for (let i = 0; i < 200; i++) {
    const state = sampleRandomState();
    assert.deepEqual(
      [...state.cp].sort((a, b) => a - b),
      Array.from({ length: 8 }, (_, i) => i),
    );
    assert.deepEqual(
      [...state.ep].sort((a, b) => a - b),
      Array.from({ length: 12 }, (_, i) => i),
    );
    assert.equal(parity(state.cp), parity(state.ep));
    assert.equal(state.co.reduce((a, b) => a + b) % 3, 0);
    assert.equal(state.eo.reduce((a, b) => a + b) % 2, 0);
    states.add(JSON.stringify(state));
  }
  assert.equal(states.size, 200);
});
test('local solver produces usable random-state scrambles without network access', () => {
  const scrambles = Array.from({ length: 3 }, () => generateRandomScramble());
  assert.equal(new Set(scrambles).size, 3);
  for (const scramble of scrambles) {
    assert.match(scramble, /^[URFDLB](?:2|')?(?: [URFDLB](?:2|')?)+$/);
    const cube = new Cube().move(scramble);
    assert.equal(cube.isSolved(), false);
    cube.move(cube.solve());
    assert.equal(cube.isSolved(), true);
  }
});
test('worker failures reject outstanding requests and a subsequent request creates a fresh worker', async () => {
  const workers = [];
  const scrambler = createScrambler({
    workerFactory: () => {
      const worker = {
        postMessage(id) {
          this.id = id;
        },
        terminate() {
          this.terminated = true;
        },
      };
      workers.push(worker);
      return worker;
    },
  });
  const first = scrambler.next(),
    second = scrambler.next();
  workers[0].onerror();
  await assert.rejects(first, /unavailable/);
  await assert.rejects(second, /unavailable/);
  assert.equal(workers[0].terminated, true);
  const third = scrambler.next();
  workers[1].onmessage({ data: { id: workers[1].id, scramble: 'R U' } });
  assert.equal(await third, 'R U');
});
