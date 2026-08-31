import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith("--") || value === undefined) {
    throw new Error(`Expected --name value arguments; received ${key ?? "<none>"}`);
  }
  args.set(key.slice(2), value);
}

const cdpUrl = args.get("cdp-url") ?? "http://127.0.0.1:9333";
const baseUrl = new URL(args.get("base-url") ?? "https://920cf041.qsite1.pages.dev/");
const outputRoot = args.get("output");
const baselineWidth = Number(args.get("baseline-width"));
const baselineDpr = Number(args.get("baseline-dpr"));
const uiZoomLabel = args.get("ui-zoom-label") ?? null;

if (!outputRoot) throw new Error("--output is required");
if (!Number.isFinite(baselineWidth) || baselineWidth <= 0) throw new Error("--baseline-width must be positive");
if (!Number.isFinite(baselineDpr) || baselineDpr <= 0) throw new Error("--baseline-dpr must be positive");

const routes = [
  ["home", "/", 200],
  ["for-partners", "/for-partners/", 200],
  ["for-startups", "/for-startups/", 200],
  ["industries", "/industries/", 200],
  ["pocs", "/pocs/", 200],
  ["maradin", "/pocs/maradin/", 200],
  ["spark", "/spark/", 200],
  ["about", "/about/", 200],
  ["contact", "/contact/", 200],
  ["genuine-404", "/phase-6-r1-genuine-404/", 404],
];

const screenshotsRoot = path.join(outputRoot, "screenshots");
const framesRoot = path.join(outputRoot, "video-frames");
await mkdir(screenshotsRoot, { recursive: true });
await mkdir(framesRoot, { recursive: true });

const browser = await chromium.connectOverCDP(cdpUrl);
const pages = browser.contexts().flatMap((context) => context.pages());
const page = pages.find((candidate) => {
  try {
    return new URL(candidate.url()).origin === baseUrl.origin;
  } catch {
    return false;
  }
});
if (!page) throw new Error(`No ${baseUrl.origin} page is attached to ${cdpUrl}`);

let frameIndex = 0;
const frame = async (label) => {
  frameIndex += 1;
  const filename = `${String(frameIndex).padStart(4, "0")}-${label}.png`;
  await page.screenshot({ path: path.join(framesRoot, filename), scale: "css" });
  return filename;
};

const inspect = async () => page.evaluate(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return !element.hidden
      && element.getAttribute("aria-hidden") !== "true"
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity) !== 0
      && rect.width > 0
      && rect.height > 0;
  };
  const summary = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      visible: visible(element),
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
    };
  };

  const textSelectors = "h1,h2,h3,h4,p,li,a,button,summary,dt,dd,label,blockquote";
  const clippedText = [...document.querySelectorAll(textSelectors)].flatMap((element) => {
    if (!visible(element) || !(element.textContent || "").trim()) return [];
    const style = getComputedStyle(element);
    const clipsX = ["hidden", "clip", "scroll", "auto"].includes(style.overflowX);
    const clipsY = ["hidden", "clip", "scroll", "auto"].includes(style.overflowY);
    const x = clipsX && element.scrollWidth > element.clientWidth + 1;
    const y = clipsY && element.scrollHeight > element.clientHeight + 1;
    if (!x && !y) return [];
    return [{
      tag: element.tagName,
      text: element.textContent.replace(/\s+/g, " ").trim().slice(0, 180),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      client: [element.clientWidth, element.clientHeight],
      scroll: [element.scrollWidth, element.scrollHeight],
    }];
  });

  const splitWords = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode() && splitWords.length < 40) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!parent || !visible(parent) || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
    for (const match of node.data.matchAll(/[^\s\u00a0]+/gu)) {
      const word = match[0];
      if (word.length < 2) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + word.length);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
      const lines = new Set(rects.map((rect) => Math.round(rect.y * 10) / 10));
      if (lines.size > 1) {
        splitWords.push({ word: word.slice(0, 120), parent: parent.tagName, lines: [...lines] });
        if (splitWords.length >= 40) break;
      }
    }
  }

  const main = document.querySelector("main");
  const h1 = main?.querySelector("h1") ?? document.querySelector("h1");
  const proposition = main?.querySelector("p");
  const sections = [...(main?.querySelectorAll("section") ?? [])];
  const hiddenSections = sections.filter((element) => !visible(element)).map((element) => ({
    id: element.id || null,
    label: element.getAttribute("aria-labelledby"),
  }));
  const controls = [...document.querySelectorAll("a[href],button,summary,input,select,textarea")]
    .filter(visible)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        text: (element.innerText || element.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120),
        href: element.getAttribute("href"),
        disabled: Boolean(element.disabled),
        rect: { width: rect.width, height: rect.height },
      };
    });
  const mobile = document.querySelector("[data-mobile-nav], details.mobile-nav");
  const desktop = document.querySelector(".desktop-nav");
  const footer = document.querySelector("footer");
  const root = document.documentElement;

  return {
    geometry: {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      devicePixelRatio,
      visualViewport: window.visualViewport ? {
        width: visualViewport.width,
        height: visualViewport.height,
        scale: visualViewport.scale,
      } : null,
      document: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, scrollHeight: root.scrollHeight },
    },
    identity: { title: document.title, bodyClass: document.body.className, lang: document.documentElement.lang },
    h1: summary(h1),
    proposition: summary(proposition),
    navigation: { desktop: summary(desktop), mobile: summary(mobile) },
    main: summary(main),
    footer: summary(footer),
    sectionCount: sections.length,
    hiddenSections,
    clippedText,
    splitWords,
    controls: {
      count: controls.length,
      disabled: controls.filter((item) => item.disabled),
      zeroSized: controls.filter((item) => item.rect.width <= 0 || item.rect.height <= 0),
      samples: controls.slice(0, 30),
    },
    horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
  };
});

const results = [];
for (const [id, pathname, expectedStatus] of routes) {
  const response = await page.goto(new URL(pathname, baseUrl).href, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(700);
  const urlAtTop = page.url();
  const topFrame = await frame(`${id}-top`);
  await page.screenshot({ path: path.join(screenshotsRoot, `${id}-top.png`), scale: "css" });

  let opening = null;
  if (id === "home") {
    opening = await page.evaluate(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      const entry = document.querySelector("#entry");
      const rect = (element) => {
        const value = element?.getBoundingClientRect();
        return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
      };
      return { shell: rect(shell), entry: rect(entry), scrollY, href: location.href };
    });
    const skip = page.locator("a.skip-link[href='#entry']").first();
    if (await skip.count()) {
      await skip.focus();
      await skip.press("Enter");
      await page.waitForFunction(() => {
        const shell = document.querySelector("[data-cinematic-shell]");
        const heading = document.querySelector("#entry h1");
        const rect = heading?.getBoundingClientRect();
        return shell?.dataset.manifestoReveal === "resolved"
          && rect
          && rect.bottom > 0
          && rect.top < innerHeight;
      }, null, { timeout: 8_000 });
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: path.join(screenshotsRoot, "home-manifesto.png"), scale: "css" });
    await frame("home-manifesto");
    opening.resolved = await page.evaluate(() => {
      const shell = document.querySelector("[data-cinematic-shell]");
      return {
        href: location.href,
        scrollY,
        manifestoReveal: shell?.dataset.manifestoReveal ?? null,
        cinematicPhase: shell?.dataset.cinematicPhase ?? null,
        cinematicHeader: document.documentElement.dataset.cinematicHeader ?? null,
        routeNavigation: shell?.dataset.routeNavigation ?? null,
      };
    });
    const audience = page.locator("#audience-routing").first();
    if (await audience.count()) {
      await audience.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector("[data-cinematic-shell]")?.dataset.routeNavigation === "released", null, { timeout: 8_000 });
      await page.waitForTimeout(120);
    }
  }

  const beforeMenu = await inspect();
  const mobileSummary = page.locator("[data-mobile-nav] summary, details.mobile-nav summary").first();
  let menu = { applicable: false };
  if (await mobileSummary.count() && await mobileSummary.isVisible()) {
    menu.applicable = true;
    await mobileSummary.click();
    await page.waitForTimeout(120);
    menu.open = await page.evaluate(() => {
      const details = document.querySelector("[data-mobile-nav], details.mobile-nav");
      const links = [...(details?.querySelectorAll("a[href]") ?? [])].filter((link) => {
        const rect = link.getBoundingClientRect();
        const style = getComputedStyle(link);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
      return {
        open: Boolean(details?.open),
        ariaExpanded: details?.querySelector("summary")?.getAttribute("aria-expanded"),
        linkCount: links.length,
        links: links.map((link) => ({ text: link.textContent.trim(), href: link.getAttribute("href") })),
      };
    });
    await page.screenshot({ path: path.join(screenshotsRoot, `${id}-menu.png`), scale: "css" });
    await frame(`${id}-menu`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
    menu.closed = await page.evaluate(() => {
      const details = document.querySelector("[data-mobile-nav], details.mobile-nav");
      const active = document.activeElement;
      return {
        open: Boolean(details?.open),
        activeTag: active?.tagName,
        activeText: active?.textContent?.replace(/\s+/g, " ").trim(),
      };
    });
  }

  const footer = page.locator("footer").first();
  if (await footer.count()) await footer.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const bottomFrame = await frame(`${id}-bottom`);
  const atBottom = await page.evaluate(() => ({
    scrollY,
    maxScrollY: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    footerVisible: (() => {
      const footer = document.querySelector("footer");
      if (!footer) return false;
      const rect = footer.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })(),
  }));
  await page.screenshot({ path: path.join(screenshotsRoot, `${id}-full.png`), fullPage: true, scale: "css" });

  const failures = [];
  if ((response?.status() ?? null) !== expectedStatus) failures.push(`http-status:${response?.status() ?? "null"}`);
  if (!beforeMenu.h1?.visible || !beforeMenu.h1.text) failures.push("complete-h1-not-visible");
  if (beforeMenu.h1 && (beforeMenu.h1.scrollWidth > beforeMenu.h1.clientWidth + 1) && ["hidden", "clip"].includes(beforeMenu.h1.overflowX)) failures.push("h1-clipped");
  if (!beforeMenu.proposition?.visible || !beforeMenu.proposition.text) failures.push("opening-proposition-not-visible");
  if (beforeMenu.horizontalOverflow) failures.push("horizontal-overflow");
  if (beforeMenu.clippedText.length) failures.push(`clipped-text:${beforeMenu.clippedText.length}`);
  if (beforeMenu.splitWords.length) failures.push(`internally-split-words:${beforeMenu.splitWords.length}`);
  if (beforeMenu.hiddenSections.length) failures.push(`hidden-sections:${beforeMenu.hiddenSections.length}`);
  if (beforeMenu.controls.count === 0 || beforeMenu.controls.zeroSized.length) failures.push("unusable-controls-or-links");
  if (!beforeMenu.main?.visible || !beforeMenu.footer?.visible || !atBottom.footerVisible) failures.push("document-continuation-incomplete");
  if (menu.applicable && (!menu.open?.open || menu.open.linkCount < 8)) failures.push("mobile-menu-not-usable");
  if (menu.applicable && (menu.closed?.open || menu.closed?.activeTag !== "SUMMARY")) failures.push("mobile-menu-escape-focus-return-failed");

  results.push({
    id,
    pathname,
    expectedStatus,
    actualStatus: response?.status() ?? null,
    urlAtTop,
    urlAfterReview: page.url(),
    opening,
    inspection: beforeMenu,
    menu,
    continuation: atBottom,
    frames: [topFrame, ...(menu.applicable ? [`${id}-menu`] : []), bottomFrame],
    failures,
    status: failures.length ? "FAIL" : "PASS",
  });
}

const geometry = results[0].inspection.geometry;
const zoomProof = {
  inputMethod: "native Windows SendInput keyboard chord delivered to installed Chrome",
  chromeUiAccessibilityLabel: uiZoomLabel,
  baseline: { innerWidth: baselineWidth, devicePixelRatio: baselineDpr },
  observed: geometry,
  widthRatio: baselineWidth / geometry.innerWidth,
  dprRatio: geometry.devicePixelRatio / baselineDpr,
};
zoomProof.status = uiZoomLabel === "Zoom: 200%"
  && Math.abs(zoomProof.widthRatio - 2) < 0.02
  && Math.abs(zoomProof.dprRatio - 2) < 0.02
  && geometry.visualViewport?.scale === 1
  ? "PASS"
  : "FAIL";

const report = {
  schema: "quantum-hub.phase-6-r1.installed-chrome-native-zoom.v1",
  createdAt: new Date().toISOString(),
  baseUrl: baseUrl.href,
  browser: { product: "Google Chrome", version: browser.version(), cdpUrl, headed: true },
  node: { version: process.version, execPath: process.execPath },
  classification: "GENUINE INSTALLED GOOGLE CHROME BROWSER ZOOM",
  forbiddenSubstitutes: { viewportResize: false, cssZoom: false, transformScale: false, deviceEmulation: false },
  zoomProof,
  routeSummary: { total: results.length, passed: results.filter((result) => result.status === "PASS").length, failed: results.filter((result) => result.status === "FAIL").length },
  results,
};
report.status = zoomProof.status === "PASS" && report.routeSummary.failed === 0 ? "PASS" : "FAIL";

const reportPath = path.join(outputRoot, "installed-chrome-200-percent-report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const files = [];
for (const directory of [screenshotsRoot, framesRoot]) {
  for (const name of await readdir(directory)) {
    const filename = path.join(directory, name);
    const bytes = await readFile(filename);
    files.push({ path: path.relative(outputRoot, filename).replaceAll("\\", "/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
}
const reportBytes = await readFile(reportPath);
const manifest = {
  schema: "quantum-hub.phase-6-r1.installed-chrome-native-zoom-artifacts.v1",
  createdAt: report.createdAt,
  report: { path: path.basename(reportPath), bytes: reportBytes.length, sha256: createHash("sha256").update(reportBytes).digest("hex") },
  entries: files.sort((a, b) => a.path.localeCompare(b.path)),
};
await writeFile(path.join(outputRoot, "installed-chrome-200-percent-artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({ outputRoot, reportPath, status: report.status, zoomProof: report.zoomProof, routeSummary: report.routeSummary, frameCount: frameIndex }, null, 2));
await browser.close();
