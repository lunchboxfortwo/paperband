import { formatMoney, formatSessionDate, shortSessionDate } from "./view-model.js";
import { indexAtClientX, layoutSeries } from "./chart-layout.js";

const PLOT_HEIGHT = 208;
const GUTTER = 72;

export function createChart(root) {
  const state = { spec: null, pinned: false, index: null };
  const observer = new ResizeObserver(() => schedule());
  observer.observe(root);

  function setSpec(spec) {
    state.spec = spec;
    state.pinned = false;
    state.index = null;
    schedule();
  }

  let frame = 0;
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => paint());
  }

  function paint() {
    root.replaceChildren();
    root.style.setProperty("--gutter", `${GUTTER}px`);
    const spec = state.spec;
    if (!spec) return;
    if (spec.state === "empty") {
      root.append(note(spec.message));
      return;
    }
    if (spec.state === "single") {
      root.append(single(spec));
      root.append(note(spec.note));
      return;
    }

    if (root.clientWidth < 40) return;
    const width = Math.max(120, root.clientWidth - GUTTER);
    const layout = layoutSeries(spec.points, spec.markers, width, PLOT_HEIGHT);
    const body = document.createElement("div");
    body.className = "chart-body";

    const axis = document.createElement("div");
    axis.className = "y-axis";
    for (const tick of layout.ticks) {
      const label = document.createElement("span");
      label.style.top = `${tick.y}px`;
      label.textContent = formatAxis(tick.price);
      axis.append(label);
    }

    const plot = document.createElement("div");
    plot.className = "plot";
    plot.tabIndex = 0;
    plot.setAttribute("role", "group");
    plot.setAttribute("aria-label", spec.aria || "Price chart");

    const svg = svgEl("svg");
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.setAttribute("width", String(layout.width));
    svg.setAttribute("height", String(layout.height));
    svg.setAttribute("aria-hidden", "true");
    const poly = svgEl("polyline");
    poly.setAttribute("points", layout.line.map((point) => `${point.x},${point.y}`).join(" "));
    poly.setAttribute("class", "series");
    svg.append(poly);
    plot.append(svg);

    const tip = document.createElement("div");
    tip.className = "tip";
    tip.hidden = true;
    tip.setAttribute("role", "status");

    function showIndex(index, pin) {
      const point = spec.points[index];
      if (!point) return;
      state.index = index;
      if (pin) state.pinned = true;
      const marker = (layout.markers || []).find((item) => item.index === index);
      tip.replaceChildren();
      tip.append(tipLine(pointLabel(point), true));
      tip.append(tipLine(`${spec.valueLabel || "Close"} ${formatMoney(point.value)}`));
      if (marker) tip.append(tipLine(markerText(marker)));
      tip.hidden = false;
      const dot = layout.line[index];
      placeTip(tip, plot, root, dot.x, dot.y);
    }

    function hideTip() {
      state.pinned = false;
      tip.hidden = true;
    }

    plot.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch" || state.pinned) return;
      const index = indexAtClientX(event.clientX, plot.getBoundingClientRect(), spec.points.length, layout.pad);
      showIndex(index, false);
    });
    plot.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".mark")) return;
      const index = indexAtClientX(event.clientX, plot.getBoundingClientRect(), spec.points.length, layout.pad);
      showIndex(index, true);
    });
    plot.addEventListener("pointerleave", () => {
      if (!state.pinned) tip.hidden = true;
    });
    plot.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideTip();
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const current = state.index == null ? 0 : state.index;
      const next = event.key === "ArrowRight" ? Math.min(spec.points.length - 1, current + 1) : Math.max(0, current - 1);
      showIndex(next, true);
    });
    plot.addEventListener("blur", () => {
      if (!state.pinned) tip.hidden = true;
    });

    for (const marker of layout.markers) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `mark ${marker.priceRole} ${marker.side || ""}`;
      button.style.left = `${marker.x}px`;
      button.style.top = `${marker.y}px`;
      button.setAttribute("aria-label", markerText(marker));
      const dot = document.createElement("i");
      button.append(dot);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        showIndex(marker.index, true);
      });
      plot.append(button);
    }

    plot.append(tip);
    body.append(axis, plot);
    root.append(body);
    root.append(axisLabels(spec.points, layout.line));
    if (spec.caption) root.append(note(spec.caption));

    if (state.pinned && state.index != null) showIndex(state.index, true);
  }

  return { setSpec, disconnect: () => observer.disconnect() };
}

function single(spec) {
  const row = document.createElement("div");
  row.className = "single";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mark sole";
  button.setAttribute("aria-label", spec.aria || spec.title);
  const dot = document.createElement("i");
  button.append(dot);
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  tip.append(tipLine(spec.title, true));
  if (spec.detail) tip.append(tipLine(spec.detail));
  button.addEventListener("click", () => {
    tip.hidden = !tip.hidden;
  });
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = spec.title;
  copy.append(title);
  if (spec.detail) {
    const detail = document.createElement("span");
    detail.className = "quiet";
    detail.textContent = spec.detail;
    copy.append(detail);
  }
  row.append(button, copy, tip);
  return row;
}

function note(text) {
  const p = document.createElement("p");
  p.className = "caption";
  p.textContent = text;
  return p;
}

function tipLine(text, strong) {
  const p = document.createElement("p");
  if (strong) p.className = "tip-strong";
  p.textContent = text;
  return p;
}

function pointLabel(point) {
  if (point.label) return point.label;
  if (point.date) return formatSessionDate(point.date) || shortSessionDate(point.date);
  return "";
}

function axisLabels(points, line) {
  const row = document.createElement("div");
  row.className = "x-axis";
  const indexes = [0, Math.floor((line.length - 1) / 2), line.length - 1]
    .filter((index, position, all) => all.indexOf(index) === position);
  for (const index of indexes) {
    const span = document.createElement("span");
    const point = points[index];
    span.textContent = point?.date ? shortSessionDate(point.date) : (point?.axis || "");
    row.append(span);
  }
  return row;
}

function markerText(marker) {
  const side = marker.side || "target";
  const when = formatSessionDate(marker.date) || marker.date;
  if (marker.priceRole === "fill") {
    return `Filled ${side} on ${when} at ${formatMoney(marker.price)}.`;
  }
  if (marker.priceRole === "target") {
    return `Pending ${side} target at the published price ${formatMoney(marker.price)} on ${when}. Not a fill.`;
  }
  return `Pending ${side} on ${when}, drawn at the close ${formatMoney(marker.price)}. Not a fill and not a limit price.`;
}

function placeTip(tip, plot, root, x, y) {
  tip.style.left = "0px";
  tip.style.top = "0px";
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const maxLeft = Math.max(0, root.clientWidth - width);
  const absLeft = Math.max(0, Math.min(plot.offsetLeft + x - width / 2, maxLeft));
  const left = absLeft - plot.offsetLeft;
  let top = y - height - 10;
  if (top < 0) top = y + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function formatAxis(price) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function svgEl(name) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}
