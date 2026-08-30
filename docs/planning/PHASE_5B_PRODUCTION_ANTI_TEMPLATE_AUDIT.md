# Phase 5B production anti-template audit

**Audit state:** PASS with two watch items; human visual sign-off remains required.

**Audited revision:** `9a9ad82b266c663e5689c8a6884a90cfc835ef7c`

**Scope:** the production Astro DOM, route CSS, route controllers, and built-browser evidence for all nine Phase 5B routes. This is an audit of what shipped in the CP7 candidate, not a restatement of the planning matrix.

## Evidence and measurement basis

- Production source: the nine route experience components, their route-specific stylesheets, and their route controllers at the audited revision.
- Cross-route browser evidence: `phase-5b-work/cp7-responsive-accessibility/final/responsive-accessibility-final.json`, SHA-256 `E62B4D20B49170D729CE4DFB61E5F73F796EB55701678BEEACCE2AC600AFE365`.
- That report records 117 responsive cases, 54 fallback/motion variants, 18 keyboard cases, 9 mobile-navigation cases, and 18 axe cases, with zero failures and zero axe violations.
- Route-only length evidence for Proof/Maradin, SPARK/About, and Contact/404 comes from the CP4, CP5, and CP6 final reports. The first three route-only values were measured from their production route roots. Full-document measurements come from the CP7 1440 × 900 browser pass.
- H1 rectangles below are browser measurements at 1440 × 900 in document coordinates: `x / y / width / height`, in CSS pixels.
- “Sections” is the literal production `<section>` count. “Acts” and “regions” are the production `data-route-act` and `data-route-region` markers. A zero region count does not mean that a route lacks semantic structure.

## Measured production inventory

| Route | Production architecture | Sections | Acts / regions | Route-only length | Full document at 1440 × 900 | H1 rectangle | Route media |
|---|---|---:|---:|---:|---:|---|---:|
| Industry — `/for-partners/` | `pressure-system` | 4 | 4 / 0 | ≈5.30 VH | 5,262 px / 5.85 VH | 48 / 238.6 / 1,072 / 466.6 | 0 |
| Startups — `/for-startups/` | `conditional-corridor` | 0 | 4 / 0 | ≈4.47 VH | 4,509 px / 5.01 VH | 292.8 / 220.1 / 1,088 / 505.4 | 0 |
| Industries — `/industries/` | `four-territory-threshold` | 5 | 4 / 6 | ≈6.22 VH | 6,090 px / 6.77 VH | 48 / 233.9 / 795 / 347.3 | 0 |
| Proof — `/pocs/` | `archive-threshold` | 2 | 2 / 2 | 2.493 VH | 2,735 px / 3.04 VH | 48 / 347.6 / 796.1 / 286 | 1 poster |
| Maradin — `/pocs/maradin/` | `documentary-record` | 6 | 6 / 6 | 6.130 VH | 6,008 px / 6.68 VH | 48 / 239.4 / 912 / 354.2 | 4 DOM nodes; 5 governed files |
| SPARK — `/spark/` | `sealed-programme-runway` | 3 | 3 / 3 | 2.981 VH | 3,173 px / 3.53 VH | 48 / 199.1 / 688.1 / 524.5 | 0 |
| About — `/about/` | `institutional-interlock` | 3 | 3 / 3 | 3.421 VH | 3,570 px / 3.97 VH | 104.1 / 343.1 / 1,231.9 / 272.2 | 0 |
| Contact — `/contact/` | `intent-field` | 1 | 1 / 1 | 1.331 VH | 1,689 px / 1.88 VH | 48 / 338.1 / 592 / 223.4 | 0 |
| 404 — an intentional missing URL | `misregistered-recovery-field` | 1 | 1 / 1 | 1.050 VH | 1,435 px / 1.59 VH | 48 / 500.9 / 621.7 / 161.2 | 0 |

The difference between route-only and full-document lengths is the shared site header/footer, approximately 0.55 desktop viewports. Startups intentionally uses an article header followed by three ordered-list items rather than literal `<section>` elements; its four act markers remain complete and machine-visible.

## Production composition findings

### Industry — pressure system

- **First-overture proposition and topology:** a structural load field precedes a large, left-anchored, three-line H1: turn industrial needs into testable decisions. The proposition is experienced as inward pressure, not as a conventional centered hero.
- **Primary layout and dominant geometry:** mass, trace, boundary bars, search apertures, and a decision plane progressively compress and resolve. The four acts use different internal grids and offsets rather than repeating one split-section module.
- **Controller and transition grammar:** Mode C continuous document progress. The controller writes load, trace, boundary, search, and aperture variables through five named phases. The route stylesheet declares no transition; geometry follows scroll progress directly.
- **Ending:** “Bring the operating challenge,” followed by an industry-path choice and a proof-path choice.

### Startups — conditional corridor

- **First-overture proposition and topology:** an offset-right, three-line H1 opens a lateral signal corridor: bring the technology into the real world. Its desktop H1 begins 244.8 px farther right than Industry’s.
- **Primary layout and dominant geometry:** a signal map opens into branching channels, tolerance columns, an alignment field, and a final threshold. The DOM is a header plus three ordered-list acts, not a stack of generic page sections.
- **Controller and transition grammar:** Mode C continuous progress. Signal reach, branch shift, alignment offset, and field offset move through five route-specific phases. As on Industry, there is no route-level transition declaration; values are scroll-linked.
- **Ending:** SPARK status and participation restraint resolve into “Introduce the technology,” with startup-path and SPARK links.

### Industries — four-territory threshold

- **First-overture proposition and topology:** a left H1 sits beside a vertical territory band and introduces four operational terrains rather than a single service proposition.
- **Primary layout and dominant geometry:** four territories deliberately change composition: automotive horizon, logistics transfer stack, manufacturing fixture, and energy infrastructure span. A sixth region closes with paired context/method perspectives.
- **Controller and transition grammar:** Mode C continuous progress across threshold, horizon, transfer, fixture, span, and context phases. No route-level transition is declared; the territory variables follow scroll.
- **Ending:** one contextual invitation—“Bring the domain context”—and one “Start with the challenge” link.

### Proof — archive threshold

- **First-overture proposition and topology:** a quiet, left-side opening occupies roughly 46% of an archive boundary. The H1 starts lower than the other evidence-family route, leaving the upper field intentionally vacant.
- **Primary layout and dominant geometry:** a rotated outline boundary yields to a single poster aperture and a compact record: discipline columns, a 2 × 2 process, then release. The second act overlaps the threshold instead of becoming another full-screen alternating panel.
- **Controller and transition grammar:** Mode B reversible reveal. The poster uses a 520 ms clip and 420 ms opacity resolution; reduced-motion and no-JS paths expose the content without dependence on the animation.
- **Ending:** “Define what the test must answer,” then separate industry and startup choices.

### Maradin — documentary record

- **First-overture proposition and topology:** a dormant full-bleed video aperture sits behind a polygonal dark matte, with the H1 set into the matte. It opens as case evidence, not as Proof’s sparse archive index.
- **Primary layout and dominant geometry:** six named documentary acts—reality, problem, technology, test, observation, restraint—alternate and then recombine media and copy. The test becomes three columns, observation two columns, and restraint a centered close.
- **Media:** four production media elements are present in the DOM (two videos and two images), with five governed files in the media set. Videos are `preload="none"`, source-gated, user-triggered, and constrained to one active decoder.
- **Controller and transition grammar:** Mode B reversible reveals plus explicit media activation/release. Copy translation and the bounded matte clip resolve over 560 ms without dimming documentary text, captions or controls; there is no autoplay or continuous documentary scrub.
- **Ending:** a restrained “What followed” record, an evidence-question invitation, and return-to-Proof / bring-a-challenge routes.

### SPARK — sealed programme runway

- **First-overture proposition and topology:** a two-column opening puts the tall H1 on the left and a sealed gate on the right, joined by a five-column runway track.
- **Primary layout and dominant geometry:** runway, gate, and seal carry the first act; a closed-state act and a contextual value/FAQ act complete the route. It is not an application funnel or a contact-field clone.
- **Controller and transition grammar:** Mode B reversible reveal. Gate clip, track clip, and seal transform resolve at 520 ms, 560 ms, and 480 ms respectively.
- **Ending:** “Follow the startup route,” with one technology-path link and no application form.

### About — institutional interlock

- **First-overture proposition and topology:** two opposing full-height system halves meet at a joint. A wide, staggered H1 spans the join while the introductory copy begins in the right world.
- **Primary layout and dominant geometry:** opposing worlds, skewed joint rails, a light interlock, and a resolved central axis. The middle and ending use different two-part structures rather than repeating the overture.
- **Controller and transition grammar:** Mode B reversible reveal. Opacity resolves at 400 ms, translated elements at 620 ms, and the joint rail scales into alignment.
- **Ending:** “Enter through the real need,” splitting cleanly to Industry and Startups.

### Contact — intent field

- **First-overture proposition and topology:** one two-column arrival field: H1 and fragment index at left; a heading and three aligned intent rails at right.
- **Primary layout and dominant geometry:** the central seam and three rails express routing by intent. There is no false form, card grid, or visual-media slot.
- **Controller and transition grammar:** Mode A static composition. There is no route script and no route-level transition.
- **Ending:** an explicit note that no direct contact destination is configured. The route does not invent an outbound endpoint.

### 404 — misregistered recovery field

- **First-overture proposition and topology:** one two-column recovery field places the copy beside a displaced, rotated plane. The H1 begins at 500.9 px—162.8 px below Contact’s—and the decorative 404 numeral remains non-semantic.
- **Primary layout and dominant geometry:** a singular misregistered plane and repeating alignment seam, rather than Contact’s plural rail system.
- **Controller and transition grammar:** Mode A static composition. There is no route script and no route-level transition.
- **Ending:** one Home recovery action.

## Required pair comparisons

| Pair | Shared facts | Production difference | Verdict |
|---|---|---|---|
| **Industry vs Startups** | Four acts, zero media, Mode C progress, and two-link endings. Their full documents are 5.85 and 5.01 VH. | Industry begins at x=48 and compresses mass inward through boundary/search/decision phases. Startups begins at x=292.8 and opens signal laterally through branch/alignment/field phases. Industry is 0.83 route-only VH longer. | **Closest pair. Distinct, with a review watch on small-screen stacking and the shared two-choice ending scale.** |
| **Proof vs Maradin** | Both are evidence-family routes and both use Mode B reversible disclosure. | Proof is 2 acts / 2.493 VH / 1 poster, with archive void and one aperture. Maradin is 6 acts / 6.130 VH / 5 governed media files, with a matte, documentary alternation, and click-gated video. Their H1s start at y=347.6 and y=239.4. | Strongly differentiated in density, media behavior, cadence, and ending restraint. |
| **SPARK vs Contact** | Both are media-free and intentionally restrained. | SPARK is 3 acts / 2.981 VH / Mode B with a sealed gate and runway. Contact is 1 act / 1.331 VH / Mode A with a seam and three intent rails. Their H1s start at y=199.1 and y=338.1. | No template convergence. |
| **Contact vs 404** | Both are one-act, media-free, no-script Mode A routes. | Contact is a 1.331 VH plural routing field with three internal choices and an unresolved destination note. 404 is a 1.050 VH singular recovery plane with one Home action. Their H1 vertical positions differ by 162.8 px. | Static mode is shared; composition, purpose, and ending are not. |

The closest numerical length/region pair is Industries and Maradin: approximately 6.22 versus 6.13 route-only VH, with six region markers on each. That similarity is incidental. Industries is a media-free, continuously controlled set of four abstract territories; Maradin is a six-act, media-bearing documentary record with reversible reveals and user-gated playback.

## Anti-template checks

| Check | Result | Production evidence |
|---|---|---|
| Same hero topology repeated | PASS | The nine beginnings include pressure load, lateral corridor, territory threshold, archive void, media matte, sealed gate, opposing worlds, intent rails, and a displaced recovery plane. |
| Same H1 placement repeated | PASS | Desktop x positions range from 48 to 292.8 and y positions from 199.1 to 500.9; About uniquely spans the central joint. |
| Same primary layout repeated | PASS | Act counts range from 1 to 6, literal section counts from 0 to 6, and the production structures include ordered acts, territory shifts, archive overlap, documentary alternation, runway, interlock, rails, and a singular plane. |
| Same dominant geometry repeated | PASS | Each route owns a different geometric noun and directional behavior. No route-specific stylesheet uses sticky, fixed, or scroll-snap composition as a universal scaffold. |
| Same media treatment repeated | PASS | Seven routes have no media, Proof has one eager poster, and Maradin alone owns governed video activation. Empty routes do not reserve a generic media slot. |
| Same controller used everywhere | PASS | Three routes use Mode C, four use Mode B, and two use Mode A. Static routes ship no route controller. |
| Same transition grammar repeated | PASS | Mode C routes are directly scroll-linked; Mode B timings and affected properties differ; Contact and 404 declare none. |
| Same ending repeated | PASS | Endings resolve to challenge, technology, context, evidence, programme restraint, route selection, honest absence, or Home recovery according to route purpose. |

## Watch items for human review

1. **Industry / Startups:** this is the closest pair because it shares four-act depth, Mode C control, no media, and a two-choice close. Review the 390 × 844 and 844 × 390 captures side by side and confirm that inward compression versus lateral opening remains immediately legible after stacking.
2. **Industries / Maradin:** their near-equal length and region count can look similar in a spreadsheet. Review the desktop full-route cadence and confirm the intended distinction between abstract territory transitions and documentary evidence acts.

## Verdict

The production candidate passes the source-and-browser anti-template audit. No accidental universal section scaffold, visual-media split, controller mode, transition grammar, or ending pattern has replaced the route-specific architectures. **Industry / Startups is the closest pair**, and its decisive differentiator is directional behavior: Industry compresses an operating problem toward a decision; Startups opens a technology signal toward a viable field test.

This document supplies evidence for the Phase 5B human-review handoff; it does not substitute for the named reviewer’s visual approval and does not authorize a later phase by itself.
