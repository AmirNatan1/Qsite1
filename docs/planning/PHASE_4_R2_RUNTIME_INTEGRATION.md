# Phase 4-R2 runtime integration

The Home cinematic selects exactly one cohort at initial load and does not
replace it after resize: portrait when width is at most 800 and height exceeds
width, landscape when width is at most 900, height is at most 480, and width
exceeds height, and desktop otherwise. Its native travel is 6.25 viewport
heights (5.45 on short desktop), 4.85 portrait, or 5.10 landscape.

The browser first reads the final staged Phase 4-R2 production manifest and
then fetches only its selected hash-named VP9 asset (or H.264 when VP9 is not
supported) into a Blob-backed, inert single video decoder. The final authority
is staged from artifacts/original/phase-4r2-final-cinematic-production/ to
public/media/cinematic/phase-4r2/; the staging helper verifies every
manifest-declared byte before copying. If final authority is not yet staged,
the runtime releases the page into the static experience instead of selecting
or fabricating any media.

Final staging is a closed authority-graph check, not a manifest-only copy. It
binds the manifest to the accepted Blender SHA-256
`b0c9c7c1cf5a1642870cf03a36791cc50ec31ac207aeae794fbea83c856a79c0`,
and independently re-reads the frozen 3,600,194-byte R1.1 `.blend` at its
tracked source path before either staging or output verification can pass,
the exact 500-frame/30-fps/`50/3`-second physical timeline, explicit
`mergeMain: false` and `phase5: false` denials, the three native delivery
decisions, all three stable frame manifests, media selection, encode quality,
both visual verdicts, all three codec-determinism reports, completion and
poster reports, and the exact six-video/three-poster payload inventory. Video
records must reproduce their source-master, frame-manifest, encode settings,
canonical argv, quality and selection bindings. Posters must reproduce their
F1, frame-manifest, derivation and PNG bindings. Any extra, missing, renamed,
fallback, stale, self-hashed, private-path-bearing, or byte-altered authority
fails before the atomic public-directory replacement.

The fixed cross-report records are
`manifests/phase-4r2-media-selection.json`,
`reports/phase-4r2-encode-quality-report.json`,
`reports/phase-4r2-master-visual-verdict.json`,
`reports/phase-4r2-encode-visual-verdict.json`, and one
`reports/phase-4r2-{desktop,portrait,landscape}-codec-determinism.json` per
family. The stager reads each exact path as a regular non-symlink file,
calculates its byte size and SHA-256, and rejects any disagreement with the
production manifest or its directly bound selection/quality authority.

Development staging retains the accepted dormant Phase 3 posters only as a
safe, local no-network fallback before final authority exists. The mandatory
release command is `npm run build:phase4r2-final`: it sets final-authority
mode itself, prunes every legacy flat cinematic payload, requires the final
manifest plus six videos and three posters under
`/media/cinematic/phase-4r2/{manifests,media,posters}`, builds, and rejects
any fallback or legacy cinematic asset in `dist`. Run that command after CP5
has supplied the complete final authority.

The stable manifest URL uses `max-age=0, must-revalidate`; the browser also
requests it with `cache: "no-cache"`. Only the content-hash-named files below
`media/` and `posters/` receive long immutable caching. Output verification
requires the emitted manifest bytes to equal the tracked manifest byte for
byte, then rechecks every emitted asset size and SHA-256 against that complete
tracked graph.

`npm run build` uses the same final path automatically once the tracked R2
authority root (or its manifest) exists. This is the Cloudflare Pages-safe
default: a partial authority is handed to the final stager and fails closed;
the ordinary development fallback remains available only while no R2
authority has been created.

Scroll maps to the continuous conceptual coordinate u = mapped progress × 540.
Physical video uses clamp(floor(u) + 1, 1, 500) at (frame - 1) / 30. Browser
black is u=[500,513), with its 13-frame breathing beat expressed as
(u - 500) / 13; semantic ENTRY starts at u=513 and reaches full presence at
u=540 through (u - 513) / 27. Evidence labels remain
clamp(floor(u) + 1, 1, 540). Header and ENTRY controls remain concealed and
inert until native progress reaches 0.9995, and the reverse journey restores
that state.
