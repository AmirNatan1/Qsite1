import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

const root = process.cwd();
const contractRelative = "artifacts/original/phase-0-3d-repair-v2/portal-layout.json";
const contractUrlFragment = "/artifacts/original/phase-0-3d-repair-v2/portal-layout.json";
const harnessRoot = "prototypes/phase-0-portal-layout-qa";
const capturePlanRelative = `${harnessRoot}/capture-plan.json`;
const browserMatrixRelative = "artifacts/evidence/phase-0-3d-repair-v2/browser-matrix-report.json";
const requiredFiles = [
  contractRelative,
  `${harnessRoot}/index.html`,
  `${harnessRoot}/styles.css`,
  `${harnessRoot}/app.js`,
  `${harnessRoot}/runner.html`,
  `${harnessRoot}/runner.css`,
  `${harnessRoot}/runner.js`,
  `${harnessRoot}/README.md`,
  capturePlanRelative,
  "scripts/normalize-phase02-captures.py",
  "docs/planning/TYPOGRAPHY_AND_LAYOUT_CONTRACT.md",
  "artifacts/evidence/phase-0-3d-repair-v2/TYPOGRAPHY_COLLISION_QA.md",
  browserMatrixRelative,
];
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function absolute(relative) {
  return path.join(root, ...relative.split("/"));
}

async function exists(relative) {
  try {
    return (await stat(absolute(relative))).isFile();
  } catch {
    return false;
  }
}

async function text(relative) {
  try {
    return await readFile(absolute(relative), "utf8");
  } catch (error) {
    errors.push(`unable to read ${relative}: ${error.message}`);
    return "";
  }
}

async function json(relative) {
  const source = await text(relative);
  try {
    return JSON.parse(source);
  } catch (error) {
    errors.push(`${relative} is invalid JSON: ${error.message}`);
    return null;
  }
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function pngDimensions(buffer, label) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    errors.push(`${label} is not a valid PNG`);
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const distanceLeft = Math.abs(prediction - left);
  const distanceAbove = Math.abs(prediction - above);
  const distanceUpperLeft = Math.abs(prediction - upperLeft);
  if (distanceLeft <= distanceAbove && distanceLeft <= distanceUpperLeft) return left;
  if (distanceAbove <= distanceUpperLeft) return above;
  return upperLeft;
}

function decodePngPixels(buffer, label) {
  const dimensions = pngDimensions(buffer, label);
  if (!dimensions) return null;
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || channels === 0 || interlace !== 0) {
    errors.push(`${label} must be a non-interlaced 8-bit RGB/RGBA PNG for raster-content verification`);
    return null;
  }

  const compressed = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      errors.push(`${label} has a truncated PNG chunk`);
      return null;
    }
    if (type === "IDAT") compressed.push(buffer.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  if (compressed.length === 0) {
    errors.push(`${label} has no PNG image data`);
    return null;
  }

  let inflated;
  try {
    inflated = inflateSync(Buffer.concat(compressed));
  } catch (error) {
    errors.push(`${label} PNG image data cannot be inflated: ${error.message}`);
    return null;
  }
  const rowBytes = dimensions.width * channels;
  const expectedBytes = (rowBytes + 1) * dimensions.height;
  if (inflated.length !== expectedBytes) {
    errors.push(`${label} has unexpected decoded PNG byte length`);
    return null;
  }

  const pixels = Buffer.alloc(rowBytes * dimensions.height);
  for (let y = 0; y < dimensions.height; y += 1) {
    const sourceOffset = y * (rowBytes + 1);
    const filter = inflated[sourceOffset];
    const rowOffset = y * rowBytes;
    const previousOffset = rowOffset - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const source = inflated[sourceOffset + 1 + x];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const above = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[previousOffset + x - channels] : 0;
      let value;
      if (filter === 0) value = source;
      else if (filter === 1) value = source + left;
      else if (filter === 2) value = source + above;
      else if (filter === 3) value = source + Math.floor((left + above) / 2);
      else if (filter === 4) value = source + paethPredictor(left, above, upperLeft);
      else {
        errors.push(`${label} uses unsupported PNG filter ${filter}`);
        return null;
      }
      pixels[rowOffset + x] = value & 0xff;
    }
  }
  return { ...dimensions, channels, pixels };
}

function textInkCount(image, rectangle) {
  const left = Math.max(0, Math.floor(Number(rectangle?.leftPx)));
  const right = Math.min(image.width, Math.ceil(Number(rectangle?.rightPx)));
  const top = Math.max(0, Math.floor(Number(rectangle?.topPx)));
  const bottom = Math.min(image.height, Math.ceil(Number(rectangle?.bottomPx)));
  if (!(right > left && bottom > top)) return { visibleArea: 0, inkPixels: 0, inkBounds: null };
  let inkPixels = 0;
  let inkLeft = right;
  let inkRight = left;
  let inkTop = bottom;
  let inkBottom = top;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * image.channels;
      const red = image.pixels[offset];
      const green = image.pixels[offset + 1];
      const blue = image.pixels[offset + 2];
      const neutralInk = red >= 128 && green >= 128 && blue >= 128;
      const magentaInk = red >= 128 && red >= green * 1.35 && blue >= green * 1.05;
      if (neutralInk || magentaInk) {
        inkPixels += 1;
        inkLeft = Math.min(inkLeft, x);
        inkRight = Math.max(inkRight, x + 1);
        inkTop = Math.min(inkTop, y);
        inkBottom = Math.max(inkBottom, y + 1);
      }
    }
  }
  return {
    visibleArea: (right - left) * (bottom - top),
    visibleWidth: right - left,
    visibleHeight: bottom - top,
    inkPixels,
    inkBounds:
      inkPixels > 0
        ? {
            left: inkLeft,
            right: inkRight,
            top: inkTop,
            bottom: inkBottom,
          }
        : null,
  };
}

function jpegDimensions(buffer, label) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    errors.push(`${label} is not a valid JPEG`);
    return null;
  }
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 1 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && segmentLength >= 7 && offset + 7 <= buffer.length) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    if (segmentLength < 2) break;
    offset += segmentLength;
  }
  errors.push(`${label} has no readable JPEG frame dimensions`);
  return null;
}

function boxWithinViewport(box, viewport) {
  return (
    Number.isFinite(Number(box?.x)) &&
    Number.isFinite(Number(box?.y)) &&
    Number.isFinite(Number(box?.width)) &&
    Number.isFinite(Number(box?.height)) &&
    box.x >= 0 &&
    box.y >= 0 &&
    box.width > 0 &&
    box.height > 0 &&
    box.x + box.width <= viewport.width &&
    box.y + box.height <= viewport.height
  );
}

function lineIntersectsExpandedBox(line, box, expansion) {
  const left = box.x - expansion;
  const right = box.x + box.width + expansion;
  const top = box.y - expansion;
  const bottom = box.y + box.height + expansion;
  const lineLeft = Math.min(line.x1, line.x2);
  const lineRight = Math.max(line.x1, line.x2);
  const lineTop = Math.min(line.y1, line.y2);
  const lineBottom = Math.max(line.y1, line.y2);
  return lineRight >= left && lineLeft <= right && lineBottom >= top && lineTop <= bottom;
}

function parseQuery(value) {
  return Object.fromEntries(new URLSearchParams(value));
}

for (const relative of requiredFiles) check(await exists(relative), `missing required Phase 0.2 file: ${relative}`);

const contractSource = await text(contractRelative);
const contract = await json(contractRelative);
const contractHash = sha256(contractSource);

if (contract) {
  const viewport = contract.coordinateSystem?.referenceViewport ?? {};
  check(contract.schema === "quantum-hub.phase-0-3d-repair-v2.portal-layout.v1", "unexpected portal-layout schema");
  check(contract.status === "authoritative shared source", "portal layout is not marked authoritative");
  check(viewport.width === 1920 && viewport.height === 1200, "portal reference viewport must be 1920x1200");
  check(contract.coordinateSystem?.origin === "top-left", "portal coordinate origin must be top-left");
  check(contract.coordinateSystem?.projection?.strategy === "cover", "portal projection strategy must be explicit cover");
  check(contract.acceptance?.maximumAnchorDeltaPx === 3, "portal anchor tolerance must be exactly 3px");
  check(contract.acceptance?.glyphRuleClearancePx === 12, "glyph/rule clearance must be exactly 12px");
  check(contract.surface?.composition === "editorial negative space", "portal surface must preserve editorial negative space");
  check(contract.surface?.visualBoxAroundCopy === false, "portal surface must not place copy in a full visual box");
  check(contract.surface?.decorativeRuleCount === 1, "portal surface must declare exactly one decorative rule");
  check(contract.copy?.heading === "WHERE DO YOU ENTER?", "portal H1 must be WHERE DO YOU ENTER?");
  check(
    JSON.stringify(contract.copy?.headingLinesReference) === JSON.stringify(["WHERE DO YOU ENTER?"]),
    "portal reference H1 line break must remain one exact line",
  );
  check(
    JSON.stringify(contract.copy?.headingLinesCompact) === JSON.stringify(["WHERE DO YOU", "ENTER?"]),
    "portal compact H1 line breaks are incorrect",
  );
  check(!/prove it where it has to work/i.test(contractSource), "public hero H1 leaked into the portal contract");
  check(
    JSON.stringify(contract.copy?.route) === JSON.stringify(["Frame", "Source", "Assess", "Test", "Decide"]),
    "portal five-stage carrier is incorrect",
  );
  check(
    JSON.stringify(contract.copy?.audiences) === JSON.stringify(["For industry", "For startups"]),
    "portal audience paths are incorrect",
  );

  for (const [id, region] of Object.entries(contract.regions ?? {})) {
    check(boxWithinViewport(region, viewport), `portal region is invalid or outside the reference viewport: ${id}`);
  }
  for (const [id, box] of Object.entries(contract.glyphBounds ?? {})) {
    check(boxWithinViewport(box, viewport), `portal glyph bound is invalid or outside the reference viewport: ${id}`);
    check(box.x >= contract.safeMargins.left, `portal glyph violates left safe margin: ${id}`);
    check(box.x + box.width <= viewport.width - contract.safeMargins.right, `portal glyph violates right safe margin: ${id}`);
    check(box.y >= contract.safeMargins.top, `portal glyph violates top safe margin: ${id}`);
    check(box.y + box.height <= viewport.height - contract.safeMargins.bottom, `portal glyph violates bottom safe margin: ${id}`);
  }

  const rules = contract.decorativeRules ?? [];
  check(rules.length === 1 && rules[0]?.id === "audience-divider", "the sole portal rule must be the audience divider");
  if (rules[0]) {
    const rule = rules[0];
    const audience = contract.regions?.audience;
    const heading = contract.regions?.heading;
    check(rule.y1 > heading.y + heading.height + 12, "audience divider is not wholly below the H1");
    check(rule.x1 === audience.dividerX && rule.x2 === audience.dividerX, "audience divider X does not match its region");
    check(rule.y1 === audience.dividerY1 && rule.y2 === audience.dividerY2, "audience divider Y does not match its region");
    check(
      contract.anchors?.audienceDividerTop?.x === rule.x1 && contract.anchors?.audienceDividerTop?.y === rule.y1,
      "audience-divider top anchor does not match the rule",
    );
    check(
      contract.anchors?.audienceDividerBottom?.x === rule.x2 && contract.anchors?.audienceDividerBottom?.y === rule.y2,
      "audience-divider bottom anchor does not match the rule",
    );
    for (const [glyph, box] of Object.entries(contract.glyphBounds ?? {})) {
      check(
        !lineIntersectsExpandedBox(rule, box, contract.acceptance.glyphRuleClearancePx),
        `audience divider intersects the ${glyph} glyph bound expanded by 12px`,
      );
    }
  }

  for (const requiredAnchor of [
    "navBaseline",
    "signalLineBaseline",
    "eyebrowBaseline",
    "h1TopLeft",
    "h1Line1Baseline",
    "routeBaseline",
    "audienceRegionTopLeft",
    "audienceDividerTop",
    "audienceDividerBottom",
    "audienceIndustryBaseline",
    "audienceStartupsBaseline",
  ]) {
    const anchor = contract.anchors?.[requiredAnchor];
    check(Number.isFinite(Number(anchor?.x)) && Number.isFinite(Number(anchor?.y)), `missing portal anchor: ${requiredAnchor}`);
  }
  check(contract.regions?.heading?.x === contract.anchors?.h1TopLeft?.x, "H1 region/anchor X mismatch");
  check(contract.regions?.heading?.y === contract.anchors?.h1TopLeft?.y, "H1 region/anchor Y mismatch");
  check(contract.regions?.audience?.x === contract.anchors?.audienceRegionTopLeft?.x, "audience region/anchor X mismatch");
  check(contract.regions?.audience?.y === contract.anchors?.audienceRegionTopLeft?.y, "audience region/anchor Y mismatch");
  check(/physicalScreen/.test(JSON.stringify(contract.consumers)), "portal contract omits the physical-screen consumer");
  check(/semanticDom/.test(JSON.stringify(contract.consumers)), "portal contract omits the semantic-DOM consumer");
  check(/alignmentOverlay/.test(JSON.stringify(contract.consumers)), "portal contract omits the alignment-overlay consumer");
}

const html = await text(`${harnessRoot}/index.html`);
const css = await text(`${harnessRoot}/styles.css`);
const app = await text(`${harnessRoot}/app.js`);
const runnerHtml = await text(`${harnessRoot}/runner.html`);
const runnerCss = await text(`${harnessRoot}/runner.css`);
const runnerApp = await text(`${harnessRoot}/runner.js`);
const normalizer = await text("scripts/normalize-phase02-captures.py");
const prototypeServer = await text("scripts/serve-prototype.mjs");
const harnessSource = `${html}\n${css}\n${app}`;

check(/Prove it where it has to work\./.test(app), "harness omits the actual public hero H1");
check(/industrial innovation · herzliya/.test(app), "harness omits the actual hero eyebrow");
check(/Quantum brings industry and technology together/.test(app), "harness omits the actual supporting copy");
check(/For industry/.test(app) && /For startups/.test(app), "harness omits the actual audience labels");
check(/eyebrow:\s*HERO_ACTUAL\.eyebrow/.test(app) && /heading:\s*HERO_ACTUAL\.heading/.test(app), "hero long fixture improperly changes the public eyebrow or H1");
check(/audiences:\s*HERO_ACTUAL\.audiences/.test(app), "hero long fixture improperly changes the public audience labels");
check(
  app.includes("Quantum brings industry and technology together to define real needs, test solutions in real conditions, and turn evidence into confident decisions."),
  "hero long fixture does not use the approved support-only 1.254x string",
);
check(!/WHERE DO YOU ENTER\?/.test(app), "portal H1 is hand-copied into the harness instead of read from portal-layout.json");
check(app.includes(contractUrlFragment), "harness does not fetch the authoritative portal-layout JSON");
check(/phase-0-3d-repair-v2\/renders\/hero\/desktop-dormant-base\.png/.test(app), "harness is not bound to the final v2 dormant hero source");
check(/phase-0-3d-repair-v2\/renders\/hero\/mobile-dormant-base\.png/.test(app), "harness is not bound to the independently authored v2 mobile hero source");
check(!/phase-0-3d-repair-v2\/renders\/portal\/physical-layout\.png/.test(app), "live DOM harness uses the text-bearing physical portal raster and can double copy");
check(/phase-0-3d-repair-v2\/renders\/portal\/physical-glass-base\.png/.test(app), "harness lacks the text-free responsive portal source");
check(!/phase-0-3d-repair\/renders\//.test(harnessSource), "temporary v1 render source remains in the Phase 0.2 harness");
check(/referenceProjectionMode/.test(app) && /Math\.max\(window\.innerWidth \/ reference\.width/.test(app), "harness does not implement the contract's cover/max reference projection");
check(/exactReferenceAspect/.test(app) && /doubledCopyPass/.test(app), "harness does not classify reference versus responsive raster-copy safety");
check(/window\.phase02Ready/.test(app), "harness omits its deterministic readiness promise");
check(/window\.runPhase02TypographyCheck/.test(app), "harness omits its deterministic QA API");
check(/window\.phase02TypographyReport/.test(app), "harness omits its browser report global");
check(/await waitForScene\(\)/.test(app), "harness readiness does not wait for the selected scene image");
check(/id="phase02-report"/.test(html) && /reportNode\.textContent\s*=\s*JSON\.stringify\(report\)/.test(app), "harness does not expose its report through DOM text");
check(/longFixtureRatio/.test(app) && />= 1\.25/.test(app), "harness omits the 25%-longer fixture gate");
check(/textOverflowReport/.test(app) && /scrollWidthPx/.test(app) && /glyphRectangles/.test(app), "harness omits descendant text-overflow diagnostics");
check(/dividerGeometryReport/.test(app) && /thicknessPx\s*<=\s*1\.5/.test(app) && /dividerPass/.test(app), "harness omits its responsive divider-thickness gate");
check(/outline:\s*3px solid/.test(css), "harness lacks a visible focus treatment");
check(/min-height:\s*44px/.test(css), "harness lacks a 44px control target floor");
check(/overflow-wrap:\s*anywhere/.test(css), "harness lacks explicit text wrapping under enlarged text");
check(!/<video\b|<canvas\b/i.test(html), "harness instantiates cinematic video or canvas");
check(!/createElement\(["'](?:video|canvas)["']\)/i.test(app), "harness creates cinematic media at runtime");
check(!/@font-face|https?:\/\/(?:fonts\.|use\.typekit|use\.fontawesome)/i.test(harnessSource), "harness introduces a remote or bundled font dependency");
check(!/font-family\s*:[^;}]*(?:Syne|Newsreader|Inter)/i.test(css), "harness does not force system fallback stacks");
check(!/overflow-x\s*:\s*(?:auto|scroll|clip)/i.test(css), "harness masks horizontal overflow or creates a nested horizontal scroller");
check(!/\.review-surface\s*\{[^}]*overflow\s*:\s*hidden/is.test(css), "review surface hides layout overflow");
check(!/body\s*\{[^}]*overflow[^:]*:\s*(?:hidden|clip)/is.test(css), "body hides layout overflow");
check(/\.scene-crop\s*\{[^}]*overflow\s*:\s*hidden/is.test(css), "decorative scene overflow is not isolated in its own crop");
check(!/\.(?:hero|portal)-(?:compositor|copy|heading|supporting|audience)[^{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), "a text-bearing compositor masks layout overflow");
check(!/(?:html|body)\s*\{[^}]*min-width\s*:\s*320px/is.test(css), "harness retains the 320px minimum-width scrollbar trap");
check(/document\.documentElement/.test(app) && /clientWidth/.test(app) && /documentScrollWidth\s*>\s*layoutViewport\.width/.test(app), "harness does not measure overflow against the scrollbar-aware document viewport");
check(/function heroSceneLayoutMode\(\)/.test(app) && /dataset\.heroSceneLayout/.test(app), "hero scene layout is not derived from the exact inner viewport");
check(/source-pixel feature bounds projected through the live object-fit and CSS transform/.test(app), "hero keepouts are not calibrated from the frozen source pixels");
check(/fieldUnit/.test(app) && /spiralCable/.test(app) && /intersectingKeepouts/.test(app), "hero scene-safety report omits Field Unit/cable intersections");
check(/clearancePx\s*=\s*16/.test(app), "hero scene-safety gate lacks its 16px clearance");
check(/stressDisplaced/.test(app) && /outsideViewport/.test(app), "hero scene-safety report omits displaced stress-scene verification");
check(/function sceneSafetyReport\(\)/.test(app) && /portalReduced/.test(app) && /portal-reduced-displaced/.test(app), "scene-safety report omits reduced-portal applicability");
check(!/opaque quiet-left matte/i.test(harnessSource), "hero composition relies on a prohibited opaque quiet-left matte");
check(/data-hero-scene-layout="wide"[^}]+transform:\s*translate\(7%,\s*11%\)\s*scale\(1\.14\)/s.test(css), "wide hero does not use the bounded scene translation/scale");
check(/data-hero-scene-layout="portrait"[^}]+object-fit:\s*contain[^}]+translateY\(20%\)\s*scale\(0\.98\)/s.test(css), "portrait hero does not use the authored mobile-scene geometry");
check(/data-hero-scene-layout="short-landscape"[^}]+translate\(12%,\s*17%\)\s*scale\(1\.08\)/s.test(css), "short-landscape hero lacks right-device/bottom-cable separation");
check(
  /data-surface="portal"\]\[data-text-zoom="100"\]\[data-hero-scene-layout="short-landscape"\][^}]+portal-contract-layer[^}]+minmax\(360px,\s*0\.9fr\)/s.test(css) &&
    /data-surface="portal"\]\[data-text-zoom="100"\]\[data-hero-scene-layout="short-landscape"\][^}]+portal-audience[^}]+grid-template-columns:\s*minmax\(0,\s*1fr\)\s+1px\s+minmax\(0,\s*1fr\)/s.test(css) &&
    /data-surface="portal"\]\[data-text-zoom="100"\]\[data-hero-scene-layout="short-landscape"\][^}]+portal-audience \.audience-divider[^}]+height:\s*100%\s*!important/s.test(css) &&
    /data-surface="portal"\]\[data-text-zoom="100"\]\[data-hero-scene-layout="short-landscape"\][^}]+portal-audience button[^}]+word-break:\s*normal/s.test(css),
  "short-landscape portal controls lack a readable content-driven two-path row",
);
check(
  /@media\s*\(max-width:\s*599px\)[\s\S]+?\.portal-audience \.audience-divider\s*\{[^}]*width:\s*100%[^}]*height:\s*1px\s*!important/s.test(css),
  "mobile portal divider does not override the inline reference height with a 1px rule",
);
check(
  /data-text-zoom="200"[^,]+\.scene-image,\s*body\[data-surface="hero"\]\[data-fixture="long"\]\s+\.scene-image\s*\{[^}]*translateY\(110%\)/s.test(css),
  "hero zoom/long stress states do not displace the decorative scene outside its crop",
);
check(
  /data-surface="portal"\]\[data-reduced="true"\][^{]+\.scene-image\s*\{[^}]*translateY\(110%\)/s.test(css),
  "reduced-portal stress state does not displace the dormant scene outside semantic copy",
);
check(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css), "mobile route lacks a no-scroll 3+2 grid");
check(/prefers-reduced-motion:\s*reduce/.test(css), "harness omits the reduced-motion media query");
check(/data-reduced/.test(app) || /dataset\.reduced/.test(app), "harness omits deterministic reduced-motion state");
check(!/addEventListener\(["'](?:wheel|touchmove|scroll)["']|preventDefault\s*\(/i.test(app), "harness intercepts or cancels native scrolling");
check(!/\bdefen[cs]e\b|\bdual[\s_-]?use\b/i.test(harnessSource), "prohibited public taxonomy leaked into the harness");
check(!/(?:[a-z]:[\\/](?:users|documents and settings)[\\/]|\/users\/|\/home\/|onedrive[\\/]|\.codex[\\/])/i.test(harnessSource), "private absolute path leaked into the harness");
check(/id="capture-viewport"/.test(runnerHtml) && /<iframe\b/.test(runnerHtml), "exact viewport runner lacks its capture iframe");
check(/--capture-width/.test(runnerCss) && /--capture-height/.test(runnerCss), "exact viewport runner does not bind requested dimensions");
check(/transform:\s*scale\(var\(--capture-scale\)\)/.test(runnerCss), "exact viewport runner lacks its evidence-only outer capture scale");
check(/window\.phase02RunnerReady/.test(runnerApp), "exact viewport runner omits its readiness promise");
check(/window\.phase02RunnerReport/.test(runnerApp), "exact viewport runner omits its report global");
check(/id="phase02-runner-report"/.test(runnerHtml) && /reportNode\.textContent\s*=\s*JSON\.stringify\(runnerReport\)/.test(runnerApp), "exact viewport runner does not expose its report through DOM text");
check(/record actual browser DPR; do not claim control/.test(runnerApp), "exact viewport runner does not record the honest DPR policy");
check(!/dprMatch|devicePixelRatio\s*===\s*1/.test(runnerApp), "exact viewport runner falsely claims DPR control");
check(/child\.innerWidth/.test(runnerApp) && /child\.innerHeight/.test(runnerApp), "exact viewport runner does not verify iframe dimensions");
check(/captureRenderedBounds/.test(runnerApp) && /maximumRenderedWidth\s*=\s*1200/.test(runnerApp), "exact viewport runner does not report bounded rendered capture geometry");
check(/Image\.Resampling\.LANCZOS/.test(normalizer) && /captureRenderedBounds/.test(normalizer), "capture normalizer lacks conditional wide-evidence Lanczos lineage");
const runnerBoundsIndex = runnerApp.indexOf("const captureBoundsMatch");
const runnerPaintBarrierIndex = runnerApp.indexOf("await waitForPaintBarrier()");
const runnerReadyIndex = runnerApp.indexOf('elements.body.dataset.ready = "true"');
check(
  /function waitForPaintBarrier\(\)/.test(runnerApp) &&
    /window\.requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(resolve\)\)/.test(runnerApp) &&
    runnerBoundsIndex >= 0 &&
    runnerBoundsIndex < runnerPaintBarrierIndex &&
    runnerPaintBarrierIndex < runnerReadyIndex,
  "exact viewport runner does not hold readiness behind a post-bounds two-frame paint barrier",
);
check(!/overflow\s*:\s*hidden|overflow-x\s*:\s*(?:clip|auto|scroll)/i.test(`${runnerCss}\n${runnerHtml}\n${runnerApp}`), "exact viewport runner masks overflow");
check(/headersForPath\(pathname\)/.test(prototypeServer), "prototype server lacks path-scoped frame policy");
check(/phase-0-portal-layout-qa/.test(prototypeServer) && /frame-ancestors 'self'/.test(prototypeServer), "portal QA runner is not allowed to frame its same-origin harness");
check(/frame-ancestors 'none'/.test(prototypeServer) && /x-frame-options": "DENY"/.test(prototypeServer), "prototype server weakened the default anti-framing policy");
check(!/phase-0-3d-repair["'],\s*["']renders/.test(prototypeServer), "temporary v1 render allowlist remains in the prototype server");

const plan = await json(capturePlanRelative);
const requiredViewports = new Map([
  ["desktop-1440x900", [1440, 900]],
  ["short-desktop-1366x650", [1366, 650]],
  ["desktop-1280x800", [1280, 800]],
  ["tablet-landscape-1024x768", [1024, 768]],
  ["tablet-portrait-768x1024", [768, 1024]],
  ["mobile-390x844", [390, 844]],
  ["mobile-360x800", [360, 800]],
  ["narrow-320x800", [320, 800]],
  ["mobile-landscape-844x390", [844, 390]],
]);

function expandCases(document) {
  if (!document) return [];
  const viewports = new Map((document.viewports ?? []).map((viewport) => [viewport.id, viewport]));
  const cases = [];
  for (const template of document.caseTemplates ?? []) {
    const ids = template.viewportIds === "all" ? [...viewports.keys()] : template.viewportIds ?? [];
    const captures = template.captureViewportIds === "all" ? new Set(ids) : new Set(template.captureViewportIds ?? []);
    for (const id of ids) {
      cases.push({
        id: `${template.idPrefix}--${id}`,
        idPrefix: template.idPrefix,
        viewportId: id,
        viewport: viewports.get(id),
        query: template.query,
        focusSelector: template.focusSelector ?? null,
        captureRequired: captures.has(id),
      });
    }
  }
  return cases;
}

const expandedCases = expandCases(plan);
if (plan) {
  check(plan.schema === "quantum-hub.phase-0-3d-repair-v2.typography-capture-plan.v1", "unexpected typography capture-plan schema");
  check(plan.browserApi?.expectedSchema === "quantum-hub.phase-0-3d-repair-v2.typography-collision-browser-report.v1", "capture plan expects the wrong browser-report schema");
  check(plan.browserApi?.runnerReportDomSelector === "#phase02-runner-report", "capture plan omits the runner DOM-report selector");
  check(plan.browserApi?.captureElementSelector === "#capture-viewport", "capture plan omits the exact screenshot element");
  check(plan.capture?.fullPage === true, "capture plan must record the available full-page browser capture path");
  check(plan.capture?.rawFilenameTemplate?.endsWith(".jpg"), "capture plan raw evidence must be JPEG");
  check(plan.capture?.normalizedFilenameTemplate?.endsWith(".png"), "capture plan normalized derivative must be PNG");
  check(plan.browserApi?.runnerViewportQuery?.includes("captureScale={captureScale}"), "capture plan runner query omits captureScale");
  check(plan.capture?.maximumRenderedWidth === 1200, "capture plan uses the wrong maximum rendered evidence width");
  check(plan.capture?.normalizationMethod === "top-left-rendered-frame-crop-lanczos-when-scaled", "capture plan uses the wrong normalization method");
  check(plan.capture?.stabilization?.method === "exact-byte-modal-winner", "capture plan omits exact-byte modal stabilization");
  check(plan.capture?.stabilization?.successiveFullPageJpegsPerVisualCase === 11, "capture plan must take 11 successive JPEGs per visual case");
  check(plan.capture?.stabilization?.minimumWinnerVotes === 7, "capture plan must reject modal winners below 7/11 votes");
  check(/may alternate compositor states/.test(plan.capture?.stabilization?.timingClaim ?? ""), "capture plan makes a dishonest timing-only stability claim");
  check(
    (plan.requiredAssertions ?? []).some((item) => /every hero state and every reduced-portal stress state clears source-pixel-derived Field Unit and spiral-cable keepouts/.test(item)),
    "capture plan omits the source-derived hero/reduced-portal scene-safety gate",
  );
  const observed = new Map((plan.viewports ?? []).map((viewport) => [viewport.id, [viewport.width, viewport.height]]));
  for (const [id, dimensions] of requiredViewports) {
    check(JSON.stringify(observed.get(id)) === JSON.stringify(dimensions), `capture plan omits or changes ${id}`);
    const viewport = (plan.viewports ?? []).find((entry) => entry.id === id);
    const expectedScale = Math.min(1, plan.capture.maximumRenderedWidth / dimensions[0]);
    check(Math.abs(Number(viewport?.captureScale) - expectedScale) <= 0.000001, `capture plan uses the wrong evidence scale for ${id}`);
    check(Number(viewport?.width) * Number(viewport?.captureScale) <= plan.capture.maximumRenderedWidth + 0.01, `capture plan exceeds its rendered-width ceiling for ${id}`);
  }
  check(observed.size === requiredViewports.size, "capture plan includes an unexpected viewport");
  check(expandedCases.length === 46, `capture plan must expand to 46 deterministic cases, observed ${expandedCases.length}`);
  for (const surface of ["hero", "portal"]) {
    for (const viewportId of requiredViewports.keys()) {
      check(
        expandedCases.some((entry) => {
          const query = parseQuery(entry.query);
          return entry.viewportId === viewportId && query.surface === surface && query.fixture === "actual" && query.zoom === "100";
        }),
        `capture plan lacks the normal ${surface} case at ${viewportId}`,
      );
    }
  }
  for (const requiredPrefix of [
    "hero-zoom-200",
    "portal-zoom-200",
    "hero-long-copy",
    "portal-long-copy",
    "hero-reduced-motion",
    "portal-reduced-motion",
    "hero-keyboard-focus",
    "portal-keyboard-focus",
  ]) {
    check(expandedCases.some((entry) => entry.idPrefix === requiredPrefix), `capture plan lacks ${requiredPrefix}`);
  }
  for (const focusPrefix of ["hero-keyboard-focus", "portal-keyboard-focus"]) {
    const focusCase = expandedCases.find((entry) => entry.idPrefix === focusPrefix);
    check(parseQuery(focusCase?.query ?? "").chrome === "0", `${focusPrefix} must hide the QA toolbar during evidence capture`);
    check(Boolean(focusCase?.focusSelector), `${focusPrefix} lacks its programmatic focus selector`);
  }
}

const browserMatrix = (await exists(browserMatrixRelative)) ? await json(browserMatrixRelative) : null;
if (browserMatrix && plan) {
  check(browserMatrix.schema === "quantum-hub.phase-0-3d-repair-v2.typography-collision-matrix.v1", "unexpected browser-matrix schema");
  check(browserMatrix.contract?.sha256 === contractHash, "browser matrix used a stale portal-layout JSON");
  check(browserMatrix.fontMode === "forced metric-conscious system fallbacks", "browser matrix did not force fallback fonts");
  check(browserMatrix.capturePolicy?.method === "exact-byte-modal-winner", "browser matrix omits exact-byte modal capture policy");
  check(browserMatrix.capturePolicy?.successiveFullPageJpegsPerVisualCase === 11, "browser matrix modal capture count is not 11 per visual case");
  check(Number(browserMatrix.capturePolicy?.observedWinnerVotesMinimum) >= 7, "browser matrix includes a weak modal winner below 7/11 votes");
  check(browserMatrix.capturePolicy?.weakCases === 0, "browser matrix reports weak or tied compositor capture cases");
  check(browserMatrix.capturePolicy?.timingClaim === "none", "browser matrix incorrectly claims timing alone stabilized compositor output");
  const expectedSceneSources = new Set([
    "artifacts/original/phase-0-3d-repair-v2/renders/hero/desktop-dormant-base.png",
    "artifacts/original/phase-0-3d-repair-v2/renders/hero/mobile-dormant-base.png",
    "artifacts/original/phase-0-3d-repair-v2/renders/portal/physical-glass-base.png",
  ]);
  const sceneSourcePaths = new Set();
  for (const source of browserMatrix.sceneSources ?? []) {
    const relative = String(source.path ?? "").replaceAll("\\", "/").replace(/^\//, "");
    sceneSourcePaths.add(relative);
    check(expectedSceneSources.has(relative), `browser matrix has an unexpected scene source: ${relative}`);
    if (await exists(relative)) {
      const buffer = await readFile(absolute(relative));
      const metadata = await stat(absolute(relative));
      const dimensions = pngDimensions(buffer, relative);
      check(metadata.size === Number(source.bytes), `browser scene-source byte count mismatch: ${relative}`);
      check(sha256(buffer) === String(source.sha256 ?? "").toLowerCase(), `browser scene-source SHA-256 mismatch: ${relative}`);
      if (dimensions) {
        check(dimensions.width === Number(source.width), `browser scene-source width mismatch: ${relative}`);
        check(dimensions.height === Number(source.height), `browser scene-source height mismatch: ${relative}`);
      }
      check(Array.isArray(source.classifications) && source.classifications.length > 0, `browser scene source lacks classification: ${relative}`);
    } else {
      errors.push(`browser scene source is missing: ${relative}`);
    }
  }
  for (const relative of expectedSceneSources) check(sceneSourcePaths.has(relative), `browser matrix omits scene-source lineage: ${relative}`);
  const records = Array.isArray(browserMatrix.cases) ? browserMatrix.cases : [];
  check(records.length === expandedCases.length, `browser matrix has ${records.length}/${expandedCases.length} cases`);
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const expected of expandedCases) {
    const record = byId.get(expected.id);
    if (!record) {
      errors.push(`browser matrix lacks ${expected.id}`);
      continue;
    }
    const report = record.report ?? {};
    const runner = record.runner ?? {};
    const stateQuery = parseQuery(expected.query);
    check(record.viewportId === expected.viewportId, `browser matrix viewport ID mismatch for ${expected.id}`);
    check(record.query === expected.query, `browser matrix query mismatch for ${expected.id}`);
    check(runner.schema === "quantum-hub.phase-0-3d-repair-v2.exact-viewport-runner-report.v1", `runner report schema mismatch for ${expected.id}`);
    check(runner.viewportMatch === true, `exact iframe viewport mismatch for ${expected.id}`);
    check(runner.requestedViewport?.width === expected.viewport.width && runner.requestedViewport?.height === expected.viewport.height, `runner requested-viewport mismatch for ${expected.id}`);
    check(runner.iframeViewport?.width === expected.viewport.width && runner.iframeViewport?.height === expected.viewport.height, `runner iframe-viewport mismatch for ${expected.id}`);
    check((runner.focusSelector ?? null) === expected.focusSelector, `runner focus selector mismatch for ${expected.id}`);
    check(Number.isFinite(Number(runner.iframeViewport?.devicePixelRatio)) && Number(runner.iframeViewport.devicePixelRatio) > 0, `runner did not record actual DPR for ${expected.id}`);
    check(runner.devicePixelRatioPolicy === "record actual browser DPR; do not claim control", `runner DPR policy mismatch for ${expected.id}`);
    const expectedCaptureScale = Number(expected.viewport.captureScale);
    const expectedRenderedWidth = expected.viewport.width * expectedCaptureScale;
    const expectedRenderedHeight = expected.viewport.height * expectedCaptureScale;
    check(Math.abs(Number(runner.captureScale) - expectedCaptureScale) <= 0.000001, `runner capture scale mismatch for ${expected.id}`);
    check(runner.maximumRenderedWidth === 1200, `runner rendered-width ceiling mismatch for ${expected.id}`);
    check(runner.captureBoundsMatch === true, `runner rendered bounds failed for ${expected.id}`);
    check(Math.abs(Number(runner.captureRenderedBounds?.left)) <= 0.01 && Math.abs(Number(runner.captureRenderedBounds?.top)) <= 0.01, `runner rendered capture origin mismatch for ${expected.id}`);
    check(Math.abs(Number(runner.captureRenderedBounds?.width) - expectedRenderedWidth) <= 0.02, `runner rendered capture width mismatch for ${expected.id}`);
    check(Math.abs(Number(runner.captureRenderedBounds?.height) - expectedRenderedHeight) <= 0.02, `runner rendered capture height mismatch for ${expected.id}`);
    check(Number(runner.captureRenderedBounds?.rasterWidth) === Math.round(expectedRenderedWidth), `runner rendered raster width mismatch for ${expected.id}`);
    check(Number(runner.captureRenderedBounds?.rasterHeight) === Math.round(expectedRenderedHeight), `runner rendered raster height mismatch for ${expected.id}`);
    check(report.schema === plan.browserApi.expectedSchema, `browser report schema mismatch for ${expected.id}`);
    check(report.pass === true, `browser QA failed for ${expected.id}`);
    check(report.contract?.sha256 === contractHash, `browser report used a stale contract for ${expected.id}`);
    check(report.viewport?.width === expected.viewport.width && report.viewport?.height === expected.viewport.height, `browser report viewport mismatch for ${expected.id}`);
    check(Number(report.viewport?.layoutWidth) > 0 && Number(report.viewport.layoutWidth) <= expected.viewport.width, `browser report lacks a valid scrollbar-aware layout width for ${expected.id}`);
    check(Number(report.viewport?.layoutHeight) > 0 && Number(report.viewport.layoutHeight) <= expected.viewport.height, `browser report lacks a valid scrollbar-aware layout height for ${expected.id}`);
    check(Number(report.viewport?.documentScrollWidth) <= Number(report.viewport?.layoutWidth) + 1, `browser report document scroll width exceeds its usable viewport for ${expected.id}`);
    check(report.fonts?.mode === "forced metric-conscious fallback", `fallback-font mode missing for ${expected.id}`);
    check(report.copy?.lineCountPass === true, `H1 line-count check failed for ${expected.id}`);
    check(report.copy?.longFixturePass === true, `long-copy check failed for ${expected.id}`);
    check(report.layout?.collisionPass === true, `collision check failed for ${expected.id}`);
    check(report.layout?.pageHorizontalOverflow === false, `page overflow detected for ${expected.id}`);
    check(report.layout?.routeHorizontalOverflow === false, `route overflow detected for ${expected.id}`);
    check(report.layout?.horizontalBoundsPass === true, `horizontal-bound check failed for ${expected.id}`);
    check(report.layout?.textOverflowPass === true, `descendant text overflow detected for ${expected.id}`);
    check(Array.isArray(report.layout?.textOverflow?.offenders) && report.layout.textOverflow.offenders.length === 0, `text overflow offenders remain for ${expected.id}`);
    check(report.layout?.buttonPass === true, `button-size check failed for ${expected.id}`);
    check(report.layout?.ruleSafetyPass === true, `glyph/rule clearance failed for ${expected.id}`);
    check(report.layout?.dividerPass === true, `responsive divider geometry failed for ${expected.id}`);
    check(
      report.layout?.divider?.applicable === (stateQuery.surface === "portal"),
      `responsive divider applicability mismatch for ${expected.id}`,
    );
    check(report.accessibility?.focus?.pass === true, `focus check failed for ${expected.id}`);
    check(report.accessibility?.reducedMotionPass === true, `reduced-motion check failed for ${expected.id}`);
    check(report.assets?.sceneReady === true, `scene failed to load for ${expected.id}`);
    check(report.assets?.doubledCopyPass === true, `doubled portal raster copy risk detected for ${expected.id}`);
    const expectedHeroSceneLayout =
      expected.viewport.width < 900 && expected.viewport.height > expected.viewport.width
        ? "portrait"
        : expected.viewport.height <= 450
          ? "short-landscape"
          : "wide";
    const portalReducedSceneSafety = stateQuery.surface === "portal" && stateQuery.motion === "reduce";
    const sceneSafetyShouldApply = stateQuery.surface === "hero" || portalReducedSceneSafety;
    check(
      report.layout?.sceneSafety?.applicable === sceneSafetyShouldApply,
      `scene-safety applicability mismatch for ${expected.id}`,
    );
    if (sceneSafetyShouldApply) {
      const safety = report.layout?.sceneSafety ?? {};
      const expectedHeroSource =
        expectedHeroSceneLayout === "portrait"
          ? "/artifacts/original/phase-0-3d-repair-v2/renders/hero/mobile-dormant-base.png"
          : "/artifacts/original/phase-0-3d-repair-v2/renders/hero/desktop-dormant-base.png";
      const stressScene = portalReducedSceneSafety || stateQuery.zoom === "200" || stateQuery.fixture === "long";
      check(
        safety.mode === (portalReducedSceneSafety ? "portal-reduced-displaced" : stressScene ? "stress-displaced" : expectedHeroSceneLayout),
        `scene-layout mode mismatch for ${expected.id}`,
      );
      check(safety.baseLayoutMode === expectedHeroSceneLayout, `base scene-layout mode mismatch for ${expected.id}`);
      check(safety.sourceScene === expectedHeroSource, `scene-safety source mismatch for ${expected.id}`);
      check(safety.clearancePx === 16, `keepout clearance mismatch for ${expected.id}`);
      check(
        safety.calibration === "source-pixel feature bounds projected through the live object-fit and CSS transform",
        `hero keepout calibration is not source-derived for ${expected.id}`,
      );
      check(safety.pass === true, `Field Unit/cable keepout gate failed for ${expected.id}`);
      const keepouts = Array.isArray(safety.keepouts) ? safety.keepouts : [];
      check(
        JSON.stringify(keepouts.map((entry) => entry.id)) === JSON.stringify(["field-unit", "spiral-cable"]),
        `hero keepout identities are incomplete for ${expected.id}`,
      );
      for (const keepout of keepouts) {
        check(
          Number(keepout.projected?.rightPx) > Number(keepout.projected?.leftPx) &&
            Number(keepout.projected?.bottomPx) > Number(keepout.projected?.topPx),
          `${keepout.id} keepout is empty for ${expected.id}`,
        );
        check(
          keepout.outsideViewport === stressScene,
          `${keepout.id} viewport-displacement state mismatch for ${expected.id}`,
        );
      }
      const safetyBlocks = Array.isArray(safety.blocks) ? safety.blocks : [];
      check(safetyBlocks.length === (portalReducedSceneSafety ? 5 : 4), `scene-safety block count mismatch for ${expected.id}`);
      check(
        safetyBlocks.every(
          (block) =>
            block.pass === true &&
            block.withinAllowedRegion === true &&
            Array.isArray(block.intersectingKeepouts) &&
            block.intersectingKeepouts.length === 0,
        ),
        `semantic copy intersects the Field Unit/cable safe areas for ${expected.id}`,
      );
      check(report.assets?.scene === expectedHeroSource, `scene-safety report used the wrong authored scene for ${expected.id}`);
      if (stateQuery.surface === "hero" && stateQuery.fixture === "long") {
        check(report.copy?.heading === "Prove it where it has to work.", `hero long fixture changed the public H1 for ${expected.id}`);
        check(
          Number(report.copy?.longFixtureRatio) >= 1.25 && Number(report.copy?.longFixtureRatio) <= 1.26,
          `hero support-only long fixture ratio is outside 1.25–1.26 for ${expected.id}`,
        );
      }
    }
    const referenceAspect = expected.viewport.width / expected.viewport.height;
    const shouldUseReferenceProjection =
      stateQuery.surface === "portal" &&
      stateQuery.fixture === "actual" &&
      stateQuery.zoom === "100" &&
      stateQuery.motion !== "reduce" &&
      expected.viewport.width >= 1024 &&
      Math.abs(referenceAspect - 1.6) <= 0.001;
    if (stateQuery.surface === "portal") {
      check(
        report.layout?.projection?.mode === (shouldUseReferenceProjection ? "reference-cover" : "responsive-dom-flow"),
        `portal projection mode mismatch for ${expected.id}`,
      );
      check(
        report.layout?.anchors?.applicable === shouldUseReferenceProjection,
        `portal anchor applicability is dishonest for ${expected.id}`,
      );
      check(
        report.assets?.scene ===
          (stateQuery.motion === "reduce"
            ? expected.viewport.width < 600
              ? "/artifacts/original/phase-0-3d-repair-v2/renders/hero/mobile-dormant-base.png"
              : "/artifacts/original/phase-0-3d-repair-v2/renders/hero/desktop-dormant-base.png"
            : "/artifacts/original/phase-0-3d-repair-v2/renders/portal/physical-glass-base.png"),
        `portal scene classification/source mismatch for ${expected.id}`,
      );
      if (shouldUseReferenceProjection) {
        check(report.assets?.sceneClassification === "dom-owned crossover over text-free physical glass", `exact crossover scene classification mismatch for ${expected.id}`);
      }
    }
    if (report.layout?.anchors?.applicable) {
      check(report.layout.anchors.pass === true, `portal anchor delta exceeded 3px for ${expected.id}`);
    }
    if (expected.captureRequired) {
      const actualDpr = Number(runner.iframeViewport?.devicePixelRatio);
      const evidenceWasScaled = expectedCaptureScale < 1;
      const expectedCropWidth = Math.round(expectedRenderedWidth);
      const expectedCropHeight = Math.round(expectedRenderedHeight);
      check(typeof record.capture?.path === "string", `required capture path missing for ${expected.id}`);
      check(/^[a-f0-9]{64}$/i.test(record.capture?.sha256 ?? ""), `required capture hash missing for ${expected.id}`);
      check(Number(record.capture?.bytes) > 10_000, `required capture is implausibly small for ${expected.id}`);
      check(
        String(record.capture?.path ?? "").startsWith("artifacts/evidence/phase-0-3d-repair-v2/captures/normalized/") &&
          String(record.capture?.path ?? "").endsWith(".png") &&
          !String(record.capture?.path ?? "").includes(".."),
        `normalized capture path is outside the evidence directory for ${expected.id}`,
      );
      check(typeof record.capture?.raw?.path === "string", `raw capture path missing for ${expected.id}`);
      check(/^[a-f0-9]{64}$/i.test(record.capture?.raw?.sha256 ?? ""), `raw capture hash missing for ${expected.id}`);
      check(Number(record.capture?.raw?.bytes) > 10_000, `raw capture is implausibly small for ${expected.id}`);
      check(
        String(record.capture?.raw?.path ?? "").startsWith("artifacts/evidence/phase-0-3d-repair-v2/captures/raw/") &&
          String(record.capture?.raw?.path ?? "").endsWith(".jpg") &&
          !String(record.capture?.raw?.path ?? "").includes(".."),
        `raw capture path is outside the evidence directory for ${expected.id}`,
      );
      check(
        record.capture?.normalization?.method ===
          (evidenceWasScaled ? "top-left-crop-lanczos-resample" : "top-left-crop-no-resample"),
        `capture normalization method mismatch for ${expected.id}`,
      );
      check(record.capture?.normalization?.origin?.x === 0 && record.capture?.normalization?.origin?.y === 0, `capture crop origin mismatch for ${expected.id}`);
      check(Number(record.capture?.normalization?.sourceCrop?.width) === expectedCropWidth && Number(record.capture?.normalization?.sourceCrop?.height) === expectedCropHeight, `capture source-crop bounds mismatch for ${expected.id}`);
      check(Math.abs(Number(record.capture?.normalization?.captureScale) - expectedCaptureScale) <= 0.000001, `capture normalization scale mismatch for ${expected.id}`);
      check(record.capture?.normalization?.resampled === evidenceWasScaled, `capture resampling state mismatch for ${expected.id}`);
      check(record.capture?.normalization?.resampleFilter === (evidenceWasScaled ? "Lanczos" : null), `capture resampling filter mismatch for ${expected.id}`);
      check(record.capture?.normalization?.sourceRawSha256 === record.capture?.raw?.sha256, `capture normalization lineage mismatch for ${expected.id}`);
      if (await exists(record.capture?.path ?? "")) {
        const captureBuffer = await readFile(absolute(record.capture.path));
        const dimensions = pngDimensions(captureBuffer, record.capture.path);
        const metadata = await stat(absolute(record.capture.path));
        check(metadata.size === Number(record.capture.bytes), `capture byte count mismatch for ${expected.id}`);
        check(sha256(captureBuffer) === String(record.capture.sha256).toLowerCase(), `capture SHA-256 mismatch for ${expected.id}`);
        if (dimensions) {
          check(dimensions.width === expected.viewport.width, `capture width mismatch for ${expected.id}`);
          check(dimensions.height === expected.viewport.height, `capture height mismatch for ${expected.id}`);
          check(Number(record.capture.width) === dimensions.width, `recorded capture width mismatch for ${expected.id}`);
          check(Number(record.capture.height) === dimensions.height, `recorded capture height mismatch for ${expected.id}`);
        }
        const decodedCapture = decodePngPixels(captureBuffer, record.capture.path);
        if (decodedCapture) {
          let visibleGlyphRectangles = 0;
          for (const block of report.layout?.textOverflow?.blocks ?? []) {
            for (const rectangle of block.glyphRectangles ?? []) {
              const ink = textInkCount(decodedCapture, rectangle);
              if (ink.visibleArea === 0) continue;
              visibleGlyphRectangles += 1;
              const minimumInkPixels = Math.max(4, Math.ceil(ink.visibleArea * 0.0008));
              check(
                ink.inkPixels >= minimumInkPixels,
                `normalized raster lacks expected visible text ink for ${expected.id} / ${block.id}: ${ink.inkPixels} < ${minimumInkPixels}`,
              );
              const rectangleFullyVisible =
                Number(rectangle.leftPx) >= 0 &&
                Number(rectangle.rightPx) <= decodedCapture.width &&
                Number(rectangle.topPx) >= 0 &&
                Number(rectangle.bottomPx) <= decodedCapture.height;
              if (rectangleFullyVisible && ink.inkBounds && ink.visibleWidth >= 24 && ink.visibleHeight >= 8) {
                const horizontalCoverage = (ink.inkBounds.right - ink.inkBounds.left) / ink.visibleWidth;
                const verticalCoverage = (ink.inkBounds.bottom - ink.inkBounds.top) / ink.visibleHeight;
                check(
                  horizontalCoverage >= 0.45,
                  `normalized raster has partial/clipped text coverage for ${expected.id} / ${block.id}: horizontal ${horizontalCoverage.toFixed(3)} < 0.45`,
                );
                check(
                  verticalCoverage >= 0.3,
                  `normalized raster has partial/clipped text coverage for ${expected.id} / ${block.id}: vertical ${verticalCoverage.toFixed(3)} < 0.3`,
                );
              }
            }
          }
          check(visibleGlyphRectangles >= 3, `normalized raster has too few verifiable text rectangles for ${expected.id}`);
        }
      } else {
        errors.push(`required capture file missing for ${expected.id}`);
      }
      if (await exists(record.capture?.raw?.path ?? "")) {
        const rawBuffer = await readFile(absolute(record.capture.raw.path));
        const rawDimensions = jpegDimensions(rawBuffer, record.capture.raw.path);
        const rawMetadata = await stat(absolute(record.capture.raw.path));
        check(rawMetadata.size === Number(record.capture.raw.bytes), `raw capture byte count mismatch for ${expected.id}`);
        check(sha256(rawBuffer) === String(record.capture.raw.sha256).toLowerCase(), `raw capture SHA-256 mismatch for ${expected.id}`);
        if (rawDimensions) {
          check(rawDimensions.width >= expectedCropWidth, `raw capture is too narrow to contain the rendered frame for ${expected.id}`);
          check(rawDimensions.height >= expectedCropHeight, `raw capture is too short to contain the rendered frame for ${expected.id}`);
          check(Number(record.capture.raw.width) === rawDimensions.width, `recorded raw capture width mismatch for ${expected.id}`);
          check(Number(record.capture.raw.height) === rawDimensions.height, `recorded raw capture height mismatch for ${expected.id}`);
          check(Number(record.capture.raw.devicePixelRatio) === actualDpr, `recorded raw capture DPR mismatch for ${expected.id}`);
          check(record.capture.raw.rasterPolicy === "actual browser full-page JPEG; no CSS-by-DPR relationship asserted", `raw capture raster policy mismatch for ${expected.id}`);
        }
      } else {
        errors.push(`raw capture file missing for ${expected.id}`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Phase 0.2 portal/typography verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Verified Phase 0.2 portal/layout contract ${contractHash}: ${expandedCases.length} browser cases, exact copy/anchors, source-pixel Field Unit/cable keepouts, 12px glyph-rule clearance, fallback-font and no-overflow boundaries.`,
  );
}
