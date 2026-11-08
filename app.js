import { createChart } from "./chart.js";
import {
  PNL_BASIS_TEXT,
  STRATEGY_ID,
  actionLine,
  buildDisplay,
  formatEt,
  formatMoney,
  marksNote,
  statusLine,
} from "./view-model.js";

const balanceChart = createChart(document.querySelector("#balance"));
const priceChart = createChart(document.querySelector("#price"));
let model = null;
let selected = null;

function para(text, className) {
  const node = document.createElement("p");
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function render(next) {
  model = next;
  const status = document.querySelector("#status");
  if (!model.ok) {
    status.textContent = model.message;
    document.querySelector("#equity").replaceChildren();
    balanceChart.setSpec({ state: "empty", message: "No balance marks were read." });
    priceChart.setSpec({ state: "empty", message: "No price series was read." });
    document.querySelector("#tracked").replaceChildren(para("No tracked names were read."));
    document.querySelector("#actions").replaceChildren(para("No paper actions were read."));
    return;
  }

  status.textContent = statusLine(model);
  renderEquity(model);
  renderBalance(model);
  const strategy = document.querySelector("#strategy");
  if (model.algorithmId && model.algorithmId !== STRATEGY_ID && strategy.dataset.fallback !== "1") {
    strategy.textContent = "This snapshot is not the monthly momentum rule. See the full note.";
    strategy.dataset.fallback = "1";
  }
  renderTracked(model);
  renderActions(model);
  renderSwitcher();
  renderPrice();
}

function renderEquity(current) {
  const host = document.querySelector("#equity");
  host.replaceChildren();
  const book = current.book;
  const state = book.halted ? "Halted" : book.positionCount ? `${book.positionCount} open` : "Flat";
  host.append(
    stat("Equity", formatMoney(book.equity) || "Unknown"),
    stat("Cash", formatMoney(book.cash) || "Unknown"),
    stat("Book", state),
  );
}

function stat(label, value) {
  const wrap = document.createElement("div");
  const name = document.createElement("p");
  name.className = "k";
  name.textContent = label;
  const number = document.createElement("p");
  number.className = "v";
  number.textContent = value;
  wrap.append(name, number);
  return wrap;
}

function renderBalance(current) {
  if (!current.balance.length) {
    balanceChart.setSpec({ state: "empty", message: "No balance marks in this snapshot." });
    return;
  }
  if (current.balance.length === 1) {
    const point = current.balance[0];
    const when = formatEt(point.ts);
    const kind = point.kind || "mark";
    balanceChart.setSpec({
      state: "single",
      title: formatMoney(point.equity) || "Unknown",
      detail: [when, kind].filter(Boolean).join(" · "),
      note: "Only published mark.",
      aria: `Balance ${formatMoney(point.equity) || "unknown"}, ${kind}${when ? `, ${when}` : ""}. Only published mark.`,
    });
    return;
  }
  balanceChart.setSpec({
    state: "series",
    valueLabel: "Equity",
    caption: "Published equity marks.",
    aria: `Balance, ${current.balance.length} published marks.`,
    markers: [],
    points: current.balance.map((point) => ({
      value: point.equity,
      low: point.equity,
      high: point.equity,
      label: formatEt(point.ts) || "Unspecified time",
      axis: formatEt(point.ts, "short") || "",
    })),
  });
}

function renderSwitcher() {
  const host = document.querySelector("#symbols");
  host.replaceChildren();
  if (!selected || !model.symbols.some((row) => row.symbol === selected)) {
    selected = model.symbols[0]?.symbol || null;
  }
  for (const row of model.symbols) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = row.symbol;
    button.setAttribute("aria-pressed", String(row.symbol === selected));
    button.addEventListener("click", () => {
      selected = row.symbol;
      renderSwitcher();
      renderPrice();
    });
    host.append(button);
  }
}

function renderPrice() {
  const row = model.symbols.find((item) => item.symbol === selected);
  if (!row) {
    priceChart.setSpec({ state: "empty", message: "No tracked names in this snapshot." });
    return;
  }
  if (!row.bars.length) {
    priceChart.setSpec({ state: "empty", message: row.caption });
    return;
  }
  priceChart.setSpec({
    state: "series",
    valueLabel: "Close",
    caption: row.caption,
    aria: `${row.symbol} daily closes, ${row.bars[0].date} to ${row.bars[row.bars.length - 1].date}.`,
    markers: row.markers,
    points: row.bars.map((bar) => ({
      date: bar.date,
      value: bar.close,
      low: bar.low,
      high: bar.high,
    })),
  });
}

function renderTracked(current) {
  const host = document.querySelector("#tracked");
  host.replaceChildren();
  if (!current.symbols.length) {
    host.append(para("No tracked names in this snapshot."));
    return;
  }

  const table = document.createElement("table");
  const columns = document.createElement("colgroup");
  for (const width of ["18%", "34%", "28%", "20%"]) {
    const col = document.createElement("col");
    col.style.width = width;
    columns.append(col);
  }
  table.append(columns);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(cell("th", "Name"), cell("th", "Target"), cell("th", "Mark", "num"));
  const pnlHead = cell("th", "P&L", "num");
  const basis = document.createElement("button");
  basis.type = "button";
  basis.className = "hint";
  basis.textContent = "basis";
  basis.setAttribute("aria-expanded", "false");
  const pop = document.createElement("p");
  pop.className = "caption basis";
  pop.hidden = true;
  pop.textContent = basisText(current);
  let pinned = false;
  function show(next) {
    pop.hidden = !next;
    basis.setAttribute("aria-expanded", String(next));
  }
  basis.addEventListener("click", () => {
    pinned = !pinned;
    show(pinned);
  });
  basis.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") show(true);
  });
  basis.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && !pinned) show(false);
  });
  basis.addEventListener("focus", () => show(true));
  basis.addEventListener("blur", () => {
    if (!pinned) show(false);
  });
  pnlHead.append(basis);
  headRow.append(pnlHead);
  head.append(headRow);
  table.append(head);

  const body = document.createElement("tbody");
  for (const row of current.symbols) {
    const tr = document.createElement("tr");
    tr.append(cell("td", row.symbol));
    tr.append(targetCell(row));
    const mark = document.createElement("td");
    mark.className = "num";
    mark.textContent = formatMoney(row.mark) || "—";
    const shortMark = formatEt(row.markUtc, "short");
    if (shortMark) {
      const when = document.createElement("span");
      when.className = "quiet block";
      when.textContent = shortMark;
      mark.append(when);
    }
    tr.append(mark);
    const pnl = document.createElement("td");
    pnl.className = "num";
    if (row.pnlPct == null) {
      pnl.textContent = "none";
      pnl.setAttribute("aria-label", `No booked paper P&L for ${row.symbol}`);
    } else {
      pnl.textContent = formatPctSafe(row.pnlPct);
      pnl.classList.add(row.pnlPct > 0 ? "long" : row.pnlPct < 0 ? "short" : "flat");
    }
    tr.append(pnl);
    body.append(tr);
  }
  table.append(body);
  host.append(table, pop);
  const note = marksNote(current.symbols);
  if (note) host.append(para(note, "caption"));
}

function basisText(current) {
  const published = current.symbols.find((row) => row.pnlPct != null);
  if (!published) return PNL_BASIS_TEXT;
  return published.pnlBasis || "Published percent. This snapshot did not name the denominator.";
}

function targetCell(row) {
  const td = document.createElement("td");
  if (!row.target) {
    td.textContent = "—";
    return td;
  }
  const side = document.createElement("span");
  side.className = `side ${row.target}`;
  side.textContent = row.target.charAt(0).toUpperCase() + row.target.slice(1);
  td.append(side);
  if (row.pending) {
    const pending = document.createElement("span");
    pending.className = "quiet";
    pending.textContent = ", pending";
    td.append(pending);
  }
  return td;
}

function cell(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (tag === "th") node.scope = "col";
  node.textContent = text;
  return node;
}

function formatPctSafe(value) {
  const pct = value * 100;
  const body = Math.abs(pct).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (pct > 0) return `+${body}%`;
  if (pct < 0) return `-${body}%`;
  return `${body}%`;
}

function renderActions(current) {
  const host = document.querySelector("#actions");
  host.replaceChildren();
  if (!current.actions.length) {
    host.append(para("No paper actions in this snapshot."));
    return;
  }
  if (!current.fills) host.append(para("No fills.", "quiet"));
  if (current.actions.some((action) => action.status === "pending")) {
    host.append(para("Pending, not executed.", "quiet"));
  }
  const list = document.createElement("ul");
  list.className = "actions";
  const ordered = [
    ...current.actions.filter((action) => action.status === "filled"),
    ...current.actions.filter((action) => action.status !== "filled"),
  ];
  for (const action of ordered) {
    const item = document.createElement("li");
    item.textContent = actionLine(action);
    list.append(item);
  }
  host.append(list);
}

async function loadJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function load() {
  try {
    const snapshot = await loadJson("data/snapshot.json");
    let prices = null;
    try {
      prices = await loadJson("data/prices.json");
    } catch {
      prices = null;
    }
    render(buildDisplay(snapshot, prices));
  } catch {
    document.querySelector("#status").textContent = "The snapshot could not be read. Nothing was estimated.";
  }
}

load();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") load();
});
