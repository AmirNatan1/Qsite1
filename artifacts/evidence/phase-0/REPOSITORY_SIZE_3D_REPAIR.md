# Phase 0 3D Repair Repository-Size Evidence

Status: verified before the repair commit
Measurement date: 2026-08-17
Branch: `planning/phase-0-reconciliation`

## Candidate snapshot

The unignored candidate working set, measured immediately before adding this small Markdown record, contained 164 files totaling 124,551,851 bytes. The largest file was `artifacts/original/phase-0-3d-repair/review/field-unit-material-sheet.png` at 4,481,553 bytes.

| Measure | Result |
| --- | ---: |
| Candidate files at least 50 MiB | 0 |
| Candidate files at least 100 MiB | 0 |
| Existing local `.git` metadata before the repair commit | 10,358,002 bytes |
| Git LFS tracked files | 0 |
| `.gitattributes` present | no |

Git LFS 3.7.1 is installed on the workstation, but it is not configured for this repository and was not enabled. No file approaches the ordinary GitHub command-line upload ceiling, so this repair is committed through normal Git objects.

## Policy checked

GitHub's official repository-limits documentation recommends a 1 MiB maximum for individual Git objects for optimal performance, enforces a 100 MiB single-object ceiling, and enforces a 2 GiB push ceiling. GitHub's large-file guidance recommends keeping repositories below 1 GiB where practical and states that files larger than 100 MiB are blocked from ordinary Git storage.

- `https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits`
- `https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github`

Decision: the largest repair artifact is about 4.28 MiB, the complete candidate remains well below the recommended repository-size range, and Git LFS is neither required nor authorized.
