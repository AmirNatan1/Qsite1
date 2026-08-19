# Phase 1 font provenance

Status: verified self-hosted production font record
Retrieval date: 2026-08-19

## Delivery policy

Phase 1 uses no runtime Google Fonts stylesheet or third-party font request. Only the Latin WOFF2 files needed by the approved English site are self-hosted. The required fallback stacks remain active and are tested separately.

## Font binaries

| Family and use | Weight | Authoritative delivery URL | Bytes | SHA-256 |
| --- | ---: | --- | ---: | --- |
| Syne display | 800 | `https://fonts.gstatic.com/s/syne/v24/8vIS7w4qzmVxsWxjBZRjr0FKM_24vg6jTY8.woff2` | 13,684 | `1a340e84b78c7e1e7ed24306d682fdcd6dc8cc6cb52b158fbaf22c03f7f001c3` |
| Newsreader editorial | 400 | `https://fonts.gstatic.com/s/newsreader/v26/cY9qfjOCX1hbuyalUrK49dLac06G1ZGsZBtoBCzBDXXD9JVF438weI_wC-ZF.woff2` | 22,480 | `e66067814f1c672d33a457e4f4d102c818b481420e2234cf685ebdbf2f443904` |
| Inter UI | 400–600 | `https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2` | 48,256 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |

The URLs were returned by `fonts.googleapis.com/css2` for Syne 800, Newsreader 400 and Inter 400/500/600 using a current Chromium user agent. The CSS response itself is not used at runtime or committed.

## Licenses

All three families are distributed under the SIL Open Font License 1.1. Notices are preserved verbatim in `public/fonts/licenses/`.

| Family | Official repository path | Google Fonts Git blob | Local notice SHA-256 |
| --- | --- | --- | --- |
| Syne | `https://github.com/google/fonts/blob/main/ofl/syne/OFL.txt` | `f410e51ceb99dcbf9fb3048c09a525243001b542` | `cc43cdce6f91c57989af8459341c276655e34224e954fa69c2ad700831a742d8` |
| Newsreader | `https://github.com/google/fonts/blob/main/ofl/newsreader/OFL.txt` | `d2d4f407109e9c74b8ab502fc79b912408ab8e41` | `fdfad38143ec470553cae82a1e45320bdd1b9ec70415d37bd0171051d8a4ded8` |
| Inter | `https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt` | `21f6aff961064c2e429f570995e446bcdd555422` | `5b9321a4298cfeb6b34354164a1c3afc3db114569984c502b9b35d988fd58c57` |

## Fallback contract

- Display: `Arial Black, Arial, sans-serif`
- Editorial: `Georgia, Times New Roman, serif`
- UI: `Arial, Helvetica, sans-serif`

Preferred-font and forced-fallback browser matrices must both pass after any font binary, weight, CSS or copy change.
