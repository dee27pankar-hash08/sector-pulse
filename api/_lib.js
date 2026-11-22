// Shared data + maths helpers for Sector Pulse.
// Data sources: AMFI (official daily NAVs), mfapi.in (AMFI NAV history mirror),
// US Treasury (official daily yield curve), Frankfurter (ECB reference FX rates).

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'Accept': '*/*'
};
const DAY = 86400000;

export async function fetchText(url, timeoutMs = 15000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

// ---------- NAV history ----------
function parseDMY(s) { // "20-11-2026" -> UTC ms
  const [d, m, y] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getHistory(code) {
  let txt, lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { txt = await fetchText(`https://api.mfapi.in/mf/${code}`, 12000); break; }
    catch (e) { lastErr = e; await sleep(500 * (attempt + 1)); }
  }
  if (txt === undefined) throw lastErr;
  const j = JSON.parse(txt);
  if (!j || !Array.isArray(j.data) || !j.data.length) throw new Error('no data for ' + code);
  const pts = [];
  for (const row of j.data) {
    const v = parseFloat(row.nav);
    if (!isFinite(v) || v <= 0) continue;
    pts.push([parseDMY(row.date), v]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  // de-duplicate dates
  const out = [];
  for (const p of pts) { if (!out.length || out[out.length - 1][0] !== p[0]) out.push(p); else out[out.length - 1] = p; }
  // Adjust for unit splits / consolidations (e.g. ETF NAV jumping 10x overnight):
  // a one-day move beyond -45% / +80% is treated as a corporate action, and earlier NAVs are rescaled.
  let splits = 0;
  for (let i = out.length - 1; i > 0; i--) {
    const r = out[i][1] / out[i - 1][1];
    if (r < 0.55 || r > 1.8) {
      for (let k = 0; k < i; k++) out[k] = [out[k][0], out[k][1] * r];
      splits++;
    }
  }
  return { splits, code: String(code), name: j.meta?.scheme_name || String(code), category: j.meta?.scheme_category || '', house: j.meta?.fund_house || '', pts: out };
}

// Pick the first candidate with >= minPts points, else the longest one available.
// Candidates are tried in order, so fallbacks are only fetched when needed.
export async function getBestHistory(codes, minPts = 260) {
  let best = null;
  for (const c of codes) {
    try {
      const h = await getHistory(c);
      if (h.pts.length >= minPts) return h;
      if (!best || h.pts.length > best.pts.length) best = h;
    } catch (e) { /* try next candidate */ }
  }
  return best;
}

// Run async jobs with a concurrency limit (keeps the upstream API happy).
export async function pool(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ---------- series maths ----------
export function idxAtOrBefore(pts, t) {
  let lo = 0, hi = pts.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

// Simple return over `days` calendar days ending at the last point. null if history too short.
export function retDays(pts, days) {
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const target = last[0] - days * DAY;
  if (pts[0][0] > target + 4 * DAY) return null; // not enough history
  const i = idxAtOrBefore(pts, target);
  if (i < 0) return null;
  return last[1] / pts[i][1] - 1;
}

export function retYTD(pts) {
  if (!pts.length) return null;
  const last = pts[pts.length - 1];
  const y = new Date(last[0]).getUTCFullYear();
  const i = idxAtOrBefore(pts, Date.UTC(y, 0, 1) - 1);
  if (i < 0) return null;
  return last[1] / pts[i][1] - 1;
}

export function cagr(pts, years) {
  const r = retDays(pts, Math.round(years * 365.25));
  if (r === null) return null;
  return Math.pow(1 + r, 1 / years) - 1;
}

export function tail(pts, days) {
  if (!pts.length) return [];
  const start = pts[pts.length - 1][0] - days * DAY;
  const i = Math.max(0, idxAtOrBefore(pts, start));
  return pts.slice(i);
}

export function dailyReturns(pts) {
  const r = [];
  for (let i = 1; i < pts.length; i++) r.push([pts[i][0], pts[i][1] / pts[i - 1][1] - 1]);
  return r;
}

export function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
export function stdev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export function annVol(pts) {
  const r = dailyReturns(pts).map(x => x[1]);
  if (r.length < 40) return null;
  return stdev(r) * Math.sqrt(252);
}

export function maxDrawdown(pts) {
  if (pts.length < 2) return null;
  let peak = pts[0][1], peakT = pts[0][0], mdd = 0, from = pts[0][0], to = pts[0][0];
  for (const [t, v] of pts) {
    if (v > peak) { peak = v; peakT = t; }
    const dd = v / peak - 1;
    if (dd < mdd) { mdd = dd; from = peakT; to = t; }
  }
  return { mdd, from, to };
}

export function sma(pts, n) {
  if (pts.length < n) return null;
  let s = 0;
  for (let i = pts.length - n; i < pts.length; i++) s += pts[i][1];
  return s / n;
}

// Weekly-sampled series, rebased to 100 at the start of the window (for charts).
export function rebased(pts, days, step = 5) {
  const t = tail(pts, days);
  if (!t.length) return [];
  const base = t[0][1];
  const out = [];
  for (let i = 0; i < t.length; i += step) out.push([t[i][0], +(t[i][1] / base * 100).toFixed(2)]);
  const last = t[t.length - 1];
  if (out[out.length - 1][0] !== last[0]) out.push([last[0], +(last[1] / base * 100).toFixed(2)]);
  return out;
}

// Align two series on common dates.
export function align(a, b) {
  const mb = new Map(b.map(p => [p[0], p[1]]));
  const fa = [], fb = [];
  for (const [t, v] of a) { const w = mb.get(t); if (w !== undefined) { fa.push([t, v]); fb.push([t, w]); } }
  return [fa, fb];
}

// Month-end samples.
export function monthEnds(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const d = new Date(pts[i][0]);
    const n = pts[i + 1] ? new Date(pts[i + 1][0]) : null;
    if (!n || n.getUTCMonth() !== d.getUTCMonth()) out.push(pts[i]);
  }
  return out;
}

export function cacheHeaders(res, seconds = 21600) {
  res.setHeader('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=86400`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

export function round(x, d = 4) { return x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(d); }
export { DAY };
