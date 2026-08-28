# Phase 5A Supporting-Route Preproduction

Status: CP3 route-by-route creative architecture; implementation-ready planning only; human review pending; Phase 5B is not authorized

Accepted parent: `47a6f3cc7f464b09c9c143cac273c2a1f5a35bfa`

Routes: `/for-partners/`, `/for-startups/`, `/industries/`, `/pocs/`, `/pocs/maradin/`, `/spark/`, `/about/`, `/contact/`, and the real `404`

## 1. Preproduction boundary

This document defines the route briefs that a local-only Phase 5A design lab and external human-review package must prove. It does not change or authorize changes to a public route.

Throughout CP3, CP4 and CP5:

- the existing supporting-route, shared-layout, content, navigation, style and approved-asset bytes remain frozen;
- speculative compositions remain under an isolated local prototype path outside `src/` and `public/`;
- generated screenshots, videos, contact sheets, PDFs and the ZIP remain external and untracked;
- current public copy remains authoritative;
- chapter names in brackets are design descriptors, not proposed public copy;
- no new public claim, person, team, partner, facility, metric, outcome, contact destination or route may be inferred;
- no confidential or connected-Drive material may enter a prototype or review package without separate approval;
- Phase 5B begins only after all six Phase 5A human gates receive explicit ACCEPT.

## 2. Capture and naming contract

The later CP4 capture plan must use these route prefixes:

| Route | Prefix |
| --- | --- |
| For industry | `FI` |
| For startups | `FS` |
| Industries | `IN` |
| Proof | `PR` |
| Maradin | `MA` |
| SPARK | `SP` |
| About | `AB` |
| Contact | `CO` |
| 404 | `NF` |

State suffixes:

- `D##` — 1440×900 desktop storyboard state;
- `SD` — 1366×650 short-desktop state;
- `TL` — 1024×768 tablet-landscape state;
- `TP` — 768×1024 tablet-portrait state;
- `P##` — 390×844 portrait storyboard state;
- `N` — 320×800 narrow-mobile state;
- `L` — 844×390 short-landscape composition;
- `M##` — signature-motion key state;
- `RM` — reduced-motion resolved state;
- `NJ` — actual JavaScript-disabled state;
- `NAV` — open-mobile-navigation state;
- `Z200` — 200% text state;
- `FF` — fallback-font state.

Every route review folder must ultimately contain a full desktop contact sheet, portrait contact sheet, short-landscape composition, representative motion states, material/detail board, typography hierarchy, responsive sheet, reduced-motion state, no-JS state, media requirements, publication constraints, performance plan and implementation risks. None of those derivatives is created or tracked at CP3.

## 3. Shared prototype behavior

- Semantic content exists in the HTML before enhancement.
- The lab adds an `is-enhanced` class only after required elements and motion preferences are known.
- Without that class, every route presents its resolved static composition.
- No prototype uses production route URLs, a public preview path, external network assets or a package runtime.
- Scroll and resize may request one frame; there is no continuous loop.
- Mode C progress is computed from current document position and cached local bounds.
- Mode B states toggle symmetrically on entry and exit.
- Fast and reverse scrolling resolve directly to the latest state.
- Review controls are local-lab controls and never resemble a public interface.
- No route prototype submits, stores, sends or fetches user data.

---

# 4. For industry — `/for-partners/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `For industry` |
| Existing H1 | `Turn industrial needs into testable decisions.` |
| Spatial thesis | operational pressure becomes a precise challenge aperture, test threshold and decision exit |
| Signature behavior | opposing material masses progressively bound one useful evidence route |
| Motion mode | Mode C — local document-progress mapping |
| Transition in | destination overture is settled immediately; no homepage or cross-page animation |
| Transition out | the resolved challenge edge conceptually becomes Proof's evidence aperture or Contact's industry intent terminus |
| Datum | ownership-and-criteria edge; active only during bounding and test crossing |
| Media decision | no real media; abstract pressure architecture is primary |

1. **Purpose**

   Show how a real industrial challenge is framed, sourced, narrowed, tested and moved toward a responsible decision without turning Quantum into a generic consultancy catalogue.

2. **Audience**

   Industrial operators, challenge owners, operational stakeholders and innovation leads who possess a real need or recurring challenge context.

3. **User question answered**

   “Can Quantum help turn this operating pressure into a useful test and evidence-based next step?”

4. **Approved content hierarchy**

   Preserve the existing H1 and introduction; challenge-first framing; five approved capability descriptions; Frame / Source / Assess / Test / Decide sequence; defined-challenge and ongoing-context structures; the minimal CHAMP proposition; operating-context statement; Proof and Contact links. Do not add partner identities, examples, metrics or promises.

5. **Proposed page chapters**

   1. `[Pressure overture]` — existing H1 and challenge-first introduction.
   2. `[Boundary]` — operating context, owner and evidence criteria become explicit.
   3. `[Search field]` — sourcing and assessment narrow possibilities without a candidate dashboard.
   4. `[Test threshold]` — a bounded POC crosses into meaningful conditions.
   5. `[Decision route]` — evidence resolves toward an appropriate next step.
   6. `[Operating context]` — defined challenge, ongoing context and minimal CHAMP relationship.
   7. `[Release]` — existing Proof and industry-contact routes.

6. **Emotional and spatial arc**

   Begin with controlled pressure and incomplete definition. Reduce ambiguity through increasingly exact boundaries. Reach maximum compression at the test threshold. Release into a calm, narrow decision plane rather than a triumphal result.

7. **Signature behavior**

   Two asymmetrical graphite masses define a large unresolved void at `FI-M01`. As local progress advances, the void becomes a challenge boundary at `FI-M02`; one edge continues through sourcing and assessment; the route crosses a narrow test gate at `FI-M03`; completed structure aligns into one decision exit at `FI-M04`. Semantic chapters never move, disappear or wait for these states.

8. **Motion verbs, direction and transitions**

   Primary verbs are Focus → Cross → Resolve. Reverse restores decision exit → test gate → broad challenge boundary → unresolved pressure. Fast scroll jumps to current state without catch-up. Entry is a fully available overture; exit is normal navigation to Proof or Contact. No page-transition controller is permitted.

9. **Material vocabulary and datum**

   Compressed matte graphite, load shadow, one pale criteria edge, a narrow neutral aperture and a short magenta critical segment only while a boundary is active. The datum is a functional ownership/criteria edge, not a decorative underline. No industrial photograph, steel texture, gauge or faux telemetry.

10. **Media strategy**

    Real media is not essential. Existing repository media is not relevant outside the Maradin proof. Connected Drive review is not required. A later authentic operating-context image would require a new route-specific human gate; the approved fallback is the complete abstract pressure composition.

11. **Publication constraints**

    No partner wall, logo, named relationship, facility, metric, client result, procurement implication or commercial-success claim. CHAMP remains only `An industry-side programme context.` Existing “commercialisation and decision support” language must not be visualized as a guaranteed result. The public label remains exactly `For industry` even though the path remains `/for-partners/`.

12. **Desktop storyboard**

    - `FI-D01` — wide pressure overture; H1 occupies the protected semantic field.
    - `FI-D02` — challenge boundary gains owner/context/criteria precision.
    - `FI-D03` — sourcing field narrows through layered apertures, not cards.
    - `FI-D04` — test gate is the highest-pressure spatial state.
    - `FI-D05` — aligned decision exit, minimal CHAMP context and next routes.

13. **Portrait storyboard**

    - `FI-P01` — vertical load above a full-width challenge statement.
    - `FI-P02` — one vertical criteria edge connects normal-flow process chapters.
    - `FI-P03` — test threshold opens into a full-width decision/route area.

    Geometry must not sit behind long copy. Process stages remain consecutive and touch-safe.

14. **Short-landscape storyboard**

    `FI-L` uses a compact left text column and a shallow compressed aperture on the right. The H1, intro and at least one next route remain visible without requiring a viewport-height overture. Open navigation at `FI-NAV` may cover geometry but not the focused route control.

15. **Reduced-motion version**

    Display the fully resolved open challenge aperture and all chapters in normal flow. No pressure interpolation, line travel or masked threshold. Magenta is limited to focus and the current critical label.

16. **No-JS version**

    Identical semantic order with a static pressure chamber at its resolved state. No empty `data-progress` region, hidden process content or reserved effect height.

17. **Performance strategy**

    Incremental target: 5–7 KB CSS, 1.5–2.5 KB raw route JS, zero media and no dependency. Cache section bounds; write at most two transform custom properties and one clip/edge property in one input-driven frame. Target fewer than three composited layers and no route-induced task over 50 ms.

18. **Implementation risks**

    The composition could regress into capability cards, over-compress copy, resemble a mechanical dashboard or imply that a decision is always successful. Clip-path paint cost and large blurred shadows are technical risks. Remove the effect before reducing semantic clarity.

19. **Dependencies**

    Existing approved copy, typography, tokens, BaseLayout navigation and internal links; optional future shared local-progress helper. No media, API, CMS, external library or content dependency.

20. **Open questions requiring human approval**

    Accept or redirect the pressure/aperture thesis; approve whether CHAMP remains in the final route hierarchy or is subordinated further; approve the degree of spatial compression at the test state; approve any future copy reordering separately from this design gate.

---

# 5. For startups — `/for-startups/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `For startups` |
| Existing H1 | `Bring your technology into the real world.` |
| Spatial thesis | a technology signal enters a larger operating system and aligns with real constraints |
| Signature behavior | an off-axis route narrows through relevance and fit before one field-access threshold |
| Motion mode | Mode C — local document-progress mapping |
| Transition in | resolved exterior signal and complete semantic route |
| Transition out | corridor becomes SPARK's runway or terminates at Contact's startup intent |
| Datum | alignment rail that ends after field entry |
| Media decision | no real media |

1. **Purpose**

   Explain how an MVP+ technology can move from capability and readiness toward relevant industrial context, a bounded POC question and evidence—without promising an outcome.

2. **Audience**

   Startup founders, technical leaders and deployable technology teams with a functioning capability and credible industrial use case.

3. **User question answered**

   “Is our technology ready and relevant for an industrial route, and what must a useful field test establish?”

4. **Approved content hierarchy**

   Preserve the existing H1 and intro; five readiness conditions; six approved support/context areas; Readiness / Relevance / Design / Field / Evidence sequence; SPARK proposition and `Applications closed`; explicit no-guarantee participation note; startup contact path. Do not add product examples, customer logos, funding language or acceptance criteria presented as scoring.

5. **Proposed page chapters**

   1. `[Exterior signal]` — capability enters from outside the operating field.
   2. `[Readiness]` — functioning technology, use case, team and measurable value hypothesis.
   3. `[Relevance corridor]` — capability aligns with an identified operating need.
   4. `[Field threshold]` — POC design and real constraints become visible.
   5. `[Evidence plane]` — the route resolves to learning and an appropriate next step.
   6. `[SPARK context]` — closed programme path, clearly separate from general introduction.
   7. `[Release]` — existing non-application contact route.

6. **Emotional and spatial arc**

   Begin with possibility and small scale. Increase the weight of surrounding operating conditions. Narrow toward fit without creating a selection score. Cross into the field only after relevance and readiness align. End with sober evidence rather than promised adoption.

7. **Signature behavior**

   A compact signal route enters a large, off-axis graphite field at `FS-M01`. Tolerance rails narrow around it at `FS-M02`; the route becomes aligned but not accelerated at `FS-M03`; it crosses one field-access boundary at `FS-M04`; the rail ends and leaves a quiet evidence plane. The effect never resembles a funnel, loading bar or acceptance meter.

8. **Motion verbs, direction and transitions**

   Conduct → Focus → Cross → Resolve. Reverse returns evidence → threshold → misalignment → exterior signal. Fast scroll resolves instantly. Normal navigation to SPARK carries only conceptual corridor/runway continuity. Navigation to Contact targets `#for-startups` natively.

9. **Material vocabulary and datum**

   Exterior black void, narrow alignment rail, graphite tolerance plates, precise pale threshold and restrained magenta at the current alignment point. The datum ends after field entry. Avoid startup gradients, glowing product orbs, accelerator graphics and venture-capital visual language.

10. **Media strategy**

    No media is essential. Do not use generic founder, laptop, product-demo, office or factory imagery. Repository media is insufficient and intentionally unnecessary. No Drive review is required. The complete abstract alignment corridor is the approved fallback.

11. **Publication constraints**

    No guaranteed POC, industrial access, customer, procurement, investment or success. `Relevant industrial access` remains conditional on an identified need. SPARK remains closed; no application, waitlist, date or cohort claim. Do not turn readiness criteria into exclusion scores or imply that passing them guarantees entry.

12. **Desktop storyboard**

    - `FS-D01` — small signal against a large settled operating field.
    - `FS-D02` — readiness conditions establish surrounding tolerance.
    - `FS-D03` — relevance corridor narrows around capability and use case.
    - `FS-D04` — field threshold and POC design reach maximum structural weight.
    - `FS-D05` — evidence plane, closed SPARK context and general startup route.

13. **Portrait storyboard**

    - `FS-P01` — signal enters at the top edge, separate from H1.
    - `FS-P02` — readiness and relevance become sequential vertical tolerance bands.
    - `FS-P03` — field boundary opens into evidence and SPARK status.

    No sideways corridor simulation and no copy over a narrow animated rail.

14. **Short-landscape storyboard**

    `FS-L` places the aligned signal and threshold in a shallow right field, with H1 and intro left. The SPARK closed state is readable without scrolling into an apparent application surface. `FS-NAV` verifies the open menu and long startup heading coexist.

15. **Reduced-motion version**

    Use a resolved static alignment corridor and open field threshold. All readiness, evidence and guarantee limitations remain visible. No travelling signal.

16. **No-JS version**

    Static resolved rails and complete content. General contact and SPARK navigation work as normal links; native document navigation never depends on route progress.

17. **Performance strategy**

    Incremental target: 5–7 KB CSS, 1.5–2.5 KB JS, zero media. A shared progress helper may set two translation values and one boundary state. Fewer than three active composited layers; no blurred full-screen field or continuous loop.

18. **Implementation risks**

    The corridor could read as a sales funnel, qualification dashboard or guaranteed path. Scale contrast could dwarf content on mobile. A moving signal could become decorative. Keep the signal short-lived and remove the mapper on portrait if static composition is stronger.

19. **Dependencies**

    Existing content and publication guardrails, SPARK record/status, typography/tokens, internal routes, optional shared local-progress helper. No external media, library, API, CMS or form.

20. **Open questions requiring human approval**

    Accept or redirect the alignment-corridor thesis; approve how strongly the field threshold should imply conditional access; approve the relationship between the startup route and SPARK without making SPARK the only path; approve any later copy reordering separately.

---

# 6. Industries — `/industries/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `Industries` |
| Existing H1 | `Industry is where relevance is tested.` |
| Spatial thesis | four distinct operating territories alter the conditions of a useful test |
| Signature behavior | native vertical passage transforms four materially recognizable fields |
| Motion mode | Mode C — local document-progress mapping |
| Transition in | Automotive territory is immediately available; no selection UI |
| Transition out | current territory resolves toward For industry or Contact; no selected filter persists |
| Datum | local seam or implied alignment; absent in at least one territory |
| Media decision | no real media; abstract territory system is primary |

1. **Purpose**

   Show that the operating context changes the evidence question, using exactly four approved public domains as distinct territories rather than taxonomy cards.

2. **Audience**

   Industry challenge owners, technology teams and ecosystem visitors evaluating domain relevance.

3. **User question answered**

   “Which approved operating territory is relevant, and what kind of constraint does it bring to a test?”

4. **Approved content hierarchy**

   Preserve the existing H1 and introduction; exactly Automotive & Mobility, Logistics & Supply Chain, Industry 4.0 / Advanced Manufacturing, and Energy & Infrastructure with their approved contextual descriptions; seven subordinate cross-domain technology categories; context-first method; industry-contact route. Do not add a fifth marker, teaser or implied domain.

5. **Proposed page chapters**

   1. `[Territory overture]` — all four domains belong to one connected field.
   2. `[Automotive]` — velocity, low horizon and human/vehicle operating context.
   3. `[Logistics]` — stacking, transfer, routing and physical infrastructure.
   4. `[Manufacturing]` — tooling, fixtures, tolerance and process constraint.
   5. `[Energy]` — scale, load, continuity and tall spans.
   6. `[Cross-domain capability]` — technology categories remain subordinate and non-filtering.
   7. `[Field method and release]` — challenge-first CTA.

6. **Emotional and spatial arc**

   Begin with contextual breadth. Move through four peaks that feel physically different while retaining one material world. Avoid escalation that implies one industry is more important. End by returning attention from taxonomy to the operating challenge.

7. **Signature behavior**

   Local progress transforms one active background field and a peripheral adjacent edge:

   - `IN-M01` Automotive — low, long perspective planes and velocity horizon;
   - `IN-M02` Logistics — stacked transfer volumes and deep corridor;
   - `IN-M03` Manufacturing — rigid fixture and tolerance gate;
   - `IN-M04` Energy — tall load-bearing spans and infrastructural void.

   Territory identity must remain recognizable after labels are temporarily hidden in the local lab. This is a visual QA exercise only; production labels always remain visible.

8. **Motion verbs, direction and transitions**

   Cross → Release between territories. Reverse reconstructs the exact preceding material field. Fast scroll selects the current territory without animating through skipped states. Entry and exit are normal navigation. There is no carousel, tab state, horizontal scroll or cross-page selection persistence.

9. **Material vocabulary and datum**

   Automotive uses low graphite velocity slabs; Logistics uses stacked charcoal volumes and transfer gaps; Manufacturing uses rigid matte fixtures, crisp tolerance edges and a controlled cylinder/plane relationship; Energy uses tall graphite spans, load shadow and deep void. The datum becomes a local seam, joint, gap or implied axis and is absent when the territory geometry already communicates direction.

10. **Media strategy**

    Real media is not essential. Approved Maradin imagery may not stand in for Automotive or the other industries. A four-image media set would require equal quality and four independent publication reviews, so it is not required. No Drive review is needed. Abstract territories are the complete fallback and primary design.

11. **Publication constraints**

    Exactly four public industries. Defense and dual-use remain absent from headings, metadata, alt text, labels, filenames and visual annotation. Cross-domain technology categories must not become filters, tabs, territories or scale claims. Abstract structures may not be captioned as Quantum facilities.

12. **Desktop storyboard**

    - `IN-D01` — all-four territory overture with one connected field, not four panels.
    - `IN-D02` — Automotive low horizon and velocity planes.
    - `IN-D03` — Logistics transfer corridor and stacks.
    - `IN-D04` — Manufacturing fixture and tolerance state.
    - `IN-D05` — Energy spans and load.
    - `IN-D06` — technology categories recede; operating challenge returns.

13. **Portrait storyboard**

    - `IN-P01` — Automotive full-width vertical field.
    - `IN-P02` — Logistics transition and readable title/copy.
    - `IN-P03` — Manufacturing fixture composition.
    - `IN-P04` — Energy spans and route release.

    Each territory is a complete vertical passage, not a cropped desktop panorama.

14. **Short-landscape storyboard**

    `IN-L` uses one recognizable active territory at a time, with heading and description in a protected side band. No viewport-height chapter or sideways gesture. `IN-NAV` verifies the open two-column mobile navigation does not cause overflow over the active territory.

15. **Reduced-motion version**

    Four static, full-width territory passages in normal flow. Distinction comes from geometry, scale and density rather than transition. No background interpolation or lateral travel.

16. **No-JS version**

    Same four static territories and semantic descriptions. All categories and the CTA remain visible. No territory is hidden behind an inactive-state class.

17. **Performance strategy**

    Incremental target: 7–10 KB CSS, 2.5–4 KB JS, zero media. Cache all territory bounds together. Keep only the current and adjacent edge in transformed layers; cap active composited layers at four. Mobile and reduced motion initialize no mapper. Remove masks before accepting sustained paint or scroll delay.

18. **Implementation risks**

    The design could regress into four large cards, make domains legible only through labels, imply a hidden fifth territory, or overuse 100-viewport-height sections. Multiple masks can create paint cost. Long manufacturing and logistics headings are wrapping hard gates at 320 px and 200% text.

19. **Dependencies**

    Frozen `PUBLIC_INDUSTRIES`, existing approved descriptions and technology categories, route typography/tokens, optional shared progress helper. No media, data source, API, library or filter controller.

20. **Open questions requiring human approval**

    Accept or redirect each of the four territory identities; approve the transition rhythm without hierarchy among domains; approve an entirely abstract route; approve whether cross-domain technology categories remain in their current late-page position.

---

# 7. Proof — `/pocs/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `Proof` |
| Existing H1 | `Evidence before scale.` |
| Spatial thesis | one quiet evidence archive with one exceptionally deep public record |
| Signature behavior | a single archive boundary opens into Maradin; no library grid appears |
| Motion mode | Mode B threshold state by default; Mode C only if human review proves a meaningful bounded opening |
| Transition in | complete one-record field is available immediately |
| Transition out | ordinary navigation gives way to Maradin documentary reality |
| Datum | aperture edge that disappears when the record opens |
| Media decision | approved Maradin poster only; no video |

1. **Purpose**

   Establish Quantum's evidence discipline and present truthful public scarcity as confidence, with Maradin as the sole public record.

2. **Audience**

   Industry, technology and ecosystem visitors evaluating whether Quantum's claims are grounded in real testing.

3. **User question answered**

   “What public evidence exists, and what makes the record useful rather than merely impressive?”

4. **Approved content hierarchy**

   Preserve the existing H1 and intro; evidence philosophy; four-step structured-POC discipline; exactly one Maradin record, approved summary and poster; native route to `/pocs/maradin/`; two approved contact contexts. The runtime invariant enforcing one record remains authoritative.

5. **Proposed page chapters**

   1. `[Quiet archive overture]` — one public record is materially present.
   2. `[Record threshold]` — Maradin poster/title/summary appear earlier as the route's central fact.
   3. `[Evidence discipline]` — approved philosophy and four distinct test stages.
   4. `[Open record]` — direct Maradin route.
   5. `[Release]` — industry/startup starting contexts remain secondary.

   Reordering is a design proposal only; public copy and final order require human approval before Phase 5B.

6. **Emotional and spatial arc**

   Begin with quiet confidence rather than an empty catalogue. Allow one record to acquire depth. Cross from abstract evidence discipline into one factual image. End with a direct invitation to inspect the full record, not a suggestion of hidden volume.

7. **Signature behavior**

   One large archival graphite boundary is visible at `PR-M01`. At `PR-M02`, its edge tightens around the approved poster. At `PR-M03`, the matte field releases and the record becomes fully readable. There are no adjacent slots, counters, pagination controls or ghost records.

8. **Motion verbs, direction and transitions**

   Focus → Cross. Mode B may simply toggle closed/open aperture states when the record enters its viewport band. Reverse closes the same aperture. If a Mode C opening is proposed, it must remain in normal flow, use one bounded clip and add no sticky travel. Navigation to Maradin is immediate and does not animate the aperture across documents.

9. **Material vocabulary and datum**

   Vast proving black, archival graphite, off-white record hierarchy, one controlled aperture and documentary light. The datum is the opening edge only; it disappears when media is dominant. Avoid file-folder UI, index tabs, database labels, metrics and interface chrome.

10. **Media strategy**

    Real media is essential. Use only `maradin-field-aperture-poster-approved.jpg`, 1920×1080 and 86,343 bytes. The repository is sufficient; no Drive review. No video request on the index. If the image fails, retain the semantic title, summary and link without a visible placeholder.

11. **Publication constraints**

    Maradin only. No anonymous proof, confidential teaser, empty slot, “coming soon,” blurred record, metric, KPI or numerical claim. The word “archive” describes evidence care, not collection size. Do not imply that other private cases exist.

12. **Desktop storyboard**

    - `PR-D01` — large quiet field and one discernible record edge.
    - `PR-D02` — approved poster constrained inside the aperture.
    - `PR-D03` — record title/summary and documentary light reach full hierarchy.
    - `PR-D04` — evidence discipline follows as editorial architecture.
    - `PR-D05` — native link to Maradin and restrained contact routes.

13. **Portrait storyboard**

    - `PR-P01` — one tall record edge, not an empty screen.
    - `PR-P02` — full-width poster crop with factual hierarchy below it.
    - `PR-P03` — evidence discipline and record link in normal flow.

14. **Short-landscape storyboard**

    `PR-L` places a shallow poster aperture beside the H1 and summary, with the record link inside the initial reachable composition. No full-screen blank archive prelude. Open navigation remains legible over the matte field.

15. **Reduced-motion version**

    The aperture is fully open at a composed poster crop. All evidence philosophy and the record route remain normal-flow content. No mask interpolation.

16. **No-JS version**

    The poster, title, summary, evidence discipline and link are visible. A missing image fails open to the semantic record. No empty archive shell remains.

17. **Performance strategy**

    Incremental target: 4–6 KB CSS, 0–1.5 KB JS and one 86,343-byte lazy or appropriately prioritized poster. Prefer Mode B to continuous progress. One clip layer maximum, no video and no third-party code.

18. **Implementation risks**

    Excessive empty space could read as lack of work rather than confidence. Archive styling could imply a larger hidden collection. A full-bleed poster could make the index indistinguishable from Maradin. Maintain one bounded threshold and preserve the documentary climax for the detail route.

19. **Dependencies**

    Frozen `publicProofRecords`, `maradinProofRecord`, approved poster and its provenance, existing internal links and shared route system. No new content, media, API, CMS or library.

20. **Open questions requiring human approval**

    Accept or redirect the one-record archive thesis; approve placing the record threshold before the evidence-method detail; approve poster crop and Mode B versus Mode C; confirm that no additional public proof is authorized.

---

# 8. Maradin — `/pocs/maradin/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `Maradin — Dynamic Ground Projection` |
| Existing H1 | approved proof-record title |
| Spatial thesis | documentary field reality displaces abstract interface architecture |
| Signature behavior | observation shutters and matte editorial cuts connect media to six factual chapters |
| Motion mode | Mode B bounded threshold states; media is never scroll-scrubbed |
| Transition in | immediate approved documentary state after ordinary navigation from Proof |
| Transition out | field record resolves back to Proof or industry Contact context |
| Datum | peripheral crop/caption edge, mostly absent |
| Media decision | complete existing governed five-asset set; no additional sourcing |

1. **Purpose**

   Present the most documentary supporting route as a disciplined field record of challenge, technology, test conditions, execution, evidence and approved next step.

2. **Audience**

   Industrial decision-makers, technology teams and ecosystem visitors examining a real POC and the limits of what it established.

3. **User question answered**

   “What happened in this field test, under which conditions, what was observed, and what can responsibly be said next?”

4. **Approved content hierarchy**

   Preserve the approved title, summary and context metadata; hero field video/poster; test-contact video; projected stop-hand still; real field still; six chapters—Challenge, Technology, Test design, Execution, Evidence, Next step; three related capabilities; Proof return and industry-contact routes. No field may gain an unapproved number or outcome.

5. **Proposed page chapters**

   1. `[Field overture]` — approved documentary still establishes reality immediately.
   2. `[Condition]` — challenge and relevant operating context.
   3. `[Technology contact]` — approved technology and field-test media.
   4. `[Test design]` — positions, surfaces, light and weather conditions.
   5. `[Observation sequence]` — execution and evidence remain distinct.
   6. `[Bounded next step]` — approved next-step language with no expansion.
   7. `[Related work and release]` — capabilities, Proof return and industry contact.

6. **Emotional and spatial arc**

   Cross immediately from abstract graphite into field reality. Slow down around observation and conditions. Let evidence become clear without making the route celebratory. Return to a dark editorial field only after the record and its limits settle.

7. **Signature behavior**

   Documentary media remains in normal flow. A matte top or side cut identifies the current evidence context at `MA-M01`; the field image occupies the composition at `MA-M02`; the cut releases into the next factual chapter at `MA-M03`. Observer states may alter a bounded crop or edge, but they never cover captions, scrub video, autoplay or hold the viewport.

8. **Motion verbs, direction and transitions**

   Cross → Resolve → Release. Threshold states toggle symmetrically on reverse. Media playback is controlled only by the native user action, never scroll position. Proof → Maradin is ordinary navigation with immediate semantic and poster availability. Maradin → Proof/Contact is also ordinary navigation.

9. **Material vocabulary and datum**

   Documentary asphalt/night light, daylight field still, proving black, matte caption cuts, pale factual rules and restrained metadata. Magenta appears only in Quantum state/focus and naturally inside approved imagery; no added overlay competes with it. The datum is an occasional crop edge and may disappear for an entire media chapter.

10. **Media strategy**

    Existing repository media is sufficient and essential:

    - field-aperture video, 3,962,341 bytes;
    - field-aperture poster, 86,343 bytes;
    - test-contact video, 4,133,483 bytes;
    - projected field frame, 169,156 bytes;
    - real field still, 961,699 bytes.

    No Drive review or new media is required. Videos remain `preload="none"`, user-initiated, native-controlled and non-autoplay. Preserve exact frozen bytes, approved alt text and factual captions. Use CSS for the field still's intended portrait crop without destructive re-encoding.

11. **Publication constraints**

    No numeric claim, KPI, score, result overlay, procurement, production deployment or commercial-success implication. Hyundai/vehicle branding is documentary context, not an endorsement or partnership claim. Do not expand the approved EcoMotion/OI Lounge next-step language. Do not infer ownership of the location, vehicle or facility.

12. **Desktop storyboard**

    - `MA-D01` — documentary overture dominated by an approved still/poster and factual title.
    - `MA-D02` — challenge and technology context with one unobtrusive field-media control.
    - `MA-D03` — test design paired with projected-road evidence.
    - `MA-D04` — execution and evidence separated by matte editorial cuts.
    - `MA-D05` — approved next step, related capabilities and routes on a quiet dark field.

13. **Portrait storyboard**

    - `MA-P01` — portrait documentary crop, title and summary in separate normal-flow regions.
    - `MA-P02` — field frame and conditions with factual caption.
    - `MA-P03` — observation/evidence sequence and native media control.
    - `MA-P04` — next step and release.

    Real imagery must not be reduced to thumbnails beside oversized interface text.

14. **Short-landscape storyboard**

    `MA-L` uses one 16:9 field image or poster with a narrow factual side band. Native controls remain reachable and do not collide with headings or the open menu. No tall stacked grid is forced into 390 px height.

15. **Reduced-motion version**

    Use approved stills/posters at composed crops. Videos remain available only through explicit controls and never start automatically. No observer-driven crop movement.

16. **No-JS version**

    Complete title, summary, six chapters, stills, captions and native video controls. Video fallback text remains. No chapter is initially hidden for reveal.

17. **Performance strategy**

    Incremental target: 6–9 KB CSS and 1–2 KB JS. Initial load should request the first poster only; lazy stills add approximately 1.13 MB when approached; both user-initiated videos total approximately 8.10 MB. Never decode both simultaneously by script. No background video, autoplay, scrubber, third-party player or large blur.

18. **Implementation risks**

    Interface framing may bury evidence; full-resolution media may cause decode or memory pressure; incorrect EXIF handling may break portrait composition; captions may accidentally imply outcomes; native controls can collide with aggressive crops. Prefer stable media presentation over signature motion.

19. **Dependencies**

    Frozen `maradinProofRecord`, five exact governed assets and their publication provenance, approved alt/caption language, native browser media controls and shared route styles. No Drive, API, CMS, custom player or media-processing dependency.

20. **Open questions requiring human approval**

    Approve which approved still/poster owns the overture; approve whether both videos remain prominent or one becomes secondary; approve the documentary shutter treatment; approve final media/chapter ordering without changing facts; confirm no new Maradin media or claims are authorized.

---

# 9. SPARK — `/spark/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `SPARK` |
| Existing H1 | `A runway from MVP+ to industrial POC.` |
| Spatial thesis | a programme runway reaches a closed threshold while institutional energy continues |
| Signature behavior | the route stops at a dormant gate and releases into context, not application |
| Motion mode | Mode B bounded threshold states |
| Transition in | startup alignment conceptually becomes a settled programme runway |
| Transition out | closed runway releases into Contact's non-application startup context |
| Datum | runway edge terminating at the closed threshold |
| Media decision | no real media |

1. **Purpose**

   Explain the SPARK proposition, readiness, programme route and participant value while making the current closed status unequivocal and avoiding dead-end sadness.

2. **Audience**

   MVP+ startup teams and ecosystem visitors seeking programme context.

3. **User question answered**

   “What does SPARK help develop, what is the route, and can I apply now?”

4. **Approved content hierarchy**

   Preserve the existing H1 and intro; `Applications closed` status; proposition and eligibility; Readiness / Need / Fit / Design / Evidence route; four participant-value areas; status explanation; three FAQs; general startup-contact path. Do not add dates, cohort detail, statistics or alternative registration.

5. **Proposed page chapters**

   1. `[Dormant runway overture]` — proposition and closed status coexist immediately.
   2. `[Readiness]` — functioning capability and team preparedness.
   3. `[Programme route]` — need, fit, design and evidence.
   4. `[Retained value]` — context, feedback and test discipline continue beyond the gate.
   5. `[Closed threshold]` — status and FAQ answer uncertainty directly.
   6. `[Release]` — general startup introduction, explicitly not an application.

6. **Emotional and spatial arc**

   Begin with stored institutional energy and a visible route. Approach the threshold without suspense that it may open. Resolve clearly to closed, then let the architecture continue sideways/downstream into useful programme context and the truthful non-application path.

7. **Signature behavior**

   A restrained runway edge approaches a matte closed plane at `SP-M01`. At `SP-M02`, the status resolves and the active magenta segment stops. At `SP-M03`, a neutral edge releases into programme context below/aside. The gate never animates open, pulses for attention or behaves like a button.

8. **Motion verbs, direction and transitions**

   Conduct → Resolve → Release. Observer states are bounded and reversible. The transition from For startups is conceptual only; no cross-page line persists. Contact navigation targets `#for-startups` and must not be labeled as an application.

9. **Material vocabulary and datum**

   Dormant graphite runway, sealed matte threshold, restrained warm residue, neutral programme plane and a short magenta segment that terminates. Avoid event-stage lighting, accelerator gradients, countdowns, cohort mosaics or celebratory confetti.

10. **Media strategy**

    No media is essential. Repository proof media is unrelated. No Drive review is required. Abstract runway/threshold architecture is the complete primary state and fallback.

11. **Publication constraints**

    Status remains exactly `Applications closed`. No form, waitlist, email capture, date, future cohort, applicant count, cohort statistic, guaranteed POC, procurement or investment. The contact path is a general technology introduction only.

12. **Desktop storyboard**

    - `SP-D01` — runway overture with status already visible.
    - `SP-D02` — readiness and proposition alongside the route.
    - `SP-D03` — five programme stages around a closed threshold, not five cards.
    - `SP-D04` — retained participant value after status resolution.
    - `SP-D05` — FAQ and non-application release.

13. **Portrait storyboard**

    - `SP-P01` — vertical runway with status near the H1.
    - `SP-P02` — programme stages in normal flow around one neutral spine.
    - `SP-P03` — closed threshold, value and FAQ remain open and readable.

14. **Short-landscape storyboard**

    `SP-L` shows the runway ending within the shallow right half while proposition/status occupy the left. No large empty runway delays content. Open navigation and status remain simultaneously legible.

15. **Reduced-motion version**

    Static sealed threshold, complete route stages and retained-value content. No line travel or gate-state transition.

16. **No-JS version**

    Same static route and status. Native FAQ `<details>` remains operable. Contact path remains a normal link and never resembles an application control.

17. **Performance strategy**

    Incremental target: 4–6 KB CSS, 0–1.5 KB JS, zero media. Prefer a single observer toggling one resolved state. Two composited planes maximum and no continuous animation.

18. **Implementation risks**

    A runway can imply imminent reopening, while too much closed language can feel defeated. The gate may look clickable. Preserve retained context after the threshold and keep pointer behavior only on genuine links. Avoid repeated full-screen status states.

19. **Dependencies**

    Frozen SPARK programme record/status, existing FAQs and startup contact route, shared typography/material system. No media, date source, form, API, CMS or application backend.

20. **Open questions requiring human approval**

    Accept or redirect the dormant-runway thesis; approve the balance between closed status and retained energy; approve whether the status appears once or remains repeated in the existing content hierarchy; confirm no application or waitlist destination is authorized.

---

# 10. About — `/about/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `About` |
| Authoritative H1 | `Built between industry and technology.` |
| Spatial thesis | interlocking institutional planes reveal Quantum as the connective operating layer |
| Signature behavior | section cuts make the “between” position physically legible without a diagram or timeline |
| Motion mode | Mode B bounded threshold states |
| Transition in | complete institutional overture is available immediately |
| Transition out | interlock releases normally toward For industry or For startups |
| Datum | implied joint or tall editorial spine |
| Media decision | no real media required |

1. **Purpose**

   Explain Quantum's institutional position between operational needs and emerging technology, including its practical role and Herzliya context, without inventing organizational history or people.

2. **Audience**

   Industry, technology and institutional stakeholders seeking to understand what Quantum is and how it operates.

3. **User question answered**

   “What connective role does Quantum play, and what distinguishes that role from either side alone?”

4. **Approved content hierarchy**

   Preserve the authoritative H1 and intro; purpose; challenge/technology relationship; practical operating role; industry-led model; field-record discipline; Herzliya context; four working principles; For industry and For startups links. Team, partner, metric and timeline surfaces remain absent.

5. **Proposed page chapters**

   1. `[Between overture]` — two institutional fields and one connective layer.
   2. `[Purpose]` — make the relationship testable.
   3. `[Operating position]` — industry-led context meets technology assessment.
   4. `[Field discipline]` — challenge, test and evidence relationships.
   5. `[Principles]` — four approved working principles as structural joints, not cards.
   6. `[Herzliya context]` — restrained location context.
   7. `[Release]` — audience routes.

6. **Emotional and spatial arc**

   Begin with institutional depth and a controlled void. Reveal that Quantum occupies and stabilizes the relationship between two different frames. Move from abstract position to practical working principles. End with calm agency toward either audience route.

7. **Signature behavior**

   Two deep planes remain visibly distinct at `AB-M01`. A narrow section cut exposes the operating layer at `AB-M02`. At `AB-M03`, the planes interlock without merging, and the principles align along the joint. No nodes, connecting lines, logos or timeline dates appear.

8. **Motion verbs, direction and transitions**

   Focus → Resolve. Mode B toggles a small set of interlock states; reverse separates them. The route enters and exits through ordinary navigation. Links to the two audience routes do not animate a shared plane across pages.

9. **Material vocabulary and datum**

   Deep graphite strata, matte institutional planes, tall negative-space cut, pale editorial joint and restrained warm shadow. The datum is implied by the joint or spine and may never light up as a network connection. Avoid corporate blue, office imagery, timeline rails and organization charts.

10. **Media strategy**

    Real media is not essential. No approved institutional or team media exists in the repository. No Drive review is required for the abstract thesis. A later Herzliya or operating-context asset requires explicit search and publication approval; the abstract interlock remains the complete fallback.

11. **Publication constraints**

    No unverified team roster, portrait, role, qFund member, partner, metric, facility, founding date, history milestone or scale claim. Herzliya may be named only as currently approved context. Do not imply ownership of a building, lab or industrial site.

12. **Desktop storyboard**

    - `AB-D01` — institutional interlock overture and authoritative H1.
    - `AB-D02` — purpose appears within the controlled void.
    - `AB-D03` — industry-led operating position reveals the connective layer.
    - `AB-D04` — principles align as structural joints.
    - `AB-D05` — Herzliya context and audience-route release.

13. **Portrait storyboard**

    - `AB-P01` — two vertically offset planes frame the H1 without clipping it.
    - `AB-P02` — connective layer becomes a vertical editorial spine.
    - `AB-P03` — principles and audience routes remain full-width normal-flow content.

14. **Short-landscape storyboard**

    `AB-L` shows one shallow interlock beside the H1 and intro; no tall institutional void delays context. Open navigation covers decoration safely. Long H1 and fallback-font states are explicit gates.

15. **Reduced-motion version**

    Static fully resolved interlock and complete editorial sequence. No moving planes or focus interpolation.

16. **No-JS version**

    Identical resolved institutional composition and semantic content. Audience links remain ordinary navigation. No principles wait for an observer.

17. **Performance strategy**

    Incremental target: 4–6 KB CSS, 0–1.5 KB JS, zero media. One observer may toggle two plane transforms. Avoid full-screen blur and keep decorative layers below semantic content. On portrait, prefer CSS-only static geometry.

18. **Implementation risks**

    The interlock could resemble a generic corporate diagram, merger graphic or partner relationship claim. Excess plane depth can reduce text contrast. Treat “between” as architectural space, not network topology, and keep every semantic assertion in approved text.

19. **Dependencies**

    Existing approved About copy, Herzliya/footer context, typography/tokens and audience links. No team data, media, Drive, API, CMS or external library.

20. **Open questions requiring human approval**

    Accept or redirect the interlocking-plane thesis; approve whether Herzliya is a dedicated late chapter or remains a quiet line; approve an entirely abstract institutional route; confirm no team or qFund content is authorized.

---

# 11. Contact — `/contact/`

## Route contract

| Field | Decision |
| --- | --- |
| Public label | `Contact` |
| Authoritative H1 | `Start with the challenge.` |
| Spatial thesis | three incoming intent rails resolve into a calm final arrival plane |
| Signature behavior | native hash targeting identifies the relevant intent without a form or fake endpoint |
| Motion mode | Mode A — static architecture and CSS target/focus states |
| Transition in | any route may arrive directly or through one of three existing hashes |
| Transition out | no fabricated external action; normal global navigation remains available |
| Datum | quiet terminus and target alignment |
| Media decision | none |

1. **Purpose**

   Provide the minimum truthful final destination by distinguishing industry, startup/technology and general/ecosystem/media contexts while the public contact destination remains unverified.

2. **Audience**

   Industrial challenge owners, startup/technology teams, and general ecosystem or media visitors.

3. **User question answered**

   “Which context best describes why I want to speak with Quantum, and what information should I begin with?”

4. **Approved content hierarchy**

   Preserve the authoritative H1 and intro; exactly three intent groups with stable IDs `for-industry`, `for-startups`, and `general`; existing approved descriptions. `contactDestination` remains `null`, so no email, form, phone or outbound action is added.

5. **Proposed page chapters**

   1. `[Arrival overture]` — H1, intro and calm endpoint plane.
   2. `[Industry intent]` — operating need, context and useful test question.
   3. `[Startup intent]` — capability, use case, readiness and test conditions.
   4. `[General intent]` — institutional, ecosystem or media context.
   5. `[Honest terminus]` — no visible submission surface until a destination is verified.

6. **Emotional and spatial arc**

   Arrive calmly after more spatial routes. Reduce all surviving structure into three understandable starting contexts. Resolve the incoming hash/focus state without urgency. End honestly rather than compensating for the missing destination with lead-generation machinery.

7. **Signature behavior**

   Three neutral rails converge into a contained arrival plane. A native `:target` state aligns the relevant rail and intent group when the visitor arrives through a hash. The state is visible through hierarchy and focus, not motion. No button, submit surface or fake confirmation appears.

8. **Motion verbs, direction and transitions**

   Focus → Resolve through static target/focus treatment. No route controller. Cross-route continuity is fulfilled by native hashes and immediate content. Browser back/forward restores the URL and target normally.

9. **Material vocabulary and datum**

   Near-black arrival void, tall restrained walls, pale alignment rules, one contained intent plane and magenta only for focus/target. The datum terminates here. Avoid large buttons, form panels, floating contact widgets and decorative convergence animation.

10. **Media strategy**

    No media is useful or authorized. No repository or Drive review is required. The minimal static arrival is the complete design.

11. **Publication constraints**

    No form, backend, mailto, invented email, phone number, personal contact, calendar link, response-time promise, automatic message, data collection or fake success state. The three intent descriptions must not imply submission or guaranteed response. No fourth intent group without approval.

12. **Desktop storyboard**

    - `CO-D01` — calm arrival overture and three aligned intent rails.
    - `CO-D02` — default all-intents state with equal semantic availability.
    - `CO-D03` — `#for-industry` target state.
    - `CO-D04` — `#for-startups` target state.
    - `CO-D05` — `#general` target state and quiet terminus.

13. **Portrait storyboard**

    - `CO-P01` — compact H1/intro and vertical intent sequence.
    - `CO-P02` — selected target remains in view below the fixed document header.
    - `CO-P03` — complete third intent and footer without a fake CTA.

14. **Short-landscape storyboard**

    `CO-L` uses a compact H1 column and three short intent rows. Native hash target must not sit behind the header. `CO-NAV` verifies the open mobile menu, all intents and focus outline remain reachable without overflow.

15. **Reduced-motion version**

    Identical to the default static route. Target/focus state changes are instantaneous.

16. **No-JS version**

    Identical. Native anchors, `:target`, `<details>` navigation, skip link and browser history remain sufficient.

17. **Performance strategy**

    Incremental target: 2–4 KB CSS, zero route JS and zero media. No observer, transform loop or dynamic import. Use ordinary target/focus selectors and content-driven height.

18. **Implementation risks**

    The route may feel incomplete because a real destination is unavailable. Adding a visual submit affordance would be dishonest. Native hash targets can be obscured by the header unless scroll margin is planned. Over-enclosure can make the minimal route feel ominous rather than calm.

19. **Dependencies**

    Existing intent IDs/descriptions, BaseLayout navigation/focus, internal hashes and the explicit `contactDestination === null` publication guard. No backend, form, API, email service, media or library.

20. **Open questions requiring human approval**

    Accept or redirect the arrival/terminus thesis; approve native target emphasis; provide and separately verify a real contact destination if action is desired in Phase 5B; approve any destination label and privacy implications before implementation.

---

# 12. Real 404

## Route contract

| Field | Decision |
| --- | --- |
| Public label | semantic 404 error |
| Existing H1 | `This signal goes nowhere.` — tone requires human review |
| Spatial thesis | one material plane and its neutral seam are quietly displaced from the system |
| Signature behavior | static misregistration directs attention toward reliable recovery |
| Motion mode | Mode A — static architecture |
| Transition in | any missing URL resolves directly to the error document |
| Transition out | ordinary recovery link or global navigation |
| Datum | interrupted neutral seam; no active current |
| Media decision | none |

1. **Purpose**

   Remain a real semantic error route that communicates dislocation quietly and makes recovery immediate.

2. **Audience**

   Any visitor following a stale, mistyped or unavailable URL.

3. **User question answered**

   “What happened, and where can I go now?”

4. **Approved content hierarchy**

   Preserve the semantic error page, `noindex, follow`, one H1, current Home recovery and full global header/footer while tone is reviewed. The route remains excluded from the sitemap. A deployed random URL must return HTTP 404 rather than a branded HTTP 200 page.

5. **Proposed page chapters**

   1. `[Dislocation]` — restrained 404 marker and displaced material plane.
   2. `[Error statement]` — one clear H1 and no novelty copy stack.
   3. `[Recovery]` — Home plus reliable global navigation.

   This remains one short semantic route, not a spectacle sequence.

6. **Emotional and spatial arc**

   Register that the expected route is absent, then reduce uncertainty immediately. The page should feel composed and calm, never punitive, comic or broken.

7. **Signature behavior**

   A neutral editorial seam and one graphite plane are offset from the shared alignment. The recovery link occupies the stable aligned region. No automatic correction animation, glitch, static, scanline or CRT effect.

8. **Motion verbs, direction and transitions**

   Resolve → Release through static hierarchy and focus. There is no controller and no reverse sequence. Recovery uses ordinary navigation.

9. **Material vocabulary and datum**

   Proving black, displaced graphite plane, faint 404 numeral, pale interrupted rule and white semantic hierarchy. Active magenta is absent except focus. Avoid glitch typography, television noise, broken-signal animation and joke illustration.

10. **Media strategy**

    No media. No repository or Drive review. Static CSS architecture is the complete state.

11. **Publication constraints**

    No joke that weakens the brand, no fake search, no broken navigation, no content claim and no cinematic media. The current “This signal goes nowhere” line requires an explicit human tone decision before it is carried into a redesign. Error metadata remains non-indexing.

12. **Desktop storyboard**

    - `NF-D01` — displaced plane, restrained 404 marker, clear H1.
    - `NF-D02` — aligned recovery region and visible global navigation.

13. **Portrait storyboard**

    - `NF-P01` — compact dislocation above a fully wrapping H1.
    - `NF-P02` — Home recovery and global navigation remain immediate.

14. **Short-landscape storyboard**

    `NF-L` places the displaced plane behind a shallow left marker while H1 and Home link remain visible without vertical overflow. `NF-NAV` confirms recovery remains possible with the menu open.

15. **Reduced-motion version**

    Identical static route.

16. **No-JS version**

    Identical semantic error and native links.

17. **Performance strategy**

    Incremental target: 1–2 KB CSS, zero JS and zero media. No large filters, fixed animations or additional font request.

18. **Implementation risks**

    The host may serve the page with HTTP 200; visual styling can distract from recovery; large faint type may overflow at 200% text; current copy may read as a brand joke. Network status must be tested on immutable and branch deployments.

19. **Dependencies**

    Existing BaseLayout, noindex metadata, Home link, global navigation and host 404 behavior. No script, media, API or search index.

20. **Open questions requiring human approval**

    Approve or replace the current H1 tone; approve whether Home alone plus global navigation is sufficient or one additional internal recovery link is needed; approve the displaced-plane composition; verify deployed HTTP 404 behavior.

---

# 13. Cross-route responsive review plan

The route folders provide authored states; a cross-route sheet must also compare the same pressure across all nine routes.

## Required comparison rows

1. 1440×900 overtures — prove distinct silhouettes.
2. 1366×650 — prove no viewport-height content trap.
3. 1024×768 — prove intermediate geometry is authored.
4. 768×1024 — prove portrait depth is not a desktop crop.
5. 390×844 — prove independent mobile hierarchy.
6. 320×800 — prove no split words, overflow or undersized targets.
7. 844×390 — prove short-landscape availability and open navigation.
8. 200% text — prove content-driven height and complete headings.
9. Fallback fonts — prove geometry yields to changed metrics.
10. Reduced motion — prove nine premium static states.
11. No JavaScript — prove complete content and geometry.
12. Keyboard/focus — prove target, links, FAQ, media controls and recovery.

The comparison must make it possible to hide route names and still distinguish at least For industry, For startups, all four Industries territories, Proof, Maradin, SPARK, About, Contact and 404 from composition alone.

# 14. Local prototype source plan

The compact tracked lab may render complete local HTML from one publication-safe data authority rather than duplicating nine documents:

```text
prototypes/phase-5a-supporting-routes/
  route-data.mjs
  render-route.mjs
  server.mjs
  shared/
    system.css
```

`route-data.mjs` contains local design descriptors, the nine-route order, approved public paths/labels, chapter mappings, media decisions, constraints and budgets. It is not a new public content source. `render-route.mjs` must produce complete server-rendered semantic HTML for every route and for the page, motion, material, typography and transition boards. `server.mjs` must bind only to loopback, expose the lab canary/header, deny state-changing methods and serve only the lab plus exact allow-listed fonts and Maradin assets. `shared/system.css` contains the isolated visual system and responsive/reduced-motion states.

The lab requires no client JavaScript to present its semantic or visual review states. If a later motion diagnostic genuinely requires client enhancement, it must be a separate small allow-listed file, keep the complete server-rendered state visible without it and receive an isolation-test update. The external evidence contract—not a public route—must enumerate every required route/board/viewport combination and output filename.

The local server may allow only:

- the prototype directory;
- exact approved Quantum brand/font paths needed for fidelity;
- exact approved Maradin media paths used by Proof and Maradin.

It must deny traversal, external requests, unexpected methods and all non-allow-listed repository paths.

# 15. External review-package route structure

For each route slug—`for-partners`, `for-startups`, `industries`, `proof`, `maradin`, `spark`, `about`, `contact`, and `404`—the external package must contain:

```text
route-brief.md
desktop-storyboard--1440x900.png
responsive-contact-sheet.png
mobile-storyboard--390x844.png
short-landscape--844x390.png
signature-motion-states.png
representative-transition-states.png
material-detail-board.png
typography-hierarchy.png
reduced-motion.png
no-js.png
media-requirements.md
publication-constraints.md
performance-plan.md
implementation-risks.md
```

The full package manifest must bind every derivative by relative path, byte size, pixel dimensions where applicable and SHA-256. It must record that every generated file is outside Git and that prototype/public isolation passed.

# 16. Phase 5B handoff contract

After all six human gates receive ACCEPT, a Phase 5B implementation plan may translate these route briefs into production. That handoff must:

1. preserve approved content and publication filters unless a separate content gate says otherwise;
2. retain BaseLayout semantics, skip/focus safety, normal navigation and no-JS availability;
3. create route-specific markup and styles rather than one universal route template;
4. import route JavaScript only for Mode B/C routes that genuinely require it;
5. use a shared progress helper only for measurement/scheduling, not for visual uniformity;
6. keep Contact and 404 CSS-only;
7. load real media only on Proof and Maradin under the existing approval boundary;
8. add no new public route, form, contact destination, partner, person, claim or media without approval;
9. verify all seven viewport families, 200% text, fallback fonts, reduced motion, no-JS, keyboard and open navigation;
10. measure actual CSS, JS, media requests, long tasks and scroll responsiveness against the budgets in this document;
11. prove a real deployed 404 status;
12. obtain a new human implementation gate before merging or changing production `main`.

Until that handoff, every route design described here remains a local, speculative review proposition and every existing public supporting route remains unchanged.
