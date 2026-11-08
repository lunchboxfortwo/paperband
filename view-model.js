/** Pure display model. Reads published JSON only. Does not invent marks, P&L, or fills. */

export const STRATEGY_ID = "tsmom_12m_monthly_v1";

export const PNL_BASIS_TEXT =
  "Booked gain or loss for that name, divided by its booked cost. Nothing is booked in this snapshot, so there is no percent. A 252-session return is the signal, not P&L.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ET = "America/New_York";
const SOURCE_LABELS = { yahoo_finance: "Yahoo Finance" };

export function formatEt(value, mode = "datetime") {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const base = { timeZone: ET };
  if (mode === "date") {
    return new Intl.DateTimeFormat("en-US", {
      ...base,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
  if (mode === "short") {
    return new Intl.DateTimeFormat("en-US", {
      ...base,
      month: "short",
      day: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-US", {
    ...base,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function formatSessionDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function shortSessionDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

export function formatMoney(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatPct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const pct = value * 100;
  const body = Math.abs(pct).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (pct > 0) return `+${body}%`;
  if (pct < 0) return `-${body}%`;
  return `${body}%`;
}

export function sourceLabel(source) {
  if (!source) return null;
  return SOURCE_LABELS[source] || String(source);
}

function unwrap(body) {
  if (body && body.snapshot && typeof body.snapshot === "object" && body.snapshot.schema) {
    return { snapshot: body.snapshot, publication: body.publication || null };
  }
  return { snapshot: body, publication: null };
}

function finiteBars(block) {
  const bars = block?.bars;
  if (!Array.isArray(bars)) return [];
  return bars.filter((bar) => {
    if (!bar || typeof bar.date !== "string") return false;
    return [bar.open, bar.high, bar.low, bar.close].every((n) => typeof n === "number" && Number.isFinite(n));
  });
}

function readPnl(row) {
  if (typeof row?.pnl_pct === "number" && Number.isFinite(row.pnl_pct)) {
    return { pct: row.pnl_pct, basis: row.pnl_pct_basis || row.pnl_basis || null };
  }
  const position = row?.position;
  if (position && typeof position.pnl_pct === "number" && Number.isFinite(position.pnl_pct)) {
    return { pct: position.pnl_pct, basis: position.pnl_basis || position.pnl_pct_basis || null };
  }
  return { pct: null, basis: null };
}

function sessionDateFromInstant(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

export function actionsFromSnapshot(snapshot) {
  if (Array.isArray(snapshot?.actions)) {
    return snapshot.actions
      .filter((row) => row && row.symbol && row.status && row.side)
      .map((row) => ({
        symbol: String(row.symbol),
        status: String(row.status),
        side: String(row.side),
        signalReturn: typeof row.signal_return === "number" ? row.signal_return : null,
        signalDate: row.signal_date || null,
        scheduledAt: row.scheduled_at || null,
        fillPrice: typeof row.fill_price === "number" ? row.fill_price : null,
        filledAt: row.filled_at || null,
        explicitPrice: typeof row.price === "number" ? row.price : null,
      }));
  }

  const scheduledAt = snapshot?.market?.next_open_utc || null;
  const actions = [];
  for (const row of snapshot?.symbols || []) {
    if (row?.pending?.target) {
      actions.push({
        symbol: row.symbol,
        status: "pending",
        side: row.pending.target,
        signalReturn: typeof row.tsmom_return === "number" ? row.tsmom_return : null,
        signalDate: row.tsmom_signal_date || null,
        scheduledAt,
        fillPrice: null,
        filledAt: null,
        explicitPrice: typeof row.pending.price === "number" ? row.pending.price : null,
      });
    }
    const position = row?.position;
    if (position && typeof position.fill_price === "number" && position.filled_at && position.side) {
      actions.push({
        symbol: row.symbol,
        status: "filled",
        side: position.side,
        signalReturn: null,
        signalDate: null,
        scheduledAt: null,
        fillPrice: position.fill_price,
        filledAt: position.filled_at,
        explicitPrice: null,
      });
    }
  }
  return actions;
}

export function markersFor(actions, bars) {
  const byDate = new Map((bars || []).map((bar) => [bar.date, bar]));
  const markers = [];
  for (const action of actions || []) {
    if (action.status === "filled" && typeof action.fillPrice === "number") {
      const date = sessionDateFromInstant(action.filledAt);
      const bar = date ? byDate.get(date) : null;
      if (!bar) continue;
      markers.push({
        symbol: action.symbol,
        status: "filled",
        side: action.side,
        date,
        price: action.fillPrice,
        priceRole: "fill",
      });
      continue;
    }
    if (action.status !== "pending") continue;
    const date = action.signalDate || null;
    if (typeof action.explicitPrice === "number" && date && byDate.has(date)) {
      markers.push({
        symbol: action.symbol,
        status: "pending",
        side: action.side,
        date,
        price: action.explicitPrice,
        priceRole: "target",
      });
      continue;
    }
    const bar = date ? byDate.get(date) : null;
    if (!bar) continue;
    markers.push({
      symbol: action.symbol,
      status: "pending",
      side: action.side,
      date,
      price: bar.close,
      priceRole: "anchor",
    });
  }
  return markers;
}

export function observedRange(bars) {
  if (!bars?.length) return null;
  return {
    low: Math.min(...bars.map((bar) => bar.low)),
    high: Math.max(...bars.map((bar) => bar.high)),
  };
}

export function priceCaption(prices, bars, markers) {
  if (!bars?.length) return "No public price series for this name.";
  const range = observedRange(bars);
  const retrieved = formatEt(prices?.retrieved_at);
  const source = prices?.source || "Unnamed source";
  const end = formatSessionDate(bars[bars.length - 1].date);
  const start = formatSessionDate(bars[0].date);
  const bits = [
    `${source}, daily bars ${start} to ${end}`,
    retrieved ? `retrieved ${retrieved}` : null,
    "unadjusted",
    `observed high to low ${formatMoney(range.high)} to ${formatMoney(range.low)}`,
  ].filter(Boolean);
  let text = `${bits.join(", ")}. Observed on these bars, not a target.`;
  if (markers.some((marker) => marker.priceRole === "anchor")) {
    text += " Open circles are pending signals at that day's close, not fills or limit prices.";
  }
  if (markers.some((marker) => marker.priceRole === "target")) {
    text += " Squares are pending targets at a published price, not fills.";
  }
  if (markers.some((marker) => marker.priceRole === "fill")) {
    text += " Solid circles are fills at the published fill price.";
  }
  return text;
}

export function actionLine(action) {
  const side = action.side ? action.side.charAt(0).toUpperCase() + action.side.slice(1) : "Unknown";
  if (action.status === "filled") {
    const when = formatEt(action.filledAt) || "time unpublished";
    const price = formatMoney(action.fillPrice) || "price unpublished";
    return `${action.symbol} · filled ${side.toLowerCase()} · ${price} · ${when}`;
  }
  const bits = [`${action.symbol} · pending ${side.toLowerCase()}`];
  if (action.signalReturn != null) bits.push(`signal ${formatPct(action.signalReturn)}`);
  if (action.signalDate) bits.push(formatSessionDate(action.signalDate));
  if (action.explicitPrice != null) bits.push(`target ${formatMoney(action.explicitPrice)}`);
  if (action.scheduledAt) bits.push(`next open ${formatEt(action.scheduledAt)}`);
  if (action.fillPrice == null) bits.push("no fill price");
  return bits.join(" · ");
}

export function statusLine(model) {
  const bits = [];
  if (model.stale) bits.push("Stale.");
  bits.push(model.publishedLabel ? `Published ${model.publishedLabel}.` : "No publication time.");
  bits.push("Not a live feed.");
  if (model.marketStatus) {
    const reason = model.marketReason ? ` (${model.marketReason})` : "";
    bits.push(`Market ${model.marketStatus}${reason}.`);
  }
  if (model.nextOpenLabel) bits.push(`Next open ${model.nextOpenLabel}.`);
  return bits.join(" ");
}

export function marksNote(rows) {
  if (!rows.length) return null;
  const same = rows.every((row) => row.markAt === rows[0].markAt && row.markSource === rows[0].markSource);
  if (same && (rows[0].markLabel || rows[0].markSource)) {
    const when = rows[0].markLabel || "time unpublished";
    const source = sourceLabel(rows[0].markSource) || "source unnamed";
    return `Snapshot marks, ${source}, ${when}. The chart is a separate daily series and can differ. Not a live quote.`;
  }
  return "Marks are each name's last close in the snapshot. Not a live quote.";
}

export function buildDisplay(snapshotInput, pricesInput) {
  const { snapshot, publication } = unwrap(snapshotInput);
  if (!snapshot || snapshot.schema !== "paperband.snapshot.v1") {
    return { ok: false, message: "Unrecognized snapshot. Nothing was estimated." };
  }

  const prices = pricesInput && pricesInput.schema === "paperband.prices.v1" ? pricesInput : null;
  const book = snapshot.book || {};
  const positions = Array.isArray(book.positions) ? book.positions : [];
  const curve = Array.isArray(book.equity_curve) ? book.equity_curve : [];
  const balance = curve
    .filter((point) => point && typeof point.equity === "number" && Number.isFinite(point.equity))
    .map((point) => ({
      ts: point.ts || null,
      equity: point.equity,
      kind: point.kind || null,
    }));

  const actions = actionsFromSnapshot(snapshot);
  const symbolRows = Array.isArray(snapshot.symbols) ? snapshot.symbols : [];
  const symbols = symbolRows.map((row) => {
    const bars = finiteBars(prices?.symbols?.[row.symbol]);
    const symbolActions = actions.filter((action) => action.symbol === row.symbol);
    const pnl = readPnl(row);
    const markers = markersFor(symbolActions, bars);
    return {
      symbol: row.symbol,
      target: row.pending?.target || row.tsmom_target_label || row.direction || null,
      pending: Boolean(row.pending?.target),
      mark: typeof row.last_close === "number" ? row.last_close : null,
      markAt: row.last_close_et || null,
      markUtc: row.last_close_utc || null,
      markLabel: formatEt(row.last_close_utc),
      markSource: row.last_source || null,
      pnlPct: pnl.pct,
      pnlBasis: pnl.basis,
      signalReturn: typeof row.tsmom_return === "number" ? row.tsmom_return : null,
      bars,
      markers,
      caption: priceCaption(prices, bars, markers),
    };
  });

  return {
    ok: true,
    stale: publication?.publication_state === "stale",
    live: false,
    algorithmId: snapshot.algorithm?.id || null,
    publishedAt: snapshot.generated_at || null,
    publishedLabel: formatEt(snapshot.generated_at),
    marketStatus: snapshot.market?.status || null,
    marketReason: snapshot.market?.reason || null,
    nextOpenLabel: formatEt(snapshot.market?.next_open_utc),
    book: {
      equity: typeof book.equity === "number" ? book.equity : null,
      cash: typeof book.cash === "number" ? book.cash : null,
      positionCount: positions.length,
      halted: Boolean(book.halted),
    },
    balance,
    symbols,
    actions,
    fills: actions.filter((action) => action.status === "filled").length,
    pricesLoaded: Boolean(prices),
  };
}
