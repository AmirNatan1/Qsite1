export const TERRITORY_STATE_RANGES = Object.freeze({
  release: Object.freeze([0, 0.1]),
  automotive: Object.freeze([0.1, 0.28]),
  "automotive-logistics": Object.freeze([0.28, 0.36]),
  logistics: Object.freeze([0.36, 0.5]),
  "logistics-manufacturing": Object.freeze([0.5, 0.58]),
  manufacturing: Object.freeze([0.58, 0.72]),
  "manufacturing-energy": Object.freeze([0.72, 0.8]),
  energy: Object.freeze([0.8, 0.91]),
  registration: Object.freeze([0.91, 0.97]),
  proof: Object.freeze([0.97, 1]),
});

export const TERRITORY_STATES = Object.freeze(Object.keys(TERRITORY_STATE_RANGES));

export const TERRITORY_TRACK_KEYFRAMES = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([0.1, 0]),
  Object.freeze([0.22, 0.18]),
  Object.freeze([0.28, 0.22]),
  Object.freeze([0.36, 0.4]),
  Object.freeze([0.46, 0.44]),
  Object.freeze([0.5, 0.44]),
  Object.freeze([0.58, 0.62]),
  Object.freeze([0.68, 0.66]),
  Object.freeze([0.72, 0.66]),
  Object.freeze([0.8, 0.82]),
  Object.freeze([0.88, 0.86]),
  Object.freeze([0.91, 0.86]),
  Object.freeze([0.97, 1]),
  Object.freeze([1, 1]),
]);

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value) => Number(clamp01(value).toFixed(6));

function normalizeProgress(value) {
  let numeric;
  try {
    numeric = Number(value);
  } catch {
    return 0;
  }
  if (!Number.isFinite(numeric)) return 0;
  return clamp01(numeric);
}

function rangeProgress(progress, range) {
  const [start, end] = range;
  return round((progress - start) / (end - start));
}

function stateFor(progress) {
  if (progress < 0.1) return "release";
  if (progress < 0.28) return "automotive";
  if (progress < 0.36) return "automotive-logistics";
  if (progress < 0.5) return "logistics";
  if (progress < 0.58) return "logistics-manufacturing";
  if (progress < 0.72) return "manufacturing";
  if (progress < 0.8) return "manufacturing-energy";
  if (progress < 0.91) return "energy";
  if (progress < 0.97) return "registration";
  return "proof";
}

function trackProgress(progress) {
  for (let index = 1; index < TERRITORY_TRACK_KEYFRAMES.length; index += 1) {
    const [endProgress, endTrack] = TERRITORY_TRACK_KEYFRAMES[index];
    if (progress > endProgress) continue;

    const [startProgress, startTrack] = TERRITORY_TRACK_KEYFRAMES[index - 1];
    const local = (progress - startProgress) / (endProgress - startProgress);
    return round(startTrack + (endTrack - startTrack) * local);
  }
  return 1;
}

export function projectTerritoryProgress(inputProgress) {
  const progress = round(normalizeProgress(inputProgress));
  const release = rangeProgress(progress, TERRITORY_STATE_RANGES.release);
  const automotive = rangeProgress(progress, TERRITORY_STATE_RANGES.automotive);
  const automotiveToLogistics = rangeProgress(
    progress,
    TERRITORY_STATE_RANGES["automotive-logistics"],
  );
  const routing = rangeProgress(progress, TERRITORY_STATE_RANGES.logistics);
  const logisticsToManufacturing = rangeProgress(
    progress,
    TERRITORY_STATE_RANGES["logistics-manufacturing"],
  );
  const tolerance = rangeProgress(progress, TERRITORY_STATE_RANGES.manufacturing);
  const manufacturingToEnergy = rangeProgress(
    progress,
    TERRITORY_STATE_RANGES["manufacturing-energy"],
  );
  const load = rangeProgress(progress, TERRITORY_STATE_RANGES.energy);
  const registration = rangeProgress(progress, TERRITORY_STATE_RANGES.registration);
  const proof = rangeProgress(progress, TERRITORY_STATE_RANGES.proof);

  // Completed territories remain reconstructible as quiet, non-zero trace memory.
  const automotiveResidue = round(automotive * (1 - automotiveToLogistics * 0.72));
  const logisticsResidue = round(routing * (1 - logisticsToManufacturing * 0.74));
  const manufacturingResidue = round(tolerance * (1 - manufacturingToEnergy * 0.7));

  // Noise quiets as Energy resolves into registration and documentary authority.
  const fieldNoise = round(0.74 - load * 0.16 - registration * 0.5 - proof * 0.08);
  // The carrier gains load-bearing weight through Energy, then narrows for Proof.
  const carrierWeight = round(0.22 + load * 0.5 - registration * 0.34 - proof * 0.1);

  return {
    progress,
    state: stateFor(progress),
    release,
    automotive,
    automotiveToLogistics,
    routing,
    logisticsToManufacturing,
    tolerance,
    manufacturingToEnergy,
    load,
    registration,
    proof,
    track: trackProgress(progress),
    fieldNoise,
    carrierWeight,
    automotiveResidue,
    logisticsResidue,
    manufacturingResidue,
  };
}

