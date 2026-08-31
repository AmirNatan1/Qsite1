# Phase 7A typography candidate authority

This directory is a portable, research-only, non-production authority for the
Phase 7A typography study. None of these files is served by Astro. The folder
contains local copies of all four proof fonts and their licences so the
comparison does not depend on a repository-root URL or a remote request.

| Candidate | Upstream pin | Local file | Bytes | SHA-256 | Licence |
| --- | --- | --- | ---: | --- | --- |
| Anybody | `fe7b55cf9d1563348ad95ac8e05f43b81a420c31` | `anybody-variable.woff2` | 69,612 | `27bf65457ce65fb6fdad625c5003cf14e2e6492afc30671ec9ec8fd1efb16fdb` | `OFL-Anybody.txt` |
| Mona Sans 2.0.27 | `0f7dc66ddd766605eb0e75c3f47bf9d1dd38ceca` | `mona-sans-v2.0.27-variable.woff2` | 307,976 | `875ad1fab0c1f4854927fa8086963fb6ddd4608b04a58b267cddf8a9d78f80d3` | `OFL-Mona-Sans.txt` |
| Bricolage Grotesque | `84745e5b96261ae5f8c6c856e262fe78d1d6efdd` | `bricolage-grotesque-variable.woff2` | 204,636 | `b51a8ebd169637e47cb7db430431ab3e122d2f09b03ee2a03ea06f4cb46f1a8e` | `OFL-Bricolage-Grotesque.txt` |
| Archivo | `b5d63988ce19d044d3e10362de730af00526b672` | `archivo-variable.ttf` | 658,596 | `664bbeb10522dac35c174a3860aaecad7b1ad3a0fc8b0d26888e26c824ec556d` | `OFL-Archivo.txt` |
| Archivo static comparison | same pin | `archivo-semi-condensed-bold.woff2` | 53,508 | `1194eb36f975285a201e0605f3a98ad6946bfc2ca8f3947532373d491bef1bc8` | `OFL-Archivo.txt` |

The static Archivo WOFF2 remains a packaging reference; `specimens.html` uses
the variable TTF so both Archivo width states remain observable.

## Proof states

| Candidate | Stored / narrow | Resolved / wide |
| --- | ---: | ---: |
| Anybody | `wdth 58` | `wdth 112` |
| Mona Sans | `wdth 75` | `wdth 125` |
| Bricolage Grotesque | `wdth 75` | `wdth 100` |
| Archivo | `wdth 62` | `wdth 125` |

`specimens.html` uses only `./` font URLs. It may be opened directly where the
browser permits local font loading, or this directory may be served as the root
of any local static server. It is not a public website route and must not be
copied into the production output.
