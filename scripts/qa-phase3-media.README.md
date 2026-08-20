# Phase 3 isolated media QA

This verifier audits the four Phase 3 delivery candidates without importing or serving the production site. It opens only the paths supplied on the command line, probes them with the supplied ffprobe executable, and exposes them to Chromium through a temporary loopback-only server.

Required candidate flags:

- --desktop-mp4
- --desktop-webm
- --mobile-mp4
- --mobile-webm

The --ffprobe and --output flags are also required. Candidate files and the report path are rejected if they resolve inside src, public, or dist.

Example:

    node scripts/qa-phase3-media.mjs ^
      --ffprobe "C:\path\to\ffprobe.exe" ^
      --output "artifacts\evidence\phase-3\reports\phase-3-media-qa.json" ^
      --desktop-mp4 "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-desktop-h264.mp4" ^
      --desktop-webm "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-desktop-vp9.webm" ^
      --mobile-mp4 "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-mobile-h264.mp4" ^
      --mobile-webm "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-mobile-vp9.webm" ^
      --headed ^
      --require-browser

The defaults match the authored Phase 3 contract: 30 fps, 9 seconds, 270 frames, a 12-frame GOP, 1920 by 1080 desktop media, and 720 by 1280 mobile media. Override flags exist for any deliberately revised contract.

The JSON report has schema quantum-hub.phase-3-media-qa.v1. Each candidate contains:

- exact file size and SHA-256;
- ffprobe container, codec, dimensions, frame rate, duration, frame count, bitrate, stream inventory, color fields, and keyframe positions;
- explicit pass/fail checks for the expected GOP and zero audio;
- Chromium metadata and first-usable-frame timing;
- first and final seeks plus rendered-element fingerprints;
- ten seeded random seeks;
- rapid alternating and tight-burst seeks;
- nearby-frame, forward, and reverse seek sequences;
- seek latency distribution;
- linear playback decoded/dropped-frame telemetry;
- hidden-tab behavior when Chromium exposes a real hidden visibility state;
- separate tested Chromium results and expected-but-not-executed Safari/iOS and Firefox compatibility notes.

The seeded targets and field ordering are deterministic. Wall-clock latencies, playback counters, browser versions, and rendered fingerprints are measurements and will naturally vary by machine.

A headless run may be unable to create a genuine hidden document. That result is explicitly partial-hidden-tab-inconclusive at candidate level and partial-browser-evidence-incomplete in the report summary; it can never become a full browser pass. Use --headed for the final focus/visibility evidence when the environment permits a visible Chromium window. If even a headed session cannot expose hidden state, the report requests a manual visible-browser focus-switch trace.

If Chromium is unavailable, the report is still written as a partial ffprobe result. Partial browser evidence exits successfully by default so probe-only automation remains usable, but --require-browser makes missing or inconclusive browser evidence return a nonzero exit code.
