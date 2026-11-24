// Advisor Desk market-data pipeline.
// Runs on GitHub Actions after the US close. Fetches total-return price history for the
// security master (asset-class ETFs, common mutual funds, mega-cap stocks) and US macro
// series from FRED, runs data-quality controls, and writes one JSON file for the app.
// If a source fails, the previous day's series is kept and the control is marked as failed.
//
// Usage: node scripts/fetch-market.mjs <previous.json> <output.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , PREV = 'prev.json', OUT = 'out/market.json'] = process.argv;
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': '*/*' };

// ---------- security master ----------
// cls = asset class used for allocation. proxy = the ETF that represents the asset class in models.
export const CLASSES = {
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
export const UNIVERSE = [
  // Asset-class proxies (used to build and back-test the models)
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

// FRED macro series: id, label, unit, frequency
const FRED = [
  ['DFF', 'Fed funds (effective)', '%', 'daily'],
  ['DGS3MO', '3-month Treasury', '%', 'daily'],
  ['DGS2', '2-year Treasury', '%', 'daily'],
  ['DGS10', '10-year Treasury', '%', 'daily'],
  ['DGS30', '30-year Treasury', '%', 'daily'],
  ['T10YIE', '10-year breakeven inflation', '%', 'daily'],
  ['BAMLC0A0CM', 'Investment-grade spread (OAS)', '%', 'daily'],
  ['BAMLH0A0HYM2', 'High-yield spread (OAS)', '%', 'daily'],
  ['VIXCLS', 'VIX (equity volatility)', 'index', 'daily'],
  ['MORTGAGE30US', '30-year mortgage rate', '%', 'weekly'],
  ['CPIAUCSL', 'CPI (headline index)', 'index', 'monthly'],
  ['CPILFESL', 'Core CPI (index)', 'index', 'monthly'],
  ['UNRATE', 'Unemployment rate', '%', 'monthly']
];

// ---------- helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { tries = 3, timeout = 20000, text = false } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return text ? await r.text() : await r.json();
    } catch (e) { last = e; if (i === tries - 1) console.log(`  ! ${url.slice(0, 90)} -> ${e.name}: ${e.message}${e.cause ? ' (' + (e.cause.code || e.cause.message) + ')' : ''}`); await sleep(1500 * (i + 1)); }
  }
  throw last;
}
const ymd = d => d.toISOString().slice(0, 10);
const r4 = x => Math.round(x * 1e4) / 1e4;
const sig = x => x === null || x === undefined ? null : Number(x.toPrecision(7));

async function yahoo(t) {
  const now = Math.floor(Date.now() / 1000);
  const q = `/v8/finance/chart/${encodeURIComponent(t)}?period1=0&period2=${now}&interval=1d&events=div%7Csplit&includeAdjustedClose=true`;
  let j;
  try { j = await get('https://query1.finance.yahoo.com' + q); }
  catch (e) { j = await get('https://query2.finance.yahoo.com' + q); }
  const res = j?.chart?.result?.[0];
  if (!res || !res.timestamp) throw new Error(j?.chart?.error?.description || 'empty response');
  const ts = res.timestamp, adj = res.indicators?.adjclose?.[0]?.adjclose || [], cl = res.indicators?.quote?.[0]?.close || [];
  const off = res.meta?.gmtoffset || 0;
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const a = adj[i] ?? null, c = cl[i] ?? null;
    if (a === null || c === null || !(a > 0)) continue;
    const d = ymd(new Date((ts[i] + off) * 1000));
    if (pts.length && pts[pts.length - 1][0] === d) pts[pts.length - 1] = [d, a, c]; else pts.push([d, a, c]);
  }
  return { pts, currency: res.meta?.currency, exchange: res.meta?.exchangeName, splits: Object.keys(res.events?.splits || {}).length };
}

async function stooqClose(t) {
  const sym = t.toLowerCase().replace('-', '.') + '.us';
  const txt = await get(`https://stooq.com/q/l/?s=${sym}&f=sd2c&h&e=csv`, { text: true, tries: 2, timeout: 10000 });
  const line = txt.trim().split('\n')[1]; if (!line) throw new Error('no data');
  const [, date, close] = line.split(',');
  const c = parseFloat(close); if (!(c > 0)) throw new Error('no close');
  return { date, close: c };
}

async function fred(id) {
  const txt = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=1999-12-01`, { text: true });
  const rows = txt.trim().split('\n').slice(1).map(l => l.split(',')).filter(r => r[1] && r[1] !== '.' && !isNaN(parseFloat(r[1]))).map(r => [r[0], parseFloat(r[1])]);
  if (!rows.length) throw new Error('empty series');
  return rows;
}

const monthEnds = pts => { const out = []; for (const p of pts) { const m = p[0].slice(0, 7); if (out.length && out[out.length - 1][0] === m) out[out.length - 1] = [m, p[1]]; else out.push([m, p[1]]); } return out; };

async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }

// ---------- run ----------
let prev = {};
try { prev = JSON.parse(readFileSync(PREV, 'utf8')); } catch (e) {}
const controls = [];
const ctl = (series, control, status, evidence, action = '') => controls.push({ series, control, status, evidence, action });

const securities = {};
await pool(UNIVERSE, 4, async (s) => {
  let data, err;
  try { data = await yahoo(s.t); } catch (e) { err = e.message; }
  const p = prev.securities?.[s.t];
  if (!data || data.pts.length < 30) {
    ctl(s.t, 'Availability', 'fail', `Price source failed (${err || 'too little data'})${p ? '; previous data kept' : ''}`, 'Re-run the refresh; if it persists, check the ticker and the source');
    if (p) securities[s.t] = { ...p, stale: true };
    return;
  }
  const pts = data.pts;
  ctl(s.t, 'Availability', 'pass', `${pts.length.toLocaleString('en-US')} daily prices since ${pts[0][0]}`);
  // history length: models and stress tests need 2008
  if (s.proxy) ctl(s.t, 'History length', pts[0][0] <= '2007-12-31' ? 'pass' : 'warn', `History starts ${pts[0][0]}`, pts[0][0] <= '2007-12-31' ? '' : 'Stress test for 2008 uses a shorter history for this asset class');
  // abnormal one-day moves in the last year (total-return basis)
  const lastYr = pts.slice(-260); let big = [];
  for (let i = 1; i < lastYr.length; i++) { const r = lastYr[i][1] / lastYr[i - 1][1] - 1; if (Math.abs(r) > (s.type === 'Stock' ? 0.25 : 0.12)) big.push(`${lastYr[i][0]} ${(r * 100).toFixed(1)}%`); }
  ctl(s.t, 'Accuracy (abnormal moves)', big.length ? 'warn' : 'pass', big.length ? `Large one-day moves: ${big.slice(0, 3).join(', ')}` : 'No one-day move beyond threshold in the last year', big.length ? 'Confirm against a second source or a corporate action' : '');
  // gaps
  let gaps = 0; for (let i = 1; i < lastYr.length; i++) if ((new Date(lastYr[i][0]) - new Date(lastYr[i - 1][0])) / 864e5 > 6) gaps++;
  ctl(s.t, 'Completeness', gaps ? 'warn' : 'pass', gaps ? `${gaps} gap(s) longer than 6 days in the last year` : 'No gaps longer than 6 days in the last year');
  securities[s.t] = {
    name: s.name, cls: s.cls, type: s.type, proxy: s.proxy, currency: data.currency,
    first: pts[0][0], lastDate: pts[pts.length - 1][0], last: sig(pts[pts.length - 1][2]),
    monthly: monthEnds(pts).map(([m, a]) => [m, sig(a)]),
    daily: pts.slice(-300).map(([d, a]) => [d, sig(a)])
  };
});

// timeliness: compare each series with the latest date in the universe
const latest = Object.values(securities).map(s => s.lastDate).sort().pop();
for (const [t, s] of Object.entries(securities)) {
  const lag = (new Date(latest) - new Date(s.lastDate)) / 864e5;
  ctl(t, 'Timeliness', s.stale ? 'fail' : lag > 4 ? 'warn' : 'pass', `Last price ${s.lastDate} (universe latest ${latest})`, lag > 4 || s.stale ? 'Investigate a stale or suspended price' : '');
}

// cross-source check on the latest close (exchange-traded only)
let crossOk = 0, crossN = 0;
await pool(UNIVERSE.filter(s => s.type !== 'Mutual fund' && securities[s.t] && !securities[s.t].stale), 3, async (s) => {
  try {
    const q = await stooqClose(s.t); const mine = securities[s.t];
    if (q.date !== mine.lastDate) { ctl(s.t, 'Cross-source price check', 'pass', `Second source on a different date (${q.date}); not compared`); return; }
    crossN++;
    const diff = Math.abs(q.close / mine.last - 1);
    if (diff < 0.005) crossOk++;
    ctl(s.t, 'Cross-source price check', diff < 0.005 ? 'pass' : 'warn', `Primary ${mine.last} vs second source ${q.close} (${(diff * 100).toFixed(2)}% difference)`, diff < 0.005 ? '' : 'Reconcile the closing price before using it in client reports');
  } catch (e) { ctl(s.t, 'Cross-source price check', 'warn', `Second source unavailable (${e.message})`, 'Primary source used without independent confirmation'); }
});

// macro
const macro = {};
await pool(FRED, 3, async ([id, label, unit, freq]) => {
  try {
    const rows = await fred(id);
    const last = rows[rows.length - 1];
    const ago = days => { const d = new Date(last[0]); d.setDate(d.getDate() - days); const s = ymd(d); let v = null; for (const r of rows) { if (r[0] <= s) v = r[1]; else break; } return v; };
    macro[id] = { label, unit, freq, lastDate: last[0], last: last[1], m1: ago(31), y1: ago(365), monthly: monthEnds(rows).filter(r => r[0] >= '2005-01').map(([m, v]) => [m, v]) };
    if (freq === 'monthly') { const m = macro[id].monthly; const n = m.length; macro[id].yoy = n > 12 ? r4((m[n - 1][1] / m[n - 13][1] - 1) * 100) : null; macro[id].yoyPrev = n > 13 ? r4((m[n - 2][1] / m[n - 14][1] - 1) * 100) : null; }
    const age = (Date.now() - new Date(last[0])) / 864e5, lim = freq === 'daily' ? 7 : freq === 'weekly' ? 14 : 75;
    ctl(id, 'Timeliness', age > lim ? 'warn' : 'pass', `${label}: latest observation ${last[0]}`, age > lim ? 'Series not updated within its normal release cycle' : '');
  } catch (e) {
    ctl(id, 'Availability', prev.macro?.[id] ? 'warn' : 'fail', `FRED download failed (${e.message})${prev.macro?.[id] ? '; previous data kept' : ''}`, 'Re-run the refresh');
    if (prev.macro?.[id]) macro[id] = prev.macro[id];
  }
});

const summary = { total: controls.length, pass: controls.filter(c => c.status === 'pass').length, warn: controls.filter(c => c.status === 'warn').length, fail: controls.filter(c => c.status === 'fail').length, crossChecked: crossN, crossMatched: crossOk };
const out = { generatedAt: new Date().toISOString(), asOf: latest, classes: CLASSES, securities, macro, controls, summary, sources: { prices: 'Yahoo Finance chart API (total-return adjusted closes)', crossCheck: 'Stooq end-of-day quotes', macro: 'Federal Reserve Bank of St. Louis (FRED)' } };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT}: ${Object.keys(securities).length}/${UNIVERSE.length} securities, ${Object.keys(macro).length}/${FRED.length} macro series, controls ${summary.pass} pass / ${summary.warn} warn / ${summary.fail} fail, cross-checked ${crossOk}/${crossN}`);
if (Object.keys(securities).length < UNIVERSE.length * 0.8) { console.error('Too many securities missing; refusing to publish.'); process.exit(1); }
