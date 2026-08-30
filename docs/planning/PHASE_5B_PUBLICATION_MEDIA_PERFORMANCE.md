# Phase 5B publication, media and performance safety

Status: **machine PASS** for the CP8 candidate. Human publication, media and performance judgment remains pending.

Audited Git anchor: `9a9ad82b266c663e5689c8a6884a90cfc835ef7c` plus the CP8 candidate working tree. The final clean-HEAD audit is produced after the CP8 checkpoint and retained for the Phase 5B review package.

## Executable evidence

- Accepted-copy candidate report: `../phase-5b-work/cp8-publication-media-performance/accepted-copy-final.json`
- Report bytes: `185354`
- Report SHA-256: `292832e21eae9c17f50e9f7dd5aaccaed4077ffd884d673baf475492c624ad5e`
- Browser: Chrome `150.0.7871.187`, 1440 × 900, service workers blocked.
- Coverage: nine routes, normal forward and reverse native scrolling, quiet-runtime sampling, request/transfer accounting, governed-media initiation, Long Task and Layout Shift observers.
- Focused tooling/publication suite: 15 tests passed, 0 failed.

## Deny-by-default publication result

The executable publication test is bound to the actual routed Astro dependency graph, runtime public-content projection, generated HTML inventory and sitemap. It does not scan historical planning material and therefore cannot turn old audit vocabulary into false public findings.

The public build contains exactly four approved industries, exactly one proof record (Maradin), a closed SPARK programme, no application or registration affordance, no public team/metric/partner/update records, and no configured contact destination. Public copy and links contain no defence/dual-use material, extra or fictional case, fabricated date, qFund crossover, email address, phone number, positive procurement/contract claim, commercial-success claim, or quantified outcome claim. The only waiting-list and procurement terms are the frozen accepted negative disclosures: no waiting-list route exists, and participation guarantees neither a procurement agreement nor an investment. The test removes only those exact disclosures before enforcing the deny rules.

## Route payload and normal-load network measurements

“Normal transfer” excludes the two Maradin video bodies that are requested only after the audit clicks their explicit playback controls. Raw/gzip code values are route-attributable; shared header/footer code is separately retained in the JSON evidence.

| Route | JS raw / gzip | CSS raw / gzip | Normal requests | Normal transfer | Max scroll Long Task | Load CLS | Scroll CLS | Quiet RAF | Max decoder |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| For industry | 1,785 / 951 B | 6,998 / 2,026 B | 10 | 100,452 B | 0 ms | 0.034387 | 0.000444 | 0 | 0 |
| For startups | 1,783 / 932 B | 6,975 / 1,987 B | 10 | 100,243 B | 0 ms | 0.082353 | 0 | 0 | 0 |
| Industries | 1,899 / 977 B | 8,971 / 2,275 B | 10 | 100,307 B | 0 ms | 0.016192 | 0 | 0 | 0 |
| Proof | 654 / 470 B | 5,904 / 1,855 B | 11 | 185,339 B | 0 ms | 0.002147 | 0 | 0 | 0 |
| Maradin | 1,399 / 795 B | 8,991 / 2,411 B | 13 | 1,318,994 B | 0 ms | 0.007761 | 0 | 0 | 1 expected after initiation |
| SPARK | 660 / 475 B | 5,965 / 1,778 B | 10 | 99,123 B | 0 ms | 0.065859 | 0 | 0 | 0 |
| About | 631 / 458 B | 5,996 / 1,885 B | 10 | 98,873 B | 0 ms | 0.057473 | 0 | 0 | 0 |
| Contact | 0 / 0 B | 3,740 / 1,254 B | 7 | 95,774 B | 0 ms | 0.016754 | 0 | 0 | 0 |
| Intentional 404 | 0 / 0 B | 1,906 / 811 B | 7 | 94,834 B | 0 ms | 0.012401 | 0 | 0 | 0 |

Maximum measured load CLS was `0.082353`; maximum scroll CLS was `0.000444`. Every forward journey reached the document end, every reverse journey returned to the top, horizontal overflow remained within tolerance, quiet-window RAF callbacks and pending RAFs were zero, and active intervals were zero.

## Request and governed-media result

- Seven non-media routes requested only ordinary shared static assets; they requested no route media.
- Proof requested exactly `/media/maradin/maradin-field-aperture-poster-approved.jpg` and no video.
- Maradin referenced exactly three governed stills and two governed H.264 videos. Its two `<img>` elements retain `loading="lazy"`; Chrome may fetch native-lazy resources according to its distance/network heuristic, and the report records the observed request phase rather than claiming stricter scheduling.
- Before explicit playback, both Maradin `<video>` elements had no `src`, empty `currentSrc`, `preload="none"`, `readyState=0`, and zero active decoders. No video body was requested.
- Each explicit playback control loaded metadata and one governed MP4. Starting the second player released the first, so the maximum active decoder count remained one.
- Maradin normal transfer was `1,318,994` bytes. After both deliberate video-initiation checks, total transfer was `9,415,510` bytes across 15 requests.
- Across all nine normal and explicit-initiation paths, the audit observed 90 requests and `10,290,455` transferred bytes.
- Phase 4 cinematic requests on supporting routes: **zero**.
- Ungoverned or unused Maradin media requests: **zero**.

Governed asset hashes remain:

| Asset | SHA-256 |
|---|---|
| `maradin-field-aperture-poster-approved.jpg` | `6afc1a69570f2541b89b4f6a5074bec04a5d607743d91670321f550b4d6364bd` |
| `maradin-prove-field-frame-approved.jpg` | `b85f1bd5413b6fe7da235e5217e16b106ae4ff0763e8deb9db6e509dbc0b8b8c` |
| `maradin-real-field-still-approved.jpg` | `49ab9aca0d2e3ef9e9ce164f43f9dbd1514ef815179626bef2bb4217827a6741` |
| `maradin-field-aperture-approved.mp4` | `daaec510c528bd7f72a97cfce1d9ede3359ec1339e28e26f524d127f09bf247c` |
| `maradin-test-contact-approved.mp4` | `076aecf40d9e67ac29eb0b8e2d34ffc374619862a9679a6e44bc08ccfd2c113d` |

## Runtime conclusion

No route-attributable scroll task exceeded 50 ms; in this run, all nine route maxima were exactly 0 ms. No route created a perpetual animation frame loop or continuous interval. Mode C routes retain bounded event-driven measurement, Mode B routes retain bounded observers, and Contact/404 ship no route controller. The audit found zero unexpected media decoders and zero supporting-route requests for Phase 4 cinematic assets.

These are machine results, not human acceptance. They leave all six Phase 5B gates pending and do not authorize Phase 6.
