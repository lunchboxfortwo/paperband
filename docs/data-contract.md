# Display data contract

The page is a static reader for files in this repository. It does not trade, poll a broker, or turn the research note into a balance.

## `data/snapshot.json`

Schema `paperband.snapshot.v1`. A wrapper `{ publication, snapshot }` is also accepted. If `publication.publication_state` is `"stale"`, the status line starts with "Stale." The page does not describe the file as a live feed.

Read:

- `generated_at`, `market.status`, `market.reason`, `market.next_open_utc`
- `book.equity`, `book.cash`, `book.halted`, `book.positions` (count only)
- `book.equity_curve[]`: `ts`, `equity`, `kind`
- `symbols[]`: `symbol`, `last_close`, `last_close_utc`, `last_close_et`, `last_source`, `pending.target`, `pending.price` when it is a number, `tsmom_return`, `tsmom_signal_date`, `tsmom_target_label`, `direction`
- `symbols[].pnl_pct` and `pnl_pct_basis` (or the same fields on `position`) when present
- `symbols[].position` only when `fill_price`, `filled_at`, and `side` are all present
- `actions[]` when it is an array. That array replaces rows derived from `pending`

Not read:

- `hypothetical` (it is not balance history)
- `symbols[].lower` and `symbols[].upper` (this rule has no entry or exit price)
- the comparison study in the note and PDF

Balance points are the finite `equity` values in `equity_curve`, in order. Zero points: empty state. One point: one mark, no line. The page does not add, interpolate, or replace those points.

P&L percent is shown only from `pnl_pct`. The basis control says that figure is booked gain or loss divided by that name's booked cost. If `pnl_pct_basis` or `position.pnl_basis` is a string, that string is used instead. `tsmom_return` is the signal, not P&L.

## Actions

Each explicit action uses `symbol`, `status`, `side`, and optionally `signal_return`, `signal_date`, `scheduled_at`, `price`, `fill_price`, `filled_at`.

Without `actions[]`, a pending row is taken from `symbols[].pending`. It has no fill price. Its next open is `market.next_open_utc`.

## Chart markers

Drawn only when the date falls on a bar in `data/prices.json`:

- **fill:** solid circle at `fill_price` on the New York session date of `filled_at`
- **target:** square at a published pending `price` on the signal date
- **anchor:** open circle at that day's close when a pending row has no published price. The close places the date on the chart. It is not a limit and not a fill

No marker is placed on `lower`, `upper`, or a date that has no bar.

## `data/prices.json`

Schema `paperband.prices.v1`.

- `source`, `retrieved_at`, `interval`, `adjustment`, `window`, `note`
- `symbols.{SYMBOL}.bars[]` of `date`, `open`, `high`, `low`, `close`, all four as finite numbers

Bars that fail that check are dropped, not repaired. The observed range is the minimum low and maximum high of the bars drawn. A missing file, a different schema, or a missing symbol leaves the price chart empty. `last_close` stays in the table and is not drawn as a fake series.

The current file is a manual retrieve from the Yahoo Finance chart API (`interval=1d`, unadjusted OHLC, last 126 daily bars with a close, `2026-05-11` through `2026-11-06`, `retrieved_at` `2026-11-08T21:34:01Z`). It is chart context, not the paper book. The page does not call Yahoo. Replace the file to move the chart forward.

## Later publishes

The page will show these when a file contains them. It will not estimate them.

- more `book.equity_curve` points actually recorded by the book
- filled actions with `fill_price` and `filled_at`
- `pnl_pct` and a basis string
- a newer `prices.json` if the chart should include later sessions

Until then the published state is one $500 funding mark, no fills, and pending META short and QQQ long targets with no fill price.
