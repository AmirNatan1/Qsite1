# Reference-site forensic audit

Audit target: `https://www.kunalrajelli.com/`
Audit date: 17 August 2026
Private evidence ID: `reference-audit-2026-08-17`
Storage: private Codex visualization workspace
Repository status: intentionally uncommitted

## Evidence and intellectual-property policy

The reference is an experience benchmark, not a production source. No reference screenshot, video, image, font, model, source code, class name, JavaScript, or proprietary media is stored in this repository or used in a Quantum artifact. This file contains observations and hashes only.

The audit distinguishes:

- **Direct**: observed in the public browser experience or browser-exposed resource behavior.
- **Inferred**: the most plausible mechanism class, without copying implementation code.
- **Unknown**: unavailable through the public experience and not asserted.

## Audit coverage

### Viewports

- 1440x900 desktop
- 1280x800 desktop
- 1024x768 compact desktop
- 768x1024 tablet
- 390x844 mobile
- 360x800 mobile
- 1366x650 short-height desktop

The browser's captured content dimensions can be smaller than the requested outer viewport because of browser chrome. Both requested and captured dimensions are preserved in the evidence manifest.

### Interaction passes

| Pass | Status | Notes |
|---|---|---|
| Slow forward scroll | Direct | Major visual beats and media-to-interface handoff inspected |
| Fast forward scroll | Direct | Immediate and settled states captured |
| Slow reverse scroll | Direct | Scene reconstruction and nested-scroll dependency inspected |
| Rapid direction changes | Direct | Settled state captured; no source code inspected |
| Trackpad-like small deltas | Direct | Reverse-after-small-deltas evidence captured |
| Mouse-wheel-like larger deltas | Direct | Fast-scroll evidence captured |
| Keyboard navigation | Direct | Focus-state evidence captured |
| Reduced-motion | Limited/unknown | Browser emulation did not establish a complete authored alternative with device certainty |
| Mobile touch | Limited | Mobile-width behavior inspected; genuine physical touch-device capture remains unknown |
| Fresh and repeat visit | Direct | Repeat-load evidence captured |
| Direct `/works` load | Direct | Direct route behavior captured |
| Case-detail interaction | Direct | Open state captured for accessibility review |

Full-session desktop and mobile recordings were not available. This is an explicit evidence limitation, not a negative finding.

## Direct observations

### Scene construction

- At widths of at least 768px, the opening uses a paused, muted, approximately 1920x1067, 8.042-second WebM whose current time follows document progress.
- Below 768px, the opening changes to a full-viewport canvas backed by 97 numbered JPEG frames.
- The cinematic section occupies approximately four viewport heights and contains a sticky 100vh scene, yielding approximately three viewport heights of travel.
- The cinematic media reaches its final frame at approximately 80% progress.
- The remaining progress becomes an amber bridge followed by a timed DOM reveal.
- The post-portal `/works` experience is a distinct full-screen `overflow-y:auto` scroller.
- No runtime WebGL requirement was observed for the audited opening. Desktop is consistent with pre-rendered video; mobile is consistent with a pre-rendered image sequence rendered to canvas.
- Core overlay typography remains DOM content rather than text burned into the opening media.

### Scroll topology

```text
native document scroll
└── approximately 4vh cinematic section
    └── sticky 100vh media scene
        ├── media-scrubbed opening
        ├── early media completion
        └── timed/amber DOM bridge
            └── nested full-screen /works overflow scroller
```

- Native document scroll controls the outer cinematic sequence.
- The separate `/works` scroller takes over after the handoff.
- That boundary creates a second scrollbar and can require another gesture after visible portal motion has completed.
- Reverse scrolling reconstructs the cinematic sequence only after the nested scroller has returned to its top.
- The cinematic media remains mounted behind the interface after handoff.
- Direct `/works` loading bypasses the opening.

Exact source-side easing values, JavaScript controller internals, and timeline constants are unknown and were not extracted.

### Camera and spatial motion

The directly visible progression is:

1. an oblique view of a child, laptop, and surrounding field;
2. an approach with a changing camera relationship;
3. increasing dominance of the laptop display;
4. near-frontal screen alignment;
5. screen fill and transition into the portfolio interface.

The source camera, focal length, orbit axes, dolly distance, roll, and exact frame timings are baked into proprietary media and remain unknown. Quantum retains only the principle of continuous spatial escalation toward an interface target.

### Typography, orientation, and microinteraction

- Overlay text remains sharp and viewport-oriented while the physical scene moves behind it.
- The post-portal interface supplies navigation and portfolio content but has substantially less structural depth than Quantum requires.
- Hover, background, audience-tab, book-call, and project-card states were captured.
- A keyboard focus state was observed and captured, but the opening did not expose a clearly visible skip-intro control during the audit.
- The audited output did not establish a semantic `<main>` for the opening.
- Decorative-media assistive-technology treatment was not visibly exposed.
- The case-detail state did not demonstrate complete dialog semantics or reliable focus transfer through public visual behavior.

### Responsive strategy

| Width class | Direct behavior | Quantum lesson |
|---|---|---|
| Desktop/tablet, at least 768px | One pre-rendered WebM scrubbed through a sticky scene | Pre-rendering can deliver a high visual ceiling without runtime WebGL |
| Mobile, below 768px | 97-frame canvas sequence | A separate mobile treatment is valuable, but an eager long sequence presents payload and memory risk |
| Short-height desktop | Same broad scene class within a constrained vertical viewport | Quantum must author collision-safe short-height framing |
| Reduced motion | Complete authored treatment not proven | Quantum must implement a separate static experience, not infer one |

## Performance and lifecycle observations

- Desktop carries a full cinematic WebM and mobile makes a long frame sequence available.
- Media remains mounted after the handoff, preserving reverse speed but retaining memory.
- The mobile frame sequence presents possible decoding, memory, and preload risks.
- The nested scroller complicates input ownership, reverse behavior, orientation changes, and browser history reasoning.
- The timed bridge can separate the moment visible motion is complete from the moment content accepts continued scroll.
- Exact CPU, GPU, decoder-memory, Core Web Vitals, and physical-device frame-rate values remain unknown; they cannot be inferred from screenshots.

Quantum therefore measures Retain, Pause, Partial release, and Full unload rather than copying the reference lifecycle. Reverse-scroll continuity remains the default priority.

## Accessibility observations and limits

Direct or visually supported concerns:

- no visible skip-intro control was observed;
- no semantic `<main>` was established from public output inspection;
- decorative media was not visibly marked as hidden from assistive technology;
- a nested full-page scroller increases keyboard and orientation complexity;
- case-detail focus management and dialog semantics were not proven;
- the timed bridge can separate scroll input from visible feedback.

Unknown without a complete assistive-technology audit:

- screen-reader announcements;
- exact landmark tree across every state;
- focus restoration on every overlay closure;
- genuine iOS/Android touch behavior;
- complete reduced-motion network behavior.

## Reference Mechanics Matrix

| Reference mechanic | What the user experiences | Likely mechanism | Why it works | Weakness or risk | Quantum adaptation | Originality departure | Reduced-motion fallback |
|---|---|---|---|---|---|---|---|
| Pinned opening | One continuous spatial world | Sticky viewport plus native outer scroll | Focus and anticipation | Can become overlong | One sticky cinematic shell | Dormant industrial proving ground and Spiral Conduction | Static poster in normal flow |
| Desktop camera motion | Approach, rotation, screen alignment | Scroll-scrubbed WebM | Physically continuous movement | Seeking and payload risk | Original pre-rendered Field Unit path if production-gated | Authored camera axis, Q geometry, cable choreography | No camera motion |
| Mobile motion | Similar narrative in compact form | 97-frame canvas sequence | Preserves progression | Preload, decode, and memory cost | Independent browser-native premium 2.5D composition | Fewer owned layers, no broad orbit, no long sequence | Mobile dormant poster |
| Environmental signal | Visual path toward the screen | Baked scene progression | Directs attention | Copying the subject/path risks imitation | One grounded physical spiral cable | Cumulative conduction front; no free-moving object | Cable remains dormant |
| Screen entry | Physical scene becomes an interface | Final media frames plus DOM overlay | Conceals the technical boundary | Timed blank/amber bridge | Matched Q screen/aperture and overlapping DOM | Powered industrial instrument, no laptop or amber wipe | Immediate semantic surface |
| Post-portal navigation | Portfolio interface appears | Nested full-screen scroller | Dramatic reveal | Second scrollbar and extra gesture | Native document content continues immediately | Operating surface with substantially greater content depth | Ordinary document flow |
| Reverse reconstruction | Scene can be revisited | Media/frame reversal after inner scroller returns to top | Spatial memory | Nested-scroller delay | Absolute body-progress reconstruction | Power-down plus inner-to-outer conduction retraction | Static hero remains |
| Typography over scene | Copy remains legible | DOM overlays | Sharp and accessible potential | Scene can compete with text | Semantic hero and actions from first paint | Quantum editorial hierarchy | Identical semantic copy |
| Media ownership | Media stays mounted after interface reveal | Persistent video/canvas | Fast reverse | Retained memory | Measured lifecycle controller | Pause-first and evidence-gated release | Cinematic runtime never created |
| Content depth | Compact portfolio interior | Limited `/works` system | Keeps reveal concise | Insufficient for Quantum | Eight later homepage chapters and semantic routes | Operational platform rather than portfolio scrapbook | All content visible |

## Evidence manifest

All listed artifacts are third-party reference evidence. They are identified for audit integrity but intentionally absent from Git.

| Interaction pass | Artifact filename | Captured dimensions | Bytes | SHA-256 | Status |
|---|---|---:|---:|---|---|
| Desktop narrative beats | `desktop-contact-sheet.png` | 1472x924 | 609791 | `bf3c3fb17e698bfd755368954fbe142dfefdeadf9b235acf41df92ebc5479943` | Private, uncommitted |
| Desktop portal before/during/after | `desktop-portal-triptych.png` | 1472x316 | 192038 | `2dc82b391de9fa2aee78ba63ddae6418541b0412b67fbe54e9a99dbddec7b968` | Private, uncommitted |
| Mobile narrative beats | `mobile-contact-sheet.png` | 812x1721 | 602991 | `ae6f94008218379b0d325267e7822be44e1f34380d32d276a28a48e626427d12` | Private, uncommitted |
| Mobile portal before/during/after | `mobile-portal-triptych.png` | 812x579 | 160011 | `0f8a5146e8d1fadfc5ab0c48c2a703346996a36577f3eef73b274c71e4c36e82` | Private, uncommitted |
| Fast forward, immediate | `desktop-1440x900-fast-scroll-immediate.png` | 1425x891 | 99202 | `18b77840a836def1b580c310fc6cf095a94ec22213bbb63e5896ef3e6ad57c2f` | Private, uncommitted |
| Fast forward, settled | `desktop-1440x900-fast-scroll-settled.png` | 1425x891 | 30655 | `777c34f651ee9fae9b946fec576dbf0f85f8d505eed6752311dd87888d7cd516` | Private, uncommitted |
| Keyboard focus | `desktop-1440x900-keyboard-focus.png` | 1425x891 | 98900 | `f36b6e9d9ffa213008f018337fcfb3e2d399eb6d660946d4a6a8c9e7ac4dfc59` | Private, uncommitted |
| Direct `/works` load | `desktop-1280x800-direct-works-load.png` | 1265x791 | 70180 | `952b90090cc3c0c2438772d82ec3e9d593af03980d88992d9142a785d760b1ce` | Private, uncommitted |
| Case detail open | `desktop-1440x900-case-detail-open.png` | 1440x900 | 69553 | `96391d4f664b029a6a68664621c6eb32095dbe91c40cf066e3a99b125753ce80` | Private, uncommitted |
| Repeat load | `desktop-1440x900-repeat-load.png` | 1425x891 | 53618 | `0f947edec8680e6e1bdfa9d39e035751b59ba0bffca83158bbd447278eafc0a6` | Private, uncommitted |
| Reverse with small deltas | `desktop-1440x900-reverse-after-small-deltas.png` | 1425x891 | 56384 | `be52d44ee75a3c2335f371d233ddc85e72d681c058f9e93d91133c5ca1f90e21` | Private, uncommitted |
| Mobile reverse to scene | `mobile-390x844-reverse-to-scene.png` | 375x812 | 5802 | `b8374ea9e86994d1961739b0d92f7a16bb030627e694bc51f8870aaac5189c01` | Private, uncommitted |

The private evidence workspace also contains individual progress captures for the required viewports and major beats. Their filenames, dimensions, byte sizes, and hashes remain available under the same private evidence ID. Absence from this compact manifest does not authorize committing those files.

## Audit conclusion

Quantum may adopt the class of experience: a scroll-controlled physical scene that becomes a native interface. It must not adopt the reference composition, assets, exact frame sequence, nested-scroll topology, mobile frame-preload strategy, or timed bridge. Spiral Conduction, the powered-off Field Unit, one-root handoff, authored mobile 2.5D path, and designed reduced-motion poster create a materially distinct Quantum mechanism.
