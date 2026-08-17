# Framework and Cloudflare Contract

Status: Phase 0 architecture decision and read-only deployment audit
Audit date: 17 August 2026

## Preservation contract

The only implementation repository is `https://github.com/AmirNatan1/Qsite1.git`. The only deployment path is its existing GitHub-connected Cloudflare Pages project, `qsite1`. GitHub pushes remain the deployment source of truth.

Phase 0 must preserve:

- all repository history;
- `main`;
- the existing Cloudflare project and GitHub connection;
- the production-branch configuration;
- current domains and DNS;
- all private dashboard settings that cannot be audited.

Phase 0 must not create or use a second repository, nested `.git`, Sites host, second Cloudflare project, Worker deployment, direct Wrangler production flow, or unrelated preview provider. It must not modify a Cloudflare setting.

## Repository observations

| Field | Direct observation |
|---|---|
| Remote | `https://github.com/AmirNatan1/Qsite1.git` |
| Remote default branch | `main` |
| Verified baseline SHA | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Baseline tree | One eight-byte `README.md`; no application or configuration |
| Branches at audit | `main` only |
| Tags at audit | None |
| Existing framework | None |
| Existing package manager/lockfile | None |
| Existing Pages/Workers config | None in Git |
| Existing Functions | None in Git |
| Existing Worker entrypoint | None in Git |
| Existing SSR/server dependency | None in Git |
| Existing redirect/fallback config | None in Git |

## Cloudflare observations

| Contract field | Status | Evidence or decision boundary |
|---|---|---|
| Project name | Direct: `qsite1` | GitHub `Cloudflare Pages` check |
| Connected repository | Direct with high confidence: `AmirNatan1/Qsite1` | Check is attached to the authoritative repository baseline |
| Production branch | Operationally observed: `main`; dashboard confirmation unavailable | `main` is the default and only branch and produced the Pages check/production hostname behavior |
| Initial check | Direct: `95384265300`, successful | Attached to baseline SHA |
| Historical deployment URL | Direct: `https://366edc4c.qsite1.pages.dev` | Check output |
| Production hostname | Direct: `https://qsite1.pages.dev` | Existing project hostname |
| Deployed behavior | Direct: `/README.md` available, `/` returns 404 | Repository had no `index.html` |
| Repository root | Unavailable in private dashboard | Not invented or modified |
| Install command | Unavailable in private dashboard | Not invented or modified |
| Build command | Unavailable in private dashboard | Not invented or modified |
| Output directory | Unavailable in private dashboard | Not invented or modified |
| Cloudflare Node setting | Unavailable in private dashboard | Project pins a compatible Node version in Git; dashboard remains untouched |
| Branch-preview policy | Unavailable until a non-production push/check is observed | Initial evidence proves only the baseline Pages check |
| Build-watch paths | Unavailable in private dashboard | Not invented or modified |
| Environment-variable names | Unavailable in private dashboard | No names or secret values are asserted |
| Custom domains | Unavailable in private dashboard | The `pages.dev` hostname is known; no other domain claim is made |
| Redirects | None tracked in the baseline | No dashboard redirect is inferred |
| SPA fallback | No tracked fallback; deployed root 404 | Static real-route HTML is selected; no SPA fallback is required |
| Pages Functions | None tracked | No function is created in Phase 0 |
| Worker entrypoint | None tracked | No Worker is created in Phase 0 |
| SSR/server dependency | None observed | Static architecture remains valid |

Private dashboard fields were inaccessible in the available authenticated environment. This limitation is explicit. Existing settings remain untouched, and selected repository configuration is verified through the branch build and any resulting Cloudflare branch preview rather than assumed to have changed the dashboard.

## Framework comparison

| Criterion | Astro static + isolated TypeScript | Plain Vite + React + TypeScript | Vinext |
|---|---|---|---|
| Static semantic route HTML | Native file-based static pages | SPA by default; requires multi-page/prerender additions | Can produce routes, but is optimized around Next-compatible architecture |
| Route-specific metadata | Native page/head composition | Custom router/prerender discipline required | Strong, but more machinery than the static contract needs |
| Cinematic homepage | Isolated framework-free controller on `/` | React controller possible but hydrates a larger application surface | Possible, but no unique benefit without Next/server requirements |
| Progressive enhancement | HTML first, zero page JS by default | Requires deliberate server/prerender setup to avoid JS ownership | Possible but framework/server conventions increase complexity |
| Cloudflare Pages static output | Direct `dist` static output | Direct static output after additional routing decisions | Better justified by a concrete Next/Workers runtime need |
| Server runtime | None required | None required for a static SPA | Common value proposition is unused here |
| Payload/maintenance | Smallest selected surface | React/router runtime and broader hydration risk | Largest and least justified surface of the three |
| Decision | **Selected** | Rejected for Phase 0 | Rejected under observed contract |

## Decision

Use Astro `7.2.2` with TypeScript in static-output mode.

The Phase 0 application contract is:

```text
framework: Astro 7.2.2
language: TypeScript
package manager: npm
Node requirement: >=22.12.0
pinned project Node: 22.16.0
repository root: /
build command: npm run build
static output: dist
server output: none
adapter: none
React integration: none
Worker entrypoint: none
Pages Functions: none
SPA fallback: none required
CMS/database/API/form runtime: none
```

The project Node pin uses `22.16.0`, matching the verified Cloudflare Pages build-image default selected for this repository audit while satisfying Astro's minimum Node requirement. Because the private Cloudflare Node setting is unavailable, Phase 0 does not claim or attempt a dashboard change.

The minimal root contains only the authorized semantic feasibility hero and a clear non-production Phase 0 label. The Spiral Conduction harness remains a committed review surface under `prototypes/phase-0-spiral-field/`; it does not become a public launch route.

## Dependency boundary

Allowed Phase 0 runtime/build surface:

- Astro;
- TypeScript and Astro's required transitive build dependencies;
- the smallest test tooling required by the implemented feasibility surface.

Explicitly absent unless a later accepted plan proves a new requirement:

- React and Astro React integration;
- Vinext or Next-compatible runtime;
- GSAP or ScrollTrigger;
- Three.js, React Three Fiber, or Drei;
- smooth-scroll libraries;
- CMS, database, API, authentication, analytics, or form runtime;
- Cloudflare Worker/Pages Function adapters;
- runtime Q-HUB dependency;
- `.openai/hosting.json` or a separate Sites hosting contract.

The isolated 2.5D controller is framework-free TypeScript. Native document scroll is its source of truth, and its output is decorative progressive enhancement over complete semantic content.

## Static-output acceptance tests

The Phase 0 candidate must prove:

1. `npm ci` succeeds from the committed lockfile.
2. `npm run check` succeeds.
3. `npm run build` succeeds.
4. `dist/index.html` exists and provides a working `/`.
5. The output contains no `_worker.js`, server entrypoint, server-render manifest, API route, or Pages Function.
6. The root has semantic heading/content structure, visible focus, and no fake public-route links.
7. The review harness is not linked as a public launch route.
8. Direct supporting routes are not fabricated during Phase 0.
9. Production output contains no private path, third-party reference binary, prohibited public content, or secret.
10. Any Cloudflare branch preview check is attached to the exact pushed Phase 0 SHA.

## Architecture repair trigger

Package initialization or further architecture work must stop if reliable evidence reveals any of the following existing deployment requirements:

- SSR;
- RSC;
- server actions;
- a Next-compatible API;
- authentication/session logic requiring a server;
- an existing Worker entrypoint;
- Pages Functions that the site must preserve;
- an output contract materially incompatible with static `dist` files.

Such a discovery reopens architecture planning. It does not automatically select Vinext, alter Cloudflare, or introduce a Worker.

## Cloudflare branch-preview verification

After the final Phase 0 commit is pushed to `planning/phase-0-reconciliation`:

1. inspect the GitHub check attached to the pushed full SHA;
2. confirm that the check belongs to the existing `qsite1` Cloudflare Pages project;
3. record the branch-preview URL only if Cloudflare produces one;
4. verify the deployed/check SHA equals the final pushed SHA;
5. verify `/` returns the static Phase 0 feasibility root;
6. do not change the production branch, production hostname, domains, DNS, or dashboard configuration;
7. report unavailable preview behavior honestly if no branch preview is generated.

The existing `main` deployment remains untouched throughout Phase 0.
