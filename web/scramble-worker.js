import { generateRandomScramble } from './random-state.js';

self.onmessage = ({ data: id }) => {
  try {
    self.postMessage({ id, scramble: generateRandomScramble() });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
