# Implementation Gates

Status: binding delivery and human-review contract
Current authorization: Phase 0 only
Current branch: `planning/phase-0-reconciliation`
Production branch: `main` (must not change during Phase 0)

## Gate principle

Automated success is evidence, not human acceptance. Every phase ends at a pushed, immutable candidate SHA with a clean working tree and waits for its declared human decision. Work does not silently continue into the next phase.

The active Phase 0 authorization permits:

- safe repository reconciliation;
- read-only audit of the existing Cloudflare contract;
- a minimal static Astro feasibility root;
- planning, provenance, and publication records;
- original Spiral Conduction and Field Unit feasibility evidence;
- a non-production premium 2.5D review harness;
- relevant tests, build, commit, push, and Cloudflare branch-preview verification.

It does not permit:

- Phase 1 semantic route implementation;
- the full homepage or supporting-route architecture;
- production cinematic integration;
- a change, merge, or push to `main`;
- Cloudflare setting, DNS, domain, project, or production-branch mutation;
- a separate deployment provider, Sites host, Worker, or direct Wrangler production deployment;
- Q-HUB mutation or runtime dependency;
- installation of system-level DCC or media tools.

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

- [ ] Blender/equivalent, FFmpeg, ffprobe, H.264, VP9, MediaRecorder, Canvas capture, glTF tools, image tools, Git LFS, and repository-size limits are honestly audited.
- [ ] No system-level tool was installed during Phase 0.
- [ ] If a real encoder was available, the low-resolution seek test records the actual tool, codec, input/output properties, and measurements.
- [ ] If no encoder was available, no encode or seek-performance result is claimed.
- [ ] The missing pinned tool/version/license/install footprint is documented.
- [ ] The shippability of browser-native premium 2.5D without the missing tool is stated.
- [ ] Required viewport tests show zero horizontal overflow.
- [ ] Reduced motion creates no cinematic video or frame sequence.
- [ ] Repository size remains within the documented policy.

### Code, build, and publication evidence

- [ ] `npm ci` succeeds.
- [ ] `npm run check` succeeds.
- [ ] `npm run build` succeeds.
- [ ] `dist/index.html` exists and is a working semantic root.
- [ ] Build output contains no Worker entrypoint or unexpected server runtime.
- [ ] Keyboard focus is visible.
- [ ] Phase 0 root contains no fake links to unbuilt public routes.
- [ ] No Defense/dual-use text, public metric, form, testimonial, fabricated person/partner, additional case, placeholder, private path, or internal source record leaks into production output.
- [ ] The final candidate is committed and pushed normally.
- [ ] Any Cloudflare branch preview is matched to the exact pushed SHA.
- [ ] The working tree is clean.

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
