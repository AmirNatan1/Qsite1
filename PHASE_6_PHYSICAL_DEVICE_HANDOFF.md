# Phase 6 physical-device handoff

Status: **PENDING HUMAN DEVICE REVIEW**  
Automation is not physical hardware. Playwright WebKit is not an iPhone and headed Playwright Firefox is not a touch/trackpad substitute.

Preview to test after final deployment:

- Branch preview: `https://feature-phase-6-global-hardening.qsite1.pages.dev/`
- Immutable preview: replace this line with the observed immutable Phase 6 URL from the final deployment report before review.

Use the branch preview for the test script and the immutable preview only to confirm the same opening frame and version. Record the device/OS/browser version and whether Low Power Mode, Reduce Motion or data-saving is enabled.

## A. iPhone Safari — approximately 8 minutes

Use a physical iPhone in portrait. Make one continuous screen recording with touch indicators if available.

1. Close the existing tab, open the bare preview root, and wait for the first frame. Expected: the dark proving hall and dormant cable/CRT appear; the H1 and header do not flash over the film. Failure: blank field, visible manifesto flash, wrong first frame or blocked page.
2. Make the smallest practical upward swipe. Expected: visible current progress begins immediately and remains causally ordered. Failure: a dormant gesture, automatic playback or a jump unrelated to finger travel.
3. Make a medium momentum swipe, lift, and touch to stop mid-current. Expected: native momentum behaves like Safari; after the page stops, the physical frame freezes. Failure: continued animation, snapping or a scroll lock.
4. Reverse slowly. Expected: current/cable state reconstructs deterministically. Failure: popping, stale frame, wrong direction or a semantic overlay lingering over dominant physical media.
5. Advance through CRT arrival, indicator, line, raster and Q, then stop at each practical landmark. Expected: each is scroll-controlled and paused; no playback clock runs.
6. Cross the black threshold with one normal gesture and stop scrolling. Expected: the manifesto fades autonomously in about 720 ms; the document does not wait for another gesture. Reverse before/after it resolves, then re-enter. Expected: it clears and replays cleanly.
7. From another route tap the Quantum logo or Home, and also open the preview directly with `/#entry`. Expected: the manifesto is the arrival, no F1 flash occurs, and reverse scrolling can reach the physical poster/cinematic.
8. Rotate portrait → landscape → portrait once while stopped mid-current and once at the manifesto. Expected: stable native position, coherent family/fallback, no black-level flash, clipping or address-bar jump trap.
9. Background Safari for five seconds, return, then continue in both directions. Expected: paused state remains coherent; no duplicate media request, stale header or restarted automatic motion.
10. Open the mobile menu, use Escape-equivalent dismissal if a hardware keyboard is attached or tap outside, then navigate to Maradin. Expected: menu state does not survive Back unexpectedly and focus is not trapped.
11. On Maradin, start the first video, then the second. Expected: no source/decoder exists before the tap; only one plays at once; the first returns to its poster when the second starts. Background/foreground once. Expected: hidden playback stops and the launch state is usable on return.

Provide: one 60–120 s opening/threshold recording, one 20–40 s orientation/background recording, one 20–40 s Maradin recording, and screenshots of any failure with the URL bar visible.

## B. Precision trackpad — approximately 6 minutes

Use a physical Windows Precision Touchpad or Mac trackpad in a current Chromium/Safari browser. Record the pointer and scroll bar where practical.

1. Fresh-load bare `/`; apply several micro-deltas. Expected: the first positive document movement visibly leaves F1. Failure: any repeatable positive-scroll dead zone.
2. Perform one long inertial gesture and do not touch again. Expected: native inertia owns travel; fast movement may skip intermediate states and the latest document position wins.
3. Reverse immediately during inertia, then stop mid-state. Expected: prompt reversal, deterministic frame, no catch-up animation after the document stops.
4. Use one fast gesture to skip toward the threshold. Expected: no lock and no “scroll again to continue” gate.
5. Stop at current, CRT arrival, line/raster and Q landmarks. Expected: physical frame remains paused with no tearing or delayed settle.
6. Navigate to a supporting route, activate Home (`/#entry`), reverse into the physical chapter, then go Back and Forward twice. Expected: native history position, no F1/semantic flash, no duplicate fade, listener or request.
7. Open and close the mobile-width menu using keyboard and pointer if the device is a small convertible. Expected: visible focus, Escape closes and returns focus, Back does not resurrect stale open state.

Provide: one 60–90 s recording showing micro-deltas, inertia, reversal and stop; one 30–45 s Home/history recording; browser/OS/trackpad model.

## C. Mouse wheel — approximately 5 minutes

Use a physical detented mouse wheel in desktop Chromium or Firefox.

1. Fresh-load bare `/` and move exactly one notch forward. Expected: visible physical progress on the first notch. Failure: dormant F1 or an automatic multi-state run.
2. Send rapid repeated notches, stop, then reverse with one and several notches. Expected: latest native position wins; the frame freezes at rest and reverses causally.
3. Stop near line, raster and Q. Expected: recognizable paused states without tearing or a playback clock.
4. Cross into the manifesto with repeated notches, stop input, and wait. Expected: the semantic-only fade finishes autonomously while scroll position stays fixed.
5. Test wheel forward/reverse on For industry, For startups, Industries, Proof, SPARK and About. Expected: ordinary document flow, no supporting-route sticky scene or skipped content.
6. Activate Home from one supporting route and from the real 404. Expected: `/#entry` arrival without F1 flash; reverse returns naturally to the physical opening.

Provide: one 60–90 s recording and a short note identifying mouse model, OS, browser and wheel setting.

## Review outcome

For each device class, record one of `ACCEPT`, `REPAIR` or `REDIRECT`, link the supplied evidence, and identify the exact step for every failure. Until a human supplies real-device evidence, none of these tests is a machine PASS and all remain **PENDING HUMAN DEVICE REVIEW**.

