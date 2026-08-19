# Phase 0.4R browser evidence

Status: **PASS — final local browser authority sealed; human creative acceptance pending**

This additive evidence root preserves the accepted Phase 0.4 typography, wording, anchor, responsive and query topology while isolating the Phase 0.4R creative-source repair. It does not overwrite or reinterpret the accepted Phase 0.4 matrix or captures.

## Immutable baseline

- repository baseline: `fec1f0e9243a9cda188c539ab1b79e4a99c30623`
- portal layout contract: `artifacts/original/phase-0-4-crt-television/crt-portal-layout.json`, 16,248 bytes, SHA-256 `255c5b1499857ab8a2409adf368543efa0d6f9bfe3171e8a0a0a680e2caf31cc`
- accepted capture plan: `prototypes/phase-0-4-crt-portal-qa/capture-plan.json`, 26,822 bytes, SHA-256 `5006dfee0af38bd0ffa71a875351b13c55766eae5ea3588968bccb16cc9fdd61`
- accepted matrix: `artifacts/evidence/phase-0-4-crt-television/browser-matrix-report.json`, 1,149,989 bytes, SHA-256 `5411220869170f0290423d2f235aba2dc659aa1820e6eb2a3680bbe179d073d7`
- accepted harness aggregate: SHA-256 `984980d22922ea03c5a5ac157cf4c2b6372f175f6711e0f5d2bd45c7ffc38cd5`
- accepted source-space keepout authority: 1,225,841 bytes, SHA-256 `c2d371d4eb3d3bfafe82ad67728c2df48ef7e38b09b2d1306d5accd2c955ac3d`

The immutable legacy Phase 0.4 authority is the Git tree at candidate SHA `fec1f0e9243a9cda188c539ab1b79e4a99c30623`. Phase 0.4R intentionally updates governed package paths in the current candidate, so the legacy Phase 0.4 byte-expectation verifiers are not part of the active aggregate check. Their scripts and evidence remain preserved for an exact historical checkout; no legacy verifier or committed Git object is rewritten.

## Capture authority

The released ready-plan snapshot is byte-frozen at `capture-plan-authority.json`, 43,077 bytes, SHA-256 `dfd21e2e70fddd02285c8f00979d8cb95aacca43462ef079fff063aafa0d3f08`. It binds all six exact source records and the frozen/PASS 6/6 keepout ledger, 1,157,579 bytes, SHA-256 `4dcf0d9b6e7e583682b8d148178634fabb54b331f02ab31e7d7e9358ff6cd26c`.

The mutable plan is now final `PASS`, 46,456 bytes, SHA-256 `3039c7ad2ff66c953298820c2ca7fe1bc2cca5e7790960458c1712dffc3f3438`. Its completion pointers do not alter the ready snapshot used by the matrix. The final harness aggregate is SHA-256 `0f05a44cbb904c5ad13a0ce3ea91192500786827fe8405c13c46cb1117472a5e`; the authority fingerprint is `5dc0da47871b570e986a2cd8b83db665bfe602207536e7eac6db48e06d9447ac`.

## Frozen test topology

- 46 browser reports;
- 36 full-size normalized captures;
- the exact accepted nine viewports, query strings, focus selectors and capture flags;
- forced fallback, 200% text, 25.4% longer support copy, reduced motion, focus, whole-word, 44px control, overflow, collision, rule and source-projected keepout checks;
- explicit narrow proof at 320×800, including 200% text;
- batches of no more than 10 cases;
- 11 successive full-page JPEGs for every visual case;
- a unique exact-byte modal winner with at least 7 of 11 votes; weak or tied rounds are discarded and recorded;
- atomic checkpoint persistence after every case and hash-validated resume.

The 46/36 matrix remains unchanged. After that matrix is normalized, a separate repository-browser step captures `portal-08-full-semantic-surface` at 1440×900 using the same 11-shot, unique ≥7/11 modal policy. Portal state 7 is the normalized `portal-actual--desktop-1440x900` matrix capture with the frozen text-free takeover raster behind semantic DOM. Portal state 8 keeps the same semantic DOM, typography and anchors while removing that decorative raster after DOM ownership. Their paths and SHA-256 values must differ.

The exact six-role report/capture dependency roster is machine-bound in `prototypes/phase-0-4r-crt-portal-qa/capture-plan.json`. The physical portal-close source has no live DOM case; it remains a separate crossover-sheet lineage input.

## Repository-native commands

Static/final verification:

```text
node scripts/capture-phase04r-browser-matrix.mjs --list
node scripts/verify-phase0-4r-crt-layout.mjs
node scripts/finalize-phase04r-browser-evidence.mjs --check
node scripts/verify-phase0-4r-crt-assets.mjs --final
```

The completed production sequence was run in resumable batches of ten or fewer cases with the existing non-public server on port 4173:

```text
node scripts/capture-phase04r-browser-matrix.mjs --batch-size 10
python scripts/normalize-phase04r-captures.py
python scripts/normalize-phase04r-captures.py --check
node scripts/capture-phase04r-browser-matrix.mjs --portal-state-8
node scripts/finalize-phase04r-browser-evidence.mjs --prepare
node scripts/finalize-phase04r-browser-evidence.mjs --complete
node scripts/finalize-phase04r-browser-evidence.mjs --check
```

Re-running capture is not required for the sealed candidate. If explicitly authorized later, the runner resumes implicitly and skips only cases whose report, raw winner and authority fingerprint still validate.

## Final evidence layout

- `reports/`: one repository-native case report per planned case;
- `captures/raw/`: exact modal JPEG winners;
- `captures/normalized/`: viewport-normalized PNG evidence;
- `recovery/`: preserved stale-authority checkpoints and bytes when an authority changes;
- `browser-matrix-report.json`: emitted only after all 46 local cases pass;
- `capture-plan-authority.json`: byte-identical ready-for-capture plan snapshot during finalization.
- `portal-states/`: the separately captured state-8 JPEG/report and the two-state browser authority lineage;
- `browser-review-composition-inputs.json`: deterministic sheet-10-through-16 source records for the creative compositor; it creates no pixels;
- `browser-evidence-manifest.json`: matrix, snapshot, power/portal authorities and zero blank-bridge, aspect-snap and doubled-copy counts.

The normalized matrix is PASS at 1,159,197 bytes, SHA-256 `82ae5672fba028f813bc98754038e0deb9ab2b022bb199e3e2dcb1a8b272b00d`: 46/46 reports, 36/36 normalized captures and zero required geometry, overflow, fragmentation, fallback, focus, reduced-motion or semantic failures. Modal winners are 31 cases at 11/11, four at 10/11 and one at 8/11; no weak or tied round was admitted. The normalized checkpoint is `complete-local-authority-normalized`, 43,161 bytes, SHA-256 `39f49f65347beca0c7e203df6a08e243a8455e9d77e899973ea14602a4c4d598`.

The final portal authority is PASS 8/8 at 56,690 bytes, SHA-256 `3d3df7884f78cd9ee573a82f5961013d038c390324fb4b95efd109f3ccf236cb`. Browser states 7 and 8 are distinct decoded rasters; the bridge records zero blank frames, aspect snaps and doubled copy. The additive sheets 10–16 composition manifest is PASS at 17,615 bytes, SHA-256 `82a338594cac6f56e1c36dafaddd929d54b9c7b91c1710bae538a3770cddeca4`. Browser evidence is PASS at 15,829 bytes, SHA-256 `741b1e351a367324a4ad5f1a4f372df591d7f6c79a1518a225404264533fd724`.

All 36 final normalized captures were opened and inspected at their governed viewport dimensions. Direct visual review found no clipped words, text/rule or text/scene collisions, unreadable stress typography, missing focus state, or reduced-motion scene regression. Automated and internal visual PASS remain evidence only; human creative acceptance is still pending.

`--prepare` and `--complete` write the additive Phase 0.4R browser authorities. Phase 0.4R production updates the governed source, review and manifest paths in place, while the complete pre-repair Phase 0.4 bytes remain recoverable and verifiable at Git SHA `fec1f0e9243a9cda188c539ab1b79e4a99c30623`. Creative remains the sole owner of review-sheet pixel composition.

Human creative acceptance remains pending. Phase 1 remains locked.

## Repository boundary

Status: **PASS — projected candidate and privacy boundary verified; commit and push pending**.

`repository-impact-report.json` is the additive size and provenance authority. It measures the projected candidate against the accepted parent, keeps strict net-tree growth below the 80,000,000-byte gate, discloses exact true-new Git-object bytes, and records the required evidence-backed preferred-budget exception without deleting governed evidence. The ignored external quality-review ZIP is measured and hash-bound but is not included in the committed candidate. No production branch or Cloudflare setting is changed by this evidence package.
