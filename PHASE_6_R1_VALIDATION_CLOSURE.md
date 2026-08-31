# Phase 6-R1 validation closure

## Authority

Phase 6-R1 remains a narrow evidence and validation repair. It does not self-accept Phase 6, authorize Phase 7, or authorize a merge to `main`.

- Branch: `repair/phase-6-r1-validation-closure`
- Required parent: `aee036740b129624c54b8f1b878229f955d187ae`
- Frozen production `main`: `501040c42bba30b9d9517b88a8f9857992a2dba4`
- Production-source changes: none
- Change scope: test tooling, evidence assembly, reports, package/audit tooling, and validation probes

Final commit, deployment and package hashes are deliberately generated outside this tracked report so the report cannot claim the hash of a tree that it changes.

## Corrected status taxonomy

The assembler, packager and independent auditor preserve these states without promoting them to machine PASS:

- `PASS`
- `FAIL`
- `LIMITATION`
- `NOT OBSERVED`
- `PENDING HUMAN REVIEW`
- `NOT AVAILABLE TO EXECUTION ENVIRONMENT`

BFCache requires an actual ordered persisted pagehide/pageshow restoration. Hidden/visible requires an observed hidden transition. Keyboard and focus require completed interaction evidence; axe-only results cannot satisfy them. Genuine 200% requires actual installed-browser zoom and cannot be inferred from viewport resizing. Physical-hardware evidence cannot be inferred from a file name, WebKit proxy, or injected input.

Focused unit tests reject each prior false promotion, contradictory human ledger, incomplete host composite, unbound recording, duplicate source report, and semantically rebuilt package.

## Host validation closure

- Genuine installed Chrome 200%: `PASS`. Chrome 150 was zoomed through native browser keyboard input to 200%. All ten public-route outcomes passed the ten required checks. The 720×450 reflow run remains supplemental only.
- Native Windows input injection: `PASS` for the stated machine condition. Windows `SendInput` wheel events reached headed installed Chrome and exercised minimal input, long traversal, reversal, authored stops, supporting-route flow, `/#entry`, and reverse physical traversal. This is not labelled a physical human mouse.
- Real hidden/visible: `NOT OBSERVED`. Five real headed-Chrome tab/minimize scenarios were attempted across Home, manifesto and both Maradin player states; the instrumented document never exposed `hidden` or a visibilitychange event. Coherent visible-state observations are retained without a PASS promotion.
- BFCache: `NOT OBSERVED`. Installed Chrome, Playwright Chromium and Firefox used fresh headed persistent profiles. Ordinary Back/Forward passed across 81 transitions; persisted pagehide/pageshow counts remained zero and not-restored reasons were unexposed.
- Focused WebKit interaction: `LIMITATION`. Navigation, skip activation, Home, mobile menu, Escape/focus return, supporting navigation and Back/Forward completed. Keyboard events were delivered, but deterministic Tab/Shift+Tab focus fidelity remained a Windows Playwright WebKit limitation.
- Physical iOS Safari: `NOT AVAILABLE TO EXECUTION ENVIRONMENT`. No connected device, trusted bridge or already-authorized real-device entitlement was available.
- WebKit / iOS-layout proxy: `LIMITATION`, with layout `PASS`. Twenty portrait/landscape route outcomes, reduced motion, slow network and Maradin lifecycle passed; Windows WebKit Home H.264 decoding and a real hidden transition remained limited/not observed. This proxy is not physical Safari evidence.

No host-side validation reproduced a production-site defect. No accepted controller, media, composition, publication content or route architecture was changed.

## Motion, accessibility and lifecycle evidence

Fresh Chromium and Firefox machine sets contain all five required recordings: forward traversal, reverse traversal, stop-at-current/line/raster/Q, resize/orientation-style changes at current and manifesto, and supporting route to Home `/#entry` followed by reverse physical traversal. They are supplemental machine evidence and are not physical-device recordings.

The accessibility authority retains full route/viewport axe matrices, keyboard, menu and history evidence, reduced motion, and no-JS coverage. WebKit focus remains explicitly limited. Lifecycle, memory, media/network and publication evidence is revalidated by the final Node 22 run and deployment verifier.

## Human-device packaging rule

The earlier hard stop on four user-recorded videos was withdrawn. Missing physical recordings now produce a `NOT AVAILABLE TO EXECUTION ENVIRONMENT` ledger and do not block packaging. Present recordings can only be `PASS`, `FAIL`, or `PENDING HUMAN REVIEW` after hash/size/media binding and actual review; they cannot be relabelled as unavailable hardware.

The final external package includes the environmental-limitations report and clearly separates physical hardware, native Windows injection, genuine Chrome zoom, and WebKit/iOS proxy evidence.

## Declared Node runtime and deployment

`.nvmrc` remains `22.16.0`. The final external authority must bind Node `v22.16.0`, the exact npm version, `npm ci`, Astro check, the complete test suite, production build, Phase 4 source verification, Phase 5B/Phase 6 regression verification, and a byte comparison against Node 24. It must also bind the exact final branch commit to the signed Cloudflare deployment, immutable preview, branch preview, dist inventory and HTTP/header parity.

## Review gates

All six Phase 6 gates remain `PENDING HUMAN REVIEW`:

- Native-scroll and motion integrity
- Performance and memory safety
- Media and network isolation
- Cross-engine and history resilience
- Accessibility and fallback resilience
- Visual and publication regression

Phase 6 is not self-accepted. Phase 7 is not authorized. Production `main` remains unmerged and frozen.
