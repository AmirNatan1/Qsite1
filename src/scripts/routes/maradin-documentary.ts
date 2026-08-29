import { enhanceReversibleReveals } from "./reversible-reveal";

const root = document.querySelector<HTMLElement>("[data-maradin-record]");

if (root) {
  root.dataset.routeMotion = matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "observer";
  enhanceReversibleReveals(root);
  const players = [...root.querySelectorAll<HTMLElement>("[data-maradin-player]")];
  const release = (player: HTMLElement) => {
    const video = player.querySelector<HTMLVideoElement>("[data-maradin-video]");
    if (!video?.src) return;
    video.pause();
    video.removeAttribute("src");
    video.tabIndex = -1;
    video.load();
    player.dataset.videoState = "dormant";
    const launch = player.querySelector<HTMLButtonElement>("[data-maradin-play]");
    if (launch) launch.hidden = false;
  };

  root.addEventListener("click", (event) => {
    const launch = (event.target as Element).closest<HTMLButtonElement>("[data-maradin-play]");
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
    void video.play().catch(() => undefined);
  });

  addEventListener("pagehide", () => players.forEach(release), { once: true });
}
