import { getHistory, pool, fetchText, cacheHeaders, round, DAY } from './_lib.js';
import { BENCHMARK, SECTORS, BROAD, US } from './_config.js';

// First-line data-quality controls on every series the app relies on.
// Each check returns pass / warn / fail with the evidence and the corrective action.

function checkSeries(label, h, isPrimary, latestDate) {
  const out = [];
  const p = h.pts, last = p[p.length - 1][0];
  const add = (control, status, evidence, action) => out.push({ series: label, proxy: h.name, code: h.code, control, status, evidence, action });

  // 1. Timeliness: is the latest NAV as fresh as the latest NAV across the universe?
  const lagDays = Math.round((latestDate - last) / DAY);
  add('Timeliness', lagDays <= 1 ? 'pass' : lagDays <= 4 ? 'warn' : 'fail',
    lagDays <= 0 ? `Latest NAV ${new Date(last).toISOString().slice(0, 10)}, in line with the universe` : `Latest NAV is ${lagDays} day(s) behind the universe`,
    lagDays <= 1 ? 'None' : 'Check whether the scheme stopped publishing NAVs; switch to the next proxy if it persists');

  // 2. Completeness: gaps in the last year beyond a long weekend / holiday block.
  const yr = p.filter(x => x[0] >= last - 365 * DAY);
  let gaps = 0, maxGap = 0;
  for (let i = 1; i < yr.length; i++) { const g = (yr[i][0] - yr[i - 1][0]) / DAY; if (g > 6) gaps++; maxGap = Math.max(maxGap, g); }
  add('Completeness', gaps === 0 ? 'pass' : gaps <= 2 ? 'warn' : 'fail',
    gaps === 0 ? `No gaps over 6 days in the last year (longest ${Math.round(maxGap)} days)` : `${gaps} gap(s) over 6 days; longest ${Math.round(maxGap)} days`,
    gaps === 0 ? 'None' : 'Investigate missing NAV dates; returns spanning the gap may be distorted');

  // 3. Accuracy: abnormal one-day moves (after split adjustment) that need review.
  let outliers = 0, worst = 0;
  for (let i = 1; i < yr.length; i++) { const r = yr[i][1] / yr[i - 1][1] - 1; if (Math.abs(r) > 0.08) { outliers++; if (Math.abs(r) > Math.abs(worst)) worst = r; } }
  add('Accuracy (outliers)', outliers === 0 ? 'pass' : 'warn',
    outliers === 0 ? 'No single-day move above 8% in the last year' : `${outliers} single-day move(s) above 8% (largest ${(worst * 100).toFixed(1)}%)`,
    outliers === 0 ? 'None' : 'Verify against the index level or AMC disclosure before relying on short-period returns');

  // 4. Corporate actions handled.
  add('Corporate actions', 'pass', h.splits ? `${h.splits} unit split/consolidation detected and adjusted` : 'No unit splits detected', 'None');

  // 5. Sufficiency of history for 1-year metrics.
  const histDays = (last - p[0][0]) / DAY;
  add('History length', histDays >= 365 ? 'pass' : 'warn',
    `${(histDays / 365).toFixed(1)} years of NAV history`, histDays >= 365 ? 'None' : '1-year metrics unavailable; prefer a longer-running proxy');

  // 6. Proxy selection.
  add('Proxy selection', isPrimary ? 'pass' : 'warn', isPrimary ? 'Primary proxy in use' : 'Primary proxy unavailable; fallback proxy in use',
    isPrimary ? 'None' : 'Review why the primary proxy failed; confirm the fallback tracks the same index');
  return out;
}

export default async function handler(req, res) {
  try {
    const started = Date.now();
    const groups = [BENCHMARK, ...SECTORS, ...BROAD, ...US];
    const results = await pool(groups, 6, async g => {
      for (let i = 0; i < g.codes.length; i++) {
        try { const h = await getHistory(g.codes[i]); if (h.pts.length >= 200 || i === g.codes.length - 1) return { g, h, primary: i === 0 }; }
        catch (e) { /* next */ }
      }
      return { g, h: null };
    });
    const ok = results.filter(r => r.h);
    const latest = Math.max(...ok.map(r => r.h.pts[r.h.pts.length - 1][0]));
    let checks = [];
    for (const r of results) {
      if (!r.h) { checks.push({ series: r.g.label, proxy: '-', code: '-', control: 'Availability', status: 'fail', evidence: 'No NAV history could be retrieved for any proxy', action: 'Escalate: source unavailable; series excluded from analysis' }); continue; }
      checks.push({ series: r.g.label, proxy: r.h.name, code: r.h.code, control: 'Availability', status: 'pass', evidence: `${r.h.pts.length.toLocaleString()} daily NAVs retrieved`, action: 'None' });
      checks = checks.concat(checkSeries(r.g.label, r.h, r.primary, latest));
    }

    // Source-level checks: AMFI file and macro feeds.
    const source = [];
    try {
      const t0 = Date.now(); const txt = await fetchText('https://www.amfiindia.com/spages/NAVAll.txt', 20000);
      const ms = Date.now() - t0; const lines = txt.split('\n').length;
      source.push({ series: 'AMFI NAV file', proxy: 'amfiindia.com', code: '-', control: 'Source availability & size', status: lines > 5000 ? 'pass' : 'fail', evidence: `${lines.toLocaleString()} lines downloaded in ${ms} ms`, action: lines > 5000 ? 'None' : 'Escalate: AMFI file incomplete' });
    } catch (e) { source.push({ series: 'AMFI NAV file', proxy: 'amfiindia.com', code: '-', control: 'Source availability & size', status: 'fail', evidence: String(e.message || e), action: 'Escalate: official NAV source unreachable' }); }
    try {
      const j = JSON.parse(await fetchText('https://api.frankfurter.app/latest?from=USD&to=INR'));
      const age = Math.round((Date.now() - Date.parse(j.date + 'T00:00:00Z')) / DAY);
      source.push({ series: 'USD/INR (ECB)', proxy: 'frankfurter.app', code: '-', control: 'Timeliness', status: age <= 4 ? 'pass' : 'warn', evidence: `Latest rate ${j.rates.INR} dated ${j.date} (${age} day(s) old)`, action: age <= 4 ? 'None' : 'Check the ECB publication calendar' });
    } catch (e) { source.push({ series: 'USD/INR (ECB)', proxy: 'frankfurter.app', code: '-', control: 'Timeliness', status: 'fail', evidence: String(e.message || e), action: 'Escalate: FX source unreachable' }); }

    checks = source.concat(checks);
    const summary = { total: checks.length, pass: checks.filter(c => c.status === 'pass').length, warn: checks.filter(c => c.status === 'warn').length, fail: checks.filter(c => c.status === 'fail').length };
    cacheHeaders(res, 21600);
    res.status(200).send(JSON.stringify({ generatedAt: Date.now(), runtimeMs: Date.now() - started, latestNav: latest, summary, checks }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.status(502).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
