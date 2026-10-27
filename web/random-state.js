import { Cube } from './cube-solver.js';

let initialized = false;
function integer(max) {
  const limit = 0x100000000 - (0x100000000 % max);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}
function shuffle(values) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = integer(i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
}
const parity = (values) =>
  values.reduce(
    (sum, value, i) =>
      sum + values.slice(i + 1).filter((other) => other < value).length,
    0,
  ) % 2;
function orient(values, modulus) {
  let sum = 0;
  for (let i = 0; i < values.length - 1; i++)
    sum += values[i] = integer(modulus);
  values[values.length - 1] = (modulus - (sum % modulus)) % modulus;
}

// Uniform legal cubie state: independent permutations, matching parity, and
// constrained orientations. Inverting a solution reproduces the sampled state.
export function sampleRandomState() {
  const state = new Cube().toJSON();
  shuffle(state.cp);
  shuffle(state.ep);
  if (parity(state.cp) !== parity(state.ep))
    [state.ep[0], state.ep[1]] = [state.ep[1], state.ep[0]];
  orient(state.co, 3);
  orient(state.eo, 2);
  return state;
}
export function generateRandomScramble() {
  if (!initialized) {
    Cube.initSolver();
    initialized = true;
  }
  return Cube.inverse(new Cube(sampleRandomState()).solve());
}
