# Phase 6 baseline

Status: pre-production-change baseline complete  
Captured: 2026-08-30 (Europe/Madrid)  
Accepted site under test: `005a36860ecbfd6fedb3d3f2223f168c1edfbb05`  
Phase 6 branch: `feature/phase-6-global-hardening`

This report records the accepted Phase 5B-R2 site before any Phase 6 production repair. Raw browser reports are external and untracked under the Phase 6 evidence root.

## Provenance

| Item | Baseline value |
| --- | --- |
| Repository root | `C:/Users/amir/OneDrive/Documents/Quantum-Hub/Qsite1` |
| Initial branch | `repair/phase-5b-r2-home-navigation-manifesto` |
| Initial / accepted HEAD | `005a36860ecbfd6fedb3d3f2223f168c1edfbb05` |
| Accepted HEAD direct parent | `ca22ae2f234302e7485803c560866abd7757735e` |
| Phase 6 branch | `feature/phase-6-global-hardening` |
| Phase 6 exact parent | `005a36860ecbfd6fedb3d3f2223f168c1edfbb05` |
| Merge base with `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Accepted Phase 4 ancestor | `47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa` |
| Local `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Fetched `origin/main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Public GitHub `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Initial worktree/index | clean |
| Tracked files | 1,763 |
| Tracked bytes | 717,122,030 |
| Static build files / bytes | 58 / 22,144,041 |
| Deterministic `dist` tree SHA-256 | `4beda73f9c05bc240b343f9696a5f6d1fcb7519630420722a123e2eb3147c6f6` |
| Active media-manifest SHA-256 | `06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54` |

All remotes were fetched before the Phase 6 branch was created. The accepted SHA is the exact branch ancestor. No merge, rebase, squash or `main` mutation occurred.

## Runtime and browser inventory

| Runtime | Version / condition |
| --- | --- |
| Node | 24.18.0; package engine satisfied; `.nvmrc` requests 22.16.0, which was not installed on this host |
| npm | 11.16.0 |
| Astro | 7.2.2, static output |
| TypeScript | 5.9.3 |
| Playwright Core | 1.62.1 |
| axe-core | 4.10.3 |
| sharp | 0.35.3 |
| System Chrome | 150.0.7871.187 |
| Managed Chromium | 151.0.7922.34 |
| Microsoft Edge | 152.0.4191.53 (inventory only) |
| Playwright WebKit | 26.5; correctly described as Playwright WebKit, not physical Safari |
| Playwright Firefox | 153.0; installed for Phase 6; headed automation works |
| Firefox headless | Host compositor fails before site code with `RenderCompositorSWGL failed mapping default framebuffer`; headed runs are required here |

## Build and test result

- `npm test`: **PASS**, 232 tests, 0 failed, 0 skipped.
- `npm run build`: **PASS**, 10 HTML pages plus `robots.txt` and `sitemap.xml`; Astro build completed in 1.16 s in the observed run.
- Phase 4 output verifier: **PASS**; one inert SSR video, H.264-only active authority, isolated supporting routes.
- Phase 5B production verifier: **PASS** for all nine supporting-route budgets and governed-media rules.
- Build left the tracked worktree clean.

## Route inventory

| Identity | Public path | Baseline mode |
| --- | --- | --- |
| Home | `/` and semantic fragment `/#entry` | physical cinematic plus Operating Field |
| For industry | `/for-partners/` | route-local progress controller |
| For startups | `/for-startups/` | route-local progress controller |
| Industries | `/industries/` | route-local progress controller |
| Proof | `/pocs/` | bounded/reversible reveal; one governed poster |
| Maradin | `/pocs/maradin/` | reversible reveals; two explicit-initiation videos |
| SPARK | `/spark/` | bounded/reversible reveal |
| About | `/about/` | reversible reveal |
| Contact | `/contact/` | static |
| Real 404 | `/__phase6-intentional-404__/` (served by `404.html` when deployed) | static recovery |

## Production JavaScript and CSS

The build emitted 14 JavaScript files totalling 26,563 raw bytes plus route-inline scripts, and 9 CSS files totalling 97,322 raw bytes. The Phase 4 verifier reports 31,472 raw / 12,867 gzip bytes of total JavaScript when inline script surfaces are included. There is no universal supporting-route controller bundle: Contact and 404 have only shared inline navigation behavior.

| Significant emitted asset | Raw bytes |
| --- | ---: |
| Home cinematic controller | 15,916 |
| Home Operating Field controller | 3,047 |
| Home entry module | 950 |
| Shared document-progress controller | 1,145 |
| Maradin route module | 883 |
| Home CSS | 36,387 |
| Shared BaseLayout CSS | 11,623 |
| Largest supporting-route CSS (Industries) | 8,971 |

All supporting-route Phase 5B JS/CSS budgets passed. No new production dependency was present.

## Requests, media and decoders

- Enhanced Home requests exactly one responsive dormant poster, the active manifest, and one selected H.264 asset. It creates one Blob/object URL and uses one paused decoder. No VP9/WebM request occurs and the playback clock remains stopped.
- Reduced-motion and no-JS Home made zero cinematic-video requests in the observed 390×844 runs. Both retained one H1, native `/#entry`, navigation and compact static geometry.
- Supporting routes made zero Phase 4 cinematic requests and create no homepage controller/runway.
- Proof requested exactly the governed Maradin poster and no video.
- Maradin began with two `preload="none"` videos at `readyState=0`, no `src`, no decoder and no autoplay. First initiation created one decoder; second initiation released the first and retained a maximum of one.
- The nine supporting-route audit observed 90 total requests / 10,290,450 transferred bytes across its full run, zero route-isolation failures and zero Phase 4 cinematic requests.
- Active Phase 4 assets are 3 H.264 files (8,014,164 bytes aggregate), 3 PNG posters (4,455,308 bytes aggregate), and the 14,889-byte manifest. Exact asset hashes remain declared by the manifest.

## Motion, tasks, CLS and lifecycle

- No wheel or touch scrolling is cancelled. No `scrollTo`, `scroll`, `scrollIntoView` or `scrollTop` write is present.
- Existing route controllers use one-shot dirty/RAF work. The route audit observed zero persistent RAFs, zero active intervals after quiet and zero route-attributable scroll-window long tasks above 50 ms.
- The maximum supporting-route load CLS was 0.082353; maximum scroll CLS was 0.
- Existing supporting-route forward/reverse traversal returned to native scroll position zero without overflow.
- Chromium long-task observations (five runs per case, 360×800) were:

| Case | Min | Median | p95 | Max | Phase |
| --- | ---: | ---: | ---: | ---: | --- |
| Blank control | 0 ms | 0 ms | 0 ms | 0 ms | navigation/idle |
| For-industry representative | 0 ms | 62 ms | 92 ms | 92 ms | initial load; scroll max 0 ms |
| Home reduced motion | 61 ms | 70 ms | 84 ms | 84 ms | initial load |
| Home media blocked | 82 ms | 85 ms | 139 ms | 139 ms | initial load/failure harness |
| Home enhanced | 64 ms | 91 ms | 114 ms | 114 ms | initial load |

PerformanceObserver attribution reported `unknown/window`; the evidence does not justify inventing a script or rendering stack. These isolated initial-load tasks are retained as an attribution limitation, not misreported as scroll work.

## Accessibility, responsive and fallback baseline

- Chromium supporting-route matrix: **PASS**, 117 route/viewport cases at all 13 required sizes.
- Keyboard: **PASS**, 18 cases. Mobile navigation: **PASS**, 9 cases.
- axe: 18 cases, 0 violations, 0 serious/critical findings.
- Static variants: 54 reduced-motion, no-JS and blocked-font cases passed.
- Exactly one H1, no horizontal overflow, minimum-target and semantic checks passed across that supporting-route matrix.
- The existing 720×450 text-reflow check is a proxy only. Genuine automated 200% browser zoom was not available and remains a declared limitation/human check.
- Home no-JS and reduced-motion at 390×844 retained the exact H1, usable navigation, native `/#entry`, one static poster, zero cinematic script/video request and no enhanced 535–675svh runway.

## History and engine observations

- Chromium and WebKit normal Back navigation returned to `/` with Navigation Timing type `back_forward`, correct top position and a live Home controller.
- A persisted BFCache restoration was not observed in automated local navigation; persisted pagehide/pageshow paths therefore require synthetic lifecycle coverage plus deployed/manual confirmation.
- Chromium and headed Firefox decode the Blob-backed H.264 Home asset, remain paused and present the first deterministic frame.
- Local Playwright WebKit 26.5 reports H.264 support but fails both direct and Blob H.264 with media error code 4. The site releases the media surface and preserves a coherent poster/runway fallback. This is a local WebKit codec-runtime limitation, not evidence about physical iPhone Safari.

## Known pre-repair defects

The baseline reproduced the following before production repair; exact steps and resolution state are in `PHASE_6_DEFECT_LEDGER.md`.

1. Blocked Home entry module leaves the candidate page concealed/inert indefinitely.
2. `/#entry` plus failed cinematic media leaves the stage hidden after reverse navigation.
3. Fresh `/` plus an immediate media failure retains an unnecessary multi-viewport frozen runway while still at exact top.
4. Maradin's once-only pagehide cleanup is consumed by the first persisted lifecycle and misses the next departure.
5. Failed Maradin video initiation retains `src`, hides retry and leaves the player active.
6. At 800×800, the responsive picture selects portrait while JavaScript selects the desktop video cohort.
7. Fractional positive scroll below 0.5 CSS px maps to zero in source arithmetic.
8. Header/footer logo fallback dimensions do not match the SVG intrinsic ratio.
9. Footer and real-404 intentional Home links target bare `/` instead of the accepted semantic `/#entry` intent.

## Exact limitations at baseline

- No physical iPhone, Android device, precision trackpad or Mac trackpad is available to this automation host. Those gates remain pending human device review.
- Firefox must run headed on this host because of a browser compositor failure before page creation.
- WebKit lacks usable H.264 decoding here and does not expose Chromium's Long Task, Layout Shift, heap or video-frame-callback diagnostics.
- Genuine 200% zoom and real mobile address-bar dynamics are not reliably automatable here.
- No persisted BFCache hit was observed locally; normal history restoration did execute.
- Cold/warm long-task attribution is coarse and Chromium-only at baseline.
- No Cloudflare Phase 6 deployment existed at baseline.

