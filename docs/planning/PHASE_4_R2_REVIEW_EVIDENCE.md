# Phase 4-R2 production review evidence

This is the recovery and review contract for final Phase 4-R2 deployment
evidence. It does not authorize acceptance, Phase 5, or a merge to `main`.

## Required order

Final evidence is produced only after the final deployment, from one exact,
immutable, clean Git HEAD:

1. Stage the selected Phase 4-R2 production media with
   `scripts/phase4r2-media.mjs` and complete the runtime integration.
2. Commit the complete final runtime and production-media authority. The
   evidence tools do not accept a dirty working tree or a different HEAD.
3. Deploy that exact HEAD to Cloudflare Pages.
4. Run `scripts/verify-phase4r2-deployment.mjs`. It independently binds the
   GitHub commit and branch, one explicit successful GitHub check-run ID, the
   actual Cloudflare Pages deployment ID, the Cloudflare commit and branch,
   the immutable deployment URL, the branch URL, and every asset in the
   tracked production-media manifest.
5. Run `scripts/capture-phase4r2-production-evidence.mjs` against the verified
   immutable URL, using the deployment verification report. Its destination
   must be a fresh durable external directory.
6. Run `scripts/package-phase4r2-human-review.mjs` with that external evidence
   root, the external final-production root, and another fresh external package
   directory. The packager launches a
   separate-process `--audit-existing` pass before it reports success.

Do not run capture before the immutable deployment verifier is PASS. Do not
reuse a capture directory or package directory.

## Deployment verification

The deployment verifier requires two distinct identifiers:

- `--github-check-run-id` is an actual GitHub check run attached to the exact
  expected commit. It must be completed with the exact conclusion `success`;
  neutral and skipped conclusions do not pass.
- `--cloudflare-deployment-id` is the actual Cloudflare Pages deployment ID.
  With a Cloudflare API token it is verified against the Pages deployment API.
  For this public GitHub-connected project, the verifier can instead bind the
  same UUID, account, project, commit prefix, immutable URL, branch URL and
  completed success timestamp from Cloudflare Pages' signed GitHub App check.

One is never substituted for the other. The Cloudflare API deployment URL must
equal the supplied immutable URL. Both the immutable URL and branch URL must
serve byte-identical copies of all nine manifest assets. Every deployed byte
count and SHA-256 must match the tracked
`phase-4r2-production-media-manifest.json`.
Nested paths are preserved exactly. `media/<name>` deploys as
`/media/cinematic/phase-4r2/media/<name>`, `posters/<name>` as
`/media/cinematic/phase-4r2/posters/<name>`, and the manifest as
`/media/cinematic/phase-4r2/manifests/phase-4r2-production-media-manifest.json`.
Flattening a basename fails.

Local and GitHub `main` must both be exactly
`501040c42bba30b9d9517b88a8f9857992a2dba4`, and the checked-out branch must
equal `--branch`. MIME/cache headers, deployed manifest bytes, emitted HTML and
authoritative JS/CSS are verified. A 206 range byte must equal byte zero of the
full response.

The verifier also compares the exact evidence HEAD with `main`. An identical
or behind result means that exact commit is already contained by `main` and
fails the run. Only an ahead or diverged review branch can support
`mainMerged: false`.

A `Range: bytes=0-0` request is recorded honestly for each asset and origin:

- `SUPPORTED` means HTTP 206 returned exactly one byte with the exact
  `Content-Range` total.
- `HONESTLY_IGNORED` means HTTP 200 returned the complete, hash-matching asset.

A malformed partial response fails. An ignored Range request is never reported
as supported.

Credentials are read only from named environment variables when present and
are never written to a report. The public GitHub/Cloudflare check fallback
requires no token and still performs complete deployed-byte verification.

## Exact browser evidence

The capture has exactly 13 responsive viewpoints:

| Family | Viewpoints |
| --- | --- |
| Desktop | 1440x900, 1366x650, 1280x800, 1024x768 |
| Portrait | 768x1024, 390x844, 360x800, 320x800 |
| Landscape | 844x390, 740x360, 800x360, 896x414, 900x480 |

The physical film is F001-F500, the black breathing beat is
F501-F513, and semantic ENTRY is F514-F540. Browser decoding is synchronized
with `requestVideoFrameCallback` whenever Chromium exposes it. No runtime CSS
is injected.

F501-F540 are browser-owned conceptual frames. The capture searches and
asserts `quantumPhase4.conceptualFrame` across the full 540-frame experience.
For every conceptual frame after F500, the physical decoder authority must
remain pinned to `targetFrame = 500` and `targetTime = 499 / 30`; F501-F540
must never be sought from production video. Forward recordings finish at
conceptual F540. Desktop reverse starts at F540 and ends dormant at F001. The
fast jump starts and ends at F001 and proves rapid forward and reverse travel.

The capture emits exactly:

- 16 categorical sheets: desktop production, current, orbit, Q, environment,
  portal, physical/DOM continuity, short height, mobile portrait, 320, 768,
  844 landscape, reduced motion, no-JS, 200%, and chrome visibility;
- 7 recordings: desktop forward, desktop reverse ending dormancy, desktop fast
  jump, and forward runs at 390x844, 844x390, 320x800, and 768x1024;
- 10 machine reports: deployed browser, network, performance, responsive,
  accessibility, family/codec, media failure, supporting routes, publication
  regression, and Git/deployment provenance.

The sheet milestones include dormancy, early/mid current, side/rear orbit, CRT
startup, stable Q, late approach, F500 threshold, beat begin/mid/end,
first/partial/near/settled ENTRY, and settled chrome. Capture also exercises
reduced-motion zero-video behavior, no-JS, 200%, skip pending/activation,
deep/history/reload/visibility/BFCache where available, abort/404/unsupported/
decode/timeout media failures, supporting routes, wheel/keyboard/touch inputs,
cold/warm/2Mbps+200ms loading, request family/codec/origin inventory, long
tasks/CLS/memory when exposed, accessibility/focus, and Phase 2B Operating
Field regression.

Recorder masters are temporary. Each retained recording is normalized and
then fully decoded as silent H.264 MP4, constant 30 fps, `yuv420p`. Its exact
decoded frame count is recorded for the package audit.

## Exact human-review package

The ZIP contains exactly 40 manifested payloads:

| Payload kind | Count |
| --- | ---: |
| PNG sheets | 16 |
| H.264 MP4 recordings | 7 |
| JSON reports | 17 |
| Total manifested payloads | 40 |

`README.md` and `MANIFEST.json` are the only two additional archive entries,
for exactly 42 ZIP entries. A byte-identical detached manifest is written next
to the archive.

The 17 reports are the 10 machine reports above plus 7 consolidated safe
authority reports: production media manifest; render summaries; separate
desktop, portrait, and landscape completion audits; selected/rejected encode
quality (including its visual verdict); and posters/pilot/temporal (including
the master visual verdict). Those seven explicitly project 14 final
authority inputs. Packaging fails on any extra or missing evidence or
production-root file; it never recursively redacts arbitrary reports.

The ZIP basename is exactly
`phase-4r2-final-cinematic-production-human-review.zip`.

The ZIP uses stored entries, UTF-8 safe relative paths, lexical byte order, a
fixed DOS timestamp, and CRC-32. Reversing its input order must reproduce the
same bytes. The independent audit checks:

- ZIP structure, central/local header parity, CRC-32, unique safe paths, and
  exhaustive manifest coverage;
- the fixed DOS timestamp on every local and central entry, strict original
  lexical local/central order, contiguous non-overlapping local entries, and
  exact coverage of every byte before the central directory (audit never sorts
  an observed archive to hide an order defect);
- every payload byte count and SHA-256;
- full decoded pixels for every sheet;
- H.264, an actual MP4 container, CFR 30, `yuv420p`, exactly one video stream,
  zero audio/data/subtitle/other streams, full decode, dimensions, and exact
  frame count for every recording;
- an exact report-path-to-schema allowlist and `PASS` status; a merely
  Phase-4-R2-looking schema prefix is insufficient;
- absence of private user paths, OneDrive, AppData, LocalCache, `.codex`,
  `file://`, loopback URLs, UNC paths, and token-shaped secrets;
- exclusion of raw Cycles masters, receipts, logs, Blender sources, recorder
  masters, candidate ladders, rejected encodes, and quarantine material.

The capture root, ZIP, detached manifest, audit, and result remain external and
untracked.

## Human and authorization gates

The package has exactly five gates, each with the literal value
`PENDING HUMAN REVIEW`:

1. PHYSICAL → DIGITAL CONTINUITY
2. NATIVE SCROLL + REVERSE INTEGRITY
3. RESPONSIVE + ACCESSIBLE INTEGRATION
4. MEDIA + PERFORMANCE SAFETY
5. OPERATING FIELD REGRESSION

The following values remain exact throughout the capture, reports, manifest,
audit, and result:

```json
{
  "humanAccepted": false,
  "phase5Authorized": false,
  "mainMerged": false
}
```

Machine `PASS` means only that the evidence is intact, reproducible, decoded,
private-path safe, and bound to the verified deployment. It is not human
acceptance.

## Command shapes

Use `--help` for the full option list and `--dry-run` to validate a command
shape without network, browser, media, or filesystem writes.

```text
node scripts/verify-phase4r2-deployment.mjs --help
node scripts/capture-phase4r2-production-evidence.mjs --help
node scripts/package-phase4r2-human-review.mjs --help
```

Pure contract self-tests are also available through `--self-test`. They do not
capture, deploy, or package production evidence.
