# Phase 7A provenance

Recorded before any production-source edit on 2026-08-31 (Europe/Madrid).

## Repository authority

| Authority | Value |
| --- | --- |
| Repository | `AmirNatan1/Qsite1` |
| Phase 7A branch | `redirect/phase-7a-signal-field-threshold` |
| Required direct parent | `371e3e8a21a1d215ecaf2bf14b9f509432b230b0` |
| Accepted Phase 6 branch | `repair/phase-6-r1-validation-closure` |
| Accepted Phase 6 local SHA | `371e3e8a21a1d215ecaf2bf14b9f509432b230b0` |
| Accepted Phase 6 live origin SHA | `371e3e8a21a1d215ecaf2bf14b9f509432b230b0` |
| Local `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Local `origin/main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Live origin `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Starting worktree | Clean; no modified or untracked files |
| Merge policy | Linear commits only; no merge or rebase |
| Publication policy | Branch preview only; production `main` remains untouched |

The Phase 7A branch was created directly at the accepted Phase 6 SHA. The live
origin values were read with `git ls-remote`, not inferred from cached tracking
refs.

## Frozen opening hashes before Phase 7A

| Asset | SHA-256 | Result |
| --- | --- | --- |
| `public/brand/quantum-icon-white.svg` | `c660ed87bc5293bfbffa662e523343a7e83bc86cb94848912494e85e0dc9d4ff` | PASS |
| `public/brand/quantum-icon-color.svg` | `04dc37965b33587fea5f4664660f8a7f9a81ec7904d39925b41c6826b80cded9` | PASS |
| desktop H.264 | `f31b0d4582af6c54e722e628f72601ea851d8886dde36aca9379bd2bfddee2d3` | PASS |
| portrait H.264 | `eff1d8c39a9987c24a1c1cf176b5ddc7c4daeca0f992991d59a505cdf47950db` | PASS |
| landscape H.264 | `b3f197b17edd060195b15e5652ff23343d895bdbb32457ad183b62f1906f2dae` | PASS |
| desktop poster | `8dc5388108116da7202a6b8b24ea8fccb42ebc4cdfb50b861427488436e35979` | PASS |
| portrait poster | `e104fe5e3d0e471df2059919eb26eca7bb493929eca1000d8ab6ce95a611dee9` | PASS |
| landscape poster | `5692f67493faf34844a6e2eaa838999babbaaf6d1c7d10e51505587daeb1d679` | PASS |
| production media manifest | `06f9f5b256577ed1b0f159a435135fca6a78185be57b4db8853b9b276c080a54` | PASS |

The runtime cinematic payload is ignored staging output derived from the
hash-verified tracked Phase 4-R2.1 authority. The before hashes above were
calculated from the staged runtime files used by the accepted build.

## Accepted baseline production impact

The accepted baseline production build completed successfully before the first
source edit.

| Surface | Baseline |
| --- | ---: |
| JavaScript emitted under `dist/_astro` | 27,647 bytes across 14 files |
| CSS emitted under `dist/_astro` | 97,536 bytes across 9 files |
| Homepage cinematic JavaScript | 16,283 bytes raw / 5,777 bytes gzip |
| Build-reported total JavaScript | 34,272 bytes raw / 13,598 bytes gzip |
| Self-hosted production fonts | 84,420 bytes |

The two JavaScript totals use different accepted Phase 6 accounting surfaces:
the first is the literal emitted `_astro` file sum; the second is the existing
build verifier's page-script surface, which includes inline shared script.
Phase 7A final reporting will preserve both bases and compare like with like.

## Human authority

All six Phase 7A gates remain **PENDING HUMAN REVIEW**. This record does not
authorize Phase 7B, a merge to `main`, or self-acceptance of any visual result.
