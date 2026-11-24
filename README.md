# Advisor Desk

**A wealth management home-office toolkit, built on live market data.** Live at **https://sector-pulse-dusky.vercel.app**

Advisor Desk does the work a wealth management home-office team does to support financial advisors: profile the client, map them to a house model, review the household portfolio, propose tax-aware trades, test the retirement plan, and hand the advisor a one-page pack for the client meeting. It covers US multi-asset portfolios (equities, bonds, real assets and cash across taxable and retirement accounts), with a separate India mutual fund research page.

## Workflow

| Step | Tab | What it does |
|---|---|---|
| 1 | **Client & risk** | Seven-question risk profile that separates *willingness* from *capacity*; the recommended model is the lower of the two. Advisor overrides require a recorded reason. |
| 2 | **House models** | Five strategic models across 15 asset classes, back-tested since 2007 with monthly rebalancing: return, volatility, drawdown, worst 12 months, Sharpe, and stress tests (2008, Q4 2018, COVID, 2022). Optional municipal-bond sleeve for high-bracket clients. |
| 3 | **Portfolio review** | Household holdings across taxable, IRA, 401(k) and Roth accounts vs the target model: drift, concentration, overlapping index funds, cash drag, home bias, asset location, duration risk, active-fund performance vs benchmark, risk vs profile (suitability) and stress tests in dollars. |
| 4 | **Rebalance** | Tax-aware trade list: trades stay inside each account, retirement accounts first, taxable losses harvested before gains, new money located by tax efficiency, with estimated realized gains and federal tax. |
| 5 | **Goal plan** | Retirement Monte Carlo (2,000 paths, 12-month block bootstrap of the model's own history, inflation and fees), probability of success, wealth bands, plan success by model, and what it takes to reach 85%. |
| 6 | **Markets** | House view with auto-generated talking points, Fed funds, Treasury curve, real yields, inflation, unemployment, VIX, mortgage rates and asset-class performance. |
| 7 | **Data & controls** | Daily data-quality tests with evidence and actions, plus an audit log of reviews, overrides and client packs. |
| ⤓ | **Client review pack** | One-page summary for the advisor, printable or saved as PDF. |

The **India fund research** page (`/india.html`) keeps the original Indian sector scorecard, mutual fund due-diligence screen, watchlist monitoring and controls, built on official AMFI data.

## Data

- **Prices:** Tiingo end-of-day data for 44 securities: asset-class ETFs, common mutual funds and large-cap stocks. Total returns are rebuilt independently from prices, distributions and splits, then reconciled against the vendor's adjusted series.
- **Macro:** straight from the publishers: US Treasury (yield curves), Federal Reserve Bank of New York (effective fed funds), Cboe (VIX), US Bureau of Labor Statistics (CPI, unemployment), Freddie Mac (mortgage rates).
- **India page:** AMFI NAVs, US Treasury, ECB.

A GitHub Actions job (`.github/workflows/market-data.yml`) runs every US trading day after the close, ready before the Mumbai morning. It extends each price history incrementally, runs the controls, and publishes `market.json` to the `data` branch. If a source fails, the previous day's data is kept and the failure appears in the controls.

## Stack

Static HTML and vanilla JavaScript with hand-built SVG charts. The calculation engine (`engine.js`) is pure and runs in Node or the browser. Data pipeline in Node 22 on GitHub Actions; India APIs as Vercel serverless functions. No frameworks and no API keys in the client.

```
index.html, advisor.js, advisor2.js   Advisor Desk UI
engine.js                             Models, back-tests, portfolio review, rebalance, Monte Carlo
scripts/fetch-market.mjs              Daily data pipeline and controls
india.html, brief.js, desk.js, api/   India mutual fund research
```

## Deployment

Every push to `main` deploys to production on Vercel automatically. The market-data job needs a `TIINGO_API_KEY` repository secret.

## Limits

No stock-level look-through of fund holdings; tax estimates are federal, assume long-term lots and exclude the net investment income tax; fund expense ratios are not included. Sample clients are fictional.

*For analysis and education only; not investment advice.*
