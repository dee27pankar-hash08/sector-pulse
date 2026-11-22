import { fetchText, retDays, round, cacheHeaders, DAY } from './_lib.js';

function iso(t) { return new Date(t).toISOString().slice(0, 10); }

async function fx() {
  const end = Date.now(), start = end - 400 * DAY;
  const j = JSON.parse(await fetchText(`https://api.frankfurter.app/${iso(start)}..${iso(end)}?from=USD&to=INR`));
  const pts = Object.entries(j.rates || {}).map(([d, r]) => [Date.parse(d + 'T00:00:00Z'), r.INR]).filter(p => isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  if (!pts.length) throw new Error('no fx');
  const last = pts[pts.length - 1];
  return {
    source: 'ECB euro foreign exchange reference rates (via Frankfurter)',
    latest: last[1], asOf: last[0],
    chg1m: round(retDays(pts, 30)), chg3m: round(retDays(pts, 91)), chg1y: round(retDays(pts, 365)),
    chart: pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).filter(p => p[0] >= last[0] - 365 * DAY)
  };
}

function parseTreasury(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(',').map(s => s.replace(/"/g, '').trim());
  const iD = head.indexOf('Date'), i3m = head.indexOf('3 Mo'), i2 = head.indexOf('2 Yr'), i10 = head.indexOf('10 Yr');
  const out = [];
  for (const l of lines.slice(1)) {
    const c = l.split(',');
    const [m, d, y] = c[iD].split('/').map(Number);
    const row = { t: Date.UTC(y, m - 1, d), y3m: parseFloat(c[i3m]), y2: parseFloat(c[i2]), y10: parseFloat(c[i10]) };
    if (isFinite(row.y10) && isFinite(row.y2)) out.push(row);
  }
  return out;
}

async function treasury() {
  const y = new Date().getUTCFullYear();
  const url = yr => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`;
  const [a, b] = await Promise.allSettled([fetchText(url(y)), fetchText(url(y - 1))]);
  let rows = [];
  if (a.status === 'fulfilled') rows = rows.concat(parseTreasury(a.value));
  if (b.status === 'fulfilled') rows = rows.concat(parseTreasury(b.value));
  if (!rows.length) throw new Error('no treasury data');
  rows.sort((p, q) => p.t - q.t);
  const last = rows[rows.length - 1];
  const yearAgo = rows.filter(r => r.t <= last.t - 365 * DAY).pop() || rows[0];
  const recent = rows.filter(r => r.t >= last.t - 365 * DAY);
  return {
    source: 'U.S. Department of the Treasury, daily par yield curve rates',
    asOf: last.t,
    latest: { y3m: last.y3m, y2: last.y2, y10: last.y10, spread10_2: round(last.y10 - last.y2, 2) },
    yearAgo: { t: yearAgo.t, y3m: yearAgo.y3m, y2: yearAgo.y2, y10: yearAgo.y10, spread10_2: round(yearAgo.y10 - yearAgo.y2, 2) },
    chart: recent.filter((_, i) => i % 3 === 0 || i === recent.length - 1).map(r => [r.t, r.y2, r.y10])
  };
}

export default async function handler(req, res) {
  const [f, t] = await Promise.allSettled([fx(), treasury()]);
  cacheHeaders(res, 21600);
  res.status(200).send(JSON.stringify({
    generatedAt: Date.now(),
    fx: f.status === 'fulfilled' ? f.value : { error: String(f.reason?.message || f.reason) },
    treasury: t.status === 'fulfilled' ? t.value : { error: String(t.reason?.message || t.reason) }
  }));
}
