export const METHOD_STATE_RANGES = Object.freeze({
  "open-field": Object.freeze([0, 0.08]),
  frame: Object.freeze([0.08, 0.27]),
  source: Object.freeze([0.27, 0.46]),
  assess: Object.freeze([0.46, 0.65]),
  test: Object.freeze([0.65, 0.84]),
  decide: Object.freeze([0.84, 0.97]),
  release: Object.freeze([0.97, 1]),
});
export const METHOD_STATES = Object.freeze(Object.keys(METHOD_STATE_RANGES));

const clamp = (value) => Math.min(1, Math.max(0, value));
const round = (value) => Number(clamp(value).toFixed(6));

function normalizeProgress(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  return clamp(numeric);
}

function rangeProgress(progress, range) {
  const [start, end] = range;
  return round((progress - start) / Math.max(Number.EPSILON, end - start));
}

function stateFor(progress) {
  if (progress < 0.08) return "open-field";
  if (progress < 0.27) return "frame";
  if (progress < 0.46) return "source";
  if (progress < 0.65) return "assess";
  if (progress < 0.84) return "test";
  if (progress < 0.97) return "decide";
  return "release";
}

export function projectMethodProgress(inputProgress) {
  const progress = round(normalizeProgress(inputProgress));
  const openField = rangeProgress(progress, METHOD_STATE_RANGES["open-field"]);
  const frame = rangeProgress(progress, METHOD_STATE_RANGES.frame);
  const source = rangeProgress(progress, METHOD_STATE_RANGES.source);
  const assess = rangeProgress(progress, METHOD_STATE_RANGES.assess);
  const test = rangeProgress(progress, METHOD_STATE_RANGES.test);
  const decide = rangeProgress(progress, METHOD_STATE_RANGES.decide);
  const release = rangeProgress(progress, METHOD_STATE_RANGES.release);

  const framePressure = frame;
  const frameAperture = frame;
  // pathLength=1: SOURCE resolves the actual offset 1 -> 0.
  const candidateDash = round(1 - source);
  const candidateOpacity = round(source * (1 - assess * 0.54) * (1 - test * 0.28) * (1 - decide * 0.18));
  const rejectedCollapse = assess;
  const history = round(source * 0.48 + assess * 0.35 + test * 0.12 + decide * 0.05);
  const contact = round(test * (1 - decide * 0.25));
  const testSurface = test;
  const decisionLock = decide;
  const decisionSignal = decide;
  const fieldNoise = round(0.82 - frame * 0.2 + source * 0.34 - assess * 0.38 - test * 0.34 - decide * 0.2 - release * 0.04);
  const workpieceClarity = round(0.16 + frame * 0.2 + assess * 0.24 + test * 0.16 + decide * 0.24);

  return {
    progress,
    state: stateFor(progress),
    openField,
    frame,
    source,
    assess,
    test,
    decide,
    release,
    framePressure,
    frameAperture,
    candidateDash,
    candidateOpacity,
    rejectedCollapse,
    history,
    contact,
    testSurface,
    decisionLock,
    decisionSignal,
    fieldNoise,
    workpieceClarity,
  };
}
