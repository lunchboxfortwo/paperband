import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { layoutSeries, indexAtClientX } from "../chart-layout.js";
import {
  actionLine,
  actionsFromSnapshot,
  buildDisplay,
  markersFor,
  observedRange,
  statusLine,
} from "../view-model.js";

const snapshot = JSON.parse(readFileSync(new URL("../data/snapshot.json", import.meta.url)));
const prices = JSON.parse(readFileSync(new URL("../data/prices.json", import.meta.url)));
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const model = buildDisplay(snapshot, prices);

test("published snapshot is the forward paper book, not a backtest", () => {
  assert.equal(snapshot.schema, "paperband.snapshot.v1");
  assert.equal(snapshot.mode, "forward_paper");
  assert.equal(snapshot.generated_at, "2026-11-08T19:59:26Z");
  assert.equal(snapshot.book.equity_curve.length, 1);
  assert.equal(snapshot.book.equity_curve[0].kind, "funding");
  assert.equal(snapshot.book.equity_curve[0].equity, 500);
  assert.equal(snapshot.costs.fills_recorded, 0);
  assert.equal(snapshot.book.positions.length, 0);
  assert.equal(model.ok, true);
  assert.equal(model.live, false);
  assert.equal(model.balance.length, snapshot.book.equity_curve.length);
  assert.equal(model.balance[0].kind, "funding");
  assert.equal(model.fills, 0);
  assert.equal(statusLine(model).includes("Published Nov 8, 2026, 2:59 PM EST."), true);
  assert.equal(statusLine(model).includes("Not a live feed."), true);
  assert.equal(statusLine(model).includes("Market closed (weekend)."), true);
  assert.equal(statusLine(model).includes("Next open Nov 9, 2026, 9:30 AM EST."), true);
});

test("pending targets stay pending and are not paper P&L", () => {
  assert.equal(model.actions.length, 2);
  const meta = model.actions.find((row) => row.symbol === "META");
  const qqq = model.actions.find((row) => row.symbol === "QQQ");
  assert.equal(meta.status, "pending");
  assert.equal(meta.side, "short");
  assert.equal(meta.fillPrice, null);
  assert.equal(qqq.status, "pending");
  assert.equal(qqq.side, "long");
  assert.equal(qqq.fillPrice, null);
  assert.match(actionLine(meta), /META · pending short · signal -17\.91% · Oct 30, 2026 · next open Nov 9, 2026, 9:30 AM EST · no fill price/);
  assert.match(actionLine(qqq), /QQQ · pending long · signal \+9\.12% · Oct 30, 2026/);
  for (const row of model.symbols) {
    assert.equal(row.pnlPct, null);
    assert.notEqual(row.signalReturn, row.pnlPct);
  }
  assert.ok(Math.abs(model.symbols.find((row) => row.symbol === "META").signalReturn + 0.1790597916997828) < 1e-12);
});

test("price markers use the retrieved daily close and not a target zone", () => {
  assert.equal(prices.schema, "paperband.prices.v1");
  assert.equal(prices.source, "Yahoo Finance chart API");
  assert.equal(prices.adjustment, "unadjusted_ohlc");
  assert.equal(prices.retrieved_at, "2026-11-08T21:34:01Z");
  for (const symbol of ["META", "QQQ"]) {
    const bars = prices.symbols[symbol].bars;
    assert.equal(bars.length, 126);
    assert.equal(bars[0].date, "2026-05-11");
    assert.equal(bars.at(-1).date, "2026-11-06");
    const row = model.symbols.find((item) => item.symbol === symbol);
    assert.equal(row.bars.length, bars.length);
    assert.equal(row.markers.length, 1);
    assert.equal(row.markers[0].priceRole, "anchor");
    assert.equal(row.markers[0].status, "pending");
    assert.equal(row.markers[0].date, "2026-10-30");
    const signalBar = bars.find((bar) => bar.date === "2026-10-30");
    assert.equal(row.markers[0].price, signalBar.close);
    assert.notEqual(row.markers[0].price, snapshot.symbols.find((item) => item.symbol === symbol).lower);
    assert.notEqual(row.markers[0].price, snapshot.symbols.find((item) => item.symbol === symbol).upper);
    const range = observedRange(row.bars);
    assert.equal(range.low, Math.min(...bars.map((bar) => bar.low)));
    assert.equal(range.high, Math.max(...bars.map((bar) => bar.high)));
  }
  const metaBar = prices.symbols.META.bars.find((bar) => bar.date === "2026-10-30");
  const qqqBar = prices.symbols.QQQ.bars.find((bar) => bar.date === "2026-10-30");
  assert.equal(metaBar.close, 614.989990234375);
  assert.equal(qqqBar.close, 690.489990234375);
  const meta = snapshot.symbols.find((row) => row.symbol === "META");
  assert.notEqual(meta.last_close, prices.symbols.META.bars.at(-1).close);
  assert.equal(model.symbols[0].caption.includes("not a target"), true);
  assert.equal(model.symbols[0].caption.includes("not fills or limit prices"), true);
});

test("missing price file does not invent a series from the book mark", () => {
  const bare = buildDisplay(snapshot, null);
  assert.equal(bare.ok, true);
  assert.equal(bare.pricesLoaded, false);
  for (const row of bare.symbols) {
    assert.equal(row.bars.length, 0);
    assert.equal(row.markers.length, 0);
    assert.equal(row.caption, "No public price series for this name.");
    assert.equal(row.mark, snapshot.symbols.find((item) => item.symbol === row.symbol).last_close);
  }
  const wrong = buildDisplay(snapshot, { schema: "other", symbols: { META: { bars: [{ date: "2026-11-06", close: 1 }] } } });
  assert.equal(wrong.symbols[0].bars.length, 0);
});

test("contract fixtures do not borrow the daily close as a fill or target", () => {
  const bars = [{ date: "2026-11-06", open: 10, high: 12, low: 9, close: 11 }];
  const filled = markersFor([{
    symbol: "EXAMPLE",
    status: "filled",
    side: "long",
    fillPrice: 1,
    filledAt: "2026-11-06T21:00:00Z",
    explicitPrice: null,
  }], bars);
  assert.equal(filled[0].priceRole, "fill");
  assert.equal(filled[0].price, 1);
  const target = markersFor([{
    symbol: "EXAMPLE",
    status: "pending",
    side: "short",
    signalDate: "2026-11-06",
    explicitPrice: 2,
    fillPrice: null,
  }], bars);
  assert.equal(target[0].priceRole, "target");
  assert.equal(target[0].price, 2);
  const anchor = markersFor([{
    symbol: "EXAMPLE",
    status: "pending",
    side: "short",
    signalDate: "2026-11-06",
    explicitPrice: null,
    fillPrice: null,
  }], bars);
  assert.equal(anchor[0].priceRole, "anchor");
  assert.equal(anchor[0].price, 11);
});

test("an actions array replaces derived rows", () => {
  const clone = structuredClone(snapshot);
  clone.actions = [];
  assert.equal(actionsFromSnapshot(clone).length, 0);
  assert.equal(actionsFromSnapshot(snapshot).length, 2);
});

test("layout stays inside the plot and keeps a single mark a single mark", () => {
  const meta = model.symbols.find((row) => row.symbol === "META");
  const points = meta.bars.map((bar) => ({ date: bar.date, value: bar.close, low: bar.low, high: bar.high }));
  const layout = layoutSeries(points, meta.markers, 300, 208);
  assert.equal(layout.state, "series");
  for (const point of layout.line) {
    assert.ok(point.x >= 0 && point.x <= 300);
    assert.ok(point.y >= 0 && point.y <= 208);
  }
  assert.equal(layout.markers.length, 1);
  assert.ok(Math.abs(layout.markers[0].y - layout.line[layout.markers[0].index].y) < 1e-6);
  assert.equal(layout.observedLow, observedRange(meta.bars).low);
  const one = layoutSeries([{ value: 500, low: 500, high: 500 }], [], 300, 208);
  assert.equal(one.state, "single");
  assert.equal(one.line.length, 1);
  const flat = layoutSeries(
    [{ value: 1, low: 1, high: 1 }, { value: 1, low: 1, high: 1 }],
    [],
    280,
    200,
  );
  assert.equal(flat.line.length, 2);
  for (const point of flat.line) assert.ok(Number.isFinite(point.y));
  assert.equal(indexAtClientX(8, { left: 0, width: 300 }, points.length, layout.pad), 0);
  assert.equal(indexAtClientX(292, { left: 0, width: 300 }, points.length, layout.pad), points.length - 1);
});

test("the page keeps one strategy paragraph and the approved PDF bytes", () => {
  const paragraphs = html.match(/<p id="strategy">([\s\S]*?)<\/p>/g);
  assert.equal(paragraphs.length, 1);
  assert.match(paragraphs[0], /252-session adjusted return/);
  assert.equal(paragraphs[0].includes("—"), false);
  assert.equal(html.includes("Three-year"), false);
  assert.equal(html.includes("PaperbandMarkdown"), false);
  const pdf = readFileSync(new URL("../docs/paper-trader-monthly-momentum-s1.pdf", import.meta.url));
  assert.equal(createHash("sha256").update(pdf).digest("hex"), "4fd885a8554210253ce01acadbf9532452d1c3a2238c4ce72502eb067462e954");
  for (const name of ["index.html", "app.js", "view-model.js", "chart.js", "styles.css"]) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.equal(source.includes("1431.71"), false);
    assert.equal(source.includes("hypothetical"), false);
  }
  const view = readFileSync(new URL("../view-model.js", import.meta.url), "utf8");
  assert.equal(/\.lower\b|\.upper\b/.test(view), false);
});

test("unrecognized snapshot estimates nothing", () => {
  const broken = buildDisplay({ schema: "other" }, prices);
  assert.equal(broken.ok, false);
  assert.equal(broken.message, "Unrecognized snapshot. Nothing was estimated.");
});
