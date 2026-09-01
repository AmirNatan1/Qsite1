# Phase 7B architecture — the Operating Field

Status: pre-implementation authority. All six Phase 7B gates remain **PENDING
HUMAN REVIEW**. Phase 7C is not authorized and `main` is not merged.

## Provenance and scope

| Authority | Value |
| --- | --- |
| Repository | `AmirNatan1/Qsite1` |
| Phase 7B branch | `feature/phase-7b-operating-field-workpiece` |
| Exact parent / accepted Phase 7A | `626812c85f84ee8a48228a1f168d58c07d7943e7` |
| Accepted Phase 6 ancestor | `371e3e8a21a1d215ecaf2bf14b9f509432b230b0` |
| Frozen local/origin `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Runtime policy | Exact Node `22.16.0`; no new runtime dependency |

Phase 7B adds one homepage chapter after the accepted audience bifurcation. It
begins when the two trajectories rejoin and ends when DECIDE resolves. It does
not implement Industries, Proof, Programmes, About, Contact or complete route
reconstruction.

The physical proving-hall/cable/CRT sequence, F1–F500 mapping, H.264 assets,
posters, hashes, exact Q, digital breach, Signal Field, manifesto, bifurcation,
Field Map, typography and route shells remain frozen.

## Central law

`ONE WORKPIECE CHANGES STATE.`

The Workpiece is neither a literal product nor a sequence of replacement
scenes. It is one persistent constrained spatial condition whose boundary,
candidate routes, selected alignment, contact registration and final evidence
path accumulate as document progress changes.

## Chapter structure

The semantic and visual structure is:

1. **OPEN FIELD** — accepted bifurcated trajectories reconnect; one live signal
   enters the shared Workpiece.
2. **FRAME** — opposing pressure removes unnecessary freedom and establishes a
   testable aperture.
3. **SOURCE** — a fixed inventory of legitimate candidate paths enters from
   distinct perimeter zones without logos, names, counts or claims.
4. **ASSESS** — unsupported routes lose structural support and become route
   memory; viable geometry aligns and gains precision.
5. **TEST** — the same aperture meets a neutral governed material plane;
   abstract signal visibly registers physical resistance/contact.
6. **DECIDE** — field entropy drops, one precise magenta path remains and the
   accumulated structure becomes decision-ready evidence.
7. **RELEASE** — a quiet breathing interval bridges conceptually toward a future
   Proof chapter without building it.

The five METHOD labels remain normal semantic DOM content. The presentation is
not an ordered process list, timeline, carousel, slide deck or five repeated
cards.

## Semantic structure

- The existing manifesto remains the page's sole `h1`.
- The Operating Field uses one `h2`: `One workpiece changes state.`
- FRAME, SOURCE, ASSESS, TEST and DECIDE are `h3` headings in document order.
- Every state has one concise, truthful contextual statement.
- The sticky visual is `aria-hidden`; all essential meaning exists in the DOM.
- No interactive target is added to METHOD, so no hidden focus or target-size
  surface is created.
- The accepted Field Map remains independent and retains its exact disclosure,
  focus-containment and inert ownership.

## Persistent Workpiece visual tree

One mounted Workpiece contains fixed layers:

- far structural field and restrained material grain;
- trajectory-reconnection geometry inherited from the bifurcation;
- opposing FRAME pressure planes and one central aperture;
- deterministic SOURCE candidate paths with distinct widths, dashes and entry
  directions;
- ASSESS support rails, viable alignment and ghost-route memory;
- one neutral TEST contact plane and registration marks;
- one DECIDE signal path and quiet evidence lock;
- one bounded pointer-probe depth response for fine pointers only.

No stage inserts, removes or replaces visual nodes during scroll. The same
outline remains recognisable from FRAME through DECIDE.

## Workpiece state specification

| State | Boundary | Candidate field | Material/contact | Persistent history |
| --- | --- | --- | --- | --- |
| OPEN FIELD | broad and permissive | two trajectories reconnect | interference remains | accepted Signal Field direction |
| FRAME | opposing pressure resolves one aperture | not yet expanded | dense graphite pressure | aperture remains thereafter |
| SOURCE | FRAME aperture retained | fixed routes enter from perimeter | increased controlled interference | all route origins remain addressable |
| ASSESS | aperture gains precision | unsupported routes collapse/ghost; viable route aligns | lower entropy, clearer edges | source ghosts remain faintly visible |
| TEST | boundary hardens at contact | selected and one failed route remain legible | neutral surface intersects aperture | contact registration remains thereafter |
| DECIDE | geometry locks | one coherent route survives | quiet black and evidence registration | boundary, ghosts, alignment and contact all resolve together |

## Signal behavior

Magenta remains rare and means live signal only. It reconnects the audience
trajectories, enters the Workpiece, briefly identifies viable candidate energy,
deforms at contact and becomes one precise DECIDE path. Rejected routes use
structural greys; they do not retain magenta authority.

There is no idle signal loop. At rest the composition remains alive through
layering, occlusion, dither and route memory, not autonomous movement.

## Stage boundaries and progress

The chapter exposes one normalized progress scalar. Presentation endpoints are
authored at these initial boundaries and may be tuned only through evidence:

| Range | State authority |
| ---: | --- |
| `0.00–0.08` | OPEN FIELD / reconnection |
| `0.08–0.27` | FRAME |
| `0.27–0.46` | SOURCE |
| `0.46–0.65` | ASSESS |
| `0.65–0.84` | TEST |
| `0.84–1.00` | DECIDE / RELEASE |

Each stage value is calculated independently from current progress. A direct
jump to any position produces the complete correct state, including its history
layers, without depending on a previously completed stage.

## Native-scroll controller

Native document scroll is the sole positional authority.

1. Init or resize measures the non-sticky chapter bounds once.
2. Scroll, resize, restoration or pageshow marks the controller dirty.
3. At most one requestAnimationFrame reads the latest document position.
4. A pure projection calculates chapter progress and five bounded stage values.
5. One write phase updates CSS custom properties and the current semantic state
   marker.
6. The frame handle clears immediately; no RAF remains at rest.

The controller never calls `scroll`, `scrollTo`, `scrollIntoView`, writes
`scrollTop`, cancels wheel/touch movement, creates a timer or interpolates toward
an older position. No animation clock walks through METHOD after scrolling
stops.

The controller uses one guard and one AbortController. It tears down on a
non-persisted pagehide, cancels a pending frame when hidden, resamples on
persisted pageshow and never duplicates listeners across re-entry.

## Reverse and fast-scroll model

Reverse is not a separate animation. The same pure projection reconstructs:

`DECIDE → TEST → ASSESS → SOURCE → FRAME → OPEN FIELD`.

Fast scroll may omit intermediate samples. Because every write is derived from
the latest scalar and contains all required history layers, no queue, promise,
transition completion or delayed callback can leave the Workpiece behind the
document.

## Sticky model

Capable wide and tablet layouts use one bounded sticky visual field inside the
Operating Field chapter. Semantic passages remain normal-flow siblings and
never leave reading order. The chapter has a definite start and end; the sticky
field releases at DECIDE. There is no nested scroll container, snap point,
trapped touch behavior or repeated activation gesture.

Short landscape reduces vertical dead space and simultaneous annotation.
Narrow mobile may shorten or remove the sticky interval if validation shows it
obscures text; it never becomes a desktop crop.

## Responsive model

- **Wide desktop:** full structural depth, fixed route inventory and generous
  breathing intervals around one central Workpiece.
- **Short desktop / landscape:** lower canvas height, wider Workpiece, compact
  semantic passages and no clipped stage labels.
- **Tablet:** retained sticky identity with reduced peripheral occlusion.
- **Portrait mobile:** stronger vertical Workpiece, fewer simultaneous visible
  candidate routes and stage copy positioned outside the live signal path.
- **320px:** same central outline, minimum route inventory, no horizontal crop or
  internal word break.
- **Genuine 200%:** typography and semantic stage order win; complex peripheral
  layers may be suppressed while all five resolved meanings remain.
- **Touch:** no meaning depends on pointer response or hover.

## Pointer probe

A fine-pointer probe may reveal local depth and route memory by a few pixels. It
is bounded to the Operating Field, batches pointer movement into one frame,
settles on leave/cancel, stops while stationary and is absent for reduced motion
and touch. It never controls stage progress, changes the cursor, creates a trail
or distorts text.

## Reduced-motion model

Reduced motion keeps the complete narrative in normal document flow through
five authored resolved compositions. FRAME, SOURCE, ASSESS, TEST and DECIDE each
show the same central outline with accumulated history. Movement is limited to
direct state/opacity changes; there is no viewport-scale pan, zoom or
perspective motion. The physical opening remains bypassed under its accepted
Phase 7A behavior.

## No-JavaScript model

The enhanced sticky canvas is progressive enhancement. Without JavaScript:

- the chapter has no giant sticky runway;
- all stage headings and statements remain present and ordered;
- each stage exposes its resolved static Workpiece representation;
- the same central outline makes continuity legible;
- navigation and the native Field Map disclosure remain usable;
- understanding METHOD never requires SVG or scripting.

## Performance budget

Measured against accepted Phase 7A-R2:

| Surface | Phase 7B budget |
| --- | ---: |
| New runtime dependency | `0` |
| New production asset request | `0` |
| New production asset bytes | `0` |
| Incremental production JS | target `≤ 12,000` raw bytes |
| Incremental production CSS | target `≤ 24,000` raw bytes |
| METHOD DOM nodes | target `≤ 220` |
| METHOD SVG elements | target `≤ 90` |
| Active METHOD observers | `0` preferred; `≤ 1` if evidence requires resize observation |
| Active METHOD scroll listener | `1`, passive and abortable |
| Active RAF at rest | `0` |
| Active interval at rest | `0` |
| New network request at runtime | `1` emitted METHOD module request; `0` new asset requests |
| CLS attributable to METHOD | target `≤ 0.01` |
| Scroll-window METHOD long task | `0` tasks `≥ 50ms` attributable to controller |
| Repeated cycle | 10 forward/reverse cycles without listener, node or heap accumulation |

Any budget exception requires measurement, explanation and human review; it is
not silently promoted to PASS.

The final production build comparison against accepted Phase 7A-R2 records the
following deterministic deltas. The one added JavaScript file is the bounded
METHOD module requested by the homepage; it is not a new image, font, media or
third-party request.

| Built surface | Files | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: | ---: |
| JavaScript | `+1` | `+6,074` | `+2,178` | `+1,920` |
| CSS | `0` | `+21,630` | `+3,375` | `+2,975` |
| HTML | `0` | `+7,766` | `+1,793` | `+1,385` |
| Complete build | `+1` | `+35,470` | `+7,346` | `+6,280` |

Font, image, physical-opening media and Maradin-media byte deltas remain zero.

## Narrow implementation sequence

1. Provenance, research and architecture.
2. Semantic METHOD structure and static fallback states.
3. Persistent Workpiece base geometry and trajectory reconnection.
4. FRAME and SOURCE state projection.
5. ASSESS disorder-to-order and history retention.
6. TEST contact plane and DECIDE evidence lock.
7. Reverse, fast-scroll and lifecycle hardening.
8. Responsive, mobile, reduced-motion and no-JS authorship.
9. Accessibility and performance closure.
10. Browser evidence, deployment binding and review package.

Commits remain linear and narrow. Production `main` remains frozen.

## Human-gate status

- CONTINUOUS WORKPIECE AUTHORITY — **PENDING HUMAN REVIEW**
- OPERATING-STORY CLARITY — **PENDING HUMAN REVIEW**
- SIGNAL FIELD CREATIVE CONTINUITY — **PENDING HUMAN REVIEW**
- NATIVE-SCROLL + REVERSE INTEGRITY — **PENDING HUMAN REVIEW**
- RESPONSIVE + ACCESSIBLE AUTHORSHIP — **PENDING HUMAN REVIEW**
- PERFORMANCE + REGRESSION SAFETY — **PENDING HUMAN REVIEW**

Phase 7C is **NOT AUTHORIZED**. Main is **NOT MERGED**.
