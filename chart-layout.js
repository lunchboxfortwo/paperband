/** Map a price or equity series into pixel coordinates. No synthetic points. */

export function layoutSeries(points, markers, width, height) {
  const pad = { l: 8, r: 8, t: 14, b: 14 };
  if (!points?.length || width < 20 || height < 20) {
    return { state: "empty", pad, ticks: [], line: [], markers: [] };
  }

  const lows = points.map((point) => point.low ?? point.value);
  const highs = points.map((point) => point.high ?? point.value);
  const observedLow = Math.min(...lows);
  const observedHigh = Math.max(...highs);
  const span = observedHigh - observedLow || Math.abs(observedHigh) || 1;
  const yMin = observedLow - span * 0.08;
  const yMax = observedHigh + span * 0.08;
  const innerW = Math.max(1, width - pad.l - pad.r);
  const innerH = Math.max(1, height - pad.t - pad.b);

  function xAt(index) {
    if (points.length === 1) return pad.l + innerW / 2;
    return pad.l + (innerW * index) / (points.length - 1);
  }

  function yAt(price) {
    return pad.t + ((yMax - price) / (yMax - yMin)) * innerH;
  }

  const line = points.map((point, index) => ({
    index,
    date: point.date || null,
    ts: point.ts || null,
    value: point.value,
    x: xAt(index),
    y: yAt(point.value),
  }));

  const placed = [];
  for (const marker of markers || []) {
    const index = points.findIndex((point) => point.date && point.date === marker.date);
    if (index < 0 || typeof marker.price !== "number") continue;
    placed.push({
      ...marker,
      index,
      x: xAt(index),
      y: yAt(marker.price),
    });
  }

  const ticks = [];
  for (const price of [observedHigh, observedLow]) {
    if (!Number.isFinite(price) || ticks.some((tick) => Math.abs(tick.price - price) < 1e-9)) continue;
    ticks.push({ price, y: yAt(price) });
  }
  if (ticks.length === 2 && Math.abs(ticks[0].y - ticks[1].y) < 18) ticks.pop();

  return {
    state: points.length === 1 ? "single" : "series",
    pad,
    observedLow,
    observedHigh,
    yMin,
    yMax,
    line,
    markers: placed,
    ticks,
    width,
    height,
  };
}

export function indexAtClientX(clientX, rect, count, pad) {
  if (!count) return 0;
  if (count === 1) return 0;
  const inner = Math.max(1, rect.width - pad.l - pad.r);
  const x = clientX - rect.left - pad.l;
  const t = Math.max(0, Math.min(1, x / inner));
  return Math.round(t * (count - 1));
}
