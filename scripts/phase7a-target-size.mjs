export const TARGET_SIZE_SCHEMA = "quantum-hub.phase-7a-r1.target-size.v1";
export const TARGET_MINIMUM_CSS_PIXELS = 44;

export const TARGET_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
  "[role='menuitem']",
  "[role='option']",
  "[role='combobox']",
  "[tabindex]",
].join(", ");

export const TARGET_EXCLUSION_REASONS = Object.freeze({
  effectiveInert: "effective inert",
  nativeDisabled: "native disabled",
  hiddenAttribute: "hidden attribute",
  cssDisplayNone: "CSS display none",
  cssVisibilityHidden: "CSS visibility hidden",
  cssContentVisibilityHidden: "CSS content visibility hidden",
  closedDetails: "closed details content",
  inputTypeHidden: "hidden input",
});

const EXCLUSION_REASON_BASIS = Object.freeze({
  [TARGET_EXCLUSION_REASONS.effectiveInert]: "effectiveInert",
  [TARGET_EXCLUSION_REASONS.nativeDisabled]: "nativeDisabled",
  [TARGET_EXCLUSION_REASONS.hiddenAttribute]: "hiddenAttribute",
  [TARGET_EXCLUSION_REASONS.cssDisplayNone]: "cssDisplayNone",
  [TARGET_EXCLUSION_REASONS.cssVisibilityHidden]: "cssVisibilityHidden",
  [TARGET_EXCLUSION_REASONS.cssContentVisibilityHidden]: "cssContentVisibilityHidden",
  [TARGET_EXCLUSION_REASONS.closedDetails]: "closedDetails",
  [TARGET_EXCLUSION_REASONS.inputTypeHidden]: "inputTypeHidden",
});

export const VALID_TARGET_EXCLUSION_REASONS = Object.freeze(Object.keys(EXCLUSION_REASON_BASIS));

const REQUIRED_BASIS_FIELDS = Object.freeze([
  "effectiveInert",
  "nativeDisabled",
  "hiddenAttribute",
  "cssDisplayNone",
  "cssVisibilityHidden",
  "cssContentVisibilityHidden",
  "closedDetails",
  "inputTypeHidden",
  "pointerEventsNone",
  "zeroOpacity",
  "ariaHidden",
]);

const VALID_BASIS_FIELDS = Object.freeze(Object.values(EXCLUSION_REASON_BASIS));

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function validViewport(viewport) {
  return viewport
    && typeof viewport === "object"
    && !Array.isArray(viewport)
    && (viewport.id === null || typeof viewport.id === "string")
    && Number.isFinite(viewport.width)
    && viewport.width > 0
    && Number.isFinite(viewport.height)
    && viewport.height > 0;
}

function recordContractFailures(record, index, minimumCssPixels) {
  const label = `target record ${index}`;
  const failures = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return [`${label} must be an object`];
  if (typeof record.route !== "string" || record.route.length === 0) failures.push(`${label} route is missing`);
  if (!validViewport(record.viewport)) failures.push(`${label} viewport is invalid`);
  if (typeof record.state !== "string" || record.state.length === 0) failures.push(`${label} state is missing`);
  if (typeof record.selector !== "string" || record.selector.length === 0) failures.push(`${label} selector is missing`);
  if (typeof record.accessibleName !== "string") failures.push(`${label} accessible name is invalid`);
  if (typeof record.elementType !== "string" || record.elementType.length === 0) failures.push(`${label} element type is missing`);
  if (!finiteNonNegative(record.width)) failures.push(`${label} width is invalid`);
  if (!finiteNonNegative(record.height)) failures.push(`${label} height is invalid`);
  if (finiteNonNegative(record.width) && finiteNonNegative(record.height)
      && record.width >= minimumCssPixels && record.height >= minimumCssPixels) {
    failures.push(`${label} is not below the required target size`);
  }
  if (typeof record.visibility !== "boolean") failures.push(`${label} visibility is invalid`);
  if (typeof record.intendedInteractive !== "boolean") failures.push(`${label} intendedInteractive is invalid`);
  if (!(record.exclusionReason === null || typeof record.exclusionReason === "string")) failures.push(`${label} exclusion reason is invalid`);
  if (!record.exclusionBasis || typeof record.exclusionBasis !== "object" || Array.isArray(record.exclusionBasis)) {
    failures.push(`${label} exclusion basis is missing`);
  } else {
    for (const field of REQUIRED_BASIS_FIELDS) {
      if (typeof record.exclusionBasis[field] !== "boolean") failures.push(`${label} exclusion basis ${field} is invalid`);
    }
  }
  return failures;
}

function matchingValidExclusion(record) {
  if (!record || record.intendedInteractive !== false || typeof record.exclusionReason !== "string") return false;
  const basis = EXCLUSION_REASON_BASIS[record.exclusionReason];
  return Boolean(basis && record.exclusionBasis?.[basis] === true);
}

function basisHasValidExclusion(record) {
  return VALID_BASIS_FIELDS.some((field) => record?.exclusionBasis?.[field] === true);
}

function duplicateRecordFailures(records) {
  const seen = new Set();
  const failures = [];
  records.forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    const viewport = record.viewport && typeof record.viewport === "object"
      ? `${record.viewport.id ?? ""}:${record.viewport.width ?? ""}x${record.viewport.height ?? ""}`
      : "<invalid>";
    const key = `${record.route ?? ""}\u0000${viewport}\u0000${record.state ?? ""}\u0000${record.selector ?? ""}`;
    if (seen.has(key)) failures.push(`target record ${index} duplicates an earlier route/viewport/state/selector`);
    seen.add(key);
  });
  return failures;
}

export function validateTargetSizeRecords(records, { minimumCssPixels = TARGET_MINIMUM_CSS_PIXELS } = {}) {
  const minimumValid = Number.isFinite(minimumCssPixels) && minimumCssPixels > 0;
  const list = Array.isArray(records) ? records : [];
  const contractFailures = [];
  if (!Array.isArray(records)) contractFailures.push("target records must be an array");
  if (!minimumValid) contractFailures.push("minimum target size must be a positive number");
  const minimum = minimumValid ? minimumCssPixels : TARGET_MINIMUM_CSS_PIXELS;
  list.forEach((record, index) => contractFailures.push(...recordContractFailures(record, index, minimum)));
  contractFailures.push(...duplicateRecordFailures(list));

  const targetFailures = list.filter((record) => record?.intendedInteractive === true);
  const validExclusions = list.filter(matchingValidExclusion);
  const unexplainedExclusions = list.filter((record) => record?.intendedInteractive === false && !matchingValidExclusion(record));

  list.forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    if (record.intendedInteractive === true && record.exclusionReason !== null) {
      contractFailures.push(`target record ${index} is active but claims an exclusion`);
    }
    if (record.intendedInteractive === true && basisHasValidExclusion(record)) {
      contractFailures.push(`target record ${index} is active despite a valid exclusion basis`);
    }
    if (record.intendedInteractive === false && record.exclusionReason === null) {
      contractFailures.push(`target record ${index} is excluded without a reason`);
    }
  });

  const status = targetFailures.length === 0
    && unexplainedExclusions.length === 0
    && contractFailures.length === 0
    ? "PASS"
    : "FAIL";

  return {
    schema: TARGET_SIZE_SCHEMA,
    minimumCssPixels: minimum,
    records: list,
    targetFailures,
    validExclusions,
    unexplainedExclusions,
    contractFailures,
    summary: {
      belowMinimum: list.length,
      targetFailures: targetFailures.length,
      validExclusions: validExclusions.length,
      unexplainedExclusions: unexplainedExclusions.length,
      contractFailures: contractFailures.length,
    },
    status,
  };
}

export function validateTargetSizeObservation(observation, options = {}) {
  const records = Array.isArray(observation?.records) ? observation.records : observation?.records;
  const report = validateTargetSizeRecords(records, options);
  const observationFailures = [];
  if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
    observationFailures.push("target observation must be an object");
  }
  if (!Number.isInteger(observation?.candidateCount) || observation.candidateCount < 0) {
    observationFailures.push("target observation candidateCount is invalid");
  } else if (Array.isArray(records) && observation.candidateCount < records.length) {
    observationFailures.push("target observation candidateCount is smaller than its below-minimum records");
  }
  if (observation?.minimumCssPixels !== undefined
      && observation.minimumCssPixels !== report.minimumCssPixels) {
    observationFailures.push("target observation minimum differs from validation authority");
  }
  const contractFailures = [...report.contractFailures, ...observationFailures];
  return {
    ...report,
    candidateCount: Number.isInteger(observation?.candidateCount) ? observation.candidateCount : null,
    contractFailures,
    summary: { ...report.summary, contractFailures: contractFailures.length },
    status: report.targetFailures.length === 0
      && report.unexplainedExclusions.length === 0
      && contractFailures.length === 0
      ? "PASS"
      : "FAIL",
  };
}

export function assertTargetSizePass(recordsOrObservation, options = {}) {
  const report = Array.isArray(recordsOrObservation)
    ? validateTargetSizeRecords(recordsOrObservation, options)
    : validateTargetSizeObservation(recordsOrObservation, options);
  if (report.status !== "PASS") {
    throw new Error(
      `target-size validation failed: ${report.summary.targetFailures} active, `
      + `${report.summary.unexplainedExclusions} unexplained, ${report.summary.contractFailures} contract`,
    );
  }
  return report;
}

// This function is intentionally self-contained so it can be passed directly to
// Playwright's page.evaluate without browser-library or module-scope dependencies.
export function observeTargetSizeCandidates(context = {}) {
  const input = context && typeof context === "object" ? context : {};
  const minimumCssPixels = Number.isFinite(input.minimumCssPixels) && input.minimumCssPixels > 0
    ? input.minimumCssPixels
    : 44;
  const targetSelector = [
    "a[href]", "area[href]", "button", "input", "select", "textarea", "summary",
    "[contenteditable]:not([contenteditable='false'])", "[role='button']", "[role='link']",
    "[role='checkbox']", "[role='radio']", "[role='switch']", "[role='tab']",
    "[role='menuitem']", "[role='option']", "[role='combobox']", "[tabindex]",
  ].join(", ");
  const exclusionReasons = {
    effectiveInert: "effective inert",
    nativeDisabled: "native disabled",
    hiddenAttribute: "hidden attribute",
    cssDisplayNone: "CSS display none",
    cssVisibilityHidden: "CSS visibility hidden",
    cssContentVisibilityHidden: "CSS content visibility hidden",
    closedDetails: "closed details content",
    inputTypeHidden: "hidden input",
  };
  const viewportInput = input.viewport;
  const viewport = {
    id: typeof viewportInput === "string"
      ? viewportInput
      : typeof viewportInput?.id === "string" ? viewportInput.id : null,
    width: Number.isFinite(viewportInput?.width) && viewportInput.width > 0 ? viewportInput.width : innerWidth,
    height: Number.isFinite(viewportInput?.height) && viewportInput.height > 0 ? viewportInput.height : innerHeight,
  };
  const route = typeof input.route === "string" && input.route.length > 0
    ? input.route
    : `${location.pathname}${location.search}${location.hash}`;
  const state = typeof input.state === "string" && input.state.length > 0 ? input.state : "document";
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const escapeIdentifier = (value) => {
    if (globalThis.CSS?.escape) return globalThis.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0).toString(16)} `);
  };
  const escapeAttribute = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  const markerToken = (element) => {
    for (const attribute of ["data-target-id", "data-testid", "data-field-map", "data-field-map-threshold", "data-home-scene", "data-cinematic-shell"]) {
      if (!element.hasAttribute(attribute)) continue;
      const value = element.getAttribute(attribute);
      return value ? `[${attribute}=\"${escapeAttribute(value)}\"]` : `[${attribute}]`;
    }
    return "";
  };
  const stableSelector = (element) => {
    const parts = [];
    let current = element;
    while (current instanceof Element) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${escapeIdentifier(current.id)}`);
        break;
      }
      const marker = markerToken(current);
      if (marker) {
        parts.unshift(`${tag}${marker}`);
        break;
      }
      const parent = current.parentElement;
      let token = tag;
      if (parent) {
        const siblings = [...parent.children].filter((candidate) => candidate.tagName === current.tagName);
        if (siblings.length > 1) token += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(token);
      if (!parent) break;
      current = parent;
    }
    return parts.join(" > ");
  };
  const accessibleName = (element) => {
    const labelledBy = normalize(element.getAttribute("aria-labelledby"));
    if (labelledBy) {
      const label = normalize(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
      if (label) return label;
    }
    const ariaLabel = normalize(element.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;
    const labels = element.labels ? normalize([...element.labels].map((label) => label.textContent ?? "").join(" ")) : "";
    if (labels) return labels;
    if (element.tagName === "INPUT") {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "image") {
        const alt = normalize(element.getAttribute("alt"));
        if (alt) return alt;
      }
      if (["button", "submit", "reset"].includes(type)) {
        const value = normalize(element.getAttribute("value"));
        if (value) return value;
      }
    }
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.("[aria-hidden='true'], script, style").forEach((node) => node.remove());
    clone.querySelectorAll?.("img[alt]").forEach((image) => image.replaceWith(document.createTextNode(image.getAttribute("alt") ?? "")));
    const text = normalize(clone.textContent);
    return text || normalize(element.getAttribute("title"));
  };
  const insideClosedDetails = (element) => {
    let current = element.parentElement;
    while (current) {
      if (current.tagName === "DETAILS" && !current.hasAttribute("open")) {
        const summary = [...current.children].find((child) => child.tagName === "SUMMARY");
        if (!summary || !summary.contains(element)) return true;
      }
      current = current.parentElement;
    }
    return false;
  };

  const elements = [...document.querySelectorAll(targetSelector)];
  const records = [];
  for (const element of elements) {
    const rectangle = element.getBoundingClientRect();
    const width = rectangle.width;
    const height = rectangle.height;
    if (width >= minimumCssPixels && height >= minimumCssPixels) continue;

    let cssDisplayNone = false;
    let cssVisibilityHidden = false;
    let cssContentVisibilityHidden = false;
    let pointerEventsNone = false;
    let zeroOpacity = false;
    let ariaHidden = false;
    let current = element;
    while (current instanceof Element) {
      const style = getComputedStyle(current);
      cssDisplayNone ||= style.display === "none";
      cssVisibilityHidden ||= style.visibility === "hidden" || style.visibility === "collapse";
      cssContentVisibilityHidden ||= style.contentVisibility === "hidden";
      pointerEventsNone ||= style.pointerEvents === "none";
      zeroOpacity ||= Number(style.opacity) <= 0;
      ariaHidden ||= current.getAttribute("aria-hidden") === "true";
      current = current.parentElement;
    }
    let nativeDisabled = element.hasAttribute("disabled");
    try { nativeDisabled ||= element.matches(":disabled"); } catch { /* Non-HTML engines may not expose :disabled. */ }
    const exclusionBasis = {
      effectiveInert: Boolean(element.closest("[inert]")),
      nativeDisabled,
      hiddenAttribute: Boolean(element.closest("[hidden]")),
      cssDisplayNone,
      cssVisibilityHidden,
      cssContentVisibilityHidden,
      closedDetails: insideClosedDetails(element),
      inputTypeHidden: element.tagName === "INPUT" && (element.getAttribute("type") || "text").toLowerCase() === "hidden",
      pointerEventsNone,
      zeroOpacity,
      ariaHidden,
    };
    const reasonKey = [
      "effectiveInert", "nativeDisabled", "inputTypeHidden", "hiddenAttribute", "closedDetails",
      "cssDisplayNone", "cssVisibilityHidden", "cssContentVisibilityHidden",
    ].find((key) => exclusionBasis[key]);
    const exclusionReason = reasonKey ? exclusionReasons[reasonKey] : null;
    const intendedInteractive = exclusionReason === null;
    const type = normalize(element.getAttribute("type"));
    const role = normalize(element.getAttribute("role"));
    records.push({
      route,
      viewport,
      state,
      selector: stableSelector(element),
      accessibleName: accessibleName(element),
      elementType: element.tagName.toLowerCase(),
      width,
      height,
      visibility: !exclusionBasis.hiddenAttribute
        && !exclusionBasis.cssDisplayNone
        && !exclusionBasis.cssVisibilityHidden
        && !exclusionBasis.cssContentVisibilityHidden
        && !exclusionBasis.closedDetails
        && !exclusionBasis.inputTypeHidden
        && !exclusionBasis.zeroOpacity
        && width > 0
        && height > 0,
      intendedInteractive,
      exclusionReason,
      exclusionBasis,
      role: role || null,
      type: type || null,
    });
  }
  return { candidateCount: elements.length, minimumCssPixels, records };
}

export async function observeTargetSizes(page, context = {}) {
  if (!page || typeof page.evaluate !== "function") throw new TypeError("a browser page with evaluate() is required");
  const minimumCssPixels = Number.isFinite(context?.minimumCssPixels) && context.minimumCssPixels > 0
    ? context.minimumCssPixels
    : TARGET_MINIMUM_CSS_PIXELS;
  const observation = await page.evaluate(observeTargetSizeCandidates, { ...context, minimumCssPixels });
  return validateTargetSizeObservation(observation, { minimumCssPixels });
}
