# Phase 2A Operating Field Storyboard

Status: isolated creative-preproduction design lab; pending human review

Canary: `QH_PHASE2A_LAB_ONLY`

This directory renders deterministic static keyframes for the Phase 2A human visual gate. It is not a production route, runtime motion prototype or accepted final design.

## Isolation

- The lab lives outside Astro's `src/` and `public/` inputs.
- It references the existing governed Quantum fonts, brand marks and Maradin assets without copying them.
- It has no external network dependency.
- The Phase 2A isolation verifier fails if the lab canary or any lab path appears in production output.
- No production route depends on this directory.

## Views

- `?sheet=desktop` — twelve desktop keyframes.
- `?sheet=mobile` — seven independently authored mobile keyframes.
- `?sheet=transitions` — seven causal handoffs in three frames each.
- `?frame=d05-method-test` — one full-resolution frame.
- `?frame=m05-proof` — one full-resolution mobile frame.
- Append `&motion=reduced` to inspect the static reduced-motion edition.

The expected frames, viewports, transitions and retained evidence paths are governed by `capture-plan.json`.

## Deliberate limitations

- No production scroll choreography is implemented.
- No sticky section is implemented.
- No cinematic CRT media is integrated.
- No unapproved partner, facility or industry imagery is present.
- Maradin is the sole documentary proof and uses only existing approved assets.
