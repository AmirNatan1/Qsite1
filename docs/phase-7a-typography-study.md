# Phase 7A typography study — Signal Field display direction

**Final display-font decision: PENDING HUMAN REVIEW.** Anybody is authorized
only as the strongest provisional prototype candidate. This document does not
self-accept Typography + Material Authority, authorize Phase 7B, or authorize
PP Monument files.

The fixed manifesto is **WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE.** The
study replaces Syne as the active post-CRT display face using legally
self-hostable candidates. There are no Google Fonts runtime imports, remote
runtime requests, trial/demo fonts or files copied from unrelated websites.
PP Monument is an art-direction benchmark only; no file may enter the repository
without a separately supplied valid web licence and authorized files.

## Syne and the frozen Maradin exception

Syne is removed as the active post-CRT display face. Its existing licensed use
remains only within the unchanged `.maradin-page` because Maradin is outside the
Phase 7A redesign scope. This preservation-only exception is not approval for
the manifesto, Field Map, homepage, neutral shells or any new surface. Browser
network evidence must show no Syne request outside Maradin.

## Method

Every candidate uses the same semantic DOM, six strings, material, container,
whole-word policy and responsive rules. Evaluation covers architectural
uppercase authority, non-gimmicky character, width range, live-text
legibility, wrapping, browser rendering, 200% reflow, fallback behavior,
licence/provenance, payload and maintenance risk. Aesthetic hypotheses remain
`NOT OBSERVED` until captured evidence exists.

Identical strings:

1. “WE TURN INDUSTRIAL NEEDS INTO FIELD EVIDENCE.”
2. “One operating field. Two trajectories.”
3. “Built between industry and technology.”
4. “Start with the challenge.”
5. “Automotive & Mobility”
6. “Industry 4.0 / Advanced Manufacturing”

Required viewports: 1440×900, 1366×650, 1024×768, 768×1024, 390×844,
360×800, 320×800 and 844×390, plus genuine installed-Chrome 200% where
available. Chromium and Firefox are physical engines; WebKit is labelled a
proxy. A resize is never presented as genuine zoom.

## Candidate authority

Hashes below were calculated over exact bytes from commit-pinned official
upstream URLs on 2026-08-31 and rechecked after local storage.

### Anybody — provisional prototype candidate

- Source: [Etcetera Type commit `fe7b55cf…`](https://github.com/Etcetera-Type-Co/Anybody/tree/fe7b55cf9d1563348ad95ac8e05f43b81a420c31)
- File: [Anybody `[wdth,wght]` WOFF2](https://raw.githubusercontent.com/Etcetera-Type-Co/Anybody/fe7b55cf9d1563348ad95ac8e05f43b81a420c31/fonts/variable/Anybody%5Bwdth%2Cwght%5D.woff2)
- Local production file: `public/fonts/anybody-latin-variable.woff2`
- Axes: `wdth 50–150`, `wght 100–900`
- Bytes: 69,612
- SHA-256: `27bf65457ce65fb6fdad625c5003cf14e2e6492afc30671ec9ec8fd1efb16fdb`
- Licence: SIL OFL 1.1, no Reserved Font Name declared in inspected text
- Local licence: `public/fonts/licenses/OFL-Anybody.txt`
- Licence bytes/SHA-256: 4,486 / `7f0313b042b462fcae1934436cc747f9fd4433e3b08fd6459a4a5104b0bbd5db`
- Hypothesis: best width-to-payload ratio and clearest stored→resolved semantic fit; extremes risk eccentric poster character.

### Mona Sans — industrial control

- Source: [GitHub/Mona Sans v2.0.27 commit `0f7dc66d…`](https://github.com/github/mona-sans/commit/0f7dc66ddd766605eb0e75c3f47bf9d1dd38ceca)
- Local research file: `artifacts/original/phase-7a-typography-candidates/mona-sans-v2.0.27-variable.woff2`
- Axes: `wdth 75–125`, `opsz 1–100`, `wght 200–900`
- Bytes/SHA-256: 307,976 / `875ad1fab0c1f4854927fa8086963fb6ddd4608b04a58b267cddf8a9d78f80d3`
- Licence: SIL OFL 1.1; Reserved Font Name “Mona”
- Licence bytes/SHA-256: 4,419 / `9261dcb61fb5e3c587d50d7a9fdae12bc7422d8822d7ac06b8f34550479575de`
- Risk: materially larger payload and a recognizable product-system/SaaS character; any modified build must respect the RFN.

### Bricolage Grotesque — authored challenger

- Source: [Atelier Triay commit `84745e5b…`](https://github.com/ateliertriay/bricolage/tree/84745e5b96261ae5f8c6c856e262fe78d1d6efdd)
- Local research file: `artifacts/original/phase-7a-typography-candidates/bricolage-grotesque-variable.woff2`
- Axes: `opsz 12–96`, `wdth 75–100`, `wght 200–800`
- Bytes/SHA-256: 204,636 / `b51a8ebd169637e47cb7db430431ab3e122d2f09b03ee2a03ea06f4cb46f1a8e`
- Licence: SIL OFL 1.1, no RFN declared in inspected text
- Licence bytes/SHA-256: 4,403 / `4b5a7d8f37f5602621c8a8d7358a6a2e71317e6c231c661e15aef0275d3e07ba`
- Risk: strongest authored voice but can feel fashion-editorial; its width axis narrows only.

### Archivo — legibility backstop

- Source: [Omnibus-Type commit `b5d63988…`](https://github.com/Omnibus-Type/Archivo/tree/b5d63988ce19d044d3e10362de730af00526b672)
- Local variable research file: `artifacts/original/phase-7a-typography-candidates/archivo-variable.ttf`
- Axes: `wdth 62–125`, `wght 100–900`
- Variable bytes/SHA-256: 658,596 / `664bbeb10522dac35c174a3860aaecad7b1ad3a0fc8b0d26888e26c824ec556d`
- Static comparison WOFF2 bytes/SHA-256: 53,508 / `1194eb36f975285a201e0605f3a98ad6946bfc2ca8f3947532373d491bef1bc8`
- Licence: SIL OFL 1.1, no RFN declared in inspected text
- Licence bytes/SHA-256: 4,388 / `108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b`
- Risk: no upstream variable WOFF2; variable TTF is research-only and costly. Static WOFF2 loses live width interpolation.

## Pre-evidence comparison

| Candidate | Variable web readiness | Payload | Width usefulness | Creative hypothesis | Current status |
| --- | --- | ---: | --- | --- | --- |
| Anybody | Official WOFF2 | 69,612 | 50–150, strongest | Architectural and causally expressive if used conservatively | PROVISIONAL / PENDING HUMAN REVIEW |
| Mona Sans | Official WOFF2 | 307,976 | 75–125 | Safest industrial control; may feel product-system generic | CONTROL / NOT OBSERVED |
| Bricolage Grotesque | Official WOFF2 | 204,636 | 75–100 | Most authored challenger; may become editorial | CHALLENGER / NOT OBSERVED |
| Archivo | Variable TTF only | 658,596 | 62–125 | Highest neutral legibility; least distinct world-building | BACKSTOP / NOT OBSERVED |

## Provisional recommendation

Anybody is the strongest provisional Phase 7A candidate, not the final
selection. Its 69,612-byte official variable WOFF2 combines the broadest width
range with `wght 100–900`, allowing compressed/stored → resolved typography
without rasterizing or geometrically distorting DOM text. Its payload is much
smaller than Mona Sans and Bricolage, and its OFL declares no RFN. The prototype
uses a conservative range; extreme widths remain a risk.

## Evidence ledger

The canonical specimen is
`artifacts/original/phase-7a-typography-candidates/specimens.html`. The final
review package must add per-candidate/viewport screenshots, Chromium and Firefox
recordings, line/wrap observations, overflow/clipping results, fallback and
blocked-font results, transfer bytes and genuine/proxy zoom status. Until that
capture is complete, browser rendering and wrapping remain **NOT OBSERVED**.

## Licence retention

All candidates use SIL OFL 1.1. Exact licence texts accompany each retained
candidate. Any future subset, conversion or rename must record deterministic
tooling, input/output hashes and Modified Version/RFN handling. No candidate
depends on GitHub or Google Fonts at runtime.

## Unresolved risks and gate

Axis interpolation may change line measure and produce wrap or CLS. Browser
hinting, 200% reflow, fallback metrics, slow-network behavior, reduced motion
and short-landscape fit require fresh evidence. Human review must issue ACCEPT,
REPAIR or REDIRECT.

**TYPOGRAPHY + MATERIAL AUTHORITY: PENDING HUMAN REVIEW**  
**Final display-font decision: PENDING HUMAN REVIEW**  
**Phase 7B NOT AUTHORIZED**  
**main NOT MERGED**

