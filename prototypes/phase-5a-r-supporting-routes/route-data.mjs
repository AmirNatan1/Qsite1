// QH_PHASE5AR_ROUTE_LAB_ONLY
// Local speculative planning data. No descriptor in this file is approved new public copy.

export const ROUTE_ORDER = Object.freeze([
  "for-industry",
  "for-startups",
  "industries",
  "proof",
  "maradin",
  "spark",
  "about",
  "contact",
  "404",
]);

export const EXPECTED_ACT_COUNTS = Object.freeze({
  "for-industry": 4,
  "for-startups": 4,
  industries: 4,
  proof: 2,
  maradin: 6,
  spark: 3,
  about: 3,
  contact: 1,
  "404": 1,
});

export const EXPECTED_DOCUMENT_REGIONS = Object.freeze({
  ...EXPECTED_ACT_COUNTS,
  industries: 6,
});

export const VIEWPORTS = Object.freeze([
  { id: "desktop", width: 1440, height: 900 },
  { id: "short-desktop", width: 1366, height: 650 },
  { id: "desktop-1280", width: 1280, height: 800 },
  { id: "tablet-landscape", width: 1024, height: 768 },
  { id: "tablet-portrait", width: 768, height: 1024 },
  { id: "mobile", width: 390, height: 844 },
  { id: "mobile-360", width: 360, height: 800 },
  { id: "mobile-narrow", width: 320, height: 800 },
  { id: "landscape-740", width: 740, height: 360 },
  { id: "landscape-800", width: 800, height: 360 },
  { id: "landscape-844", width: 844, height: 390 },
  { id: "landscape-896", width: 896, height: 414 },
  { id: "landscape-900", width: 900, height: 480 },
]);

const shared = Object.freeze({
  status: "PREPRODUCTION · PUBLIC ROUTE UNCHANGED · PHASE 5B UNAUTHORIZED",
  dependencies: ["semantic HTML", "shared Dark V2 foundations", "native document scroll"],
});

export const ROUTES = {
  "for-industry": {
    slug: "for-industry",
    publicPath: "/for-partners/",
    publicLabel: "For industry",
    eyebrow: "operating route 01",
    title: "Turn industrial needs into testable decisions.",
    lede: "How does an operational need become a responsible test and decision route?",
    purpose: "Frame a real industrial challenge, source relevant candidates and move toward bounded evidence.",
    architecture: {
      actCount: 4,
      documentRegions: 4,
      documentLength: "long / 4.5–5.5 viewport target",
      overtureTopology: "central pressure aperture",
      h1Placement: "inside the upper-left edge of the working pressure aperture",
      dominantGeometry: "opposing structural masses and one narrowing working aperture",
      primaryDensity: "dense, heavy and procedural",
      mediaDominance: "none; CSS pressure field",
      transitionGrammar: "Focus-heavy continuous compression, then Cross and Resolve",
      endingBehavior: "decision aperture release",
      closestVisualSibling: "for-startups",
      antiTemplateDistinction: "Although both operating-family routes have four acts, Industry continuously compresses a challenge through one aperture while Startups conducts an edge signal through open conditional channels.",
    },
    acts: [
      { id: "pressure", kicker: "pressure", title: "Operational pressure", map: ["Operational pressure"], note: "The challenge enters as material load before process language appears." },
      { id: "frame", kicker: "focus", title: "Challenge definition", map: ["Challenge definition"], note: "Ownership, criteria and the working boundary tighten the same aperture." },
      { id: "test", kicker: "cross", title: "Search through test", map: ["Search field", "Candidate narrowing", "Test threshold"], note: "Search, narrowing and test are one continuous passage rather than three rectangular chapters." },
      { id: "decision", kicker: "resolve", title: "Decision route", map: ["Decision route"], note: "The compressed field releases into one qualified decision plane." },
    ],
    signatureStates: ["Load", "Bound", "Narrow", "Cross", "Resolve"],
    materials: ["dense structural graphite", "pressure seam", "scored steel boundary", "warm decision aperture"],
    motionMode: "C",
    publication: ["No partner or facility implication", "No metrics", "No service-brochure claims", "No overstated commercialisation"],
    performance: "5–7 KB CSS; 1.5–2.5 KB optional input-driven JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "working aperture"], strategy: "Three-line title sits within the pressure system; only decorative mass edges may crop." },
    portrait: { foreground: "working aperture", removed: "far secondary mass detail", scale: "one tall pressure slot", fullBleed: "structural mass edges", order: "pressure → criteria → test → decision", simplification: "one local progress field", identity: "compression remains visible at 320px" },
    conversion: "Resolve to the existing qualified contact intent only; destination remains unverified.",
    next: "for-startups",
    ...shared,
  },

  "for-startups": {
    slug: "for-startups",
    publicPath: "/for-startups/",
    publicLabel: "For startups",
    eyebrow: "operating route 02",
    title: "Bring your technology into the real world.",
    lede: "What must align before a technology can credibly enter an industrial field test?",
    purpose: "Show how a technology signal is tested for relevance, fit and field readiness without promising an outcome.",
    architecture: {
      actCount: 4,
      documentRegions: 4,
      documentLength: "medium / 3.75–4.5 viewport target",
      overtureTopology: "edge-origin signal alignment corridor",
      h1Placement: "low in the open field, aligned to the incoming signal rather than a left column",
      dominantGeometry: "several conductive alignment channels resolving into one corridor",
      primaryDensity: "open, directional and conditional",
      mediaDominance: "none; CSS signal and corridor",
      transitionGrammar: "Conduct-heavy lateral travel, then Focus and Cross",
      endingBehavior: "open field-access threshold",
      closestVisualSibling: "for-industry",
      antiTemplateDistinction: "Although both operating-family routes have four acts, several open conditional channels resolve toward field access rather than compressing a challenge through one heavy aperture.",
    },
    acts: [
      { id: "signal", kicker: "conduct", title: "Technology signal", map: ["Technology signal"], note: "A small exterior signal enters from the document edge." },
      { id: "conditions", kicker: "align", title: "Readiness and relevance", map: ["Readiness", "Relevance"], note: "Parallel conditions remain visible without becoming cards or a qualification dashboard." },
      { id: "fit", kicker: "focus", title: "Industrial fit", map: ["Industrial fit", "Field threshold"], note: "One route aligns while alternatives remain conditional." },
      { id: "field", kicker: "cross", title: "Evidence in the field", map: ["Evidence"], note: "The corridor releases into a larger operating field without promising access or outcome." },
    ],
    signatureStates: ["Signal", "Branch", "Align", "Cross", "Field"],
    materials: ["thin conductive surface", "open negative space", "tolerance channel", "conditional warm field"],
    motionMode: "C",
    publication: ["No guaranteed POC", "No guaranteed customer or investment", "No procurement or success implication", "Keep field access conditional"],
    performance: "5–7 KB CSS; 1.5–2.5 KB optional input-driven JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "incoming signal", "field threshold"], strategy: "The signal runs beneath and beyond a complete three-line title; no dedicated right-hand slab." },
    portrait: { foreground: "selected signal channel", removed: "minor tolerance channels", scale: "vertical corridor", fullBleed: "open field edge", order: "signal → conditions → fit → field", simplification: "secondary channels become static", identity: "conductive route remains recognizable at 320px" },
    conversion: "Continue to SPARK context or the existing startup contact intent; no invented destination.",
    next: "industries",
    ...shared,
  },

  industries: {
    slug: "industries",
    publicPath: "/industries/",
    publicLabel: "Industries",
    eyebrow: "four operating territories",
    title: "Four contexts. Four material fields.",
    lede: "Which operating contexts are in scope, and how does each one feel materially different?",
    purpose: "Make the four approved domains spatially distinct before their headings are read.",
    architecture: {
      actCount: 4,
      documentRegions: 6,
      documentLength: "long and variable / 5.25–6.25 viewport target",
      overtureTopology: "four-territory threshold band",
      h1Placement: "spanning the threshold where four incompatible territory fields meet",
      dominantGeometry: "four materially different viewport architectures",
      primaryDensity: "four distinct density peaks",
      mediaDominance: "none; territory-specific CSS material families",
      transitionGrammar: "Release and Resolve rebuild the grid between territories",
      endingBehavior: "shared operating-context coda",
      closestVisualSibling: "maradin",
      antiTemplateDistinction: "The territories are the document architecture: low horizon, depth passage, nested fixture and vertical span, not four rows or media chapters.",
    },
    acts: [
      { id: "automotive", kicker: "low horizon", title: "Automotive & Mobility", map: ["Automotive & Mobility"], note: "Wide, low and lateral: velocity reads before the heading." },
      { id: "logistics", kicker: "transfer", title: "Logistics & Supply Chain", map: ["Logistics & Supply Chain"], note: "Modular passage routes through stacked depth." },
      { id: "manufacturing", kicker: "tolerance", title: "Industry 4.0 / Advanced Manufacturing", map: ["Industry 4.0 / Advanced Manufacturing"], note: "Nested fixtures and controlled repetition tighten the field." },
      { id: "energy", kicker: "load", title: "Energy & Infrastructure", map: ["Energy & Infrastructure"], note: "Vertical spans, load and conduit establish the largest scale." },
    ],
    signatureStates: ["Threshold", "Horizon", "Transfer", "Fixture", "Span", "Context"],
    materials: ["velocity horizon", "stacked transfer graphite", "machined fixture", "loaded infrastructural span"],
    motionMode: "C",
    publication: ["Exactly four approved industries", "No defense or dual-use", "Technology categories are not extra industries", "No facility claims"],
    performance: "7–10 KB CSS; 2.5–4 KB optional current/adjacent controller; zero media",
    shortLandscape: { mustShow: ["complete H1", "four territory silhouettes"], strategy: "Four shallow territory signatures form the lower threshold; no carousel and no clipped headline." },
    portrait: { foreground: "territory material", removed: "shared four-up overview after overture", scale: "each territory becomes full-bleed", fullBleed: "all four acts with different crops", order: "horizon → transfer → fixture → span", simplification: "current/adjacent states only", identity: "each territory retains a different grid at 320px" },
    conversion: "Resolve into shared operating context and the existing For industry route.",
    next: "proof",
    ...shared,
  },

  proof: {
    slug: "proof",
    publicPath: "/pocs/",
    publicLabel: "Proof",
    eyebrow: "evidence archive / one record",
    title: "Evidence before scale.",
    lede: "What does a disciplined public proof record look like?",
    purpose: "Treat one public proof as depth and confidence, not as an incomplete library.",
    architecture: {
      actCount: 2,
      documentRegions: 2,
      documentLength: "very short / 1.75–2.5 viewport target",
      overtureTopology: "quiet archive punctured by one Maradin record aperture",
      h1Placement: "high within the archive void while the record poster is already visible",
      dominantGeometry: "one deep archive boundary and one real record",
      primaryDensity: "sparse and confident",
      mediaDominance: "one governed Maradin poster appears immediately",
      transitionGrammar: "one Cross from abstraction into evidence",
      endingBehavior: "poster and record title become the Maradin entry",
      closestVisualSibling: "maradin",
      antiTemplateDistinction: "Proof is a sparse archive threshold with one record; Maradin is the long documentary record itself.",
    },
    acts: [
      { id: "threshold", kicker: "archive threshold", title: "Evidence before scale", map: ["Evidence philosophy", "POC discipline"], note: "Discipline and truthful scarcity occupy one quiet threshold." },
      { id: "record", kicker: "one record", title: "Maradin", map: ["Single public record", "Maradin aperture"], note: "The approved poster punctures the archive early and takes visual authority." },
    ],
    signatureStates: ["Quiet", "Puncture", "Open", "Enter"],
    materials: ["archival black", "deep record edge", "documentary poster light", "quiet evidence caption"],
    motionMode: "B",
    publication: ["Exactly one public proof", "No anonymous or confidential placeholders", "No metrics", "No more-coming-soon filler"],
    performance: "4–6 KB CSS; 0–1.5 KB optional threshold JS; approved 86 KB poster",
    shortLandscape: { mustShow: ["complete H1", "record poster"], strategy: "A tall poster aperture punctures the shallow archive beside a complete title and question." },
    portrait: { foreground: "approved poster", removed: "excess archive void", scale: "record becomes reading width", fullBleed: "poster at the record threshold", order: "threshold → record", simplification: "record starts open", identity: "one real record interrupts abstraction" },
    media: ["/media/maradin/maradin-field-aperture-poster-approved.jpg"],
    conversion: "Open the Maradin record directly; no secondary case architecture.",
    next: "maradin",
    ...shared,
  },

  maradin: {
    slug: "maradin",
    publicPath: "/pocs/maradin/",
    publicLabel: "Maradin",
    eyebrow: "field record 01",
    title: "Maradin — Dynamic Ground Projection",
    lede: "What happened in the field, under what conditions, and what was responsibly learned?",
    purpose: "Present the approved public record as documentary evidence with restrained editorial structure.",
    architecture: {
      actCount: 6,
      documentRegions: 6,
      documentLength: "longest / 5.5–6.75 viewport target",
      overtureTopology: "full-bleed documentary evidence opening",
      h1Placement: "inside a matte editorial cut on the first governed field image",
      dominantGeometry: "documentary image, crop and matte relationships",
      primaryDensity: "evidence-led and varied",
      mediaDominance: "governed Maradin documentary media carries the page",
      transitionGrammar: "documentary cuts and matte changes rather than abstract transforms",
      endingBehavior: "quiet observed-evidence hold",
      closestVisualSibling: "proof",
      antiTemplateDistinction: "Maradin is the documentary record itself; real evidence replaces interface geometry from the first viewport onward.",
    },
    acts: [
      { id: "opening", kicker: "field reality", title: "Maradin", map: ["documentary opening"], note: "Approved field imagery establishes reality before interface architecture." },
      { id: "challenge", kicker: "operational problem", title: "Challenge", map: ["Challenge"], note: "The approved challenge narrative sits beside a restrained field crop." },
      { id: "technology", kicker: "physical technology", title: "Technology", map: ["Technology"], note: "Physical technology is carried by evidence framing, never a graphite placeholder." },
      { id: "test", kicker: "test environment", title: "Test design", map: ["Test design", "Execution"], note: "Crop and matte relationships establish conditions and sequence." },
      { id: "evidence", kicker: "observed evidence", title: "Evidence", map: ["Evidence"], note: "Observation remains qualified; no metric or outcome is invented." },
      { id: "conclusion", kicker: "restraint", title: "Next step", map: ["Next step"], note: "The record ends quietly in the approved next-step wording." },
    ],
    signatureStates: ["Reality", "Problem", "Technology", "Test", "Observation", "Restraint"],
    materials: ["documentary field image", "matte editorial cut", "physical ground and vehicle context", "quiet caption surface"],
    motionMode: "B",
    publication: ["Approved narrative fields only", "No commercial success or procurement claim", "No invented metrics", "Preserve qualified next-step wording"],
    performance: "6–9 KB CSS; 1–2 KB optional threshold JS; existing governed stills and user-initiated videos only",
    shortLandscape: { mustShow: ["complete H1", "documentary image", "question"], strategy: "Two or three intentional title lines sit in a matte cut beside a wide governed crop; the em dash never strands." },
    portrait: { foreground: "documentary media", removed: "abstract interface slabs", scale: "edge-to-edge evidence frames", fullBleed: "opening and alternating evidence acts", order: "media and caption order follows the record", simplification: "static still-first composition", identity: "field imagery remains dominant at 320px" },
    media: [
      "/media/maradin/maradin-field-aperture-poster-approved.jpg",
      "/media/maradin/maradin-prove-field-frame-approved.jpg",
      "/media/maradin/maradin-real-field-still-approved.jpg"
    ],
    conversion: "Return to Proof or continue to the existing qualified contact intent; no outcome claim.",
    next: "spark",
    ...shared,
  },

  spark: {
    slug: "spark",
    publicPath: "/spark/",
    publicLabel: "SPARK",
    eyebrow: "programme / closed threshold",
    title: "A runway from MVP+ to industrial POC.",
    lede: "What is the programme route, and what can I do while applications are closed?",
    purpose: "Explain the programme while making its closed status unmistakable and non-dead-end.",
    architecture: {
      actCount: 3,
      documentRegions: 3,
      documentLength: "short / 2.25–3 viewport target",
      overtureTopology: "programme runway approaching a sealed closed gate",
      h1Placement: "along the runway edge with Applications closed inside the first threshold",
      dominantGeometry: "one conductive runway, one sealed barrier and one lateral release",
      primaryDensity: "spare and institutional",
      mediaDominance: "none; dormant gate material",
      transitionGrammar: "Conduct stops deliberately, then Resolve releases sideways",
      endingBehavior: "closed status with contextual startup route",
      closestVisualSibling: "for-startups",
      antiTemplateDistinction: "SPARK has one runway that terminates at a sealed applications-closed gate; the general startup corridor remains conditional and open.",
    },
    acts: [
      { id: "runway", kicker: "conduct", title: "Programme runway", map: ["Programme proposition", "Eligibility", "Readiness route"], note: "Proposition and readiness occupy one approaching runway." },
      { id: "closed", kicker: "sealed", title: "Applications closed", map: ["Applications closed"], note: "The gate is unequivocally closed and never resembles an application control." },
      { id: "context", kicker: "release", title: "Continued context", map: ["Continued context"], note: "Institutional energy releases toward the general startup route, not a waitlist." },
    ],
    signatureStates: ["Approach", "Threshold", "Closed", "Release"],
    materials: ["dormant conductive bed", "sealed barrier", "residual field glow", "side-release seam"],
    motionMode: "B",
    publication: ["Applications closed", "No waitlist or future date", "No cohort statistics", "No guaranteed POC"],
    performance: "4–6 KB CSS; 0–1.5 KB optional threshold JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "Applications closed", "sealed gate"], strategy: "The title and closed status share the first viewport; runway decoration yields before text." },
    portrait: { foreground: "sealed gate and closed status", removed: "secondary runway glow", scale: "vertical runway", fullBleed: "closed plane", order: "runway → closed → context", simplification: "instant static gate under reduced motion", identity: "the deliberate stop remains clear at 320px" },
    conversion: "General startup context only; no application action, waitlist or future date.",
    next: "about",
    ...shared,
  },

  about: {
    slug: "about",
    publicPath: "/about/",
    publicLabel: "About",
    eyebrow: "the operating layer",
    title: "Built between industry and technology.",
    lede: "What is Quantum's role between industry needs and technology capability?",
    purpose: "Explain Quantum's operating position without inventing team, partner, history or scale surfaces.",
    architecture: {
      actCount: 3,
      documentRegions: 3,
      documentLength: "medium-short / 2.75–3.5 viewport target",
      overtureTopology: "two institutional worlds held by one interlock joint",
      h1Placement: "within the connective joint rather than outside two slabs",
      dominantGeometry: "interlocking institutional cuts and a stable operating joint",
      primaryDensity: "moderate, quiet and institutional",
      mediaDominance: "none; layered institutional surfaces",
      transitionGrammar: "Resolve through interlock; no process corridor",
      endingBehavior: "settled operating position and audience release",
      closestVisualSibling: "for-industry",
      antiTemplateDistinction: "About stabilizes a relationship through a joint; Industry compresses a procedural challenge through an aperture.",
    },
    acts: [
      { id: "worlds", kicker: "two worlds", title: "Industry and technology", map: ["Purpose", "Industry-led model"], note: "The worlds remain distinct and truthful; neither becomes a partner claim." },
      { id: "interlock", kicker: "the joint", title: "Operating position", map: ["Operating position"], note: "Quantum occupies the interlock without becoming a network diagram." },
      { id: "position", kicker: "resolve", title: "Built between", map: ["Herzliya context", "Working principles"], note: "Restrained context and principles resolve into the two existing audience routes." },
    ],
    signatureStates: ["Separate", "Approach", "Interlock", "Position"],
    materials: ["institutional graphite", "layered section cut", "pale operating joint", "quiet civic depth"],
    motionMode: "B",
    publication: ["No unverified team", "No partners or metrics", "No unsupported history", "No qFund roster crossover"],
    performance: "4–6 KB CSS; 0–1.5 KB optional threshold JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "operating joint"], strategy: "A complete three-line title occupies the joint while one institutional plane moves partly off-canvas." },
    portrait: { foreground: "operating joint", removed: "one far institutional edge", scale: "tall editorial spine", fullBleed: "interlock edges", order: "worlds → joint → position", simplification: "fully resolved static interlock", identity: "the connective layer remains visible at 320px" },
    conversion: "Release toward the existing For industry and For startups routes without a corporate funnel.",
    next: "contact",
    ...shared,
  },

  contact: {
    slug: "contact",
    publicPath: "/contact/",
    publicLabel: "Contact",
    eyebrow: "three intent routes / endpoint pending",
    title: "Start with the challenge.",
    lede: "Which conversation am I trying to begin?",
    purpose: "Classify intent calmly without pretending an unverified contact destination exists.",
    architecture: {
      actCount: 1,
      documentRegions: 1,
      documentLength: "one principal field / 1.1–1.75 viewport target",
      overtureTopology: "three intent rails converging inside one arrival field",
      h1Placement: "at the head of the same field as all three intent rails",
      dominantGeometry: "three precise routing rails and one honest terminus",
      primaryDensity: "minimal and calm",
      mediaDominance: "none; semantic intent rails",
      transitionGrammar: "static Focus through native target and keyboard states",
      endingBehavior: "intent rails terminate at an unresolved endpoint",
      closestVisualSibling: "404",
      antiTemplateDistinction: "Contact aligns three intents in one truthful field; 404 dislocates one plane and immediately recovers.",
    },
    acts: [
      { id: "arrival", kicker: "arrive", title: "Three intent rails", map: ["For industry", "For startups / technology", "General / ecosystem / media", "Verified endpoint pending"], note: "All three semantic intents are present in one field; no form or action is simulated." },
    ],
    intents: [
      { id: "for-industry", label: "For industry", detail: "industrial challenge context" },
      { id: "for-startups", label: "For startups / technology", detail: "technology and field-readiness context" },
      { id: "general", label: "General / ecosystem / media", detail: "institutional context" },
    ],
    signatureStates: ["All intents", "Industry target", "Startup target", "General target"],
    materials: ["near-empty arrival field", "three precise rails", "focus aperture", "unresolved endpoint plane"],
    motionMode: "A",
    publication: ["No form or backend", "No invented email or phone", "No response-time promise", "No submission simulation"],
    performance: "2–4 KB CSS; zero route JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "all three intent labels", "endpoint pending"], strategy: "Compact title and all three rails share one viewport; decorative chamber geometry is removed." },
    portrait: { foreground: "three semantic intents", removed: "separate decorative chamber", scale: "vertical rails", fullBleed: "none", order: "H1 → all intents → pending terminus", simplification: "native target/focus only", identity: "three-rail alignment remains recognizable at 320px" },
    conversion: "Blocked pending a human-verified destination; intent classification only.",
    next: "404",
    ...shared,
  },

  "404": {
    slug: "404",
    publicPath: "/404/",
    publicLabel: "404",
    eyebrow: "signal absent",
    title: "The requested route is out of alignment.",
    lede: "What happened, and how do I recover immediately?",
    purpose: "Provide a real semantic error state with quiet spatial dislocation and easy recovery.",
    architecture: {
      actCount: 1,
      documentRegions: 1,
      documentLength: "one recovery field / 1–1.2 viewport target",
      overtureTopology: "one misregistered plane inside an otherwise intact field",
      h1Placement: "inside the stable aligned region beside immediate recovery",
      dominantGeometry: "displaced graphite plane and interrupted neutral seam",
      primaryDensity: "near-empty",
      mediaDominance: "none; static misregistration",
      transitionGrammar: "static Resolve toward recovery",
      endingBehavior: "aligned Home recovery",
      closestVisualSibling: "contact",
      antiTemplateDistinction: "404 communicates misregistration and exits immediately; Contact aligns three live intent rails without a destination.",
    },
    acts: [
      { id: "recovery", kicker: "misregister / recover", title: "Out of alignment", map: ["Missing route", "Recovery", "Global navigation"], note: "Error, explanation and recovery occupy one compact semantic field." },
    ],
    signatureStates: ["Misregister", "Orient", "Recover", "Hold"],
    materials: ["displaced graphite plane", "interrupted neutral seam", "quiet negative space", "recovery focus"],
    motionMode: "A",
    publication: ["Real HTTP 404", "noindex, follow", "No flippant joke", "Navigation and recovery remain complete"],
    performance: "1–2 KB CSS; zero JS; zero media",
    shortLandscape: { mustShow: ["complete H1", "Home recovery"], strategy: "A small displaced plane sits behind a complete title and immediately visible Home link." },
    portrait: { foreground: "H1 and recovery", removed: "large decorative plane", scale: "small misregistered backdrop", fullBleed: "none", order: "error → explanation → Home", simplification: "identical static state", identity: "broken alignment seam remains visible at 320px" },
    conversion: "Home recovery plus reliable global navigation.",
    next: "for-industry",
    ...shared,
  },
};

export function routeForPath(pathname) {
  if (pathname === "/") return ROUTES["for-industry"];
  return Object.values(ROUTES).find((route) => route.publicPath === pathname) ?? null;
}

export function architectureFingerprint(route) {
  const architecture = route.architecture;
  return [
    architecture.actCount,
    architecture.documentRegions,
    architecture.overtureTopology,
    architecture.h1Placement,
    architecture.dominantGeometry,
    architecture.transitionGrammar,
    architecture.endingBehavior,
  ].join("|");
}

export function assertRouteData() {
  const slugs = Object.keys(ROUTES);
  if (slugs.length !== 9 || ROUTE_ORDER.some((slug) => !ROUTES[slug])) {
    throw new Error("Phase 5A-R route lab must contain exactly the nine authorized routes");
  }
  if (new Set(Object.values(ROUTES).map(({ publicPath }) => publicPath)).size !== 9) {
    throw new Error("Phase 5A-R public-path projections must be unique");
  }
  for (const slug of ROUTE_ORDER) {
    const route = ROUTES[slug];
    if (route.acts.length !== EXPECTED_ACT_COUNTS[slug]) throw new Error(`${slug} act count differs`);
    if (route.architecture.actCount !== EXPECTED_ACT_COUNTS[slug]) throw new Error(`${slug} architecture act count differs`);
    if (route.architecture.documentRegions !== EXPECTED_DOCUMENT_REGIONS[slug]) throw new Error(`${slug} document region count differs`);
    for (const field of ["documentLength", "overtureTopology", "h1Placement", "dominantGeometry", "primaryDensity", "mediaDominance", "transitionGrammar", "endingBehavior", "antiTemplateDistinction"]) {
      if (!route.architecture[field] || route.architecture[field].length < 8) throw new Error(`${slug}.architecture.${field} is incomplete`);
    }
    if (!ROUTES[route.architecture.closestVisualSibling] || route.architecture.closestVisualSibling === slug) throw new Error(`${slug}.architecture.closestVisualSibling is invalid`);
    if (route.signatureStates.length < 4 || route.signatureStates.length > 6) throw new Error(`${slug} must expose four to six signature states`);
    if (route.materials.length !== 4) throw new Error(`${slug} must expose four decisive materials`);
    if (route.status !== shared.status) throw new Error(`${slug} preproduction status differs`);
  }
  if (new Set(ROUTE_ORDER.map((slug) => architectureFingerprint(ROUTES[slug]))).size !== 9) {
    throw new Error("Every Phase 5A-R route requires a unique architecture fingerprint");
  }
  if (ROUTES.industries.acts.map(({ title }) => title).join("|") !== "Automotive & Mobility|Logistics & Supply Chain|Industry 4.0 / Advanced Manufacturing|Energy & Infrastructure") {
    throw new Error("Industries must contain exactly the four accepted territory identities");
  }
  if (!ROUTES.proof.architecture.overtureTopology.includes("archive") || !ROUTES.proof.architecture.overtureTopology.includes("Maradin")) throw new Error("Proof archive/record authority missing");
  if (!ROUTES.maradin.architecture.mediaDominance.includes("documentary media")) throw new Error("Maradin documentary media authority missing");
  if (!ROUTES.spark.acts.some(({ title }) => title === "Applications closed")) throw new Error("SPARK must remain closed");
  if (ROUTES.contact.intents.length !== 3 || !ROUTES.contact.conversion.includes("Blocked")) throw new Error("Contact must retain three truthful intent rails and no destination");
  if (!ROUTES["404"].publication.includes("Real HTTP 404")) throw new Error("404 must remain a real recovery route");
  return true;
}

assertRouteData();
