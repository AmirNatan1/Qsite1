# Phase 6-R1 validation closure

## Decision and repository authority

Phase 6-R1 remains a narrow evidence and validation repair. It does not self-accept Phase 6, authorize Phase 7, or authorize a merge to `main`.

- Branch: `repair/phase-6-r1-validation-closure`
- Required exact parent: `aee036740b129624c54b8f1b878229f955d187ae`
- Frozen production `main`: `501040c42bba30b9d9517b88a8f9857992a2dba4`
- Production-source changes: none
- Change scope: evidence assembly, browser and device validation harnesses, packaging and audit tooling, deployment verification, tests, and this closure report

The final branch SHA, tree, deployment UUID, immutable preview, branch preview, and evidence hashes are deliberately not embedded in this tracked report. The report itself changes the tree. They must be captured and cross-bound by the post-commit external R1 evidence and returned in the final handoff.

Previous pre-hardening assembly inventories and hashes are not closure authority. No earlier lifecycle/accessibility hash or generic claim about a “final tracked state” is carried forward here.

## Corrected evidence taxonomy

The refrozen assembler preserves these states without converting them to binary machine PASS:

- `PASS`
- `FAIL`
- `LIMITATION`
- `NOT OBSERVED`
- `PENDING HUMAN REVIEW`

Its guarded requirements are fail-closed:

- BFCache can pass only from real, ordered, same-Document persisted event pairs for both `/` and `/#entry`. A completed attempt with no such pair remains `NOT OBSERVED`.
- Hidden/visible behavior can pass only from an observed native visible → hidden → visible transition whose events and snapshots agree. An unavailable transition remains `NOT OBSERVED`; an observed failure dominates.
- Failed or limited interaction evidence cannot become keyboard, focus, mobile-menu, or history PASS.
- Axe-only evidence cannot satisfy keyboard, focus, mobile-menu, browser-zoom, or physical-device requirements.
- The 720×450 reflow capture is accepted only in its exact supplemental role and path. It cannot satisfy genuine 200% browser zoom.
- Genuine 200% requires the physical Chrome recording, genuine 200% identity, all ten exact routes, and all ten exact checks per route.
- Physical evidence remains `PENDING HUMAN REVIEW` unless all four exact recordings are ingested, structurally valid, hash/size/status bound, and reviewed through the exact human ledger contract.
- Human hidden/visible authority combines the opening Safari recording with the Maradin background/foreground, retryable source-free, persistent-task, and orphan-Blob checks. Any reviewed failure yields `FAIL`; file presence alone never yields PASS.
- R1 accepts only its enumerated mandatory and supplemental artifact roles, destinations, and schemas. Unknown supplemental roles and repository-source-dump destinations are rejected.

Focused counterexamples cover false summary flags, missing raw observations, contradictory ledgers, proxy-only zoom, sparse accessibility evidence, invalid media containers, and artifact/ledger drift.

## Persistent lifecycle and media authority

The lifecycle producer and assembler re-derive their conclusions from raw browser evidence rather than trusting top-level booleans:

- The exact ten-state history route/navigation sequence is required, with closed mobile menus, coherent Document and navigation identities, chronological event-ledger prefixes, finite geometry, source identity, manifesto state, and resource counters.
- Same-Document Home restoration must remain strict enhanced/ready/source-present state. Bare-Home Back may use the intentional new-Document, source-free `static/restored-scroll` continuation, but that path can never satisfy BFCache.
- BFCache event pairs are bound to the deployed origin, exact route, departure/restoration snapshots, capture times, and raw event ledgers. Aggregate `FAIL` dominates, then `NOT OBSERVED`; PASS requires both Home scenarios.
- Visibility scenarios require exact append-only event prefixes and snapshot timing. Home current/manifesto source ownership, paused decoder, frame/manifesto coherence, Blob, RAF, and interval state are verified at before/hidden/visible boundaries.
- Maradin requires exact route and retry provenance: one active attached source plus one dormant peer before activation, source-free release while hidden/visible, and a retry that returns to a source-free state without live Blob, RAF, or interval ownership.
- Listener, RAF, interval, Blob, geometry, and media-resource counters must be finite, nonnegative, arithmetically coherent, and monotonic where cumulative.
- Media documents are derived from lifecycle snapshots. Selected Phase 4 paths and network paths must agree bidirectionally, requests must bind to one logical Home document/navigation, and malformed ranges cannot bypass duplicate non-range accounting.

The harness repair for ordinary Back accepts only the intended static restoration on a new Document. It does not weaken the same-Document or BFCache path. No production controller change was made for this evidence behavior.

A fresh persistent-profile run also reproduced a tooling-only identity defect: the harness deliberately reused one route-stable navigation ID when a non-BFCache Back created a fresh Document at the same `/#entry` route, but its media classifier incorrectly treated that route ID as a unique Document ID. The repair preserves the route-stable ID for history provenance, separately correlates every governed Phase 4 request to the probe's actual Document ID, and keys media coverage and non-range duplicate checks to that Document identity. Each request also captures a monotonic frame-navigation generation; correlation promises are drained immediately before document transitions, and a generation change before resolution is rejected even when the next Document has the same URL. One generation cannot bind two Documents, while one same-Document or BFCache-restored Document may legitimately span generations for range traffic. The assembler, packager, and independent auditor re-derive the same Document, generation, route, navigation, and correlation invariants. Missing, raced, duplicated, or navigation-mismatched correlations fail closed. The exact regression case—two fresh `/#entry` Documents, one governed request each, and one shared route ID—is tested through the producer, assembler, packager, and auditor boundaries. This was not a site interaction or production media defect, so no production source was changed.

The canonical post-commit lifecycle report must be regenerated with the current schema. Its final status and SHA-256 will be reported in the final handoff; an older lifecycle payload or hash is not authoritative.

## Accessibility and WebKit authority

Accessibility PASS now requires the current producer’s complete raw evidence:

- the exact 20 route × viewport axe rows for each selected engine, with coherent violation totals and summaries;
- all ten keyboard route rows, including visible skip-link activation, forward focus from the resolved Home manifesto into the exact audience trajectories, Shift+Tab return, the desktop Home navigation control bound to `/#entry`, supporting-route navigation, and Back/Forward results;
- all four mobile menu cycles, including open/close state, Escape, focus return, and navigation; and
- exact failure arrays, engine-error counts, and derived summaries.

URL waits are report-completing and fail-closed. A control that does not receive focus or navigate produces a structured failure/limitation record instead of aborting the engine or disappearing from coverage.

A fresh isolated Chromium run reproduced a second tooling-only sequencing defect: the desktop Home-row check reopened a fresh Home document and immediately attempted to focus the deliberately inert header, before the accepted physical cinematic had released `#entry`. The repair prepares that one row with recorded native wheel input, requires media readiness, a resolved manifesto, and a non-inert entry before testing the header control, and makes the validator reject missing or contradictory preparation evidence. The repaired Chromium matrix completed 20/20 axe cases with zero violations, zero engine errors, and zero interaction failures. No production source was changed.

A later isolated Chromium run exposed a separate sampling race in the same evidence harness: the correct skip link held focus and focus styling, but the fixed post-Tab delay captured its 140 ms entrance transition while its rectangle was still outside the viewport. The runner now waits, within a strict bound, for the focused element's complete viewport geometry before recording the observation. A timeout still produces the ordinary structured focus failure. This is a tooling-only timing repair and does not alter the accepted skip-link CSS or any production source.

The final raw interaction contract also binds every successful focus observation to the exact computed visible outline colour, canonical element identity and accessible label, semantic control type, internally consistent full rectangle, rendered ancestor chain, and the expected header or mobile-navigation container. Skip activation is bound to the governed route pathname, route-owned fragment, exact target element, target geometry, and rendered ancestor chain. Desktop Home waits must complete with exact `null` error sentinels and coherent resolved Home state across arrival, Back, and Forward; About mobile-menu samples must remain on `/about/` until the deliberate Home activation. Same-document history restoration requires finite numeric alignment plus nonnegative integer scroll positions for every bare, entry, Back, and Forward sample.

Every axe, keyboard, mobile-menu, and history row retains canonical console, page-error, and request diagnostics. PASS requires terminal same-origin GET observations, service-worker isolation, exact main-frame document coverage for the governed route, and—where a supporting route deliberately opens Home—separate main-frame Home document coverage. Expected 404 and media-abort exceptions are document- and origin-bound, so they cannot suppress errors from a different route. Engine-specific executable basename, headed mode, report/result/menu/history engine identity, and the exact local QA origin are cross-bound; a well-formed measured browser version is retained without claiming a runtime-inventory proof that the report does not contain. The exact accessibility artifact path is also bound to its engine. R1 package and audit boundaries require the canonical accessibility-interactions schema unconditionally, so switching to the legacy global-hardening schema cannot bypass raw validation. Focus, route, completion, history, diagnostics, schema, origin, artifact-path, and cross-engine mutations are rejected by runner, assembler, packager, and independent-auditor tests.

The last isolated WebKit behavior was a Windows-host native focus-policy limitation rather than a reproduced production defect. It is not promoted to PASS. Retained Chromium, Firefox, and WebKit accessibility payloads created before the raw keyboard contract was expanded are intentionally rejected and must be regenerated after the final commit. Their final statuses and SHA-256 values will be returned in the final handoff.

## Human evidence stop

The required human-evidence root did not contain the four required recordings at the latest preflight.

Missing required files:

- `iphone-safari-opening.mp4`
- `iphone-safari-maradin.mp4`
- `physical-scroll-input.mp4`
- `chrome-200-percent.mp4`

Preflight enumerates all missing or non-regular required filenames before parsing any present media or review document. It never substitutes a machine recording for physical evidence.

When files are present, each recording must pass strict ISO-BMFF validation: a leading coherent `ftyp`, nonempty `moov` and `mdat`, a video track, positive movie/media timing, and a complete positive sample table. The ledger retains derived duration, sample-count, and video-track facts. PASS/FAIL reviews must bind their reviewed SHA-256 and byte size to those exact supplied bytes; replacing a same-name file invalidates the review. Every failure timestamp or frame must also fall within the parsed recording duration or sample count. PASS/FAIL entries additionally require the correct physical device, OS, browser/input identity, exact checks, structured per-check observations, and contradiction-free result text. Canonical unreviewed entries retain full null-bound check inventories and remain `PENDING HUMAN REVIEW`.

No physical iPhone, physical mouse/trackpad, genuine 200%, or physical Safari background/foreground PASS is claimed.

## Declared Node runtime and final evidence regeneration

`.nvmrc` remains `22.16.0`; it was not changed to match the earlier Node 24 run.

The R1 assembler now requires a dedicated Node 22 integrated-validation artifact using schema version 7 or later. That artifact must bind the exact final branch head and tree, required parent, frozen `main`, clean repository state, zero production-source diff, unchanged lockfile authority, exact Node/npm versions, and individual PASS outcomes for:

- `npm ci`;
- Astro check with zero errors and warnings;
- production build;
- the complete test suite;
- Phase 4 source verification;
- Phase 5B/Phase 6/R1 focused regression; and
- standalone verifier self-tests.

The same artifact must provide a byte-identical Node 22 versus Node 24 `dist` comparison with equal file count, byte count, and manifest SHA-256. Older Node results are not relabelled as final-candidate authority.

Deployment evidence is also re-derived from its raw ledgers. The exact signed GitHub check-run ID is bound independently through final metadata and package provenance. The canonical route outcomes, ten HTML authorities, header policies, sorted dist inventory, totals, file sizes and hashes, HTTP 200/404 outcomes, origin sizes and hashes, canonical results, and exercised cache policies must agree. The complete deployment dist ledger must then match the hash-bound Node 22 distribution manifest exactly; a self-consistent but forged deployment ledger is rejected.

The final Node 22 artifact hash, deployment-verification hash, persistent-lifecycle hash, and regenerated accessibility hashes will be produced externally after the final commit and listed in the final handoff.

## Package and independent-audit stop

R1 packaging is authority-profile aware and preserves the legacy Phase 6 profile. The R1 boundary requires the exact repair branch authority, the exact production/tooling change ledger, the five tracked reports including this closure report, the Node 22 validation artifact, current motion and lifecycle raw authority, the complete human ledger plus four recordings, exact topology, and hash-bound wrappers. The independent auditor revalidates the archive rather than trusting assembler or package summaries.

Unknown supplemental roles, raw frames, caches, source dumps, unbound recordings, contradictory human reviews, false PASS promotions, manifest drift, and deployment mismatch are rejected.

Because the four required human recordings are missing, packaging remains stopped:

- `phase-6-r1-validation-closure-human-review.zip`: **NOT PRODUCED**
- Embedded manifest: **NOT PRODUCED**
- Independent package audit: **NOT PRODUCED**

No ZIP size or SHA-256 is claimed. Synthetic fixtures test the package boundary but are not human evidence and are not a substitute for the required external package.

## Review gates

All six Phase 6 human gates remain `PENDING HUMAN REVIEW`:

- Native-scroll and motion integrity
- Performance and memory safety
- Media and network isolation
- Cross-engine and history resilience
- Accessibility and fallback resilience
- Visual and publication regression

Phase 6 is not self-accepted. Phase 7 is not authorized. `main` must remain unmerged and frozen at `501040c42bba30b9d9517b88a8f9857992a2dba4`.
