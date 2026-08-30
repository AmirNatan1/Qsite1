import { enhanceReversibleReveals } from "./reversible-reveal";

const root = document.querySelector<HTMLElement>("[data-maradin-record]");

if (root) {
  const abortController = new AbortController();
  const { signal } = abortController;
  root.dataset.routeMotion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "observer";
  enhanceReversibleReveals(root);
  const players = [...root.querySelectorAll<HTMLElement>("[data-maradin-player]")];
  const release = (player: HTMLElement) => {
    const video = player.querySelector<HTMLVideoElement>("[data-maradin-video]");
    if (!video) return;
    if (video.hasAttribute("src")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    video.tabIndex = -1;
    player.dataset.videoState = "dormant";
    const launch = player.querySelector<HTMLButtonElement>("[data-maradin-play]");
    if (launch) launch.hidden = false;
  };

  const releaseAll = () => players.forEach(release);

  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const launch = event.target.closest<HTMLButtonElement>("[data-maradin-play]");
    const player = launch?.closest<HTMLElement>("[data-maradin-player]");
    const video = player?.querySelector<HTMLVideoElement>("[data-maradin-video]");
    if (!launch || !player || !video?.dataset.src) return;
    players.forEach((candidate) => { if (candidate !== player) release(candidate); });
    if (!video.src) {
      video.src = video.dataset.src;
      video.tabIndex = 0;
      player.dataset.videoState = "active";
      launch.hidden = true;
      video.load();
    }
    void video.play().catch(() => release(player));
  }, { signal });

  for (const player of players) {
    player.querySelector<HTMLVideoElement>("[data-maradin-video]")
      ?.addEventListener("error", () => release(player), { signal });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) releaseAll();
  }, { signal });

  window.addEventListener("pagehide", (event) => {
    releaseAll();
    if (!event.persisted) abortController.abort();
  }, { signal });
}
