# Phase 0 real-media seek spike

This is a committed, non-production browser harness for the six genuine Blender Field Unit animatic encodes. It is not an Astro page, is not copied into `dist`, and must not become a public launch route.

## Run locally

From the Qsite1 repository root:

```text
npm run prototype
```

Open:

```text
http://127.0.0.1:4173/prototypes/phase-0-3d-media-spike/
```

The local server supports byte-range requests required for deterministic video seeking. It exposes only the two Phase 0 prototype directories, the historical Phase 0 original-artifact directory, and the repaired 3D `media` and `review` directories.

## Required real media

The harness reads these exact repository-owned files from `artifacts/original/phase-0-3d-repair/media/`:

```text
field-unit-animatic-vp9-g1.webm
field-unit-animatic-vp9-g6.webm
field-unit-animatic-vp9-g12.webm
field-unit-animatic-h264-g1.mp4
field-unit-animatic-h264-g6.mp4
field-unit-animatic-h264-g12.mp4
```

Missing or undecodable files are reported as failures. The harness does not substitute the earlier synthetic clip or any placeholder media.

## Measurement method

Every variant uses the same normalized bidirectional order:

```text
0 → .25 → .5 → .75 → .99 → .5 → .1
```

For each target, the harness:

1. registers a `seeked` listener;
2. registers `requestVideoFrameCallback` before assigning `currentTime`;
3. waits for both the completed seek and a presented frame within 0.055 seconds of the requested media time;
4. records event-to-presentation completion time, displayed-frame error and callback metadata;
5. snapshots `getVideoPlaybackQuality()` before and after the seek when the browser exposes it.

A small unreported decoder-priming seek is applied equally to each variant so the initial 0% measurement reliably produces a real seek event. The seven reported targets remain exactly the sequence above.

The live report appears in the page, is downloadable as JSON, and is always available as:

```text
window.phase0SeekReport
```

Use a current Chromium browser for the required `requestVideoFrameCallback` evidence. Keep native video controls available for visual inspection, and record browser/host context with any exported report.

## Interpretation boundary

This harness measures local browser behavior against real repaired Blender imagery. It does not by itself prove production Cloudflare performance, mobile-device memory behavior, Core Web Vitals or final cinematic acceptance. Those require their separately defined evidence passes.
