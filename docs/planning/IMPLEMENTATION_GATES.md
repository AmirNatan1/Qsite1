# Implementation Gates

Status: binding delivery and human-review contract
Current authorization: Phase 0 only
Current branch: `planning/phase-0-reconciliation`
Production branch: `main` (must not change during Phase 0)
Current evidence state: Phase 0.2 package remains frozen; authoritative Phase 0.3 matrix, exact 13-PNG review bundle, validation, sanitation, inventory, complete checks, and static build pass locally; immutable pushed candidate, Cloudflare verification, clean-tree handoff, and human creative review pending

## Gate principle

Automated success is evidence, not human acceptance. Every phase ends at a pushed, immutable candidate SHA with a clean working tree and waits for its declared human decision. Work does not silently continue into the next phase.

The active Phase 0 authorization permits:

- safe repository reconciliation;
- read-only audit of the existing Cloudflare contract;
- a minimal static Astro feasibility root;
- planning, provenance, and publication records;
- original Spiral Conduction and Field Unit feasibility evidence;
- a non-production premium 2.5D review harness;
- the authorized per-user portable Blender 5.2.0 LTS and FFmpeg/ffprobe 9.0.1 toolchain for offline Phase 0 production only;
- an original Blender-authored Field Unit, proving environment, genuine-content animatic, encoded-media comparison, and compact creative-review package;
- an additive still-only Phase 0.2 Field Unit design, shared portal-layout, responsive typography, and exact-viewport browser-evidence repair;
- an additive still-only Phase 0.3 Aperture Station, whole-word portal typography, reduced-motion composition, and repository-native browser-evidence repair;
- relevant tests, build, commit, push, and Cloudflare branch-preview verification.

It does not permit:

- Phase 1 semantic route implementation;
- the full homepage or supporting-route architecture;
- production cinematic integration;
- a new Phase 0.2 animatic, video, or full-frame sequence;
- a change, merge, or push to `main`;
- Cloudflare setting, DNS, domain, project, or production-branch mutation;
- a separate deployment provider, Sites host, Worker, or direct Wrangler production deployment;
- Q-HUB mutation or runtime dependency;
- system-wide installation, PATH mutation, unapproved add-ons, commercial plugins, texture packs, asset-store dependencies, or redistribution of production-tool binaries;
- Blender, FFmpeg, ffprobe, WebGL, Three.js, React Three Fiber, or GSAP as a website runtime dependency.

## Repository and branch discipline

The authoritative remote is `https://github.com/AmirNatan1/Qsite1.git`. The verified baseline is `501040c42bba30b9d9517b88a8f9857992a2dba4` on `main`.

Rules:

1. Each phase uses a dedicated non-production branch.
2. A phase branch begins from the exact SHA accepted at the previous gate.
3. Phase acceptance freezes that candidate as the next phase's parent; it does not update production.
4. Pushed phase branches are not rebased or force-pushed.
5. A repair is delivered as one or more normal commits on the same phase branch and creates a new candidate SHA.
6. All intended work and original evidence are committed before handoff.
7. A handoff requires a completely clean working tree.
8. GitHub push is the sole Cloudflare deployment source of truth.
9. `main` changes only after the Phase 8 release candidate receives explicit `RELEASE ACCEPT`.
10. No history rewrite, destructive reset, remote replacement, or nested repository is allowed.

The cumulative review chain is:

```text
main baseline
  -> Phase 0 candidate -> human Phase 0 decisions
  -> Phase 1 candidate from accepted Phase 0 SHA -> human decision
  -> Phase 2 candidate from accepted Phase 1 SHA -> human decision
  -> Phase 3 candidate from accepted Phase 2 SHA -> human decision
  -> Phase 4 candidate from accepted Phase 3 SHA -> human decision
  -> Phase 5 candidate from accepted Phase 4 SHA -> human decision
  -> Phase 6 candidate from accepted Phase 5 SHA -> human decision
  -> Phase 7 candidate from accepted Phase 6 SHA -> human decision
  -> Phase 8 release candidate from accepted Phase 7 SHA
  -> RELEASE ACCEPT
  -> fast-forward main to the exact accepted release SHA
```

No incomplete phase is merged to `main` merely to provide a preview. Cloudflare branch previews are the review surfaces.

## Required handoff fields

Every phase handoff reports exactly:

```text
repository root:
remote:
branch:
parent SHA:
full pushed SHA:
files changed:
tests:
build:
visual evidence:
accessibility evidence:
performance evidence where relevant:
Cloudflare preview URL when available:
working-tree status:
human gate:
```

Additional Phase 0 fields required by the authorization are:

```text
remote default branch:
Cloudflare production branch:
Cloudflare project:
framework decision:
Cloudflare contract:
Q-HUB frozen source:
import ledger:
toolchain audit:
spiral geometry decision:
Field Unit concept evidence:
proving-ground style-frame evidence:
spiral-conduction contact sheet:
portal-alignment evidence:
desktop feasibility:
mobile feasibility:
reduced-motion evidence:
2.5D fallback:
encoded-media seek evidence:
preview deployed SHA when available:
unresolved blockers:
```

The final Phase 0 3D repair handoff additionally reports:

```text
previous Phase 0 candidate:
full pushed repair SHA:
Cloudflare check ID:
Cloudflare preview URL:
preview deployed SHA:
GET /:
GET /package.json:
GET /src/pages/index.astro:
Blender source:
Blender version:
Blender provenance:
Blender source SHA-256:
FFmpeg version:
FFmpeg provenance:
FFmpeg SHA-256:
encoders verified:
Field Unit design evidence:
material evidence:
dormant master:
conduction evidence:
activation evidence:
portal evidence:
desktop animatic:
mobile evidence:
reduced-motion evidence:
DOM match evidence:
real-content VP9 seek result:
real-content H.264 seek result:
review ZIP:
ZIP bytes:
ZIP SHA-256:
repository-size evidence:
```

Reporting rules:

- SHAs are full 40-character values.
- `files changed` is the exact name/status diff from the parent SHA to the candidate SHA.
- Tests and build are rerun against the final candidate contents.
- A preview URL is reported only if Cloudflare produced one for the pushed branch.
- The preview's deployed/check SHA must equal the full pushed SHA.
- If a preview is unavailable, the handoff says “not produced” and records the verified reason; it does not invent a URL.
- Working-tree status includes staged, modified, deleted, and untracked state.

## Phase 0 gate: Repository and creative feasibility

Branch: `planning/phase-0-reconciliation`

### Repository and contract evidence

- [ ] The root is the intended `Qsite1` repository and is the Git top-level.
- [ ] `origin` is exactly the authoritative remote.
- [ ] Remote default branch and current baseline are reported.
- [ ] All remote history, branches, and tags were fetched normally.
- [ ] No nested repository, force operation, or history replacement occurred.
- [ ] The existing Cloudflare project is `qsite1` and remains untouched.
- [ ] Every accessible Cloudflare contract field is recorded.
- [ ] Every inaccessible private-dashboard field is marked unavailable rather than guessed.
- [ ] The selected architecture is justified against Astro, plain Vite/React, and Vinext.
- [ ] Static build output contains a working `/` and no unexpected server runtime.

### Documentation and provenance evidence

- [ ] `HUMAN_REVIEW_PACKAGE.md`
- [ ] `REFERENCE_AUDIT.md`
- [ ] `ORIGINALITY_DEPARTURE_MATRIX.md`
- [ ] `PUBLICATION_MATRIX.md`
- [ ] `ASSET_REGISTER.md`
- [ ] `IMPLEMENTATION_GATES.md`
- [ ] `SPIRAL_CONDUCTION_AMENDMENT.md`
- [ ] `FRAMEWORK_AND_CLOUDFLARE_CONTRACT.md`
- [ ] `QHUB_IMPORT_LEDGER.md`
- [ ] Every Q-HUB import is retrieved from frozen SHA `70d8b5cc193311b9548c49399dde6a014583e13a`.
- [ ] Source and destination SHA-256 values match the ledger.
- [ ] No Q-HUB code, UI, CSS, route, controller, build output, screenshot, test evidence, or later asset is present.
- [ ] No third-party reference screenshot or video is tracked.
- [ ] No private workstation path is present in tracked files or build output.

### Spiral Conduction creative evidence

- [ ] Top-down study compares approximately 2.25, 2.5, and 2.75 rotations.
- [ ] One recommended spiral geometry is selected and justified.
- [ ] Inner terminus visibly connects to a credible Field Unit port.
- [ ] Dormant arrival view has zero magenta environmental illumination.
- [ ] Mid-conduction view shows one cumulative outside-in front, lit behind and dormant ahead.
- [ ] Activation view keeps the unit off until the connector event, then powers it once.
- [ ] Proving-ground style frame establishes Dark V2 materiality without cyberpunk styling.
- [ ] Nine-state contact sheet proves the working normalized sequence.
- [ ] Portal-alignment evidence proves no blank bridge is required.
- [ ] Mobile evidence is independently composed at 360x800 and 390x844.
- [ ] Reduced-motion posters show the dormant cable and powered-off unit.
- [ ] The 2.5D harness maps its state directly to native document progress.
- [ ] Reverse progress reconstructs the exact state inverse.
- [ ] No wheel cancellation, nested page scroller, or extra threshold exists.
- [ ] Originality comparison passes every clone-prevention test.

### Toolchain and performance evidence

- [x] Blender 5.2.0 LTS and FFmpeg/ffprobe 9.0.1 Essentials are pinned, provenance-verified, and installed as per-user portable offline tools outside Git.
- [x] Archive/executable SHA-256 values, licenses, footprints, provider chain, `libx264`, `libvpx-vp9`, and isolation from the website runtime are recorded in `artifacts/evidence/phase-0/TOOLCHAIN_3D_REPAIR.md`.
- [x] `source/quantum-field-unit.blend` passes the final source-validation manifest with no external images or linked libraries and with the required parametric conduction controls.
- [x] The final `.blend`, review images, media, and manifests remain individually below 50 MiB; if any reaches that boundary, stop before staging and report the LFS decision requirement.
- [x] VP9 WebM and H.264 MP4 are encoded from the genuine Blender animatic at GOP intervals 1, 6, and 12.
- [x] `encode-manifest.json` and `ffprobe-manifest.json` match each media file's final SHA-256, bytes, codec, dimensions, frame rate, duration, and GOP contract.
- [x] `browser-seek-report.json` records real browser seek-to-present, visible quality, dropped/late frames, and portal integrity for all six variants.
- [x] The historical synthetic 640x400 VP9 spike is not reported as the real-content result.
- [x] `portal-alignment-report.json` and the overlay compare the final physical interface, final media frame, and first semantic DOM frame.
- [x] The premium browser-native 2.5D fallback remains shippable without production-tool runtime dependencies.
- [ ] Required viewport tests show zero horizontal overflow.
- [ ] Reduced motion creates no cinematic video or frame sequence.
- [ ] Repository size remains within the documented policy.

### Code, build, and publication evidence

- [ ] `npm ci` succeeds.
- [x] `npm run check` succeeds, including `scripts/verify-phase0-3d-repair.mjs` against the settled final package.
- [ ] `npm run build` succeeds.
- [ ] `dist/index.html` exists and is a working semantic root.
- [ ] Build output contains no Worker entrypoint or unexpected server runtime.
- [ ] Keyboard focus is visible.
- [ ] Phase 0 root contains no fake links to unbuilt public routes.
- [ ] No Defense/dual-use text, public metric, form, testimonial, fabricated person/partner, additional case, placeholder, private path, or internal source record leaks into production output.
- [ ] The final candidate is committed and pushed normally.
- [ ] Any Cloudflare branch preview is matched to the exact pushed SHA.
- [ ] The working tree is clean.

### Phase 0 3D creative repair evidence — 17 August 2026

- [x] Field Unit design sheet contains front, rear, left/right, three-quarter front, and three-quarter rear evidence at a minimum 2048px long edge.
- [x] Material sheet covers coated metal, smoked glass, cable, connector, base/contact, and precision detail.
- [ ] Dormant master is 1920x1200 or higher, with no decorative magenta environment light.
- [ ] Conduction masters cover 10%, 25%, 40%, 55%, 70%, and 78% with one cumulative outside-in front.
- [ ] Activation evidence covers connector arrival, internal transfer, one restrained mechanical wake, interface visibility, and portal readiness.
- [x] Portal evidence covers 0%, 25%, 50%, 75%, 100%, first DOM reference, overlay, and documented alignment metrics; perceptual acceptance remains human.
- [ ] The representative 192-frame, 24fps camera animatic demonstrates dormancy, conduction, changing angle, arrival, power-on, interface wake, and portal without audio.
- [ ] Mobile evidence independently covers dormant, mid-conduction, activation, and portal at 390x844 and 360x800.
- [ ] Reduced-motion desktop and mobile images show the repaired dormant physical scene without simulated motion.
- [x] `phase-0-3d-creative-review-contact-sheet.png` presents nine clearly labelled review beats.
- [x] `review-bundle-manifest.json` matches every compact review artifact's final bytes, dimensions where applicable, and SHA-256.
- [x] Root and review READMEs identify exact production versions, source hash, render engine/settings, timeline, provenance/licenses, original-artwork statement, and reference-binary exclusion.
- [ ] No temporary Blender backup, Python bytecode/cache, rendered work-frame directory, tool binary, or third-party reference binary is staged.

The exact hashes and quantitative results are read from the final manifests. Checked machine-verifiable items describe the settled local candidate; they do not imply an immutable pushed SHA, Cloudflare-preview verification, or human visual acceptance.

### Phase 0.2 Field Unit, portal, and typography repair evidence — 18 August 2026

- [x] The refreshed exact 12-PNG review bundle is present with no extra PNG in `review/`, and every record—including the three replacement browser-derived sheets—matches its governing manifest by dimensions, bytes, and SHA-256. Final authorities: browser-review `239f875a3b8dac7621dfbdc9d7a7f226fea191f22a76b6b56174f33f04c8c8a8`, review-originals `ddc1b9665765adb602348ad3df443fc209d4ceaf640837f3ff9d142d56811684`, review-bundle `c2414cf2a202f76d517f70b6a4b0800a36227da78fd5407a5d6689703ed7394b`, and PNG sanitation `74dc0b36c0e0ff339b983eea6a85cff4ffcf3ca86f5031108d2f4f763949a86d`.
- [x] The editable integrated-aperture Blender source and generation/validation scripts are present; `blender-source-validation.json` (5,017 bytes; SHA-256 `6f11055580dd00bf25d1d1c508a5c9e3d62311638df555351c59ee1299fceda1`) binds the frozen `.blend` and validator hashes and passes the exact committed validator's 12/12 semantic checks.
- [x] `portal-layout.json` is the single physical/semantic/overlay copy and coordinate authority; its SHA-256 is `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`.
- [x] The separate physical, DOM, and overlay sheet proves crossover alignment; every live DOM-owned portal state uses a text-free scene and produces no doubled headline or route copy.
- [x] The authoritative v12 browser matrix (`0e0cdf7e578eb24514146ba3826a1ded4191de740b54ce050ada82a676f71905`) passes 46/46 exact-viewport and stress cases with 36/36 raw-plus-normalized capture pairs; every normalized source passes direct full-size visual inspection.
- [x] All 23 hero cases and three reduced-portal cases project Field Unit and spiral-cable source-pixel bounds with zero intersections: 13 visible-scene hero cases retain non-empty in-frame keepouts, while ten zoom/long hero cases and three reduced-portal cases leave text unchanged and prove all 26 displaced keepouts are fully outside the clipped viewport.
- [x] Each required visual case uses 11 successive in-app full-page JPEGs and saves only its exact-byte modal winner; the acceptance floor is 7/11 with no ties or weak final cases. One initial 6/11 batch was discarded and recaptured at 8/11, recorded as `discardedWeakCaptureAttempts: 1`; no timing-only stability claim is made. All 11 scaled wide winners have declared Lanczos lineage; all 25 scale-1 derivatives declare no resampling.
- [x] The 320x800 200% hero and portal cases measure against the scrollbar-aware document viewport and have no horizontal scrollbar, hidden overflow, or nested horizontal scroller.
- [x] Exact 16:10 portal anchors have 0 CSS-pixel maximum delta; non-reference aspect and stress states report anchors not applicable.
- [x] Forced fallback-font QA, support-only 25%-longer hero fixture, focus, reduced motion, line-count, target-size, collision, responsive divider geometry, glyph/rule-clearance, raster glyph-ink/coverage, text-overflow, and doubled-copy checks all pass.
- [x] Syne, Newsreader, and Inter are not falsely claimed as delivered; no font binary or remote font dependency is present.
- [x] Byte-level privacy scans include PNG and `.blend`; no private path, prohibited public taxonomy, Blender backup, Python cache, video, frame sequence, third-party reference binary, oversized file, or unapproved runtime dependency is present.
- [x] `scripts/verify-phase0-3d-repair-v2-assets.mjs` and `scripts/verify-phase0-3d-repair-v2-layout.mjs` pass against the final review bundle and v12 browser matrix; the capture normalizer also passes independently.
- [x] The complete `npm run check` chain passes with Astro diagnostics 0/0/0, 13/13 Node tests, and all creative/layout integrity gates; `npm run build` produces one static route and 11 files totaling 9,333,433 bytes with no server runtime.
- [ ] Human creative review accepts the Field Unit silhouette/materials, proving-ground composition, activation sequence, portal crossover, hero typography, responsive layouts, and reduced-motion stills.

These checks do not authorize Phase 1, production cinematic integration, a production-branch change, or a production deployment.

### Phase 0.3 Aperture Station portal and typography evidence — 18 August 2026

- [x] The preserved portal-layout authority remains byte-identical at SHA-256 `25666cf071afe7564dc051cbec770ead325cdf19ef1f4926e43d793a2a053bc5`; Phase 0.3 does not rewrite its copy, coordinates, anchor tolerance, carrier stages, audience paths, or 12px glyph/rule clearance.
- [x] The provenance-released v3 scene ledger and Blender-derived keepout authority are bound by exact path, dimensions, bytes, and SHA-256. Mobile and reduced-mobile use the independently authored 2.25-turn cable and record 2.171694 visible turns against the 2.15 minimum.
- [x] The authoritative matrix (`8272764a01ac18b4aed7b8b0ebffdca812a5f235e51d6c2c2ea6ae744c6ac4fc`; 1,785,125 bytes; generated `2026-08-18T10:20:47.772Z`) passes 46/46 runner and child reports with 36/36 raw-plus-normalized visual lineages.
- [x] All 36 normalized captures were opened and audited at full target size. No unresolved scale/crop race, clipped or fragmented word, neutral-focus residue, opaque rounded copy panel, Aperture Station/cable collision, rule collision, horizontal truncation, or partial-layer defect remains.
- [x] Every case has a populated human line-break report and zero word-fragmentation offenders. Page/route horizontal overflow, text-offender, collision, target-size, rule-clearance, divider, semantic, scene-readiness, doubled-copy, and fallback-font gates all pass.
- [x] All 26 applicable source-derived Aperture Station/cable scene-safety cases record zero semantic-copy intersections. Hero actual/reduced/focus compositions retain the intended visible scene; zoom/long and reduced-portal stress states displace decoration without shrinking semantic text.
- [x] Six reduced-motion cases instantiate no animated media and report zero large floating rounded-panel offenders. Reduced hero evidence retains the dormant Station/cable; reduced portal evidence uses the permitted directional full-frame scrim.
- [x] Focus measurement restores or clears temporary audit focus. Forty-four neutral cases bind no active review control; explicit hero and portal focus cases bind the requested first audience control and preserve a visible 3px warm-magenta outline.
- [x] The repository-native capture runner binds plan SHA-256 `26cf9fc7088d3102b1214c6f8c0c5f1864d02d3d04c52a047b2b17b8ca7db2d5` and six-file harness SHA-256 `c306bd2b33cbc116c60e6171ebf6f1e47a29892d7d8ef57697292d379e178d65` (`phase03-layout-v11`). A harness change invalidates resume only after byte-preserving the old checkpoint, raw images, reports, and matrix in `recovery/`.
- [x] Every visual case used 11 successive full-page JPEGs and a unique exact-byte modal winner; observed minimum 10/11, zero weak cases, zero ties, zero discarded rounds, and no timing-only stability claim. Eleven normalized captures declare Lanczos restoration and 25 declare no resampling.
- [x] `scripts/verify-phase0-3d-repair-v3-layout.mjs` and `python scripts/normalize-phase03-captures.py --check` pass against the current matrix and its exact harness/capture authority.
- [x] The exact 13-PNG v3 review bundle is complete. The four browser-derived sheets match the sealed normalized captures through `browser-review-composition-manifest.json` SHA-256 `f5a7f5908aee8b65969fcbaf3d5143dd8d52a0b7be3ca2f26565a6153279e074`; `review-originals-manifest.json` SHA-256 is `1783a3e2218bf93150807b10ca27db9edd217520832880f076b1d04d89cb493b`; `review-bundle-manifest.json` SHA-256 is `8a73fc5eae08a405f8a96cc2d93dc3fd30b888d77da2fa5d4feec377260fe3fe`.
- [x] The final `blender-source-validation.json` is 6,193 bytes, SHA-256 `9f1f3ddc4ac0c4b8b9e10c749b805decbfa3be76cadda2fccdce2c2e5174bb91`, and the exact final Blender validator rerun passes 13/13 checks.
- [x] PNG sanitation SHA-256 `bba8b813f18d4a332067982696a68bd44c57bc0a9664ee15f175fe7b14c866bb` accounts for 83/83 PNGs; package inventory SHA-256 is `ec8fc58217b80be850be9fe98a94a549ea8cf5d83eea00883fb6a66654d46104`.
- [x] Final `npm run check` passes with Astro diagnostics 0/0/0, 13/13 Node tests, and all creative/layout/integrity verifiers; `npm run build` produces one static page and 11 files totaling 9,333,433 bytes with no server runtime.
- [ ] Human creative review accepts the Aperture Station, cable, portal typography, responsive hero layouts, and reduced-motion compositions.

These checks do not authorize Phase 1, production cinematic integration, a production-branch change, or a production deployment.

### Phase 0 human gates

The first gate evaluates repository integrity, contract truth, buildability, provenance, test honesty, and fallback feasibility:

```text
REPOSITORY + FEASIBILITY:
ACCEPT / REPAIR / REDIRECT
```

The separate creative gate evaluates the original object, physical spiral, conduction behavior, power-on, portal, mobile composition, reduced-motion poster, and originality:

```text
FIELD UNIT + SPIRAL CONDUCTION + PORTAL CREATIVE:
ACCEPT / REPAIR / 2.5D REDIRECT
```

Interpretation:

- `ACCEPT`: the reviewed Phase 0 candidate becomes the permitted parent for the next specifically authorized phase.
- `REPAIR`: remain on the Phase 0 branch, add normal repair commits, rerun evidence, and submit a new full SHA.
- `REDIRECT`: stop the current architecture or feasibility direction and return to planning.
- `2.5D REDIRECT`: make the accepted premium browser-native 2.5D method the future production-opening medium; do not begin later work without its separate authorization.

## Later gates (locked)

These phases remain planning records, not current authorization.

| Phase | Branch | Required result | Human decision |
|---|---|---|---|
| 1. Static semantic foundation | `feature/phase-1-semantic-foundation` | All real static routes, metadata, schemas, Dark V2 foundation, publication denial tests | `FOUNDATION ACCEPT / REPAIR / REDIRECT` |
| 2. Interior visual system | `feature/phase-2-interior-system` | Native operating surface and homepage chapters; only method/domains extended sticky | `INTERIOR SYSTEM ACCEPT / REPAIR / REDIRECT` |
| 3. Production opening prototype | `feature/phase-3-field-unit-media` | Production-quality desktop slice, authored mobile opening, final poster, codec and portal evidence | `FIELD UNIT + PORTAL CREATIVE ACCEPT / REPAIR / 2.5D REDIRECT` |
| 4. Cinematic integration | `feature/phase-4-cinematic-integration` | Deterministic one-root intro, matched handoff, reverse, lifecycle evidence | `CINEMATIC ACCEPT / REPAIR / REDIRECT` |
| 5. Supporting routes | `feature/phase-5-supporting-routes` | Complete approved route content and responsive presentation | `ROUTES + CONTENT ACCEPT / REPAIR / REDIRECT` |
| 6. Quality hardening | `hardening/phase-6-quality` | Browser/device, accessibility, performance, lifecycle, and visual-regression closure | `QUALITY ACCEPT / REPAIR / REDIRECT` |
| 7. Publication validation | `content/phase-7-publication-validation` | Frozen public copy, approvals, hashes, prohibited-content and internal-data scans | `PUBLICATION ACCEPT / REPAIR / REDIRECT` |
| 8. Release candidate | `release/phase-8-candidate` | Fresh full evidence, exact preview SHA, full human release review | `RELEASE ACCEPT / REPAIR / REDIRECT` |

## Phase 8 release rule

Only an explicit `RELEASE ACCEPT` tied to one exact Phase 8 branch-preview SHA authorizes production. The release process then:

1. verifies the accepted branch tip and a clean tree;
2. verifies that `main` has not diverged from the release candidate's accepted parent;
3. fast-forwards `main` to the exact accepted candidate SHA;
4. pushes normally, without force;
5. verifies Cloudflare production attached to and deployed that exact SHA;
6. smoke-tests every deployed route and critical asset;
7. reports the production SHA, deployment evidence, and clean tree.

If `main` moved after review, the accepted candidate is not rebased or force-applied. A new release candidate is created from the new production parent, all evidence is rerun, and a new `RELEASE ACCEPT` is required.

## Evidence storage policy

- Original Quantum source artifacts, rendered review evidence, test evidence, and implementation evidence belong in Qsite1 and must be committed, subject to the repository-size policy.
- Third-party reference evidence remains in the private workspace identified by `reference-audit-2026-08-17` and is intentionally uncommitted.
- Public documents do not contain private absolute paths, credentials, or secret values.
- If repository limits prevent a required original artifact from being committed, the gate stops and reports the blocker. The artifact is not silently maintained as undocumented external-only production work.

## Phase 0 stop condition

After the two Phase 0 gates are presented, no Phase 1 work begins. Human direction is required even when every automated check passes.
