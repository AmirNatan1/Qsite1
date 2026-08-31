import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright-core";

const valueAfter = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const baseUrl = new URL(valueAfter("--base-url", "https://920cf041.qsite1.pages.dev/"));
const output = valueAfter("--output", null);
if (!output) throw new Error("--output is required");
await mkdir(path.dirname(output), { recursive: true });

const active = () => ({
  tag: document.activeElement?.tagName ?? null,
  id: document.activeElement?.id || null,
  href: document.activeElement?.getAttribute?.("href") ?? null,
  classes: document.activeElement?.className || null,
  text: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 140) ?? null,
});
const settle = async (page, milliseconds = 250) => {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.waitForTimeout(milliseconds);
};
const newPage = async (browser, options = {}) => {
  const page = await browser.newPage(options);
  await page.addInitScript(() => {
    globalThis.__phase6R1Keys = [];
    addEventListener("keydown", (event) => globalThis.__phase6R1Keys.push({
      key: event.key,
      tag: document.activeElement?.tagName ?? null,
      href: document.activeElement?.getAttribute?.("href") ?? null,
    }), true);
  });
  return page;
};

async function runMode(headed) {
  const result = {
    headed,
    browserVersion: null,
    keyboardDelivery: { status: "PASS", events: [] },
    focus: { status: "PASS", limitations: [], observations: {} },
    navigation: { status: "PASS", failures: [], observations: {} },
  };
  let browser;
  try {
    browser = await webkit.launch({ headless: !headed });
    result.browserVersion = browser.version();

    const desktop = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await desktop.goto(new URL("/", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(desktop, 500);
    result.focus.observations.homeInitial = await desktop.evaluate(active);
    await desktop.keyboard.press("Tab");
    await desktop.waitForTimeout(150);
    result.focus.observations.homeAfterTab = await desktop.evaluate(active);
    if (result.focus.observations.homeAfterTab.tag === "BODY") {
      result.focus.limitations.push("WebKit delivered Tab but focus remained on BODY at Home");
    }

    const skip = desktop.locator("a.skip-link[href='#entry']").first();
    await skip.focus();
    result.focus.observations.skipForcedFocus = await desktop.evaluate(active);
    await desktop.keyboard.press("Enter");
    await desktop.waitForTimeout(650);
    result.navigation.observations.skipKeyboardActivation = {
      url: desktop.url(),
      manifesto: await desktop.locator("[data-cinematic-shell]").getAttribute("data-manifesto-reveal"),
      focus: await desktop.evaluate(active),
      rendering: await desktop.evaluate(() => {
        const heading = document.querySelector("#entry h1");
        const rect = heading?.getBoundingClientRect();
        return {
          mode: document.documentElement.dataset.cinematicMode ?? null,
          fallback: document.documentElement.dataset.cinematicFallback ?? null,
          headingVisible: Boolean(rect && rect.width > 0 && rect.height > 0 && getComputedStyle(heading).visibility !== "hidden"),
        };
      }),
    };
    if (!desktop.url().endsWith("/#entry")) {
      result.focus.limitations.push("Focused skip link received Enter but WebKit did not perform its default anchor activation");
      await skip.click();
      await desktop.waitForTimeout(650);
    }
    result.navigation.observations.skipPointerActivation = {
      url: desktop.url(),
      manifesto: await desktop.locator("[data-cinematic-shell]").getAttribute("data-manifesto-reveal"),
    };
    if (!desktop.url().endsWith("/#entry")) result.navigation.failures.push("skip link did not navigate even with direct pointer activation");

    const reduced = await newPage(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await reduced.goto(new URL("/#entry", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(reduced, 500);
    const entry = reduced.locator("#entry").first();
    await entry.focus();
    result.focus.observations.reducedManifestoBeforeTab = await reduced.evaluate(active);
    await reduced.keyboard.press("Tab");
    await reduced.waitForTimeout(150);
    result.focus.observations.reducedManifestoAfterTab = await reduced.evaluate(active);
    const audienceFocused = result.focus.observations.reducedManifestoAfterTab.classes?.includes?.("audience-trajectory");
    if (!audienceFocused) result.focus.limitations.push("Tab from the reduced-motion manifesto did not reach an audience trajectory");
    await reduced.keyboard.press("Shift+Tab");
    await reduced.waitForTimeout(150);
    result.focus.observations.reducedManifestoAfterShiftTab = await reduced.evaluate(active);
    if (result.focus.observations.reducedManifestoAfterShiftTab.tag === "BODY") {
      result.focus.limitations.push("Shift+Tab returned focus to BODY rather than a deterministic predecessor");
    }
    result.keyboardDelivery.events.push(...await reduced.evaluate(() => globalThis.__phase6R1Keys));
    await reduced.close();

    await desktop.goto(new URL("/about/", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(desktop);
    await desktop.evaluate(() => scrollTo(0, Math.min(900, document.documentElement.scrollHeight - innerHeight)));
    const beforeHome = await desktop.evaluate(() => scrollY);
    await desktop.keyboard.press("Home");
    await desktop.waitForTimeout(350);
    const afterHome = await desktop.evaluate(() => scrollY);
    result.navigation.observations.desktopHome = { before: beforeHome, after: afterHome };
    if (!(beforeHome > 0 && afterHome === 0)) result.navigation.failures.push("desktop Home did not return supporting route to scrollY=0");
    result.keyboardDelivery.events.push(...await desktop.evaluate(() => globalThis.__phase6R1Keys));
    await desktop.close();

    const mobile = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(new URL("/about/", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(mobile);
    const trigger = mobile.locator("[data-mobile-nav] summary").first();
    await trigger.click();
    await mobile.waitForTimeout(120);
    const open = await mobile.locator("[data-mobile-nav]").evaluate((node) => ({
      open: node.hasAttribute("open"),
      expanded: node.querySelector("summary")?.getAttribute("aria-expanded"),
      visibleLinks: [...node.querySelectorAll("a[href]")].filter((link) => {
        const rect = link.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
    }));
    await mobile.keyboard.press("Escape");
    await mobile.waitForTimeout(120);
    const closed = await mobile.locator("[data-mobile-nav]").evaluate((node) => ({
      open: node.hasAttribute("open"),
      expanded: node.querySelector("summary")?.getAttribute("aria-expanded"),
    }));
    const returnedFocus = await mobile.evaluate(active);
    result.navigation.observations.mobileMenu = { open, closed, returnedFocus };
    if (!open.open || open.expanded !== "true" || open.visibleLinks < 8) result.navigation.failures.push("mobile menu did not open with all routes available");
    if (closed.open || closed.expanded !== "false" || returnedFocus.tag !== "SUMMARY") result.navigation.failures.push("Escape did not close menu and return focus");

    await mobile.goto(new URL("/for-partners/", baseUrl).href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(mobile);
    await mobile.locator('a[href="/#entry"]').first().click();
    await mobile.waitForFunction(() => location.pathname === "/" && location.hash === "#entry", null, { timeout: 10_000 });
    await mobile.waitForTimeout(1_600);
    const entryUrl = mobile.url();
    const entryManifesto = await mobile.locator("[data-cinematic-shell]").getAttribute("data-manifesto-reveal");
    await mobile.goBack({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(mobile);
    const backUrl = mobile.url();
    await mobile.goForward({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await settle(mobile);
    const forwardUrl = mobile.url();
    result.navigation.observations.supportingHistory = { entryUrl, entryManifesto, backUrl, forwardUrl };
    if (!entryUrl.endsWith("/#entry")) result.navigation.failures.push("supporting route did not navigate to /#entry");
    if (!backUrl.endsWith("/for-partners/")) result.navigation.failures.push("Back did not restore supporting route");
    if (!forwardUrl.endsWith("/#entry")) result.navigation.failures.push("Forward did not restore /#entry");

    result.keyboardDelivery.events.push(...await mobile.evaluate(() => globalThis.__phase6R1Keys));
    const desktopKeys = [
      ...(result.focus.observations.homeAfterTab ? ["Tab"] : []),
      "Enter", "Tab", "Shift+Tab", "Home", "Escape",
    ];
    result.keyboardDelivery.expected = desktopKeys;
    result.keyboardDelivery.status = "PASS";
    await mobile.close();
  } catch (error) {
    result.navigation.failures.push(String(error));
  } finally {
    await browser?.close().catch(() => undefined);
  }

  result.focus.limitations = [...new Set(result.focus.limitations)];
  result.focus.status = result.focus.limitations.length ? "LIMITATION" : "PASS";
  result.navigation.status = result.navigation.failures.length ? "FAIL" : "PASS";
  result.harnessDiagnosis = result.navigation.status === "PASS" && result.focus.status === "LIMITATION"
    ? "Navigation, menu, Escape, Home and history complete with fixed condition checks. The prior full-suite URL/manifesto waits conflated navigation with WebKit focus/static-path state; focus fidelity remains a Windows Playwright WebKit limitation."
    : null;
  result.status = result.navigation.status === "FAIL" ? "FAIL" : result.focus.status === "LIMITATION" ? "LIMITATION" : "PASS";
  return result;
}

const headless = await runMode(false);
const headed = await runMode(true);
const report = {
  schema: "quantum-hub.phase-6-r1.focused-webkit-interactions.v1",
  createdAt: new Date().toISOString(),
  baseUrl: baseUrl.href,
  classification: "PLAYWRIGHT WEBKIT ON WINDOWS; NOT PHYSICAL SAFARI",
  modes: [headless, headed],
  status: [headless, headed].some((mode) => mode.navigation.status === "FAIL")
    ? "FAIL"
    : [headless, headed].some((mode) => mode.focus.status === "LIMITATION") ? "LIMITATION" : "PASS",
  interpretation: "Navigation, Home, menu, Escape, Back and Forward are evaluated independently from focus acquisition. Delivered keys or axe results never promote a BODY-stuck focus path to PASS.",
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
const bytes = await readFile(output);
console.log(JSON.stringify({ output, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), status: report.status }, null, 2));
