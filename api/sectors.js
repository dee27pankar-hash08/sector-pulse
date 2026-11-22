import { getBestHistory, pool, retDays, retYTD, cagr, tail, annVol, maxDrawdown, sma, rebased, cacheHeaders, round, DAY } from './_lib.js';
import { BENCHMARK, SECTORS, BROAD, US } from './_config.js';

function analyse(h) {
  const p = h.pts;
  const last = p[p.length - 1];
  const y1 = tail(p, 365);
  const s50 = sma(p, 50), s200 = sma(p, 200);
  let trend = 'n/a';
  if (s50 && s200) trend = last[1] > s50 && s50 > s200 ? 'Uptrend' : last[1] < s50 && s50 < s200 ? 'Downtrend' : 'Mixed';
  const dd = p[0][0] <= last[0] - 300 * DAY ? maxDrawdown(y1) : null;
  return {
    proxy: h.name, proxyCode: h.code, asOf: last[0], historyFrom: p[0][0],
    r1w: round(retDays(p, 7)), r1m: round(retDays(p, 30)), r3m: round(retDays(p, 91)),
    r6m: round(retDays(p, 182)), ytd: round(retYTD(p)), r1y: round(retDays(p, 365)),
    cagr3y: round(cagr(p, 3)),
    vol1y: p[0][0] <= last[0] - 300 * DAY ? round(annVol(y1)) : null,
    mdd1y: dd ? round(dd.mdd) : null,
    offHigh: round(last[1] / Math.max(...y1.map(x => x[1])) - 1),
    above200: s200 ? last[1] > s200 : null,
    above50: s50 ? last[1] > s50 : null,
    trend,
    chart: rebased(p, 365, 5)
  };
}

export default async function handler(req, res) {
  try {
    const groups = [BENCHMARK, ...SECTORS, ...BROAD, ...US];
    const hist = await pool(groups, 6, g => getBestHistory(g.codes).catch(() => null));
    const bench = hist[0] ? analyse(hist[0]) : null;
    if (!bench) throw new Error('Benchmark data unavailable');
    const rows = groups.map((g, i) => {
      if (!hist[i]) return { key: g.key || 'nifty50', label: g.label, group: g.group || '', error: 'data unavailable' };
      const a = analyse(hist[i]);
      a.key = g.key || 'nifty50'; a.label = g.label; a.group = g.group || '';
      a.rs1m = a.r1m !== null && bench.r1m !== null ? round(a.r1m - bench.r1m) : null;
      a.rs3m = a.r3m !== null && bench.r3m !== null ? round(a.r3m - bench.r3m) : null;
      a.rs1y = a.r1y !== null && bench.r1y !== null ? round(a.r1y - bench.r1y) : null;
      return a;
    });
    const benchmark = rows[0];
    const sectors = rows.slice(1, 1 + SECTORS.length);
    const broad = rows.slice(1 + SECTORS.length, 1 + SECTORS.length + BROAD.length);
    const us = rows.slice(1 + SECTORS.length + BROAD.length);

    // ---------- rule-based insights ----------
    const valid = sectors.filter(s => !s.error && s.rs3m !== null);
    const by3m = [...valid].sort((a, b) => b.rs3m - a.rs3m);
    const withTrend = sectors.filter(s => !s.error && s.above200 !== null);
    const breadth = withTrend.length ? withTrend.filter(s => s.above200).length / withTrend.length : null;
    const emerging = valid.filter(s => s.rs1m > 0 && s.rs1y !== null && s.rs1y < 0).map(s => s.label);
    const fading = valid.filter(s => s.rs1m < 0 && s.rs1y !== null && s.rs1y > 0).map(s => s.label);
    const mid = broad[0], small = broad[1];
    let riskAppetite = null;
    if (mid && small && !mid.error && !small.error && mid.r3m !== null && small.r3m !== null) {
      const spread = (mid.r3m + small.r3m) / 2 - benchmark.r3m;
      riskAppetite = { spread: round(spread), label: spread > 0.02 ? 'Risk-on' : spread < -0.02 ? 'Risk-off' : 'Neutral' };
    }
    const insights = {
      leaders: by3m.slice(0, 3).map(s => ({ label: s.label, rs3m: s.rs3m, r3m: s.r3m })),
      laggards: by3m.slice(-3).reverse().map(s => ({ label: s.label, rs3m: s.rs3m, r3m: s.r3m })),
      breadth: round(breadth, 3), breadthCount: withTrend.filter(s => s.above200).length, breadthTotal: withTrend.length,
      emerging, fading, riskAppetite
    };

    cacheHeaders(res, 21600);
    res.status(200).send(JSON.stringify({ generatedAt: Date.now(), asOf: benchmark.asOf, benchmark, sectors, broad, us, insights }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.status(502).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
