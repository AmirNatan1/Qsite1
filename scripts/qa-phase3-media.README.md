# Phase 3 isolated media QA

This verifier audits the four Phase 3 delivery candidates without importing or serving the production site. It opens only the paths supplied on the command line, probes them with the supplied ffprobe executable, and exposes them to Chromium through a temporary loopback-only server.

Required candidate flags:

- --desktop-mp4
- --desktop-webm
- --mobile-mp4
- --mobile-webm

The --ffprobe and --output flags are also required. Candidate files, the report path, and any recorded-review path are rejected if they resolve inside src, public, or dist.

Example:

    node scripts/qa-phase3-media.mjs ^
      --ffprobe "C:\path\to\ffprobe.exe" ^
      --output "artifacts\evidence\phase-3\reports\phase-3-media-qa.json" ^
      --desktop-mp4 "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-desktop-h264.mp4" ^
      --desktop-webm "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-desktop-vp9.webm" ^
      --mobile-mp4 "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-mobile-h264.mp4" ^
      --mobile-webm "artifacts\original\phase-3-crt-opening\media\phase-3-crt-opening-mobile-vp9.webm" ^
      --headed ^
      --record-candidate desktop-webm ^
      --record-video "artifacts\original\phase-3-crt-opening\review\phase-3-media-lab-scrub-evidence.webm" ^
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

## Optional recorded media-lab evidence

Supplying --record-video creates a dedicated headed Playwright process that opens the real files in prototypes/phase-3-crt-media-lab. It loads the selected delivery candidate through the lab query-source control, operates the visible timeline with Home and End, clicks all five lab exercise buttons, starts playback through the focused native video control, and scrolls through the resulting evidence table and JSON preview. The recording does not replay the verifier's programmatic seek targets, impersonate the separate Page Visibility proof, or enter the production site.

Playwright records this interaction as WebM at the exact --record-video path. The path must end in .webm, must differ from the JSON report and all four candidate files, and must remain outside src, public, and dist. The report records the video's exact byte size and SHA-256 under browser.reviewVideo.output.

Recording requires --headed so the review artifact represents a visible-browser run. --record-candidate chooses desktop-mp4, desktop-webm, mobile-mp4, or mobile-webm; desktop-webm is the preferred default. Requesting a recording also makes complete browser execution mandatory.

The seeded targets and field ordering are deterministic. Wall-clock latencies, playback counters, browser versions, and rendered fingerprints are measurements and will naturally vary by machine.

Seek success is governed by target-time exactness, absence of a media error, and a ready state of HAVE_CURRENT_DATA or better. requestVideoFrameCallback presentation remains reported as telemetry, but a missing callback does not fail an otherwise exact, usable seek.

Final evidence deliberately separates three browser roles. Each candidate receives its own fresh headless managed-Chromium process for deterministic load, seek, rendered-frame, and linear-playback measurement without offscreen-window compositor artifacts. A separate temporary, normal, non-debugged Google Chrome profile is the natural Page Visibility authority: a loopback target and cover tab are switched with PID-scoped native Ctrl+Tab input, and the server must receive a visible-to-hidden-to-visible target lifecycle without a media error. A third headed managed-Chromium process records the actual media-lab UI interaction after candidate measurement is complete. The JSON launch policy names all three roles.

Headless `getVideoPlaybackQuality()` dropped-frame deltas remain reported as compositor telemetry but are not the displayed acceptance authority because no displayed surface exists in that role. The normal non-debugged Chrome target is explicitly foregrounded, records a one-second visible decoder warm-up, and then measures a second visible playback window before the tab switch. Warm-up and measured drops remain reported; the measured window must advance, present at least 90% of the authored 30 fps, and report zero corrupted frames. The selected recording candidate receives an additional headed control-driven quality record from the real media lab.

The --headed flag authorizes the normal visible Chrome lifecycle proof and is required for final Page Visibility evidence and recording. Without it, Page Visibility remains explicitly partial-hidden-tab-inconclusive and the report cannot become a full browser pass. The native proof runs against every supplied candidate. A requested recording passes its visibility field only by referencing the separate successful native proof for the same selected candidate; it never claims that Playwright's recording page became naturally hidden.

The loopback media server supports exact byte ranges, including suffix ranges, and destroys abandoned file reads when Chromium cancels a request during rapid scrubbing. This prevents canceled transfers from contaminating later seek measurements. Candidate decoder state is also process-isolated across the four formats.

If Chromium is unavailable, the report is still written as a partial ffprobe result. Partial browser evidence exits successfully by default so probe-only automation remains usable, but --require-browser makes missing or inconclusive browser evidence return a nonzero exit code.

## Report privacy

Absolute paths remain internal execution details. In the tracked JSON report, repository candidates and review recordings use forward-slash repository-relative paths; external ffprobe and Chromium executables use basename-only identities with an explicit path scope; and protected production roots are recorded only as src, public, and dist.

Immediately before writing JSON, the complete report is recursively sanitized, including browser, probe, and recording error strings. Path detection requires a start/whitespace/quote/parenthesis boundary, so logical HTTP URLs and media routes remain intact. A final assertion rejects Windows drive paths, user-home paths, temporary-directory paths, and known host roots. Report generation stops instead of writing if an absolute host path survives that privacy boundary.
