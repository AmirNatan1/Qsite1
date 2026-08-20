# Phase 3 CRT media lab

Status: isolated, non-production browser QA surface

Canary: `QH_PHASE3_MEDIA_LAB_ONLY`

This dependency-free lab inspects encoded Phase 3 cinematic candidates without importing them into the Astro site. It
is deliberately located outside `src/` and `public/`; nothing in this directory is a production route or a Phase 4
integration.

## Open the lab

The local-file workflow needs no server: open `index.html` in a browser and choose a video with **Local video file**.
The browser creates a temporary blob URL; the chosen file is not uploaded or copied into the repository.

When the repository is served from a local static-server root, a same-origin media path can be supplied with `src`:

```text
/prototypes/phase-3-crt-media-lab/?src=/path/to/candidate.webm&fps=24
```

`src` may also be a fully qualified URL when the serving environment's media policy permits it. URL behavior is a
browser input feature, not an external runtime dependency of the lab. `fps` is optional and defaults to 24; it controls
the estimated frame readout and final-frame safety offset.

## Exercises

- Normalized slider with progress, time, estimated frame, dimensions, and media-ready-state readouts.
- Explicit first- and final-frame jumps.
- Ten cryptographically sampled random seek targets between 1% and 99%.
- Ten rapid alternating seeks between early and late timeline regions.
- An eleven-step forward/reverse traversal through the complete timeline.
- Hidden-tab telemetry recording hidden duration, media-time advance, and playback state before and after return.
- JSON export containing source facts, environment capabilities, per-seek latency, presented-frame data where supported,
  playback-quality deltas, failures, cancellations, and visibility events.

Native HTML controls, labels, focus indicators, and status announcements provide keyboard access. The timeline keeps
native Arrow, Page Up/Down, Home, and End behavior. Outside form controls, `[` and `]` step one configured frame while
`0` and `9` jump to the first and final frame.

## Evidence boundary

- Do not place raw masters, frame sequences, codec experiments, or transfer ZIPs in this directory.
- Do not move the lab into `public/` or add an Astro route for it.
- Do not import production source, fonts, media, or third-party packages.
- Exported JSON remains a local download until intentionally placed in the governed Phase 3 evidence area.
- Run `node --test tests/phase3-isolation.test.mjs` to verify this boundary and the frozen Phase 2B homepage hashes.

The lab exercises media deterministically except for the explicitly random ten-target run. It does not implement native
scroll mapping, document locking, cinematic-to-DOM transition, or any other Phase 4 behavior.
