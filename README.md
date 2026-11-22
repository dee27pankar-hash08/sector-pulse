# Sector Pulse

**India-first market and fund due-diligence desk.** Live at **https://sector-pulse-dusky.vercel.app**

Built as a portfolio project for a Wealth Management Home Office role. The app does the daily work of an investment-solutions analyst: it tracks sector trends, screens and monitors mutual funds, tests data quality, logs and escalates issues, and produces a management report. All of it runs on official, free data and refreshes automatically.

## What it does

| Tab | What you get |
|---|---|
| **Market Pulse** | Scorecard for 18 Nifty sectors: 1M/3M/1Y returns, relative strength vs Nifty 50, 50/200-DMA trend, volatility, drawdown, breadth, a risk-appetite read, plus an auto-drafted sector brief with a 30-second pitch |
| **US & Macro** | S&P 500 and Nasdaq-100 (INR terms), US Treasury yield curve, USD/INR |
| **Fund Due Diligence** | Any of ~1,400 schemes vs any of 23 benchmarks: Sharpe, Sortino, beta, Jensen's alpha, tracking error, information ratio, up/down capture, rolling 3Y returns, rule-based flags and a verdict (Retain / Watchlist / Review for replacement), a 4 Ps qualitative review and a 10-item document checklist |
| **Monitoring** | Watchlist re-screening with verdict changes versus the previous run, surveillance alerts and one-click escalation |
| **Controls** | 160+ automated data-quality tests (availability, timeliness, completeness, abnormal moves, corporate actions, history, proxy selection) and an escalation log with severity, owner and status |
| **Role map** | Each job responsibility mapped to the feature that demonstrates it |
| **Management report** | One-page summary from live data; print or save as PDF |

## Data sources

- **AMFI** daily NAVs: official Indian mutual fund data, including the scheme universe
- **mfapi.in**: NAV history (AMFI mirror)
- **US Treasury**: daily par yield curve
- **ECB via Frankfurter**: USD/INR reference rate

Sector returns are measured through the longest-running passive index funds and ETFs that track each Nifty sector index. Unit splits are detected and adjusted automatically.

## Stack

Vanilla JavaScript front end with hand-built SVG charts. Node 22 serverless functions on Vercel (`/api/*`) with a 6-hour edge cache. No build step, no frameworks, no API keys.

```
index.html        UI, charts, Market Pulse / US & Macro / Fund DD
brief.js          Sector brief assistant (sector playbook + auto-draft)
desk.js           Monitoring, Controls, Role map, document checklist, report
api/_lib.js       Fetching, retries, split adjustment, return/risk maths
api/_config.js    Sector proxies and benchmarks
api/sectors.js    Sector scorecard and insights
api/macro.js      Treasury curve and FX
api/schemes.js    AMFI scheme universe
api/fund.js       Fund due-diligence engine
api/controls.js   Data-quality control tests
```

## Run locally

```bash
npm i -g vercel
vercel dev
```

*For analysis and education only; not investment advice.*
