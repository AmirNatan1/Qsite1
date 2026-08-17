(() => {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const forcedProgress = params.has("progress")
    ? Math.min(1, Math.max(0, Number.parseFloat(params.get("progress") || "0")))
    : null;
  const forcedMobile = params.get("layout") === "mobile";
  const forcedReduced = params.get("mode") === "reduced";
  const reducedPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isReduced = forcedReduced || reducedPreference.matches;
  const isMobile = forcedMobile || (!params.has("layout") && window.innerWidth < 768);

  const body = document.body;
  const section = document.querySelector("#spiral-sequence");
  const mount = document.querySelector("#experience-mount");
  const hero = document.querySelector("#hero-copy");
  const status = document.querySelector("#semantic-status");
  const statusLine = document.querySelector("#status-line");
  const operatingSurface = document.querySelector("#operating-surface");
  const readout = document.querySelector("#progress-readout");

  body.dataset.debug = params.get("debug") === "1" ? "true" : "false";
  body.dataset.fixedProgress = forcedProgress === null ? "false" : "true";
  body.dataset.reduced = isReduced ? "true" : "false";
  body.dataset.layout = isMobile ? "mobile" : "desktop";

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const range = (value, start, end) => clamp((value - start) / (end - start));
  const smooth = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, value) => start + (end - start) * value;

  function spiralPath({ cx, cy, outerRadius, innerRadius, turns, phase, points = 220 }) {
    const commands = [];
    for (let index = 0; index <= points; index += 1) {
      const progress = index / points;
      const radius = mix(outerRadius, innerRadius, progress);
      const angle = phase + turns * Math.PI * 2 * progress;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      commands.push(`${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    return commands.join(" ");
  }

  function definitions() {
    return `
      <defs>
        <linearGradient id="terrain-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#151a1b" />
          <stop offset="0.55" stop-color="#202727" />
          <stop offset="1" stop-color="#0d1011" />
        </linearGradient>
        <linearGradient id="plinth-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#303839" />
          <stop offset="0.5" stop-color="#181e1f" />
          <stop offset="1" stop-color="#0a0d0e" />
        </linearGradient>
        <linearGradient id="shell-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#3b4546" />
          <stop offset="0.35" stop-color="#202728" />
          <stop offset="1" stop-color="#111617" />
        </linearGradient>
        <linearGradient id="conduction-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#d82b72" />
          <stop offset="0.55" stop-color="#f06ba0" />
          <stop offset="1" stop-color="#ffd0e1" />
        </linearGradient>
        <filter id="soft-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="11" />
        </filter>
        <filter id="tight-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <pattern id="terrain-hatch" width="52" height="52" patternUnits="userSpaceOnUse">
          <path d="M0 52L52 0M-13 13L13-13M39 65L65 39" stroke="rgba(255,255,255,.08)" stroke-width="1" />
        </pattern>
      </defs>`;
  }

  function fieldUnit({ x, y, scale = 1 }) {
    return `
      <g class="field-unit" transform="translate(${x} ${y}) scale(${scale})">
        <ellipse class="unit-shadow" cx="16" cy="108" rx="226" ry="54" />
        <path class="unit-plinth" d="M-236 64Q-228 28-190 19L164 19Q204 24 222 58L244 92Q252 108 232 115L-216 115Q-244 110-236 92Z" />
        <path class="unit-shell" d="M-188 33Q-177-75-83-124Q24-177 128-112Q192-72 199 18L169 72L-172 72Z" />
        <path class="unit-rail" d="M-169 43Q-146-63-56-101Q38-138 121-83Q164-54 177 20" />
        <path class="unit-edge-power" d="M-178 48Q-155-70-60-110Q43-151 134-87" />
        <circle class="connector" cx="-205" cy="4" r="23" />
        <circle class="connector-core" cx="-205" cy="4" r="10" />
        <circle class="connector-response" cx="-205" cy="4" r="8" />
        <path class="internal-path" d="M-195 4C-150 0-131-12-105-35S-61-75-31-79" />
        <circle class="aperture-well" cx="25" cy="-29" r="103" />
        <circle class="screen-glass" cx="25" cy="-29" r="82" />
        <path class="q-yoke" d="M62 57A94 94 0 1 1 101 20" />
        <path class="q-tail" d="M77 36L132 90" />
        <path class="screen-ring" d="M46 38A69 69 0 1 1 82 4" />
        <path class="screen-tail" d="M61 22L102 63" />
        <path class="screen-line" d="M-18-54H40M-18-31H59M-18-8H31" />
        <text class="screen-copy" x="-20" y="-48">test route</text>
        <text class="screen-copy muted" x="-20" y="-26">Frame · Source · Assess</text>
        <text class="screen-copy muted" x="-20" y="-7">Test · Decide</text>
      </g>`;
  }

  function desktopScene() {
    const wire = spiralPath({
      cx: 1175,
      cy: 705,
      outerRadius: 705,
      innerRadius: 205,
      turns: 2.5,
      phase: 0,
      points: 260,
    });
    return `
      <svg viewBox="0 0 1920 1200" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
        ${definitions()}
        <g class="camera-rig" data-camera-rig>
          <path class="terrain-fill" d="M0 400Q420 315 920 380T1920 346V1200H0Z" />
          <path class="terrain-line" d="M0 548Q480 465 951 519T1920 470" />
          <path class="terrain-line" d="M0 840Q470 738 920 792T1920 730" />
          <path class="terrain-line" d="M0 1015Q590 914 1090 972T1920 910" />
          <path class="terrain-hatch" fill="url(#terrain-hatch)" d="M0 400Q420 315 920 380T1920 346V1200H0Z" />
          <path class="wire-shadow" d="${wire}" />
          <path class="wire-sheath" d="${wire}" />
          <path class="wire-ridge" d="${wire}" />
          <path class="wire-halo" data-wire-halo d="${wire}" />
          <path class="wire-core" data-wire-core d="${wire}" />
          <g transform="translate(1880 705)"><rect class="terminus-mark" x="-30" y="-19" width="60" height="38" rx="12" /><path d="M-11 0H11" stroke="rgba(255,255,255,.3)" stroke-width="3" /></g>
          ${fieldUnit({ x: 1175, y: 705, scale: 1.05 })}
        </g>
      </svg>`;
  }

  function mobileScene() {
    const wire = spiralPath({
      cx: 370,
      cy: 1040,
      outerRadius: 470,
      innerRadius: 126,
      turns: 2.25,
      phase: Math.PI / 2,
      points: 220,
    });
    return `
      <svg viewBox="0 0 720 1600" preserveAspectRatio="xMidYMid slice" role="presentation" focusable="false">
        ${definitions()}
        <g class="camera-rig" data-camera-rig>
          <path class="terrain-fill" d="M0 450Q330 390 720 470V1600H0Z" />
          <path class="terrain-line" d="M0 710Q280 650 720 720M0 1070Q300 990 720 1060M0 1370Q310 1280 720 1350" />
          <path class="terrain-hatch" fill="url(#terrain-hatch)" d="M0 450Q330 390 720 470V1600H0Z" />
          <path class="wire-shadow" d="${wire}" />
          <path class="wire-sheath" d="${wire}" />
          <path class="wire-ridge" d="${wire}" />
          <path class="wire-halo" data-wire-halo d="${wire}" />
          <path class="wire-core" data-wire-core d="${wire}" />
          <g transform="translate(370 1510)"><rect class="terminus-mark" x="-28" y="-18" width="56" height="36" rx="11" /><path d="M-10 0H10" stroke="rgba(255,255,255,.3)" stroke-width="3" /></g>
          ${fieldUnit({ x: 370, y: 1040, scale: 0.92 })}
        </g>
      </svg>`;
  }

  function mountReducedPoster() {
    const picture = document.createElement("picture");
    picture.className = "reduced-picture";
    const source = document.createElement("source");
    source.media = "(max-width: 767px)";
    source.srcset = "../../artifacts/original/phase-0/reduced-motion-poster-mobile.svg";
    const image = document.createElement("img");
    image.src = "../../artifacts/original/phase-0/reduced-motion-poster-desktop.svg";
    image.alt = "";
    image.decoding = "async";
    picture.append(source, image);
    mount.replaceChildren(picture);
    status.style.opacity = "0";
    operatingSurface.style.opacity = "0";
    readout.value = "reduced · static poster";
    Object.assign(body.dataset, {
      progress: "0.000",
      conduction: "0.000",
      camera: "0.000",
      connector: "0.000",
      devicePower: "0.000",
      screenWake: "0.000",
      portal: "0.000",
      surface: "0.000",
    });
  }

  if (isReduced) {
    mountReducedPoster();
    return;
  }

  mount.innerHTML = isMobile ? mobileScene() : desktopScene();

  const cameraRig = mount.querySelector("[data-camera-rig]");
  const wireCore = mount.querySelector("[data-wire-core]");
  const wireHalo = mount.querySelector("[data-wire-halo]");
  const fieldUnitElement = mount.querySelector(".field-unit");
  const portalIris = document.createElement("div");
  portalIris.className = "portal-iris";
  portalIris.setAttribute("aria-hidden", "true");
  mount.append(portalIris);

  const wireLength = wireCore.getTotalLength();
  for (const path of [wireCore, wireHalo]) {
    path.style.strokeDasharray = `${wireLength} ${wireLength}`;
    path.style.strokeDashoffset = `${wireLength}`;
  }

  let framePending = false;
  const renderSamples = [];

  function progressFromDocument() {
    if (forcedProgress !== null && Number.isFinite(forcedProgress)) return forcedProgress;
    const rect = section.getBoundingClientRect();
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    return clamp(-rect.top / travel);
  }

  function statusFor(progress) {
    if (progress < 0.08) return "system dormant";
    if (progress < 0.76) return "challenge conducting inward";
    if (progress < 0.8) return "connector receiving";
    if (progress < 0.84) return "challenge detected";
    if (progress < 0.89) return "context received";
    return "test route available";
  }

  function render() {
    const renderStarted = performance.now();
    framePending = false;
    const progress = progressFromDocument();
    const conduction = smooth(range(progress, 0.08, 0.8));
    const camera = smooth(range(progress, 0.16, 0.76));
    const connector = smooth(range(progress, 0.76, 0.82));
    const devicePower = smooth(range(progress, 0.8, 0.87));
    const screenWake = smooth(range(progress, 0.84, 0.91));
    const portal = smooth(range(progress, 0.89, 0.97));
    const surface = smooth(range(progress, 0.94, 1));

    Object.assign(body.dataset, {
      progress: progress.toFixed(3),
      conduction: conduction.toFixed(3),
      camera: camera.toFixed(3),
      connector: connector.toFixed(3),
      devicePower: devicePower.toFixed(3),
      screenWake: screenWake.toFixed(3),
      portal: portal.toFixed(3),
      surface: surface.toFixed(3),
    });

    const dashOffset = wireLength * (1 - conduction);
    wireCore.style.strokeDashoffset = `${dashOffset}`;
    wireHalo.style.strokeDashoffset = `${dashOffset}`;
    wireCore.style.opacity = conduction > 0 ? `${mix(0.5, 1, conduction)}` : "0";
    wireHalo.style.opacity = conduction > 0 ? `${mix(0.08, 0.42, conduction)}` : "0";

    if (isMobile) {
      cameraRig.style.transform = `translate3d(${mix(-5, 2, camera)}px, ${mix(15, -22, camera)}px, 0) scale(${mix(1, 1.055, camera)})`;
    } else {
      cameraRig.style.transform = `translate3d(${mix(46, -28, camera)}px, ${mix(18, -28, camera)}px, 0) rotate(${mix(-2.4, 0, camera)}deg) skewX(${mix(-1.4, 0, camera)}deg) scale(${mix(0.98, 1.11, camera)})`;
    }

    fieldUnitElement.style.setProperty("--device-power", `${Math.max(connector * 0.45, devicePower)}`);
    fieldUnitElement.style.setProperty("--screen-wake", `${screenWake}`);

    const portalScale = isMobile ? mix(0.08, 8.2, portal) : mix(0.08, 5.8, portal);
    portalIris.style.opacity = portal > 0 ? `${Math.min(1, portal * 2.4)}` : "0";
    portalIris.style.transform = `translate(-50%, -50%) scale(${portalScale}) rotate(${mix(-6, 0, portal)}deg)`;
    operatingSurface.style.opacity = `${surface}`;
    operatingSurface.setAttribute("aria-hidden", surface > 0.98 ? "false" : "true");

    const heroYield = smooth(range(progress, 0.1, 0.38));
    hero.style.opacity = `${1 - heroYield}`;
    hero.style.transform = `translateY(${mix(0, -18, heroYield)}px)`;

    const statusVisibility = screenWake * (1 - surface);
    status.style.opacity = `${statusVisibility}`;
    status.style.transform = `translateY(${mix(12, 0, screenWake)}px)`;
    statusLine.textContent = statusFor(progress);
    readout.value = `${progress.toFixed(3)} · conduction ${conduction.toFixed(3)} · power ${devicePower.toFixed(3)}`;

    if (body.dataset.debug === "true") {
      renderSamples.push(performance.now() - renderStarted);
      if (renderSamples.length > 120) renderSamples.shift();
      const ordered = [...renderSamples].sort((left, right) => left - right);
      const p95Index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
      body.dataset.renderLastMs = renderSamples.at(-1).toFixed(3);
      body.dataset.renderP95Ms = ordered[p95Index].toFixed(3);
      body.dataset.renderSamples = String(renderSamples.length);
    }
  }

  function requestRender() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(render);
  }

  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", requestRender, { passive: true });
  window.addEventListener("orientationchange", requestRender, { passive: true });
  render();
})();
