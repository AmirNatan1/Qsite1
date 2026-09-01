function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function parseCssColor(value, label) {
  const match = /^(?:rgb|rgba)\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(value ?? "");
  invariant(match, `${label} foreground color differs`);
  return { channels: match.slice(1, 4).map(Number), alpha: match[4] === undefined ? 1 : Number(match[4]) };
}

function toHex(channels) {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(channels) {
  const values = channels.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function validateR2ContrastMaskPixels({ data, info, measurement }) {
  const label = `R2 ${measurement?.engine ?? "unknown"} selector-local contrast mask`;
  invariant(Buffer.isBuffer(data) && info?.channels === 3 && info.width === measurement?.screenshot?.width && info.height === measurement?.screenshot?.height, `${label} decoded pixels differ`);
  const verified = [];
  for (const sample of measurement.samples) {
    const foreground = parseCssColor(sample.foreground, `${label} ${sample.selector}`);
    let minimumRatio = Number.POSITIVE_INFINITY;
    let worstBackground = null;
    let worstComposite = null;
    for (let y = sample.pixelBounds.y0; y < sample.pixelBounds.y1; y += 1) {
      for (let x = sample.pixelBounds.x0; x < sample.pixelBounds.x1; x += 1) {
        invariant(x >= 0 && y >= 0 && x < info.width && y < info.height, `${label} ${sample.selector} pixel bounds escape the image`);
        const offset = (y * info.width + x) * info.channels;
        const background = [data[offset], data[offset + 1], data[offset + 2]];
        const composite = foreground.channels.map((channel, index) => Math.round(channel * foreground.alpha + background[index] * (1 - foreground.alpha)));
        const ratio = contrast(composite, background);
        if (ratio < minimumRatio) {
          minimumRatio = ratio;
          worstBackground = background;
          worstComposite = composite;
        }
      }
    }
    const recordedRatio = Number(minimumRatio.toFixed(3));
    invariant(worstBackground && worstComposite
      && toHex(worstBackground) === sample.worstBackground
      && toHex(worstComposite) === sample.compositedForeground
      && recordedRatio === sample.minimumRatio
      && recordedRatio >= sample.threshold, `${label} ${sample.selector} recorded minimum differs from packaged pixels`);
    verified.push({ id: sample.id, selector: sample.selector, minimumRatio: recordedRatio, status: "PASS" });
  }
  return { engine: measurement.engine, screenshot: measurement.screenshot.path, sampleCount: verified.length, samples: verified, status: "PASS" };
}
