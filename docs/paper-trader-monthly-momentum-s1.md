# Paper Trader: Monthly Momentum (S1)

**As of November 8, 2026**  
Paper-only simulated book. No real money. No broker orders. No options.

This note explains the live paper rule in plain language, then states the exact algorithm, book and risk limits, assumed costs, the five families that were compared, and the three-year evidence. Historical results are not a guarantee of future results.

## In plain English

Once each month, the paper book looks at roughly one trading year of prices for each name on the watchlist. If that stretch has been rising, it takes a simulated long position. If that stretch has been falling, it takes a simulated short. A long benefits if prices keep rising; a short benefits if prices keep falling. Simulated exposure can reach up to twice the paper equity, which amplifies both gains and losses. Assumed trading costs are deducted. No actual money is used.

The rest of this note is the full rule set and the comparison behind it.

## Status on November 8, 2026

- The monthly momentum paper experiment is deployed. It was verified at **1:21 PM EST (America/New_York)** on November 8, 2026; **59 tests** passed.
- The paper book is **$500**, **flat**, with **no fills yet**.
- Latest completed month-end targets, from **October 30, 2026**: **META short** (252-session adjusted return **−17.91%**) and **QQQ long** (**+9.12%**). These are targets, not open positions.
- First eligible paper entries: the **9:30 AM EST (America/New_York)** session open on **November 9, 2026**. They have not been executed.
- The initial watchlist is META and QQQ. Group members can add or remove names.
- Only an admin can pause or resume the paper experiment. That admin control is separate from the automatic daily-stop behavior described below.
- There is no public dashboard address to share. This document is the written record of the rules and evidence.

## The live algorithm

The live rule is labeled **tsmom_12m_monthly_v1**.

1. At each **completed month-end**, take the **sign of the 252-session adjusted return** for each watchlist name. That window is 252 trading sessions, not a calendar year.
2. If the return is positive, the paper target is **long**. If it is negative, the paper target is **short**. If the return is zero, history is too short, or data fail, the target is **flat**.
3. Simulated fills occur at the **next eligible regular-session open (9:30 AM EST / America/New_York)**, not at the month-end close.
4. On startup, the book uses the **latest completed month-end** to set targets and **does not backdate paper P&L**.
5. A completed month-end is the last session whose **next exchange session falls in the following month**. It is **not** whatever last bar happens to sit in a data file. November 6, 2026 was the last bar in the historical sample file; the live rule correctly did **not** treat that date as a month-end. On November 8, 2026, the latest completed month-end is **October 30, 2026**.

## Book, exposure, and risk

- Starting paper equity is **$500**.
- Gross exposure is synthetic and is capped at **2x** in aggregate, shared across the names in the book. If both names are active, each is typically sized at about 1x; if only one name is active, it may use up to the 2x cap.
- This is a **synthetic paper book**. It is not option contracts, not a margin account, and not a broker connection. No Webull orders and no actual orders are sent.
- **Overnight positions are allowed.** Gaps can help or hurt.
- **Live risk monitor:** after each completed 5-minute bar, current **marked** exposure (shares times the current price, divided by equity) is checked. Exposure above the 2x cap is cut at the **next 5-minute open**.
- **Daily stop:** if equity is down **10% from that day’s starting equity**, all positions are flattened and trading is halted for the rest of that session. A stop trigger is **not** a guaranteed maximum loss. Gaps can overshoot the 10% mark before the book can flatten.
- After a daily stop, the **monthly target may return at the next session**. That automatic return is part of the verified implementation; the book does not wait for the next month-end. It is **not** the same thing as an admin resume. An admin pause stays paused until an admin resumes it.

## Assumed costs and financing

Costs are **assumptions**, not measurements from live fills:

- **4 basis points** full spread, applied as **half (2 bps) per side**, inside the simulated fill.
- **5 basis points** slippage **each side**, inside the simulated fill.
- **1 basis point** fee **per leg**, booked as a separate cash fee rather than as part of the fill price.

Fees and fill costs are therefore separate line items. In the historical comparison, spread and slippage were taken inside the fill; fees were cash. The total was not subtracted a second time from net P&L.

**Financing is not charged on the live paper book.** A sensitivity run assumed 5% a year on gross exposure above equity and 1% a year on shorts. Those rates are round illustrations, not quotes.

## The five families

Parameters were fixed before testing. All five rules used the same $500 book, the same shared 2x cap, and the same assumed costs. No volatility targeting. Daily signals were taken from completed bars and filled at the next open. Cross-sectional ranking rules were excluded because two names are not a useful universe.

**S1 — Time-series momentum (monthly).** At month-end, the sign of the trailing 252-session total return decides long or short; the position is held about one month. Source: Moskowitz, Ooi, and Pedersen (2012), “Time Series Momentum,” *Journal of Financial Economics* 104(2), [https://doi.org/10.1016/j.jfineco.2011.11.003](https://doi.org/10.1016/j.jfineco.2011.11.003). The published evidence is for diversified futures and forwards, not single stocks.

**S2 — Moving-average trend filter (long or flat).** At month-end, long if the close is above the 10-month simple moving average; otherwise flat (cash). Sources: Faber (2007), “A Quantitative Approach to Tactical Asset Allocation,” [SSRN 962461](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=962461); Brock, Lakonishok, and LeBaron (1992), *Journal of Finance* 47(5), [https://doi.org/10.1111/j.1540-6261.1992.tb04681.x](https://doi.org/10.1111/j.1540-6261.1992.tb04681.x). This family does not take short positions.

**S3 — Donchian channel breakout (Turtle System 2).** Long when the close exceeds the prior 55-day high; short when it falls below the prior 55-day low. Exit a long at the 20-day low and a short at the 20-day high, with a 2-ATR stop (ATR over 20 days) triggered on the daily close and filled at the next open. Source: Faith, *The Original Turtle Trading Rules* (2003), and the standard Donchian channel definition. Published support is mostly practitioner and anecdotal.

**S4 — MACD trend.** MACD is the 12-day EMA minus the 26-day EMA of the daily close; the signal line is the 9-day EMA of MACD. Long when MACD is above the signal line and short when it is below (stop-and-reverse). Source: Gerald Appel; definition at [StockCharts ChartSchool, MACD](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/macd-moving-average-convergence-divergence-oscillator). This is a shorter-horizon practitioner indicator and flips often, so costs matter more.

**S5 — Wilder DMI / ADX directional trend.** Period 14. Long when +DI is above −DI and ADX(14) is above 25; short when −DI is above +DI and ADX is above 25; flat when ADX is at or below 25. Sources: J. Welles Wilder Jr., *New Concepts in Technical Trading Systems* (1978); [StockCharts ChartSchool, ADX / DMI](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-directional-index-adx). Wilder defined the indicator; the 25 threshold is a conventional “trending” level, not a single canonical trading study. This operationalization was fixed in advance.

## Three-year comparison

The comparison covers **752 daily sessions** for each of META and QQQ, from **November 8, 2023 through November 6, 2026**, after warmup from June 1, 2022. Data are daily Yahoo Finance bars. Signals use adjusted prices. Fills and marks use actual unadjusted opens and closes. Dividends are credited once as cash from the event series (a long receives them; a short pays them). There were no splits in the window.

The **canonical** run starts at **$500**, deducts the assumed trading costs above, and charges **no financing** and **no account stop**. Figures below come from the audited full report. End equity is shown to the cent; returns and drawdowns match the rounded comparison used with that report.

### Canonical results (no account stop, no financing)

| Rule | End equity | Net return | Max drawdown | Assumed costs |
|---|---:|---:|---:|---:|
| S1 Time-series momentum, 12-month | $1,431.71 | +186.3% | −38.6% | $6.90 |
| S2 10-month SMA (long / flat) | $778.24 | +55.6% | −49.4% | $17.66 |
| S3 Donchian 55 / 20 | $305.40 | −38.9% | −67.1% | $47.67 |
| S4 MACD 12 / 26 / 9 | $508.07 | +1.6% | −55.3% | $100.39 |
| S5 DMI / ADX 14 | $394.29 | −21.1% | −57.8% | $78.30 |
| Equal-weight buy-and-hold, 2x | $1,356.39 | +171.3% | −38.6% | $0.80 |
| Equal-weight buy-and-hold, 1x | $928.54 | +85.7% | −28.3% | $0.40 |
| Buy-and-hold META, 1x | $965.50 | +93.1% | −34.0% | $0.40 |
| Buy-and-hold QQQ, 1x | $889.00 | +77.8% | −22.5% | $0.40 |
| Cash | $500.00 | 0.0% | 0.0% | $0.00 |

S1 was the only one of the five rules with a positive canonical return in every yearly slice. It finished slightly ahead of 2x equal-weight buy-and-hold ($1,431.71 vs $1,356.39) at the same 38.6% maximum drawdown. Full-period Sharpe was about 1.06 for S1 and about 1.02 for 2x buy-and-hold; CAGR was about 42% and 40%. Of S1’s $931.71 net gain, META contributed about $586 and QQQ about $346.

### Yearly slices (canonical net return)

Train is November 8, 2023 to November 7, 2024; validation is November 8, 2024 to November 7, 2025; holdout is November 10, 2025 to November 6, 2026. The holdout had already been seen when the corrected comparison was produced.

| Rule | Train | Validation | Holdout (already seen) |
|---|---:|---:|---:|
| S1 Time-series momentum, 12-month | +111.6% | +16.2% | +16.5% |
| S2 10-month SMA (long / flat) | +111.6% | +3.0% | −28.6% |
| S3 Donchian 55 / 20 | +14.6% | +37.3% | −61.2% |
| S4 MACD 12 / 26 / 9 | +25.8% | −28.4% | +12.8% |
| S5 DMI / ADX 14 | +10.6% | +0.6% | −29.1% |
| Equal-weight buy-and-hold, 1x | +62.3% | +11.3% | +2.8% |
| Equal-weight buy-and-hold, 2x | +124.5% | +16.3% | +3.9% |

### Sensitivities (not the live charge set)

These runs are diagnostics on the same daily sample. They are not a second live configuration.

| Variant | End equity | Net return | Max DD | Note |
|---|---:|---:|---:|---|
| Canonical | $1,431.71 | +186.3% | −38.6% | Comparison baseline: no daily stop, no financing |
| Daily 10% stop overlay | $1,461.01 | +192.2% | −39.9% | 4 stop hits; 2 automatic re-entries the following session. This overlay is a daily approximation, not the live 5-minute stop. |
| Financing sensitivity | $1,396.66 | +179.3% | −38.9% | About $33.77 of illustrative 5% / 1% charges. Not charged live. |

## What the comparison does and does not show

S1 is the **best historical full-period result** among the five rules on this already-seen sample. It is **not** a demonstrated statistical edge.

- A post-hoc block bootstrap of the Sharpe difference between S1 and 2x equal-weight buy-and-hold, on the full 752-session sample, was about **+0.04**, with a 95% interval from **−1.02 to +1.04**. That interval includes zero. The bootstrap does not create a larger sample and was not a selection step.
- The original validation protocol selected **Donchian (S3)** on the validation window, written at **12:33 PM EST (America/New_York)** on November 8, 2026, before the holdout was scored. In the holdout year S3 lost about **61%**, with a maximum drawdown of about **67%** over the full canonical sample, and it failed that deployment bar.
- The corrected comparison that ranks S1 first was produced **after the holdout had already been seen**. It is a diagnostic, not a fresh sealed holdout.
- The daily study watched **entry notional** against the 2x cap and cut at the next daily open. A daily close could still print above 2x: S1’s peak marked gross was **2.42**. Live monitoring uses **current marked value every 5 minutes**. Those are not the same cap. Historical results are **not an exact backtest of the deployed book**.
- Two correlated technology names and roughly three dozen monthly decisions do not give much statistical power. Published studies of these families are not proof that the same rules work on META and QQQ.
- The live paper engine marks risk on 5-minute bars. The three-year test is daily. Yahoo Finance does not provide three years of 5-minute history, so this comparison cannot validate an intraday engine.

## What this is not

This is a **$500 paper experiment**. It is not investment advice, not a recommendation to trade with real money, and not a live brokerage account. Positions can be held overnight, so gaps are allowed. Assumed costs may be too low or too high compared with any future live venue. Historical results are not a guarantee.
