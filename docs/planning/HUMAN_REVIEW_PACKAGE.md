# Quantum-Hub cinematic website: Human Review Package

Status: Phase 0 3D creative repair evidence complete locally; pushed candidate and human creative review pending; prior candidate preserved as historical evidence
Plan accepted: 17 August 2026
Implementation branch: `planning/phase-0-reconciliation`
Production branch: `main` (protected from Phase 0 work)

## Purpose and authority

This package is the implementation record for Phase 0 only: repository and deployment-contract reconciliation, planning documentation, and creative feasibility. It does not authorize the complete website, Phase 1 route architecture, a production cinematic opening, a production deployment, or a change to `main`.

The binding authority order is:

1. The user's Phase 0 implementation authorization and the Spiral Conduction amendment.
2. The accepted repaired Human Review Package.
3. The Dark V2 amendment dated 12 July 2026 in the read-only Quantum design-system source.
4. The frozen, approved Q-HUB source boundary documented below.
5. The reference site, used only to understand experience mechanics and never as an asset or implementation source.

The following companion records are normative:

- [Reference audit](./REFERENCE_AUDIT.md)
- [Originality departure matrix](./ORIGINALITY_DEPARTURE_MATRIX.md)
- [Publication matrix](./PUBLICATION_MATRIX.md)
- [Asset register](./ASSET_REGISTER.md)
- [Implementation gates](./IMPLEMENTATION_GATES.md)
- [Spiral Conduction amendment](./SPIRAL_CONDUCTION_AMENDMENT.md)
- [Framework and Cloudflare contract](./FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md)
- [Q-HUB import ledger](./QHUB_IMPORT_LEDGER.md)
- [Browser QA evidence](../../artifacts/evidence/phase-0/BROWSER_QA.md)
- [Toolchain and encoded-media audit](../../artifacts/evidence/phase-0/TOOLCHAIN_AND_MEDIA_AUDIT.md)
- [Authorized portable 3D-repair toolchain](../../artifacts/evidence/phase-0/TOOLCHAIN_3D_REPAIR.md)
- [Test and build report](../../artifacts/evidence/phase-0/TEST_AND_BUILD_REPORT.md)

## Current Phase 0 3D creative repair addendum — 17 August 2026

Human review accepted the Proving Field, Spiral Conduction, outside-in cumulative illumination, powered-off initial state, delayed Field Unit activation, interface wake, portal-to-semantic-DOM architecture, authored mobile mode, reduced-motion mode, Dark V2, and one native page scroll root. The creative decision on the prior schematic evidence was `REPAIR`, not a conceptual redirect.

The current repair replaces the diagram-like visual evidence with an original, maintainable Blender-authored environment and Field Unit intended for a premium industrial product film. The production architecture remains:

```text
original Blender-authored world
-> pre-rendered cinematic media
-> small native-scroll TypeScript controller
-> matched portal frame
-> semantic Astro DOM
```

Runtime Three.js, React Three Fiber, GSAP, WebGL ownership, and any Blender/FFmpeg website dependency remain prohibited.

The user authorized a per-user portable offline toolchain. The verified installations are Blender 5.2.0 LTS and FFmpeg/ffprobe 9.0.1 Essentials, with `libx264` and `libvpx-vp9`. Their exact download provenance, archive and executable SHA-256 values, licenses, footprints, signatures, and isolation evidence live in `artifacts/evidence/phase-0/TOOLCHAIN_3D_REPAIR.md`. No tool binary belongs in Git or the deployed site.

The live repair evidence belongs under `artifacts/original/phase-0-3d-repair/`. Exact source, render, review, encode, probe, browser-seek, and portal-alignment results are authoritative only when their final repository files agree with:

- `manifests/blender-source-validation.json`;
- `manifests/render-manifest-all.json`;
- `manifests/encode-manifest.json`;
- `manifests/ffprobe-manifest.json`;
- `manifests/browser-seek-report.json`;
- `manifests/portal-alignment-report.json`;
- `manifests/review-bundle-manifest.json`.

The settled local evidence currently records:

| Evidence | Current manifest-backed result |
|---|---|
| Editable source | `source/quantum-field-unit.blend`; 360,021 bytes; SHA-256 `91601d8c0fec51744df4e4cca510556559e7f5c542b9bcc84ca83ae650c16adc`; no external images or linked libraries |
| Canonical stills | 40/40 required renders at scale `1.0`, produced with Blender Eevee from the validated source |
| Genuine animatic | 192 frames, 24fps, 8 seconds, 960x540 review resolution, no audio |
| Encoded comparison | Six real-content variants: VP9 WebM and H.264 MP4 at GOP intervals 1, 6, and 12; 629,513-3,764,295 bytes |
| Browser seek evidence | All six variants passed deterministic forward/reverse seeks; p95 seek-to-present ranged from 15.63ms to 46.362ms in the recorded environment; zero dropped or corrupted frames were observed |
| Portal alignment | 1920x1200 source comparison and overlay; SSIM approximation `0.338255`, normalized grayscale MAE `0.058587`; human perception remains the primary acceptance evidence |
| Compact review set | 14 manifest-recorded artifacts, including 11 review images, the preferred VP9 GOP-6 animatic, DOM-match metrics, and README |
| Automated integrity gate | `scripts/verify-phase0-3d-repair.mjs` passes: 40 canonical renders, 11 review images, six real-content encodes, source/manifests, privacy, taxonomy, file-size, and dependency boundaries |

These are local candidate facts, not a claim of human creative acceptance, an immutable pushed SHA, or a Cloudflare preview tied to that SHA. Those delivery facts remain pending until the branch is committed, pushed, and verified. The original browser-native 2.5D harness remains a shippable fallback and historical feasibility control; it is not a substitute for the current requested 3D-quality repair.

Phase 1 remains locked.

## 1. Repository and source audit

| Item | Verified Phase 0 fact |
|---|---|
| Sole implementation root | The root of the `Qsite1` repository |
| Sole remote | `https://github.com/AmirNatan1/Qsite1.git` |
| Remote default branch | `main` |
| Verified baseline | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Baseline contents | One `README.md`; no application framework or routes |
| Phase 0 branch | `planning/phase-0-reconciliation` |
| Cloudflare project | Existing GitHub-connected Cloudflare Pages project `qsite1` |
| Initial Cloudflare check | Check `95384265300`, successful for the baseline commit |
| Historical branch/deployment URL | `https://366edc4c.qsite1.pages.dev` |
| Existing deployed behavior | `/README.md` available; `/` returns 404 because no static index exists |
| Cloudflare mutations | None authorized or performed by this package |
| Q-HUB frozen source | `70d8b5cc193311b9548c49399dde6a014583e13a` |
| Q-HUB relationship | Read-only provenance source; never a runtime dependency |

The existing Git history, `main`, Cloudflare project, GitHub connection, production-branch configuration, domains, and DNS are preservation constraints. No force push, history rewrite, remote replacement, nested repository, second host, Worker deployment, or direct Wrangler production flow is permitted.

The accepted Q-HUB extraction boundary is:

- source repository: `https://github.com/AmirNatan1/Q-HUB.git`;
- frozen SHA: `70d8b5cc193311b9548c49399dde6a014583e13a`;
- retrieval: `git show <sha>:<path>` or a clean temporary checkout of that exact SHA;
- eligible material: only the already approved Quantum identity and Maradin records/assets listed in the import ledger;
- prohibited material: Q-HUB code, CSS, controllers, routes, page layouts, typography, visual grammar, build output, placeholders, screenshots, test results, review evidence, and later partner assets.

## 2. Reference-site forensic audit

The reference audit inspected `https://www.kunalrajelli.com/` in the seven required viewport classes and across slow/fast forward, reverse, rapid-direction, keyboard, direct-load, repeat-load, and mobile passes. The detailed direct/inferred/unknown record is in [REFERENCE_AUDIT.md](./REFERENCE_AUDIT.md).

The audit established these usable principles:

- a sticky, scroll-scrubbed physical scene can produce a continuous approach;
- the media-to-DOM boundary can be concealed by visual alignment;
- reverse motion should reconstruct spatial state;
- semantic copy should remain sharp DOM content;
- the post-portal system needs materially more depth than the reference.

It also identified mechanisms that Quantum must not inherit:

- a child, pastoral field, laptop, or amber screen-entry composition;
- a nested full-page `/works` scroller;
- a blank or timed bridge after the media completes;
- mobile delivery based on a long eagerly available frame sequence;
- accessibility gaps in landmarks, focus, skip control, and dialog semantics;
- retention of heavy media without a measured lifecycle decision.

Third-party captures remain private and intentionally uncommitted. The repository contains only the textual evidence manifest.

## 3. Experience thesis

The Proving Field presents Quantum-Hub as the place where an external industrial challenge is routed into a controlled test. Visitors arrive in a dormant charcoal proving environment, read the proposition without distraction, and discover one physical spiral cable leading toward an original, powered-off Quantum Field Unit. As scroll begins, restrained warm-magenta conduction accumulates from the cable's outer terminus inward while the camera changes angle. Only after the conduction reaches the physical connector does the Field Unit power on, expose the five-stage operating route, and open a Q-derived portal into a semantic editorial surface. The cinematic shell establishes consequence and continuity; the native site explains the audiences, method, four public domains, one approved proof, and programmes without trapping content in a simulated device.

## 4. Originality boundary

Spiral Conduction replaces every previous concept involving a free-moving magenta point, beacon, floating object, pre-lit device element, or signal crossing open air. The cable is simultaneously a physical object, the main compositional path, and a metaphor for routing a challenge into Quantum. The detailed clone-prevention tests are in [ORIGINALITY_DEPARTURE_MATRIX.md](./ORIGINALITY_DEPARTURE_MATRIX.md).

Non-negotiable departures include:

- no person, child, laptop, keyboard, pastoral field, amber transition, scrapbook interface, or copied camera composition;
- one continuous grounded Archimedean cable, not a floating line or particle system;
- a neutral dormant opening with no magenta environmental illumination at progress `0.00`;
- one cumulative outer-to-inner conduction front;
- an engineered power-on event only after the major camera movement is essentially complete;
- a Q-derived screen/aperture and semantic operating surface, not a desktop operating system;
- one native document scroll root and an exactly reversible progress function.

## 5. Repaired opening storyboard

The accepted desktop sequence retains the earlier spatial budget while replacing its signal choreography with Spiral Conduction. The working desktop section remains approximately `440svh`, providing approximately `340svh` of usable scroll travel. The initial camera hypothesis remains 26 degrees off frontal and 9 degrees above, with an approximately 42-degree field of view, a restrained 28-degree changing-angle movement, a final field of view near 34 degrees, and no more than one degree of roll. These are creative targets, not a claim of completed 3D production.

| Beat | Progress | Composition and behavior | Ownership |
|---|---:|---|---|
| 1. Dormant arrival | `0.00-0.08` | Field Unit centered, powered off; graphite spiral readable through neutral grazing light and contact shadow; no magenta illumination | Semantic hero in DOM; original visual layer decorative |
| 2. Conduction begins | `0.08-0.16` | One warm-magenta front enters at the outer cable terminus; lit cable behind remains lit | Deterministic visual progress |
| 3. Spiral acquisition | `0.16-0.32` | Current advances through the outer turns as the first camera-angle change reveals depth | Visual layer; no required text baked in |
| 4. Controlled changing angle | `0.32-0.55` | Cumulative conduction and camera movement continue together; unit remains completely off | Visual layer, direct from document progress |
| 5. Inner approach | `0.55-0.68` | Current nears the inner turns; camera completes most of its major movement | Visual layer |
| 6. Near-frontal alignment | `0.68-0.76` | Camera becomes nearly frontal while the current reaches the final inner turn | Visual layer; semantic equivalents prepared in DOM |
| 7. Connector entry | `0.76-0.80` | Current enters the credible physical port once | Visual layer |
| 8. Field Unit power-on | `0.80-0.87` | Connector response, internal route, restrained edge light, and screen wake occur in sequence | Visual layer; device does not become neon decoration |
| 9. Interface and portal | `0.84-0.97` | Sparse Quantum operating information becomes readable; the camera enters the activated Q/screen surface | Visual and semantic DOM overlap from approximately `0.89` |
| 10. Operating surface | `0.97-1.00` | Native interface fully owns the viewport without blank frame, timer, URL mutation, or extra gesture | DOM; cinematic layer enters its measured lifecycle state |

Reverse progress follows the exact inverse: operating surface to matched portal, screen power-down, internal light off, inner-to-outer conduction retraction, dormant cable, and arrival camera. No reverse animation queue or time delay is allowed.

## 6. Homepage screenplay retained for later phases

Phase 0 does not implement this structure. It preserves it so feasibility work does not invent a different site.

| Chapter | Purpose | Later behavior |
|---|---|---|
| Where do you enter? | Distinguish “For industry” and “For startups” | Two semantic audience paths |
| Built with industry | Explain Quantum's position between operating organizations and technology companies | Approved relationships only; no invented descriptors |
| From need to decision | Frame, Source, Assess, Test, Decide | Major sticky chapter |
| The problem field | Four public domains | Major sticky chapter; no Defense or dual-use output |
| Evidence before scale | Sole approved Maradin proof | Approved media and qualitative record only |
| Programme engines | SPARK and CHAMP | SPARK visibly “Applications closed”; no form |
| Current signal | Optional approved, dated activity | Omit entirely when no qualifying record exists |
| Start with the challenge | Resolve into public contact choices | No public form; approved destination required |

Only the method and domain chapters may use extended sticky treatment. Every other chapter remains ordinary document flow.

## 7. Route architecture retained for later phases

Phase 0 creates only a minimal feasibility root. It does not build the full routes below.

| Future route | Public label or purpose | Launch boundary |
|---|---|---|
| `/` | Cinematic home and audience choice | Phase 0 shows only a clearly labelled feasibility hero |
| `/for-partners` | Visible label: “For industry” | No fabricated relationships or metrics |
| `/for-startups` | Visible label: “For startups” | No guarantee of POC, procurement, or investment |
| `/industries` | Four public domains | No Defense/dual-use category, cluster, filter, or teaser |
| `/pocs` | Evidence standard and proof index | Exactly one approved proof |
| `/pocs/maradin` | Maradin: Dynamic Ground Projection | Qualitative approved evidence only |
| `/spark` | SPARK programme | Applications closed; no application flow |
| `/about` | Purpose and verified organization | No fabricated or unverified people |
| `/contact` | Approved contact destination | No public form or endpoint |

## 8. Dark V2 reconciliation

The 12 July 2026 Dark V2 amendment is authoritative. The Phase 0 feasibility surface uses:

- page base `#0e1112`;
- restrained background blending through `#1a2020` and `#14090f`;
- headings `#ffffff`;
- body `#c2cbcb`;
- muted text `#8a9797`;
- link/current core near `#f06ba0` with Quantum magenta influence near `#d82b72`;
- flat `rgba(255,255,255,.04)` surfaces with `rgba(255,255,255,.09)` borders;
- restrained rounded Q-derived geometry;
- no white sections, glassmorphism wall, cyberpunk neon, or startup-template presentation.

Syne 800, Newsreader, and Inter are the intended roles, but Phase 0 does not distribute unlicensed binaries. Metric-conscious system fallbacks are used until approved self-hostable font files are available. Browser smooth scrolling is not used as the source of choreography; document progress must remain deterministic.

## 9. Motion contract

- Native document scroll is the only source of truth.
- The full visual state is a pure function of normalized progress.
- Wheel and touch events are not cancelled for ordinary navigation.
- There is no nested full-page scroller, mandatory snapping, hidden lock, or second wheel gesture.
- Small deltas receive an immediate response.
- Fast scrolling lands in a coherent state.
- Direction changes do not queue tweens.
- The final visual interface and first semantic DOM frame overlap and align.
- Reduced motion does not create or fetch cinematic video or a frame sequence.
- Mobile uses an independently authored 2.5D composition rather than a desktop crop.

Media retention, pause, partial release, and full unload must be compared with measured reverse-readiness and memory data in a later real-media spike. Reverse continuity wins unless measured mobile memory pressure proves that a stronger release policy is necessary.

## 10. Framework decision

The selected Phase 0 architecture is current Astro static output with TypeScript and an isolated, framework-free intro controller. It uses npm, outputs static files to `dist`, creates no server runtime, and requires no React integration. The complete decision and the inaccessible Cloudflare fields are documented in [FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md](./FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md).

Plain Vite with React was rejected because static semantic routes and route-specific metadata would require additional routing/prerender machinery and broader hydration. Vinext was rejected because the observed project has no SSR, RSC, server action, Next-compatible API, or Worker-runtime requirement. A future discovery of such a requirement stops initialization and returns the architecture to repair; it does not silently select Vinext.

## 11. Component and scene boundary

```text
Static Astro shell
├── Phase 0 semantic feasibility hero
├── Phase 0 review harness (not a public route)
│   ├── dormant proving ground
│   ├── physical spiral cable
│   ├── cumulative conduction renderer
│   ├── Field Unit states
│   ├── deterministic progress controller
│   └── portal alignment layer
└── build-time planning and provenance records
```

Later phases may extend the shell with semantic routes and homepage chapters only after their gates. The feasibility controller stays isolated from content and must fail safely to complete semantic HTML.

## 12. Phase 0 creative production requirements

The Phase 0 evidence set must contain only original Quantum work:

- a top-down spiral geometry study comparing approximately 2.25, 2.5, and 2.75 rotations;
- dormant arrival, mid-conduction, and activation/portal Field Unit concept views;
- one final-intent proving-ground style frame;
- a nine-state conduction contact sheet;
- a portal-alignment overlay or side-by-side study;
- an interactive, non-production premium 2.5D harness;
- independently authored 360x800 and 390x844 mobile evidence;
- 1600x1000 and 720x1600 dormant reduced-motion posters;
- an originality comparison;
- a toolchain audit and a real encoded-media seek test using the genuine Blender animatic.

No reference assets, scraped models, generic laptop, stock science-fiction object, fabricated Quantum photograph, placeholder gray box, or another company's render may appear.

## 13. Performance feasibility budget

Phase 0 validates the static baseline and browser-native fallback against these later-production limits:

- mobile p75 LCP at or below 2.5 seconds;
- INP at or below 200ms;
- CLS at or below 0.05;
- no horizontal overflow;
- no recurring main-thread task over 50ms during normal scroll;
- scroll-controller work p95 at or below 4ms;
- critical HTML/CSS/JS before cinematic enhancement at or below approximately 180KB gzip;
- global enhancement at or below approximately 15KB gzip;
- homepage non-media controller at or below approximately 60KB gzip;
- desktop/tablet intro media at or below approximately 3MB;
- authored mobile media at or below approximately 1.2MB;
- desktop 2.5D fallback at or below approximately 1.8MB;
- mobile 2.5D fallback at or below approximately 850KB;
- reduced-motion poster at or below approximately 250KB.

An encoded-seek claim requires the genuine Blender animatic, final VP9 and H.264 variants at GOP intervals 1, 6, and 12, ffprobe evidence, and measured browser playback. The earlier synthetic 640x400 seek spike remains historical feasibility evidence and cannot satisfy the real-content gate.

## 14. Accessibility and reduced motion

The target is WCAG 2.2 AA. Phase 0 evidence must demonstrate semantic headings, visible keyboard focus, readable contrast, no scroll trap, no horizontal overflow, and meaningful operation without animation.

The reduced-motion path:

1. instantiates no cinematic video or frame sequence;
2. shows a designed dormant proving-ground poster;
3. exposes the complete semantic headline, supporting copy, and audience actions immediately;
4. performs no wire conduction, camera movement, portal rush, or extended pin;
5. keeps focus indication visible;
6. proceeds immediately into native document flow.

The visual layer is decorative and hidden from assistive technology. Essential information is semantic DOM content or has a semantic equivalent.

## 15. Authored responsive modes

| Mode | Feasibility behavior |
|---|---|
| Desktop, approximately 1200px and above | Full spiral relationship, controlled angle change, matched portal study |
| Short desktop, 650-700px high | Reduced environment height; hero, navigation, device, and cable do not collide |
| Tablet, 768-1199px | Fewer layers and shorter movement; readable interface remains dominant |
| Mobile, below 768px | Independent 2.5D composition, larger device, legible spiral, shorter travel, no broad orbit |
| Reduced motion | Responsive dormant poster and immediate semantic content |

Required visual review includes 1440x900, 1280x800, 1024x768, 768x1024, 390x844, 360x800, and 1366x650. Mobile evidence is not a crop of desktop evidence.

## 16. Publication contract

Phase 0 preserves:

- exactly four public domains: Automotive & Mobility; Logistics & Supply Chain; Industry 4.0 / Advanced Manufacturing; Energy & Infrastructure;
- exactly one approved proof source: Maradin - Dynamic Ground Projection;
- SPARK status: Applications closed;
- public audience labels: “For industry” and “For startups”;
- no public forms, metrics, testimonials, additional cases, fabricated partners, fabricated team, personal phone numbers, placeholders, or public Defense/dual-use output.

These restrictions cover HTML, metadata, filenames, image text, alternative text, JSON, source maps, sample data, and client bundles. The complete matrix is in [PUBLICATION_MATRIX.md](./PUBLICATION_MATRIX.md).

## 17. Prior Phase 0 candidate evidence — historical

The accepted Phase 0 scope produced:

- an Astro 7.2.2 static TypeScript baseline with a semantic, no-JavaScript root and no server runtime;
- all nine required planning records;
- exact-object import of four approved Quantum identity SVGs and five approved Maradin media assets from frozen Q-HUB SHA `70d8b5cc193311b9548c49399dde6a014583e13a`, with matching source/destination SHA-256 values;
- ten original repository-native creative sources: geometry comparison, three Field Unit views, proving-ground style frame, nine-state contact sheet, portal alignment, independent mobile composition, and two reduced-motion posters;
- an isolated one-root, direct-progress premium 2.5D harness with cumulative outside-in conduction and exact reverse reconstruction;
- browser evidence at all seven required responsive viewports, with zero horizontal overflow and no nested scroller;
- a reduced-motion path that constructs one dormant picture and zero animated scene SVGs or video elements;
- visible keyboard focus on both the static baseline and harness;
- a real original 640×400, 24fps, 123,712-byte VP9 WebM low-resolution desktop animatic with forward/reverse seek measurements;
- an honest audit at the time of that candidate confirming the production DCC/encoder toolchain was then unavailable, while the browser-native premium 2.5D path remained viable;
- automated static-output, publication, provenance, artifact-integrity, direct-progress, reduced-motion, and private-path checks.

The real browser encode in the prior candidate proves a bounded low-resolution media path only. It does not establish production 3D quality, controlled keyframe cadence, multi-browser behavior, mobile memory, an H.264 deliverable, or external ffprobe verification.

### Current 3D repair evidence gate

Production tooling is no longer the blocker: the authorized portable Blender and FFmpeg/ffprobe installations are verified and isolated outside the repository. The final original `.blend` source, canonical render manifest, compact review package, six genuine-content encodes, ffprobe records, browser seek measurements, and portal/DOM alignment evidence now exist under `artifacts/original/phase-0-3d-repair/` and agree with their final manifests. Delivery still requires the final repository-size report, normal commit and push, exact Cloudflare-preview SHA verification, a clean working tree, and human visual review.

`scripts/verify-phase0-3d-repair.mjs` is the strict repository gate. It verifies required source, render, review, media, and manifest files; dimensions and SHA-256 values; Blender integrity metadata; privacy and publication boundaries; third-party reference-binary exclusion; the 50 MiB ordinary-Git escalation threshold; and the absence of unapproved runtime dependencies. It passes against the settled local package. Exact hashes and quantitative results remain sourced from the committed manifests, not duplicated as independent claims.

## 18. Implementation phases and gates

Only Phase 0 is authorized. Later phases remain locked:

1. static semantic foundation;
2. interior visual system;
3. production opening prototype;
4. cinematic integration;
5. supporting routes;
6. motion, performance, and accessibility hardening;
7. publication validation;
8. release candidate.

Every future phase uses a dedicated non-production branch, runs its declared tests and build, commits and pushes all intended work, reports its exact full SHA and Cloudflare branch preview when produced, and leaves a clean tree. `main` changes only after an explicit release ACCEPT at Phase 8. Detailed gates are in [IMPLEMENTATION_GATES.md](./IMPLEMENTATION_GATES.md).

## 19. Principal risks

| Risk | Impact | Required control |
|---|---|---|
| Reference imitation | High | Originality matrix and separate creative gate |
| 3D source or encoded evidence becomes stale, oversized, or unreviewable | High | Portable pinned toolchain; canonical manifests; 50 MiB gate; no LFS without approval; premium 2.5D fallback |
| Generic Field Unit | High | Three authored concept views and human creative decision |
| Pre-lit or overly neon opening | High | Zero-magenta dormant-state test and restrained local reflection |
| Scroll interruption | Critical | One root, deterministic progress, reverse and rapid-direction tests |
| Portal mismatch | High | Alignment overlay and no-blank transition evidence |
| Mobile memory/complexity | High | Independent 2.5D mode and explicit payload budget |
| Private/reference evidence leak | High | Opaque evidence ID and tracked-file scan |
| Prohibited content leak | Critical | Deny-by-default publication scan across source and `dist` |
| Production deployment | Critical | Phase branch only; no `main` or Cloudflare-setting mutation |

## 20. Human decisions required after Phase 0

The completed Phase 0 evidence requires two independent decisions:

```text
REPOSITORY + FEASIBILITY:
ACCEPT / REPAIR / REDIRECT

FIELD UNIT + SPIRAL CONDUCTION + PORTAL CREATIVE:
ACCEPT / REPAIR / 2.5D REDIRECT
```

Technical success does not imply creative acceptance. A 2.5D REDIRECT selects the premium browser-native fallback as the production opening direction; it does not authorize Phase 1 automatically.

## 21. Stop condition

After the Phase 0 candidate is built, tested, committed, pushed, tied to any Cloudflare branch preview, and handed off with a clean tree, work stops. Phase 1 begins only after the applicable human gate explicitly authorizes it.
