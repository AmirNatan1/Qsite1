(() => {
  "use strict";

  const canvas = document.querySelector("#source");
  const context = canvas.getContext("2d", { alpha: false });
  const button = document.querySelector("#encode-button");
  const state = document.querySelector("#state");
  const supportOutput = document.querySelector("#support-output");
  const playback = document.querySelector("#playback");
  const results = document.querySelector("#results");
  const encodedData = document.querySelector("#encoded-data");

  const hasRecorder = typeof MediaRecorder !== "undefined";
  const hasCapture = typeof canvas.captureStream === "function";
  const supports = {
    mediaRecorder: hasRecorder,
    canvasCaptureStream: hasCapture,
    requestVideoFrameCallback: typeof playback.requestVideoFrameCallback === "function",
    vp9WebM: hasRecorder && MediaRecorder.isTypeSupported("video/webm;codecs=vp9"),
    vp8WebM: hasRecorder && MediaRecorder.isTypeSupported("video/webm;codecs=vp8"),
    h264MP4: hasRecorder && MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E"),
  };

  supportOutput.textContent = JSON.stringify(supports, null, 2);
  document.body.dataset.recorderSupport = hasRecorder && hasCapture ? "available" : "unavailable";
  button.disabled = !(hasRecorder && hasCapture);

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const range = (value, start, end) => clamp((value - start) / (end - start));
  const smooth = (value) => value * value * (3 - 2 * value);

  function spiralPoints(turns = 2.5, count = 260) {
    return Array.from({ length: count + 1 }, (_, index) => {
      const progress = index / count;
      const radius = 220 - progress * 142;
      const angle = turns * Math.PI * 2 * progress;
      return {
        x: 415 + radius * Math.cos(angle),
        y: 245 + radius * Math.sin(angle) * 0.58,
      };
    });
  }

  const wire = spiralPoints();

  function strokeWire(points, count, color, width, blur = 0) {
    context.save();
    context.beginPath();
    points.slice(0, Math.max(2, count)).forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.lineWidth = width;
    context.shadowColor = color;
    context.shadowBlur = blur;
    context.stroke();
    context.restore();
  }

  function draw(progress) {
    const conduction = smooth(range(progress, 0.08, 0.8));
    const power = smooth(range(progress, 0.8, 0.87));
    const screen = smooth(range(progress, 0.84, 0.91));
    const portal = smooth(range(progress, 0.89, 0.97));

    const gradient = context.createLinearGradient(0, 0, 640, 400);
    gradient.addColorStop(0, "#0e1112");
    gradient.addColorStop(0.62, "#1a2020");
    gradient.addColorStop(1, "#14090f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 640, 400);

    context.strokeStyle = "rgba(194,203,203,.12)";
    context.lineWidth = 1;
    for (let row = 230; row < 400; row += 34) {
      context.beginPath();
      context.moveTo(0, row);
      context.quadraticCurveTo(330, row - 20, 640, row + 6);
      context.stroke();
    }

    strokeWire(wire, wire.length, "rgba(0,0,0,.72)", 12);
    strokeWire(wire, wire.length, "#353d3e", 8);
    const litCount = Math.max(2, Math.round(wire.length * conduction));
    if (conduction > 0) {
      strokeWire(wire, litCount, "rgba(216,43,114,.26)", 18, 13);
      strokeWire(wire, litCount, "#f06ba0", 4, 5);
    }

    context.save();
    context.translate(415, 245);
    context.fillStyle = "rgba(0,0,0,.55)";
    context.beginPath();
    context.ellipse(0, 53, 95, 24, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#1b2223";
    context.strokeStyle = "rgba(255,255,255,.14)";
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(-86, -38, 172, 103, 22);
    context.fill();
    context.stroke();
    context.fillStyle = `rgba(240,107,160,${0.9 * power})`;
    context.beginPath();
    context.arc(-84, 12, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#060809";
    context.beginPath();
    context.arc(20, 8, 45, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(240,107,160,${0.78 * screen})`;
    context.lineWidth = 5;
    context.beginPath();
    context.arc(20, 8, 31, 0.3, Math.PI * 2 - 0.5);
    context.stroke();
    context.restore();

    if (portal > 0) {
      context.save();
      context.globalAlpha = portal;
      context.strokeStyle = "rgba(240,107,160,.5)";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(415, 253, 30 + portal * 390, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    context.fillStyle = "#c2cbcb";
    context.font = "700 12px Segoe UI, Arial, sans-serif";
    context.fillText(`PHASE 0 · ${Math.round(progress * 100)}%`, 22, 30);
  }

  draw(0);

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const once = (target, eventName) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${eventName} timed out`)), 5000);
    target.addEventListener(eventName, (event) => {
      clearTimeout(timer);
      resolve(event);
    }, { once: true });
  });

  async function toDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function seekAndMeasure(video, fraction) {
    const target = Math.min(Math.max(0, video.duration * fraction), Math.max(0, video.duration - 0.001));
    const started = performance.now();
    const seeked = once(video, "seeked");
    video.currentTime = target;
    await seeked;
    const decoded = performance.now();
    let frameCallbackObserved = false;
    if (typeof video.requestVideoFrameCallback === "function") {
      frameCallbackObserved = await Promise.race([
        new Promise((resolve) => video.requestVideoFrameCallback(() => resolve(true))),
        wait(500).then(() => false),
      ]);
    }
    return {
      fraction,
      targetSeconds: Number(target.toFixed(3)),
      seekedMs: Number((decoded - started).toFixed(2)),
      frameCallbackObserved,
      displayedMs: frameCallbackObserved ? Number((performance.now() - started).toFixed(2)) : null,
    };
  }

  async function encodeAndMeasure() {
    button.disabled = true;
    state.textContent = "Recording a real browser encode…";
    document.body.dataset.spikeState = "recording";
    results.textContent = "Encoding…";

    const mimeType = supports.vp9WebM
      ? "video/webm;codecs=vp9"
      : supports.vp8WebM
        ? "video/webm;codecs=vp8"
        : "video/webm";
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 700_000 });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = once(recorder, "stop");
    recorder.start(250);

    const durationMs = 3000;
    const started = performance.now();
    while (performance.now() - started < durationMs) {
      const elapsed = performance.now() - started;
      const cycle = elapsed / durationMs;
      draw(cycle < 0.72 ? cycle / 0.72 : 1 - ((cycle - 0.72) / 0.28) * 0.68);
      await wait(1000 / 24);
    }
    draw(0);
    recorder.stop();
    await stopped;
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType });
    const dataUrl = await toDataUrl(blob);
    encodedData.value = dataUrl;
    playback.src = URL.createObjectURL(blob);
    await once(playback, "loadedmetadata");

    if (!Number.isFinite(playback.duration)) {
      playback.currentTime = 1e10;
      await once(playback, "durationchange");
      playback.currentTime = 0;
      await once(playback, "seeked");
    }

    const order = [0, 0.25, 0.5, 0.75, 0.99, 0.5, 0.1];
    const samples = [];
    for (const fraction of order) samples.push(await seekAndMeasure(playback, fraction));

    const displayedSamples = samples.filter((sample) => sample.displayedMs !== null);
    const report = {
      generatedAt: new Date().toISOString(),
      source: { width: canvas.width, height: canvas.height, fps: 24, authoredDurationMs: durationMs },
      media: { mimeType: blob.type, bytes: blob.size, durationSeconds: Number(playback.duration.toFixed(3)) },
      support: supports,
      seekOrder: order,
      samples,
      summary: {
        maxSeekedMs: Math.max(...samples.map((sample) => sample.seekedMs)),
        observedFrameCallbacks: displayedSamples.length,
        maxObservedDisplayedMs: displayedSamples.length
          ? Math.max(...displayedSamples.map((sample) => sample.displayedMs))
          : null,
        frameCallbackTimeoutMs: 500,
      },
    };
    results.textContent = JSON.stringify(report, null, 2);
    state.textContent = "Real encode and bidirectional seek measurement complete.";
    document.body.dataset.spikeState = "ready";
    button.disabled = false;
  }

  button.addEventListener("click", () => {
    encodeAndMeasure().catch((error) => {
      state.textContent = `Spike failed: ${error.message}`;
      results.textContent = error.stack || String(error);
      document.body.dataset.spikeState = "failed";
      button.disabled = false;
    });
  });
})();
