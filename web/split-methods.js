import { PRESETS } from './core.js';

export const DEFAULT_SPLIT_METHODS = [
  { id: 'beginner', name: 'Beginner', steps: PRESETS.beginner },
  { id: 'cfop', name: 'CFOP', steps: PRESETS.cfop },
  { id: 'cfop-detailed', name: 'CFOP · individual pairs', steps: ['Cross', 'F2L pair 1', 'F2L pair 2', 'F2L pair 3', 'F2L pair 4', 'OLL', 'PLL'] },
  { id: 'roux', name: 'Roux', steps: ['First block', 'Second block', 'CMLL', 'LSE'] },
];
export const validSplitSteps = steps => Array.isArray(steps) && steps.length >= 1 && steps.length <= 12 && steps.every(step => typeof step === 'string' && step.trim().length > 0 && step.length <= 50);
export const validSplitMethod = method => method && typeof method.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(method.id) && typeof method.name === 'string' && method.name.trim().length > 0 && method.name.length <= 60 && validSplitSteps(method.steps);
export function splitMethods(settings) {
  if (Array.isArray(settings.splitMethods)) return settings.splitMethods;
  const methods = DEFAULT_SPLIT_METHODS.map(method => ({ ...method, steps: [...method.steps] }));
  if (validSplitSteps(settings.custom)) methods.push({ id: 'custom', name: 'Custom', steps: [...settings.custom] });
  return methods;
}
export function selectedSplitSteps(settings) {
  const methods = splitMethods(settings);
  return (methods.find(method => method.id === settings.preset) || methods[0])?.steps || [];
}
