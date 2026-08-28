import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ROUTE_ORDER, ROUTES, VIEWPORTS } from "../prototypes/phase-5a-supporting-routes/route-data.mjs";
import { renderRoute, renderSystem } from "../prototypes/phase-5a-supporting-routes/render-route.mjs";

const ROOT = process.cwd();
const LAB = path.join(ROOT, "prototypes", "phase-5a-supporting-routes");
const CANARY = "QH_PHASE5A_ROUTE_LAB_ONLY";

test("route lab contains exactly the nine authorized, differentiated route plans", () => {
  assert.deepEqual(Object.keys(ROUTES).sort(), [...ROUTE_ORDER].sort());
  assert.equal(new Set(Object.values(ROUTES).map(({ publicPath }) => publicPath)).size, 9);
  assert.equal(new Set(Object.values(ROUTES).map(({ signature }) => signature)).size, 9);
  assert.equal(ROUTES.industries.chapters.length, 4);
  assert.match(ROUTES.industries.chapters.join(" "), /Automotive & Mobility/);
  assert.match(ROUTES.industries.chapters.join(" "), /Energy & Infrastructure/);
  assert.match(ROUTES.proof.media.repository, /approved Maradin/i);
  assert.match(ROUTES.spark.publication.join(" "), /Applications closed/);
  assert.match(ROUTES.contact.conversion, /Blocked pending/i);
  assert.match(ROUTES["404"].publication.join(" "), /Real HTTP 404/);
});

test("route plan and render retain the publication and no-cinematic boundary", () => {
  for (const slug of ROUTE_ORDER) {
    const route = ROUTES[slug];
    const html = renderRoute(route);
    assert.match(html, /noindex, nofollow/);
    assert.match(html, new RegExp(CANARY));
    assert.match(html, /<main\b/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1, slug);
    assert.doesNotMatch(html, /<video\b|\.mp4|cinematic-runway|position:\s*sticky|WHERE DO YOU ENTER/i, slug);
    assert.doesNotMatch(html, /<form\b|mailto:|tel:|response time|join (?:the )?waitlist/i, slug);
    assert.doesNotMatch(html, /defen[cs]e|dual[- ]use/i, slug);
  }
  assert.equal((renderSystem().match(/data-system-route=/g) ?? []).length, 9);
});

test("capture plan covers seven required viewports and fifteen artifacts per route", async () => {
  const plan = JSON.parse(await readFile(path.join(LAB, "capture-plan.json"), "utf8"));
  assert.deepEqual(plan.routes, ROUTE_ORDER);
  assert.deepEqual(plan.viewports, VIEWPORTS);
  assert.equal(plan.requiredRouteArtifacts.length, 15);
  assert.ok(plan.requiredRouteArtifacts.includes("responsive-contact-sheet.png"));
  assert.ok(plan.requiredRouteArtifacts.includes("signature-motion-states.png"));
  assert.ok(plan.requiredRouteArtifacts.includes("reduced-motion.png"));
  assert.ok(plan.requiredRouteArtifacts.includes("no-js.png"));
  assert.equal(plan.rules.publicExposure, false);
  assert.equal(plan.rules.generatedReviewMediaTracked, false);
  assert.equal(plan.rules.phase5BAuthorized, false);
});

test("local server exposes only isolated noindex prototype responses", async (context) => {
  const port = 42_100 + (process.pid % 500);
  const child = spawn(process.execPath, [path.join(LAB, "server.mjs"), `--port=${port}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  context.after(() => child.kill("SIGTERM"));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8_000;
  let response;
  while (Date.now() < deadline) {
    try {
      response = await fetch(`${base}/for-partners/`, { signal: AbortSignal.timeout(500) });
      if (response.ok) break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }
  assert.ok(response?.ok, "local route server did not become ready");
  assert.equal(response.headers.get("x-phase5a-local-prototype"), CANARY);
  assert.match(response.headers.get("content-security-policy") ?? "", /connect-src 'none'/);
  assert.match(await response.text(), /LOCAL PREPRODUCTION · NOT A PUBLIC ROUTE/);
  const system = await fetch(`${base}/system/`);
  assert.equal(system.status, 200);
  assert.match(await system.text(), /One material world\. Nine distinct spatial identities\./);
  const unknown = await fetch(`${base}/not-authorized/`);
  assert.equal(unknown.status, 404);
});
