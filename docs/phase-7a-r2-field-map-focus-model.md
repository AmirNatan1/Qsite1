# Phase 7A-R2 Field Map focus model

Status: repair candidate. The five independently accepted Phase 7A gates remain
frozen; only **ACCESSIBILITY + FALLBACK + PERFORMANCE** remains **PENDING HUMAN
REVIEW**.

Phase 7A-R2 begins directly from
`016fef45323432f25b3eea849512a707174fe6c5` on
`repair/phase-7a-r2-field-map-focus-semantics`. Production `main` remains
frozen at `501040c42bba30b9d9517b88a8f9857992a2dba4`. This repair does not
self-accept Phase 7A, authorize Phase 7B, or authorize a merge to `main`.

## Native semantic boundary

The Field Map remains a native `details` disclosure with one `summary`, a
labelled `nav`, and eight ordinary links. The summary retains its unique
`aria-controls="field-map-navigation"` relationship. It does not assert
`aria-haspopup`, an authored `aria-expanded`, or menu, dialog, application or
other substituted widget roles. The browser owns the native disclosure role
and collapsed or expanded state.

## Focus on open

Opening the enhanced Field Map establishes its open state and owned `inert`
background isolation before focus moves. Focus then moves directly to the link
whose `aria-current="page"` matches the current route. When no route is current,
focus moves to the first destination. There is no animation-frame delay.

The complete focus sequence, in document order, is:

1. Field map summary
2. Home — `/#entry`
3. For industry — `/for-partners/`
4. For startups — `/for-startups/`
5. Industries — `/industries/`
6. Proof — `/pocs/`
7. SPARK — `/spark/`
8. About — `/about/`
9. Contact — `/contact/`

## Keyboard traversal and close

Every unmodified `Tab` and `Shift+Tab` key press while the Field Map is open is
resolved against the current available nine-item sequence. The controller
prevents the native step and advances one position forward or backward modulo
the sequence length. This makes every step explicit: `Tab` from Contact wraps
to the summary, and `Shift+Tab` from the summary wraps to Contact. The behavior
does not depend only on boundary interception or on background tab order.

`Escape` prevents the open-state key action, closes the native `details`,
removes the root open marker, aborts focus containment, releases only Field
Map-owned `inert` state, and returns focus to the summary. Destination
navigation, history traversal, `pagehide`, and `pageshow` also close the map and
release its owned state without forcing focus return before navigation.

## Programmatic focus containment

While the enhanced map is open, one document-level `focusin` safeguard is
registered with a fresh `AbortController`. Focus is allowed only on the summary
or one of the eight available destination links. An attempted programmatic
focus move elsewhere is redirected to the current-route destination, or to Home
when no route is current.

Closing first aborts that controller, so the document listener exists only for
the current open interval. Repeated open and close cycles replace rather than
accumulate the safeguard, and focus outside the map remains available after
close. The persistent keyboard listener is scoped to the Field Map element,
not the document.

Background isolation has separate ownership. Regions already `inert` are not
claimed, and close removes `inert` only from regions marked and tracked by the
Field Map controller. The Field Map itself is never inside an owned inert
region.

## No-JavaScript behavior

Without JavaScript, the native summary still opens the `details` element and
the labelled navigation still exposes the same eight normal links. Native
browser semantics communicate the disclosure state; no authored
`aria-expanded` is required. The JavaScript-only focus loop, focus safeguard,
root marker and owned-inert controller are absent, so a failed or disabled
enhancement cannot hide or replace navigation.

## Browser evidence classification

Chromium and Firefox automated results may establish only the behaviors they
directly observe. Playwright WebKit remains a rendering and interaction proxy;
it is not physical Safari, VoiceOver, physical human input, or proof of Safari
BFCache or hidden-document lifecycle behavior. WebKit findings must therefore
remain labelled **PROXY**, and any physical-platform claim remains pending
separate evidence.
