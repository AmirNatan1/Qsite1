# Phase 5B route CSS duplication audit

**Audit state:** PASS; no meaningful cross-route composition block was duplicated.

**Audited revision:** `9a9ad82b266c663e5689c8a6884a90cfc835ef7c`

**Scope:** the nine Phase 5B route-specific production stylesheets. Global styles and `production-foundations.css` are intentionally excluded from pair scoring because the question here is whether route compositions accidentally converged, not whether the site reuses approved foundations.

## Files measured

| Route | Route stylesheet | Source bytes | Unique exact declarations | Composition-set declarations | Leaf rule-block signatures |
|---|---|---:|---:|---:|---:|
| Industry | `src/styles/routes/industry.css` | 8,542 | 171 | 152 | 28 |
| Startups | `src/styles/routes/startups.css` | 8,590 | 172 | 151 | 31 |
| Industries | `src/styles/routes/industries.css` | 10,652 | 196 | 179 | 40 |
| Proof | `src/styles/routes/proof-production.css` | 7,061 | 152 | 131 | 30 |
| Maradin | `src/styles/routes/maradin.css` | 10,358 | 191 | 169 | 34 |
| SPARK | `src/styles/routes/spark-production.css` | 6,017 | 85 | 74 | 23 |
| About | `src/styles/routes/about.css` | 6,022 | 82 | 71 | 21 |
| Contact | `src/styles/routes/contact.css` | 3,769 | 82 | 69 | 21 |
| 404 | `src/styles/routes/404-production.css` | 1,934 | 40 | 32 | 10 |
| **Total** |  | **62,945** |  |  |  |

Each route page imports its own route stylesheet. Industry, Startups, Industries, and Maradin additionally import the approved production foundations; no route-specific stylesheet imports another route-specific stylesheet.

## Method

Three tests were used so that shared CSS vocabulary would not be mistaken for a shared page composition.

1. **Exact declaration similarity.** Comments and formatting were removed, declarations were normalized without changing their property/value meaning, and each file became a set of exact `property:value` tokens. Pair similarity is the Jaccard score: intersection divided by union.
2. **Composition-set similarity.** An exact declaration found in at least five of the nine route files was classified as a low-level primitive and removed. Twenty-three such tokens were excluded. The remaining declarations form the composition set, and the Jaccard calculation was repeated.
3. **Exact leaf-block inspection.** Normalized multi-declaration leaf rule blocks were compared as complete signatures. Matching signatures were then read in source so typographic/reset primitives could be separated from actual layout composition.

This is deliberately conservative: equal visual intent expressed with different custom properties will score low, while a harmless reset can score high. The block inspection and the DOM topology audit therefore govern the final classification.

## What counted as a primitive

The 23 high-frequency tokens include expected foundations such as `display:grid`, `align-items:center`, `position:relative`, `position:absolute`, `display:block`, `padding:0`, the UI font family, and the shared minimum-height expression. List resets, readable line lengths, label typography, focus treatment, and basic button/link scaffolding are also treated as primitives when source inspection shows no route-level geometry attached.

These are not evidence of a template. Composition means a repeated arrangement of zones, a repeated geometric system, the same spatial transition, or a copied ending/hero block.

## All pair scores

Percentages below are set Jaccard scores. “Composition” excludes the 23 corpus-wide primitive declarations.

| Pair | Exact declarations | Composition declarations |
|---|---:|---:|
| Industry / Startups | 20.4% | **15.2%** |
| Industry / Industries | 12.9% | 8.5% |
| Industry / Proof | 8.8% | 3.3% |
| Industry / Maradin | 11.0% | 5.9% |
| Industry / SPARK | 4.9% | 2.3% |
| Industry / About | 4.1% | 0.5% |
| Industry / Contact | 7.7% | 3.3% |
| Industry / 404 | 3.4% | 0.5% |
| Startups / Industries | 10.8% | 6.8% |
| Startups / Proof | 10.2% | 4.1% |
| Startups / Maradin | 11.0% | 5.3% |
| Startups / SPARK | 6.2% | 2.3% |
| Startups / About | 4.1% | 0.0% |
| Startups / Contact | 7.6% | 2.8% |
| Startups / 404 | 5.0% | 1.1% |
| Industries / Proof | 6.7% | 2.3% |
| Industries / Maradin | 12.2% | 8.1% |
| Industries / SPARK | 3.3% | 0.8% |
| Industries / About | 3.0% | 0.0% |
| Industries / Contact | 4.1% | 0.8% |
| Industries / 404 | 2.6% | 0.5% |
| Proof / Maradin | 11.4% | 5.3% |
| Proof / SPARK | 9.7% | 5.1% |
| Proof / About | 6.4% | 2.0% |
| Proof / Contact | 9.9% | 4.2% |
| Proof / 404 | 4.3% | 0.6% |
| Maradin / SPARK | 6.6% | 2.5% |
| Maradin / About | 5.4% | 1.3% |
| Maradin / Contact | 8.3% | 3.9% |
| Maradin / 404 | 3.6% | 0.5% |
| SPARK / About | 9.9% | 4.3% |
| SPARK / Contact | 10.6% | 6.7% |
| SPARK / 404 | 7.8% | 3.9% |
| About / Contact | 6.5% | 2.2% |
| About / 404 | 4.3% | 2.0% |
| Contact / 404 | 6.1% | 2.0% |

The highest composition score is Industry / Startups at 15.2%. The next four are Industry / Industries at 8.5%, Industries / Maradin at 8.1%, Startups / Industries at 6.8%, and SPARK / Contact at 6.7%. No pair reaches 16%, and only five of the 36 pairs reach 6.7%.

## Exact block inspection

Industry / Startups is the only pair with more than one repeated exact leaf-block signature: five signature types across seven selector matches. Every other route pair has at most one.

The five Industry / Startups matches are:

| Shared signature | Classification | Why it is not a copied composition |
|---|---|---|
| `max-width:54ch` plus `line-height:1.48` | Readability primitive | Constrains prose measure only; parent grids, offsets, and geometry differ. |
| `overflow:clip` plus `position:absolute` | Geometry-container primitive | Establishes a clipping container but does not define the contained shape, location, or motion. |
| `list-style:none` plus `padding:0` | Reset primitive | Removes list chrome; it does not impose a route layout. |
| Magenta color, 0.7 rem type, uppercase | Label primitive | Shared programme/index micro-typography, with different parent structures and copy roles. |
| `display:grid` plus `margin-top:2rem` | Ending-wrapper scaffolding | The link groups share basic spacing, but their hierarchy, surrounding geometry, and route proposition differ. |

After the corpus-wide primitives are discounted, only two residual exact patterns remain between these files: the 54-character prose measure and the small magenta label treatment. Both are low-level typography. **Meaningful exact composition-block duplication is therefore zero.**

## Required pair findings

### Industry vs Startups

- Exact declaration similarity: 20.4%; composition-set similarity: 15.2%, the highest pair.
- The overlap is concentrated in resets, prose measure, small labels, clipped positioning contexts, and ending-link scaffolding.
- The layout systems are not shared: Industry uses mass/trace/boundary/search/decision variables; Startups uses signal/reach/branch/alignment/field variables.
- **Classification:** closest pair and a legitimate watch item, but no copied composition block was found.

### Proof vs Maradin

- Exact declaration similarity: 11.4%; composition-set similarity: 5.3%.
- They share evidence-family color and reveal vocabulary, but Proof is one archive boundary plus one poster aperture, while Maradin defines six documentary acts and multiple media states.
- No repeated exact leaf-block composition was found.
- **Classification:** family resemblance without template convergence.

### SPARK vs Contact

- Exact declaration similarity: 10.6%; composition-set similarity: 6.7%.
- The score reflects basic grid/alignment/label primitives. SPARK defines runway, gate, track, and sealed-state transitions; Contact defines a seam and three static intent rails.
- No repeated exact leaf-block composition was found.
- **Classification:** visually and behaviorally distinct.

### Contact vs 404

- Exact declaration similarity: 6.1%; composition-set similarity: 2.0%.
- Both are static one-act utilities, but Contact’s plural rail system and 404’s singular rotated plane do not share a block signature.
- **Classification:** the shared no-script mode is functional, not templated.

## Accidental-convergence assessment

| Potential convergence | Finding | Status |
|---|---|---|
| Industry and Startups both become the same four-act scrollytelling template | Their controller class and depth match, but the exact block review finds only primitives; their variables, grids, geometry, direction, and H1 anchoring differ. | Watch, not failure |
| Evidence routes share one poster/video split | Proof’s poster aperture and Maradin’s multi-act governed media system have only 5.3% composition similarity and no repeated composition block. | Clear |
| Short routes reuse a compact two-column ending template | SPARK / Contact scores 6.7%; Contact / 404 scores 2.0%. Their dominant geometry and endings remain different. | Clear |
| One responsive scaffold erases route identity | Responsive declarations reuse normal breakpoints and stacking primitives, but their target selectors and resulting order/geometry are route-specific. CP7 found no overflow, clipping, target, keyboard, or axe failures. | Clear, with human visual confirmation required |

## Verdict

The route-specific CSS passes the duplication audit. Reuse is concentrated in low-level primitives and brand micro-typography, while composition remains independently authored. The only pair that warrants deliberate visual comparison is **Industry / Startups**; even there, complete-block inspection finds no meaningful duplicated composition. No CSS evidence indicates accidental convergence among Proof / Maradin, SPARK / Contact, or Contact / 404.

This numerical audit should be read alongside `PHASE_5B_PRODUCTION_ANTI_TEMPLATE_AUDIT.md` and the human-review captures. Similarity scores detect source overlap; they do not replace perceptual review.
