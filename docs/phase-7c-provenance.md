# Phase 7C provenance

Recorded before production implementation on 2026-09-03 (Europe/Madrid).

## Repository authority

| Authority | Recorded value |
| --- | --- |
| Repository | `AmirNatan1/Qsite1` |
| Phase 7C branch | `feature/phase-7c-territory-proof-threshold` |
| Current and required parent | `0994a5887fa90a4558275f3e66857aca5b4d4de9` |
| Human-accepted Phase 7B | `0994a5887fa90a4558275f3e66857aca5b4d4de9` |
| Local `main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| `origin/main` | `501040c42bba30b9d9517b88a8f9857992a2dba4` |
| Worktree | clean |
| Phase 7C upstream before first push | not yet configured |
| Merge commits from production `main` | `0` |

The accepted Phase 6 (`501040c42bba30b9d9517b88a8f9857992a2dba4`), accepted Phase 7A (`016fef45323432f25b3eea849512a707174fe6c5`), and accepted Phase 7B (`0994a5887fa90a4558275f3e66857aca5b4d4de9`) are all ancestors of the Phase 7C starting point.

## Frozen authority boundary

Phase 7C is additive. It may mount one new homepage chapter after the accepted `OperatingField` and add Phase 7C-namespaced component, state, controller, and stylesheet files. It must not alter the accepted physical opening, Signal Field, audience bifurcation, Field Map, or Operating Field implementation to make the new handoff easier.

The following accepted Phase 7B paths are frozen byte-for-byte against the required parent:

- `src/components/home/OperatingField.astro`
- `src/scripts/operating-field-state.mjs`
- `src/scripts/operating-field.ts`
- `src/styles/routes/phase-7b-operating-field.css`

The accepted Phase 7A, navigation, layout, and physical-controller files remain frozen as well. `src/pages/index.astro` may receive only the additive import, stylesheet import, and mount needed for Phase 7C. Any other difference is outside this phase's production authority.

## History policy

- Linear, narrow commits only.
- No merge or rebase of accepted history.
- No force push.
- No change to local or remote `main`.
- No Phase 7D work.
- The final review archive remains outside Git.
- All six Phase 7C creative gates remain `PENDING HUMAN REVIEW`.
