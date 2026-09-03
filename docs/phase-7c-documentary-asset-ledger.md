# Phase 7C documentary asset ledger

Status: production-governance authority for the Phase 7C homepage Proof threshold  
Scope: the five existing Maradin documentary assets only  
Audited source HEAD: `0994a5887fa90a4558275f3e66857aca5b4d4de9`

## Decision boundary

Phase 7C introduces no new documentary binary. The homepage Proof threshold uses
one existing, production-governed poster and one ordinary semantic link to
`/pocs/maradin/`. It does not add an inline player, a second still, a derived crop,
or another proof record.

The decisions below govern **new homepage use in Phase 7C**. A `REJECT` or
`REVIEW REQUIRED` decision does not revoke an asset's already accepted use on the
frozen `/pocs/maradin/` route.

All five assets were imported byte-for-byte from
`https://github.com/AmirNatan1/Q-HUB.git` at frozen commit
`70d8b5cc193311b9548c49399dde6a014583e13a`. Source and destination paths and
SHA-256 values are identical. The assets are registered as Class B: approved
record-specific public material that may be used only in the approved Maradin
proof context and without expanding its claims.

Current bytes were independently re-hashed during Phase 7C preparation. They
match:

- `docs/planning/ASSET_REGISTER.md`;
- `docs/planning/QHUB_IMPORT_LEDGER.md`;
- the provenance attached to each media record in `src/content/proofs.ts`; and
- the frozen-import assertions in `tests/phase0.test.mjs`.

`git diff 0fe267a811b99f36cd711527da24098d154f064d..0994a5887fa90a4558275f3e66857aca5b4d4de9 -- public/media/maradin`
is empty: the governed media bytes have not changed since import.

## Asset decisions

### MARADIN-IMG-001 — selected homepage documentary aperture

| Field | Audited value |
| --- | --- |
| Repository path | `public/media/maradin/maradin-field-aperture-poster-approved.jpg` |
| File name | `maradin-field-aperture-poster-approved.jpg` |
| Type and dimensions | JPEG, 1920 × 1080, 16:9 |
| Byte size | 86,343 |
| SHA-256 | `6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd` |
| Source authority | Frozen Q-HUB commit `70d8b5cc193311b9548c49399dde6a014583e13a`; identical source and destination path and hash |
| Already production-governed | Yes — Class B, `publicApproved: true`, `publicationStatus: approved`; explicitly registered as the approved poster for the Maradin proof context and as the Proof/index poster |
| People visible | None observed. No person is identifiable. |
| Logos visible | The distant test vehicle carries magenta/white livery, but no partner wordmark is legible in the governed full-frame presentation. |
| Partner identity visible | No readable partner identity at normal full-frame presentation. The vehicle and field setting remain documentary context only. |
| Embedded claims | None. No text, metric, result, procurement, deployment, commercial-success, or endorsement claim is embedded in the image. |
| Proposed crop or time range | Preserve the exact governed JPEG. Use the full 16:9 frame; responsive CSS fitting may adjust presentation without producing or committing a derivative asset. Do not crop toward vehicle branding. |
| Intended homepage use | The sole static documentary aperture at the Maradin Proof threshold, with intrinsic `width="1920"` and `height="1080"`, truthful alternative text, and an ordinary `/pocs/maradin/` link. |
| Publication status | Approved for this same Maradin proof context. Phase 5A explicitly identifies this 86,343-byte file as the sufficient Proof/index asset, and accepted Phase 1 previously used it on Home and Proof. |
| Phase 7C decision | **ACCEPT** |
| Reason | It is the lowest-risk and lowest-cost existing bridge from abstract field architecture to real evidence. It establishes documentary reality without adding a player, decoder, person, readable partner mark, or new claim. |

Production alternative text remains:

> A vehicle on a road at night in a real field environment.

### MARADIN-IMG-002 — projected field frame

| Field | Audited value |
| --- | --- |
| Repository path | `public/media/maradin/maradin-prove-field-frame-approved.jpg` |
| File name | `maradin-prove-field-frame-approved.jpg` |
| Type and dimensions | JPEG, 1920 × 1080, 16:9 |
| Byte size | 169,156 |
| SHA-256 | `b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c` |
| Source authority | Frozen Q-HUB commit `70d8b5cc193311b9548c49399dde6a014583e13a`; identical source and destination path and hash |
| Already production-governed | Yes — Class B, `publicApproved: true`, `publicationStatus: approved`; registered as an approved proof frame |
| People visible | At least four people are partially visible at the upper and side edges as cropped legs, lower bodies, or an edge torso. No face is visible or identifiable. |
| Logos visible | A small portion of the magenta/white vehicle is visible at the upper-right edge; no partner logo or wordmark is legible in the governed full frame. |
| Partner identity visible | Not legibly identified by the frame itself. Do not infer a relationship from the vehicle fragment. |
| Embedded claims | No textual, numeric, performance, or outcome claim. The red stop-hand projection is documentary subject matter, not proof of a result beyond the observed frame. |
| Proposed crop or time range | None for the Phase 7C homepage. Existing route use remains unchanged. Any future publication must retain a factual adjacent caption as required by the asset register. |
| Intended homepage use | None. It was considered as a stronger technology-contact frame but is not needed in addition to the selected poster. |
| Publication status | Approved on the Maradin record with a factual adjacent caption. It is not the designated Proof/index poster. |
| Phase 7C decision | **REJECT** |
| Reason | Adding it would turn truthful scarcity into a multi-image proof block, introduce partially visible people, and require another caption and request without improving the bounded homepage threshold. |

The existing safe factual caption on the Maradin route is:

> A projected stop-hand symbol observed on the road surface during field testing.

### MARADIN-IMG-003 — real-field vehicle still

| Field | Audited value |
| --- | --- |
| Repository path | `public/media/maradin/maradin-real-field-still-approved.jpg` |
| File name | `maradin-real-field-still-approved.jpg` |
| Type and dimensions | JPEG, encoded 3840 × 2160 with EXIF Orientation 6; intended portrait presentation |
| Byte size | 961,699 |
| SHA-256 | `49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741` |
| Source authority | Frozen Q-HUB commit `70d8b5cc193311b9548c49399dde6a014583e13a`; identical source and destination path and hash |
| Already production-governed | Yes — Class B, `publicApproved: true`, `publicationStatus: approved`; exact bytes and Orientation 6 are frozen |
| People visible | None observed. |
| Logos visible | Prominent Hyundai emblem and wordmark, `HYUNDAI CRADLE`, and the large Quantum Q vehicle livery. The vehicle licence plate is also visible. |
| Partner identity visible | Yes — Hyundai and Hyundai CRADLE are prominent documentary context. |
| Embedded claims | No metric or result claim, but the prominent branded vehicle can be misread as an endorsement, partnership, procurement, deployment, or commercial-success claim if detached from its bounded field-record context. |
| Proposed crop or time range | None for the Phase 7C homepage. Preserve the existing frozen Maradin-route CSS portrait treatment; do not create a derivative, strip metadata, or destructively re-encode. |
| Intended homepage use | None unless separately reviewed and approved by a human for this new prominent placement. |
| Publication status | Approved only as a bounded Maradin field still with no expanded relationship claim. Phase 5A recorded increased Hyundai/vehicle documentary prominence as an unresolved human decision. |
| Phase 7C decision | **REVIEW REQUIRED** |
| Reason | Existing route approval does not clearly authorize enlarged homepage prominence for readable partner branding. Phase 7C prohibits using an asset marked `REVIEW REQUIRED`. |

### MARADIN-VID-001 — field-aperture video

| Field | Audited value |
| --- | --- |
| Repository path | `public/media/maradin/maradin-field-aperture-approved.mp4` |
| File name | `maradin-field-aperture-approved.mp4` |
| Type and dimensions | H.264 High, yuv420p, 1920 × 1080, 30000/1001 fps, 96 frames, 3.2032 seconds; video-only, no audio stream |
| Byte size | 3,962,341 |
| SHA-256 | `daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c` |
| Source authority | Frozen Q-HUB commit `70d8b5cc193311b9548c49399dde6a014583e13a`; identical source and destination path and hash |
| Already production-governed | Yes — Class B, `publicApproved: true`, `publicationStatus: approved`; approved Maradin proof media with no inferred result or metric |
| People visible | No clearly identifiable person observed; any vehicle occupant is not discernible at the presented scale. |
| Logos visible | Hyundai/Hyundai CRADLE and Quantum vehicle livery are visible in the opening field frames; the vehicle licence plate is visible. |
| Partner identity visible | Yes, during the vehicle sequence. It remains documentary context, not endorsement. |
| Embedded claims | A burned-in subtitle near the end reads `These lasers, embedded in the vehicle`. No numeric or outcome claim is present. |
| Proposed crop or time range | None for the Phase 7C homepage. Do not cut, transcode, extract, or create a new poster from the clip. |
| Intended homepage use | None. The existing `/pocs/maradin/` user-initiated player remains frozen and unchanged. |
| Publication status | Approved on the Maradin route only under its existing user-initiated, `preload="none"`, no-source-before-intent, one-decoder lifecycle contract. |
| Phase 7C decision | **REJECT** |
| Reason | A homepage player is not justified. The selected static poster carries the documentary transition at a fraction of the network cost and without a decoder, lifecycle surface, readable partner identity, or embedded-text context. |

### MARADIN-VID-002 — test-contact video

| Field | Audited value |
| --- | --- |
| Repository path | `public/media/maradin/maradin-test-contact-approved.mp4` |
| File name | `maradin-test-contact-approved.mp4` |
| Type and dimensions | H.264 High, yuv420p, 1920 × 1080, 30000/1001 fps, 150 frames, 5.005 seconds; video-only, no audio stream |
| Byte size | 4,133,483 |
| SHA-256 | `076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d` |
| Source authority | Frozen Q-HUB commit `70d8b5cc193311b9548c49399dde6a014583e13a`; identical source and destination path and hash |
| Already production-governed | Yes — Class B, `publicApproved: true`, `publicationStatus: approved`; approved silent field-test media with no inferred outcome |
| People visible | One driver is shown in shadowed profile; a face is visible and must be treated as a person/potential identity. |
| Logos visible | Prominent Hyundai emblem and wordmark, `HYUNDAI CRADLE`, large Quantum Q livery, a small KIA vehicle badge, and the vehicle licence plate. |
| Partner identity visible | Yes — Hyundai and Hyundai CRADLE are prominent throughout close vehicle passes. |
| Embedded claims | The hood carries the label `TESTING CAR`. No numeric result, performance caption, or audio claim is present. |
| Proposed crop or time range | None for the Phase 7C homepage. Do not cut, transcode, extract, or create a new still from the clip. |
| Intended homepage use | None. The existing `/pocs/maradin/` user-initiated player remains frozen and unchanged. |
| Publication status | Approved on the Maradin route only under its existing user-initiated, `preload="none"`, no-source-before-intent, one-decoder lifecycle contract. |
| Phase 7C decision | **REJECT** |
| Reason | It has the strongest person, partner-logo, plate, network, and decoder exposure of the governed set. It adds no necessary homepage meaning beyond the selected poster. |

## Homepage selection and byte budget

| Measure | Phase 7C decision |
| --- | ---: |
| Existing governed Maradin still bytes in repository | 1,217,198 |
| Existing governed Maradin video bytes in repository | 8,095,824 |
| Existing governed Maradin media total | 9,313,022 |
| New Phase 7C documentary binary files | 0 |
| New Phase 7C documentary binary bytes | 0 |
| Homepage documentary asset selected | 1 existing JPEG |
| Selected asset bytes | 86,343 |
| Homepage Maradin video requests before intent | 0 |
| Homepage Maradin video sources/decoders | 0 |

The selected poster already ships in `public/media/maradin/`; Phase 7C adds no
asset payload to the repository or deployment. Loading the new homepage Proof
aperture may add one 86,343-byte image request to the homepage journey. Its exact
frozen bytes are already appropriately compact and must not be re-encoded merely
to claim a smaller delta.

The homepage must provide intrinsic dimensions to prevent layout shift and use
the existing approved alternative text. No image or video source may be attached
to supporting routes as a side effect of the homepage chapter.

## Approved copy and claim boundary

The only public Proof record remains:

> Maradin — Dynamic Ground Projection

The safest existing concise contextual authority is the approved summary:

> A real-world field test of Maradin’s MEMS-based laser scanning technology for vehicle‑to‑road visual communication.

Phase 7C may use that exact title and summary without expansion. It must not turn
visual vehicle context into a partner claim. In particular:

- Hyundai/CRADLE and vehicle branding are documentary facts, not endorsement or
  partnership claims;
- the location, facility, vehicle, and equipment ownership must not be inferred;
- no public partner roster or logo wall may be derived from the media;
- public partner, team, metric, and update collections remain empty;
- no numeric result, KPI, scale, procurement, contract, deployment, production,
  sales, investment, or commercial-success claim may be introduced;
- the approved EcoMotion/OI Lounge next-step language on the Maradin route must
  not be imported into the concise homepage threshold; and
- the selected image establishes that a field test was documented, not that a
  commercial or technical outcome was achieved.

The homepage Proof threshold contains one truthful record and no anonymous,
confidential, placeholder, or additional case. Truthful scarcity is the
publication rule.

## Final Phase 7C asset disposition

| Asset | Homepage decision |
| --- | --- |
| `maradin-field-aperture-poster-approved.jpg` | **ACCEPT — selected** |
| `maradin-prove-field-frame-approved.jpg` | **REJECT — not needed in addition to the selected poster** |
| `maradin-real-field-still-approved.jpg` | **REVIEW REQUIRED — do not use** |
| `maradin-field-aperture-approved.mp4` | **REJECT — no homepage player** |
| `maradin-test-contact-approved.mp4` | **REJECT — no homepage player** |

Only the exact `ACCEPT` asset is authorized for the Phase 7C homepage production
diff. No reviewed or rejected asset may be newly referenced there.
