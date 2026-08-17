# Phase 0 Asset Register

Status: controlled register for committed Phase 0 assets
Last verified: 2026-08-17

## Classification model

| Class | Meaning | Publication rule |
| --- | --- | --- |
| A | Official Quantum identity owned or explicitly authorized for public use | May ship when its exact registered hash is present |
| B | Record- or programme-specific public material with explicit approval | May ship only in the approved context and without expanding its claims |
| R | Original Quantum Phase 0 review artifact or implementation evidence | May be committed and reviewed on the non-production branch; not accepted production creative or launch media until its human gate |
| C | Internal, private or review-only evidence | Must not enter `public/`, generated output or a public preview |
| D | Prohibited, unapproved, third-party-reference or placeholder material | Must not be committed as a production asset or published |

Original Quantum Phase 0 creative artifacts are owned work rather than Q-HUB imports. They are registered below as review artifacts, not as an accepted production cinematic opening.

## Frozen Q-HUB imports

All source rows below use repository `https://github.com/AmirNatan1/Q-HUB.git` at frozen SHA `70d8b5cc193311b9548c49399dde6a014583e13a`. Source and destination are identical Git-object bytes; no crop, rewrite, recolour, transcode, recompression or metadata edit occurred.

| Asset ID | Destination | Type | Bytes | SHA-256 | Class | Approval and permitted use |
| --- | --- | --- | ---: | --- | --- | --- |
| `QH-BRAND-001` | `public/brand/quantum-full-logo-colors.svg` | SVG | 5,837 | `3b978e3a639d38e5d869afdae02d5e01eea706829ba95f1b9ee82710ffb19196` | A | Approved official full-colour identity |
| `QH-BRAND-002` | `public/brand/quantum-full-logo-white.svg` | SVG | 5,834 | `244f2bb9a95af7ce6d337e1946dedac3ace6cf01feab53c1b0c2d75e58a68032` | A | Approved official reversed identity |
| `QH-BRAND-003` | `public/brand/quantum-icon-color.svg` | SVG | 788 | `04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9` | A | Approved official compact colour identity |
| `QH-BRAND-004` | `public/brand/quantum-icon-white.svg` | SVG | 785 | `c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff` | A | Approved official compact reversed identity |
| `MARADIN-VID-001` | `public/media/maradin/maradin-field-aperture-approved.mp4` | MP4 | 3,962,341 | `daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c` | B | Approved Maradin proof media; no inferred result or metric |
| `MARADIN-IMG-001` | `public/media/maradin/maradin-field-aperture-poster-approved.jpg` | JPEG | 86,343 | `6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd` | B | Approved poster for the same proof context |
| `MARADIN-VID-002` | `public/media/maradin/maradin-test-contact-approved.mp4` | MP4 | 4,133,483 | `076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d` | B | Approved field-test media; silent presentation; no inferred outcome |
| `MARADIN-IMG-002` | `public/media/maradin/maradin-prove-field-frame-approved.jpg` | JPEG | 169,156 | `b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c` | B | Approved proof frame; factual adjacent caption required when published |
| `MARADIN-IMG-003` | `public/media/maradin/maradin-real-field-still-approved.jpg` | JPEG | 961,699 | `49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741` | B | Approved field still; no expanded relationship claim |

See `QHUB_IMPORT_LEDGER.md` for source paths, Git-object verification and the registered-but-unimported Maradin content source.

## Original Quantum Phase 0 creative sources

All rows were authored as repository-native SVG. They contain no third-party reference capture, stock model, scraped product, fabricated photograph, Q-HUB visual system, or required public meaning available only in the artwork.

| Asset ID | Committed path | Dimensions | Bytes | SHA-256 | Class | Approval state and generation |
| --- | --- | ---: | ---: | --- | --- | --- |
| `Q0-CREATIVE-001` | `artifacts/original/phase-0/spiral-geometry-study.svg` | 1800×1000 | 9,673 | `94a7995f59db85f65c7210012ebf972a4695628cea14bcb5e1fb159714d0530d` | R | Original browser-native vector; Phase 0 geometry review only |
| `Q0-CREATIVE-002` | `artifacts/original/phase-0/field-unit-concept-01-dormant-arrival.svg` | 2048×2048 | 5,562 | `e3e0bb1613ee3e4eb1eb95caeb7f69aec86aebbeed9cf5ef315fad36a56f1a42` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-003` | `artifacts/original/phase-0/field-unit-concept-02-mid-conduction.svg` | 2048×2048 | 5,913 | `0bdba2f20979ededee4f939a9c99a49a495f5931f3a0c718fd4b336d503edee3` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-004` | `artifacts/original/phase-0/field-unit-concept-03-activation-portal.svg` | 2048×2048 | 7,080 | `ceb7ce81fe85308dca94b217038180ad7c2a0138bb0cda3b07c10d30fcbfb1ee` | R | Original browser-native vector; creative gate pending |
| `Q0-CREATIVE-005` | `artifacts/original/phase-0/proving-ground-style-frame.svg` | 1920×1200 | 4,509 | `0049736f989df9a89c7db55eed8410e89da76b96e5d11c99fbf2f5bf2e734c55` | R | Original browser-native vector; final-intent style study only |
| `Q0-CREATIVE-006` | `artifacts/original/phase-0/spiral-conduction-contact-sheet.svg` | 2700×1800 | 9,596 | `7b3f3d56fd07a87aac0a864d67b249f9f8b01a0e08520e4293a715f28fcdfe4a` | R | Original nine-state browser-native vector; creative gate pending |
| `Q0-CREATIVE-007` | `artifacts/original/phase-0/portal-alignment-study.svg` | 1920×1200 | 5,229 | `0759ed1d5d177328aacac7ae3a365420778f1bfaa8165919406bf67972dd1463` | R | Original browser-native alignment vector; creative gate pending |
| `Q0-CREATIVE-008` | `artifacts/original/phase-0/mobile-composition-study.svg` | 1440×1600 | 5,077 | `74e6de5e86c341200d46b93a73eb336bc3950a96888fcd8cb67a11e5f24006ab` | R | Original separately authored mobile vector; creative gate pending |
| `Q0-CREATIVE-009` | `artifacts/original/phase-0/reduced-motion-poster-desktop.svg` | 1600×1000 | 3,457 | `7473a7a8613aa12d54b5609391466360933842bcecd48f975ce981bdea08c53f` | R | Original static dormant poster; accessibility review pending |
| `Q0-CREATIVE-010` | `artifacts/original/phase-0/reduced-motion-poster-mobile.svg` | 720×1600 | 3,503 | `11566823499cab4fbf641cf54fd68aef5eb2549b0f19bd1f866d7fdc500383ac` | R | Original static dormant poster; accessibility review pending |

## Original Phase 0 implementation evidence

The raster dimensions below are the browser-capture dimensions; viewport targets remain encoded in filenames and are separately documented in `artifacts/evidence/phase-0/BROWSER_QA.md`.

| Evidence ID | Committed path | Dimensions/type | Bytes | SHA-256 | Class |
| --- | --- | ---: | ---: | --- | --- |
| `Q0-EVIDENCE-001` | `artifacts/evidence/phase-0/baseline-1440x900.png` | 1425×891 PNG | 55,789 | `90af0e296265e974fdb93a3fad73cd5afef21e9235581ea70fb3461405ee76eb` | R |
| `Q0-EVIDENCE-002` | `artifacts/evidence/phase-0/harness-dormant-1440x900.png` | 1425×891 PNG | 74,075 | `1250d64839f37c590d7d08a5546e27f6ccbb8ca1f5d2c4a0717b3c947e718859` | R |
| `Q0-EVIDENCE-003` | `artifacts/evidence/phase-0/harness-mid-conduction-1440x900.png` | 1425×891 PNG | 52,839 | `43a95bad26e2aa23db950907f69f8440e16139a59a32cec2de0016a9d39cf7dd` | R |
| `Q0-EVIDENCE-004` | `artifacts/evidence/phase-0/harness-activation-1440x900.png` | 1425×891 PNG | 59,659 | `610854bbe1ce849cc735811d3f39cae8f6ef62b6cf819b4a4ff927da06597af5` | R |
| `Q0-EVIDENCE-005` | `artifacts/evidence/phase-0/harness-portal-1440x900.png` | 1425×891 PNG | 46,697 | `036668420442e81ed704395b19a421a7e7f6d015f79ebfdb7a2c283a5763e088` | R |
| `Q0-EVIDENCE-006` | `artifacts/evidence/phase-0/harness-operating-surface-1440x900.png` | 1425×891 PNG | 18,992 | `b8490f86175a2d0178ae0f2e99699e3f3369813e88286a0f5ced37cee798913a` | R |
| `Q0-EVIDENCE-007` | `artifacts/evidence/phase-0/harness-mobile-dormant-390x844.png` | 375×812 PNG | 35,941 | `558f1e86deb65dcc372c0a19d0ecd2ef3279cbb305a7010a68949ad0e92d05c5` | R |
| `Q0-EVIDENCE-008` | `artifacts/evidence/phase-0/harness-mobile-mid-390x844.png` | 375×812 PNG | 20,027 | `6e5b21ba2a7e5d79013d1f5c343766e1571914ea8b083531b8a52625a68377c8` | R |
| `Q0-EVIDENCE-009` | `artifacts/evidence/phase-0/harness-mobile-portal-360x800.png` | 345×767 PNG | 15,108 | `2bb4c61d767e4ad63e1e74999840533ecff068cb5477e4d6d48c31945724965e` | R |
| `Q0-EVIDENCE-010` | `artifacts/evidence/phase-0/harness-reduced-desktop-1600x1000.png` | 1585×991 PNG | 86,453 | `f372adfc7dea8bdcf037165890ba0d39d5a0d7be14923329e9fcb5c76f507d29` | R |
| `Q0-EVIDENCE-011` | `artifacts/evidence/phase-0/harness-reduced-mobile-720x1600.png` | 705×1163 PNG | 53,683 | `d1b3382d20798b5741232b23a03d9853039c6038c8f1dc72a86da160d898d1c6` | R |
| `Q0-EVIDENCE-012` | `artifacts/evidence/phase-0/keyboard-focus-1440x900.png` | 1425×891 PNG | 71,902 | `76904cb0e900f8ac118b675475bb1d145b6b0496f84a88b25ee7ac8a8c768327` | R |
| `Q0-EVIDENCE-013` | `artifacts/evidence/phase-0/static-root-1440x900.png` | 1425×891 PNG | 55,281 | `f208371b3c796aa465ba13dea43ca1a6bd603d36da77eeba5c826efa5aa1c9c6` | R |
| `Q0-EVIDENCE-014` | `artifacts/evidence/phase-0/static-root-focus-1440x900.png` | 1425×891 PNG | 56,996 | `5d371aed0859fd72584d38bd4d3490f711fb2cb5bfa8e9d0b286015937cce369` | R |
| `Q0-EVIDENCE-015` | `artifacts/evidence/phase-0/static-root-390x844.png` | 375×812 PNG | 31,089 | `463d6f3b48a3a70c17270b2c26154157a4ad7d113c94840b187542341947cf3b` | R |
| `Q0-EVIDENCE-016` | `artifacts/evidence/phase-0/encoded-seek-spike-vp9.webm` | 640×400, 2.967s VP9 WebM | 123,712 | `a8a7681ee22af7cdbd9ac2661c8a19469bab8fa03627b8368b36d022205878c2` | R |
| `Q0-EVIDENCE-017` | `artifacts/evidence/phase-0/encoded-seek-spike-report.json` | JSON | 2,283 | `220f43ac9d27bb6c7a4b808048345f218cdb7105e9275b34e08187c47974b942` | R |
| `Q0-EVIDENCE-018` | `artifacts/evidence/phase-0/encoded-seek-spike-browser.png` | 1185×889 PNG | 50,956 | `7c5510f261a686eebab44995e3962fd2986cef53eeb32b19642381c565e7051d` | R |

The Markdown browser/toolchain audit records are committed evidence ledgers but are not treated as visual/media assets. Their integrity is frozen by the final Git commit SHA.

## Explicit exclusions

- No third-party reference screenshot, recording or asset is registered for Git or public use.
- No partner logo is approved at the frozen Q-HUB SHA.
- No font binary is registered; Phase 0 uses documented system fallbacks unless licensed binaries are supplied separately.
- No Q-HUB code, CSS, route, controller, page layout, build artifact, screenshot, test output or review artifact is an asset source.
- No generic laptop, stock device, scraped model, fabricated photograph or placeholder box is permitted.
- No asset may imply a metric, result, relationship, endorsement or current team member beyond separately approved copy.

## Integrity gate

The Phase 0 candidate must recompute every committed asset SHA-256 and compare it with this register. Any unregistered binary, hash mismatch, missing approval state, private-path leak or third-party reference artifact blocks the handoff.
