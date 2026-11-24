// Advisor Desk market-data pipeline.
// Runs on GitHub Actions after the US close. Builds a total-return history for every security in the
// security master (asset-class ETFs, common mutual funds, mega-cap stocks) from Tiingo end-of-day data,
// pulls US macro data straight from the official publishers, runs data-quality controls and writes one
// JSON file for the app. Price history is extended incrementally each day; if a source fails, the
// previous data is kept and the failure is recorded as a control exception.
//
// Usage: TIINGO_API_KEY=... node scripts/fetch-market.mjs <previous.json> <output.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , PREV = 'prev.json', OUT = 'out/market.json'] = process.argv;
const KEY = process.env.TIINGO_API_KEY;
const UA = { 'User-Agent': 'AdvisorDesk/1.0 (portfolio project; github.com/dee27pankar-hash08/sector-pulse)' };

// ---------------- security master ----------------
const CLASSES = {
  us_large:   { label: 'US large-cap equity', group: 'Equity' },
  us_small:   { label: 'US small-cap equity', group: 'Equity' },
  intl_dev:   { label: 'International developed equity', group: 'Equity' },
  em:         { label: 'Emerging-markets equity', group: 'Equity' },
  us_agg:     { label: 'US core bonds', group: 'Fixed income' },
  short_tsy:  { label: 'Short-term Treasuries', group: 'Fixed income' },
  long_tsy:   { label: 'Long-term Treasuries', group: 'Fixed income' },
  ig_corp:    { label: 'Investment-grade corporates', group: 'Fixed income' },
  high_yield: { label: 'High-yield bonds', group: 'Fixed income' },
  muni:       { label: 'Municipal bonds', group: 'Fixed income' },
  tips:       { label: 'Inflation-protected (TIPS)', group: 'Fixed income' },
  reit:       { label: 'Real estate (REITs)', group: 'Real assets' },
  gold:       { label: 'Gold', group: 'Real assets' },
  commod:     { label: 'Broad commodities', group: 'Real assets' },
  cash:       { label: 'Cash & T-bills', group: 'Cash' }
};
const S = (t, name, cls, type, proxy = false) => ({ t, name, cls, type, proxy });
const UNIVERSE = [
  // Asset-class proxies: used to build and back-test the house models
  S('SPY', 'SPDR S&P 500 ETF Trust', 'us_large', 'ETF', true),
  S('IWM', 'iShares Russell 2000 ETF', 'us_small', 'ETF', true),
  S('EFA', 'iShares MSCI EAFE ETF', 'intl_dev', 'ETF', true),
  S('EEM', 'iShares MSCI Emerging Markets ETF', 'em', 'ETF', true),
  S('AGG', 'iShares Core US Aggregate Bond ETF', 'us_agg', 'ETF', true),
  S('SHY', 'iShares 1-3 Year Treasury Bond ETF', 'short_tsy', 'ETF', true),
  S('TLT', 'iShares 20+ Year Treasury Bond ETF', 'long_tsy', 'ETF', true),
  S('LQD', 'iShares iBoxx $ Investment Grade Corporate Bond ETF', 'ig_corp', 'ETF', true),
  S('HYG', 'iShares iBoxx $ High Yield Corporate Bond ETF', 'high_yield', 'ETF', true),
  S('MUB', 'iShares National Muni Bond ETF', 'muni', 'ETF', true),
  S('TIP', 'iShares TIPS Bond ETF', 'tips', 'ETF', true),
  S('VNQ', 'Vanguard Real Estate ETF', 'reit', 'ETF', true),
  S('GLD', 'SPDR Gold Shares', 'gold', 'ETF', true),
  S('DBC', 'Invesco DB Commodity Index Tracking Fund', 'commod', 'ETF', true),
  S('BIL', 'SPDR Bloomberg 1-3 Month T-Bill ETF', 'cash', 'ETF', true),
  // Other common client holdings
  S('VOO', 'Vanguard S&P 500 ETF', 'us_large', 'ETF'),
  S('IVV', 'iShares Core S&P 500 ETF', 'us_large', 'ETF'),
  S('VTI', 'Vanguard Total Stock Market ETF', 'us_large', 'ETF'),
  S('QQQ', 'Invesco QQQ Trust (Nasdaq-100)', 'us_large', 'ETF'),
  S('VEA', 'Vanguard FTSE Developed Markets ETF', 'intl_dev', 'ETF'),
  S('VWO', 'Vanguard FTSE Emerging Markets ETF', 'em', 'ETF'),
  S('BND', 'Vanguard Total Bond Market ETF', 'us_agg', 'ETF'),
  S('IEF', 'iShares 7-10 Year Treasury Bond ETF', 'us_agg', 'ETF'),
  S('SGOV', 'iShares 0-3 Month Treasury Bond ETF', 'cash', 'ETF'),
  S('VFIAX', 'Vanguard 500 Index Fund Admiral', 'us_large', 'Mutual fund'),
  S('VTSAX', 'Vanguard Total Stock Market Index Admiral', 'us_large', 'Mutual fund'),
  S('FXAIX', 'Fidelity 500 Index Fund', 'us_large', 'Mutual fund'),
  S('AGTHX', 'American Funds Growth Fund of America A', 'us_large', 'Mutual fund'),
  S('DODGX', 'Dodge & Cox Stock Fund I', 'us_large', 'Mutual fund'),
  S('VBTLX', 'Vanguard Total Bond Market Index Admiral', 'us_agg', 'Mutual fund'),
  S('PIMIX', 'PIMCO Income Fund Institutional', 'ig_corp', 'Mutual fund'),
  S('VTIAX', 'Vanguard Total International Stock Index Admiral', 'intl_dev', 'Mutual fund'),
  S('AAPL', 'Apple Inc.', 'us_large', 'Stock'),
  S('MSFT', 'Microsoft Corp.', 'us_large', 'Stock'),
  S('NVDA', 'NVIDIA Corp.', 'us_large', 'Stock'),
  S('AMZN', 'Amazon.com Inc.', 'us_large', 'Stock'),
  S('GOOGL', 'Alphabet Inc. Class A', 'us_large', 'Stock'),
  S('META', 'Meta Platforms Inc.', 'us_large', 'Stock'),
  S('TSLA', 'Tesla Inc.', 'us_large', 'Stock'),
  S('BRK-B', 'Berkshire Hathaway Inc. Class B', 'us_large', 'Stock'),
  S('JPM', 'JPMorgan Chase & Co.', 'us_large', 'Stock'),
  S('JNJ', 'Johnson & Johnson', 'us_large', 'Stock'),
  S('XOM', 'Exxon Mobil Corp.', 'us_large', 'Stock'),
  S('MS', 'Morgan Stanley', 'us_large', 'Stock')
];

// ---------------- helpers ----------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { tries = 3, timeout = 30000, text = false, headers = {}, method = 'GET', body } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method, body, headers: { ...UA, ...headers }, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return text ? await r.text() : await r.json();
    } catch (e) { last = e; if (/HTTP 4(0[0-4]|29)/.test(e.message) && i > 0) break; await sleep(2000 * (i + 1)); }
  }
  throw last;
}
const ymd = d => d.toISOString().slice(0, 10);
const sig = x => x === null || x === undefined || !isFinite(x) ? null : Number(x.toPrecision(7));
const mdy = s => { const [m, d, y] = s.split('/'); return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const monthEnds = pts => { const out = []; for (const p of pts) { const m = p[0].slice(0, 7); if (out.length && out[out.length - 1][0] === m) out[out.length - 1] = [m, p[1]]; else out.push([m, p[1]]); } return out; };
const csvRows = txt => txt.trim().split(/\r?\n/).map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));
const valueAgo = (rows, lastDate, days) => { const d = new Date(lastDate); d.setDate(d.getDate() - days); const s = ymd(d); let v = null; for (const r of rows) { if (r[0] <= s) v = r[1]; else break; } return v; };

let prev = {};
try { prev = JSON.parse(readFileSync(PREV, 'utf8')); } catch (e) {}
const controls = [];
const ctl = (series, control, status, evidence, action = '') => controls.push({ series, control, status, evidence, action });

// ---------------- prices (Tiingo) ----------------
async function tiingo(t, start) {
  const rows = await get(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(t.toLowerCase())}/prices?startDate=${start}`, { headers: { Authorization: 'Token ' + KEY, 'Content-Type': 'application/json' } });
  if (!Array.isArray(rows)) throw new Error('unexpected response');
  return rows.map(r => ({ d: r.date.slice(0, 10), close: r.close, adj: r.adjClose, div: r.divCash || 0, split: r.splitFactor || 1 })).filter(r => r.adj > 0 && r.close > 0);
}

const securities = {};
if (!KEY) ctl('Tiingo', 'Availability', 'fail', 'TIINGO_API_KEY secret is not set; previous price data kept', 'Add the repository secret TIINGO_API_KEY');
for (const s of UNIVERSE) {                       // sequential: the free plan allows 50 requests an hour
  const p = prev.securities?.[s.t];
  const meta = { name: s.name, cls: s.cls, type: s.type, proxy: s.proxy };
  if (!KEY) { if (p) securities[s.t] = { ...p, ...meta, stale: true }; continue; }
  const incremental = p && p.daily?.length && p.monthly?.length;
  const start = incremental ? ymd(new Date(new Date(p.lastDate).getTime() - 20 * 864e5)) : '1990-01-01';
  let rows;
  try { rows = await tiingo(s.t, start); } catch (e) {
    ctl(s.t, 'Availability', 'fail', `Tiingo request failed (${e.message})${p ? '; previous data kept' : ''}`, 'Re-run the refresh; check the ticker if it persists');
    if (p) securities[s.t] = { ...p, ...meta, stale: true };
    continue;
  }
  if (!rows.length) { ctl(s.t, 'Availability', 'fail', 'No prices returned', 'Check the ticker'); if (p) securities[s.t] = { ...p, ...meta, stale: true }; continue; }

  // Build / extend our own total-return index (base 100 at inception) so stored history never needs restating
  let daily, monthly, first;
  if (incremental) {
    const anchor = rows.find(r => r.d === p.lastDate);
    if (!anchor) ctl(s.t, 'Continuity', 'warn', `Previous last date ${p.lastDate} not in new data; history rebuilt`, '');
    else {
      const k = p.daily[p.daily.length - 1][1] / anchor.adj;
      const add = rows.filter(r => r.d > p.lastDate).map(r => [r.d, sig(r.adj * k)]);
      daily = p.daily.concat(add).slice(-300);
      monthly = p.monthly.slice();
      for (const [d, v] of add) { const m = d.slice(0, 7); if (monthly[monthly.length - 1][0] === m) monthly[monthly.length - 1] = [m, v]; else monthly.push([m, v]); }
      first = p.first;
    }
  }
  if (!daily) {
    if (incremental) rows = await tiingo(s.t, '1990-01-01');
    const k = 100 / rows[0].adj;
    const all = rows.map(r => [r.d, sig(r.adj * k)]);
    daily = all.slice(-300); monthly = monthEnds(all); first = rows[0].d;
  }
  const lastRow = rows[rows.length - 1];
  securities[s.t] = { ...meta, first, lastDate: lastRow.d, last: sig(lastRow.close), monthly, daily };
  ctl(s.t, 'Availability', 'pass', `${incremental ? 'Extended' : 'Loaded'} to ${lastRow.d}; history from ${first}`);

  // Control: rebuild total return independently from raw closes + distributions + splits, compare with the vendor's adjusted series
  const w = rows.slice(-253);
  if (w.length > 20) {
    let mine = 1; for (let i = 1; i < w.length; i++) mine *= (w[i].close * w[i].split + w[i].div) / w[i - 1].close;
    const vendor = w[w.length - 1].adj / w[0].adj;
    const gap = Math.abs(mine - vendor) * 100;
    ctl(s.t, 'Total-return reconciliation', gap < 0.35 ? 'pass' : 'warn', `Rebuilt from prices and distributions: ${((mine - 1) * 100).toFixed(2)}% vs vendor adjusted ${((vendor - 1) * 100).toFixed(2)}% over ${w.length - 1} trading days`, gap < 0.35 ? '' : 'Check distribution or split records before using returns in client reports');
  }
  // Control: abnormal one-day moves
  const big = []; for (let i = 1; i < w.length; i++) { const r = (w[i].close * w[i].split + w[i].div) / w[i - 1].close - 1; if (Math.abs(r) > (s.type === 'Stock' ? 0.25 : 0.12)) big.push(`${w[i].d} ${(r * 100).toFixed(1)}%`); }
  ctl(s.t, 'Accuracy (abnormal moves)', big.length ? 'warn' : 'pass', big.length ? `Large one-day moves: ${big.slice(0, 3).join(', ')}` : 'No one-day move beyond threshold in the window checked', big.length ? 'Confirm against a corporate action or second source' : '');
  if (s.proxy) ctl(s.t, 'History length', first <= '2007-12-31' ? 'pass' : 'warn', `History starts ${first}`, first <= '2007-12-31' ? '' : '2008 stress test uses a shorter history for this asset class');
  await sleep(1200);
}

const latest = Object.values(securities).map(s => s.lastDate).filter(Boolean).sort().pop();
for (const [t, s] of Object.entries(securities)) {
  const lag = (new Date(latest) - new Date(s.lastDate)) / 864e5;
  ctl(t, 'Timeliness', s.stale ? 'fail' : lag > 4 ? 'warn' : 'pass', `Last price ${s.lastDate} (latest in universe ${latest})`, s.stale || lag > 4 ? 'Investigate a stale or suspended price' : '');
}

// ---------------- macro (official publishers) ----------------
const macro = prev.macro ? { ...prev.macro } : {};
async function macroStep(id, label, fn) {
  try { await fn(); ctl(id, 'Availability', 'pass', `${label}: loaded`); }
  catch (e) { ctl(id, 'Availability', macro[id] ? 'warn' : 'fail', `${label} download failed (${e.message})${macro[id] ? '; previous data kept' : ''}`, 'Re-run the refresh'); }
}
const series = (id, label, unit, src, rows) => {
  rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
  if (!rows.length) throw new Error(`${id}: no rows`);
  const last = rows[rows.length - 1];
  macro[id] = { label, unit, source: src, lastDate: last[0], last: last[1], m1: valueAgo(rows, last[0], 31), y1: valueAgo(rows, last[0], 365), monthly: monthEnds(rows).filter(r => r[0] >= '2005-01') };
};

// US Treasury daily par yield curve (nominal) and real yield curve
const yr = new Date().getUTCFullYear();
let ust = prev.ust || null;
await macroStep('UST', 'US Treasury yield curve', async () => {
  const keepFrom = ust?.rows?.length ? yr - 1 : 2005;
  let rows = (ust?.rows || []).filter(r => +r[0].slice(0, 4) < keepFrom);
  for (let y = keepFrom; y <= yr; y++) {
    const txt = await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, { text: true });
    const t = csvRows(txt); const h = t[0];
    for (const r of t.slice(1)) {
      const g = k => { const i = h.indexOf(k); const v = i >= 0 ? parseFloat(r[i]) : NaN; return isFinite(v) ? v : null; };
      rows.push([mdy(r[0]), g('1 Mo'), g('3 Mo'), g('6 Mo'), g('1 Yr'), g('2 Yr'), g('3 Yr'), g('5 Yr'), g('7 Yr'), g('10 Yr'), g('20 Yr'), g('30 Yr')]);
    }
    await sleep(300);
  }
  rows.sort((a, b) => a[0] < b[0] ? -1 : 1);
  const lastR = rows[rows.length - 1];
  const agoR = days => { const d = new Date(lastR[0]); d.setDate(d.getDate() - days); const s = ymd(d); let v = null; for (const r of rows) { if (r[0] <= s) v = r; else break; } return v; };
  macro.UST = { label: 'US Treasury par yield curve', source: 'US Department of the Treasury', lastDate: lastR[0], tenors: ['1M', '3M', '6M', '1Y', '2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'], curve: lastR.slice(1), curve1m: agoR(31)?.slice(1), curve1y: agoR(365)?.slice(1) };
  const col = (i, id, label) => series(id, label, '%', 'US Department of the Treasury', rows.filter(r => r[i] !== null).map(r => [r[0], r[i]]));
  col(2, 'DGS3MO', '3-month Treasury yield'); col(5, 'DGS2', '2-year Treasury yield'); col(9, 'DGS10', '10-year Treasury yield'); col(11, 'DGS30', '30-year Treasury yield');
  ust = { rows: rows.filter(r => r[0] >= '2005-01-01') };
});
await macroStep('REAL10', 'TIPS real yields', async () => {
  const txt = await get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_real_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`, { text: true });
  const t = csvRows(txt); const i = t[0].findIndex(h => /^10 ?YR$/i.test(h.replace(/\s+/g, ' ')) || /10 Yr/i.test(h));
  if (i < 0) throw new Error('10-year column not found: ' + t[0].join('|'));
  const rows = t.slice(1).map(r => [mdy(r[0]), parseFloat(r[i])]).filter(r => isFinite(r[1]));
  series('REAL10', '10-year real yield (TIPS)', '%', 'US Department of the Treasury', rows);
  if (macro.DGS10) macro.BE10 = { label: '10-year breakeven inflation', unit: '%', source: 'Derived: nominal minus real 10-year Treasury yield', lastDate: macro.REAL10.lastDate, last: Math.round((macro.DGS10.last - macro.REAL10.last) * 100) / 100 };
});
// NY Fed effective fed funds rate
await macroStep('EFFR', 'Effective fed funds rate', async () => {
  const j = await get(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=2005-01-01&endDate=${ymd(new Date())}`);
  const rr = j.refRates || [];
  series('EFFR', 'Effective fed funds rate', '%', 'Federal Reserve Bank of New York', rr.map(r => [r.effectiveDate, r.percentRate]).filter(r => isFinite(r[1])));
  const top = rr.slice().sort((a, b) => a.effectiveDate < b.effectiveDate ? 1 : -1)[0];
  if (top && top.targetRateFrom !== undefined) macro.EFFR.target = [top.targetRateFrom, top.targetRateTo];
});
// Cboe VIX
await macroStep('VIX', 'VIX', async () => {
  const t = csvRows(await get('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv', { text: true }));
  series('VIX', 'VIX (equity volatility)', 'index', 'Cboe Global Markets', t.slice(1).map(r => [mdy(r[0]), parseFloat(r[4])]).filter(r => isFinite(r[1]) && r[0] >= '2005-01-01'));
});
// Freddie Mac 30-year mortgage rate
await macroStep('MORT30', '30-year mortgage rate', async () => {
  const t = csvRows(await get('https://www.freddiemac.com/pmms/docs/PMMS_history.csv', { text: true }));
  const i = t[0].indexOf('pmms30');
  series('MORT30', '30-year mortgage rate', '%', 'Freddie Mac PMMS', t.slice(1).map(r => [mdy(r[0]), parseFloat(r[i])]).filter(r => isFinite(r[1]) && r[0] >= '2005-01-01'));
});
// BLS: CPI (headline, core) and unemployment
await macroStep('CPI', 'BLS CPI and unemployment', async () => {
  const body = JSON.stringify({ seriesid: ['CUUR0000SA0', 'CUUR0000SA0L1E', 'LNS14000000'], startyear: String(yr - 9), endyear: String(yr) });
  const j = await get('https://api.bls.gov/publicAPI/v1/timeseries/data/', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  if (j.status !== 'REQUEST_SUCCEEDED') throw new Error((j.message || []).join(' ') || j.status);
  const one = id => (j.Results.series.find(s => s.seriesID === id)?.data || []).filter(d => /^M(0[1-9]|1[0-2])$/.test(d.period)).map(d => [`${d.year}-${d.period.slice(1)}-01`, parseFloat(d.value)]).filter(r => isFinite(r[1])).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const yoy = rows => rows.map((r, i) => i >= 12 ? [r[0], Math.round((r[1] / rows[i - 12][1] - 1) * 1000) / 10] : null).filter(Boolean);
  series('CPI', 'CPI inflation (year on year)', '%', 'US Bureau of Labor Statistics', yoy(one('CUUR0000SA0')));
  series('CORECPI', 'Core CPI inflation (year on year)', '%', 'US Bureau of Labor Statistics', yoy(one('CUUR0000SA0L1E')));
  series('UNRATE', 'Unemployment rate', '%', 'US Bureau of Labor Statistics', one('LNS14000000'));
});
for (const [id, m] of Object.entries(macro)) {
  if (!m.lastDate) continue;
  const age = (Date.now() - new Date(m.lastDate)) / 864e5;
  const lim = ['CPI', 'CORECPI', 'UNRATE'].includes(id) ? 75 : id === 'MORT30' ? 14 : 7;
  ctl(id, 'Timeliness', age > lim ? 'warn' : 'pass', `${m.label}: latest observation ${m.lastDate}`, age > lim ? 'Series not updated within its normal release cycle' : '');
}

// ---------------- write ----------------
const summary = { total: controls.length, pass: controls.filter(c => c.status === 'pass').length, warn: controls.filter(c => c.status === 'warn').length, fail: controls.filter(c => c.status === 'fail').length };
const out = {
  generatedAt: new Date().toISOString(), asOf: latest || null, classes: CLASSES, securities, macro, ust, controls, summary,
  sources: { prices: 'Tiingo end-of-day prices (total return rebuilt and reconciled from prices and distributions)', macro: 'US Treasury, Federal Reserve Bank of New York, Cboe, Freddie Mac, US Bureau of Labor Statistics' }
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const n = Object.keys(securities).length;
console.log(`Wrote ${OUT}: ${n}/${UNIVERSE.length} securities, ${Object.keys(macro).length} macro series; controls ${summary.pass} pass / ${summary.warn} warn / ${summary.fail} fail`);
for (const c of controls.filter(c => c.status !== 'pass')) console.log(`  ${c.status.toUpperCase()} ${c.series} · ${c.control}: ${c.evidence}`);
if (!n && !Object.keys(macro).length) { console.error('No data at all; refusing to publish.'); process.exit(1); }
