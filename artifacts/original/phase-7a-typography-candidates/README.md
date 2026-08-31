# Phase 7A typography candidate authority

This directory is a research-only, non-production authority for the Phase 7A
typography study. None of these files is served by Astro. The production
prototype loads only `public/fonts/anybody-latin-variable.woff2`; the three
challengers below are retained solely to make the specimen comparison
reproducible.

| Candidate | Upstream pin | Local file | Bytes | SHA-256 | Licence |
| --- | --- | --- | ---: | --- | --- |
| Mona Sans 2.0.27 | `0f7dc66ddd766605eb0e75c3f47bf9d1dd38ceca` | `mona-sans-v2.0.27-variable.woff2` | 307,976 | `875ad1fab0c1f4854927fa8086963fb6ddd4608b04a58b267cddf8a9d78f80d3` | `OFL-Mona-Sans.txt` |
| Bricolage Grotesque | `84745e5b96261ae5f8c6c856e262fe78d1d6efdd` | `bricolage-grotesque-variable.woff2` | 204,636 | `b51a8ebd169637e47cb7db430431ab3e122d2f09b03ee2a03ea06f4cb46f1a8e` | `OFL-Bricolage-Grotesque.txt` |
| Archivo | `b5d63988ce19d044d3e10362de730af00526b672` | `archivo-variable.ttf` | 658,596 | `664bbeb10522dac35c174a3860aaecad7b1ad3a0fc8b0d26888e26c824ec556d` | `OFL-Archivo.txt` |
| Archivo static comparison | same pin | `archivo-semi-condensed-bold.woff2` | 53,508 | `1194eb36f975285a201e0605f3a98ad6946bfc2ca8f3947532373d491bef1bc8` | `OFL-Archivo.txt` |

Anybody's pinned production provenance and OFL text are recorded in
`docs/phase-7a-typography-study.md` and
`public/fonts/licenses/OFL-Anybody.txt`.

`specimens.html` is a standalone comparison surface. It must be served from the
repository root by the Phase 7A capture tool; it is not a public website route.

