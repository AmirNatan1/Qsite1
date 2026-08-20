// QH_PHASE2A_LAB_ONLY
const params = new URLSearchParams(window.location.search);
const requestedFrame = params.get("frame");
const requestedSheet = params.get("sheet") ?? (requestedFrame ? null : "desktop");
const motion = params.get("motion") === "reduced" ? "reduced" : "full";
const root = document.documentElement;
const body = document.body;
const allFrames = [...document.querySelectorAll(".frame")];
const desktopCollection = document.querySelector(".frame-collection--desktop");
const mobileCollection = document.querySelector(".frame-collection--mobile");
const transitionSheet = document.querySelector(".transition-sheet");

root.dataset.lab = "QH_PHASE2A_LAB_ONLY";
root.dataset.motion = motion;
body.dataset.motion = motion;

function showOnly(element) {
  for (const section of [desktopCollection, mobileCollection, transitionSheet]) {
    if (section) section.hidden = section !== element;
  }
}

if (requestedFrame) {
  const selected = document.getElementById(requestedFrame);
  if (!selected?.classList.contains("frame")) {
    document.body.innerHTML = `<main class="lab-error"><h1>Unknown storyboard frame</h1><p>${requestedFrame.replace(/[<>&]/g, "")}</p></main>`;
    throw new Error(`Unknown frame: ${requestedFrame}`);
  }
  body.classList.add("single-frame");
  body.dataset.frame = requestedFrame;
  document.querySelector(".lab-index")?.setAttribute("hidden", "");
  for (const frame of allFrames) {
    const card = frame.closest(".frame-card");
    if (card) card.hidden = frame !== selected;
  }
  showOnly(selected.closest(".frame-collection"));
} else {
  body.classList.add("sheet-view");
  body.dataset.sheet = requestedSheet;
  document.querySelector(".lab-index")?.setAttribute("hidden", "");
  if (requestedSheet === "desktop") showOnly(desktopCollection);
  else if (requestedSheet === "mobile") showOnly(mobileCollection);
  else if (requestedSheet === "transitions") showOnly(transitionSheet);
  else throw new Error(`Unknown sheet: ${requestedSheet}`);
}

async function ready() {
  await document.fonts.ready;
  const images = [...document.images].filter((image) => !image.closest("[hidden]"));
  await Promise.all(images.map(async (image) => {
    if (!image.complete) await new Promise((resolve) => image.addEventListener("load", resolve, { once: true }));
    if (typeof image.decode === "function") await image.decode().catch(() => {});
    if (!image.naturalWidth) throw new Error(`Image did not load: ${image.currentSrc || image.src}`);
  }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  root.dataset.captureReady = "true";
}

ready().catch((error) => {
  root.dataset.captureReady = "error";
  console.error(error);
});
