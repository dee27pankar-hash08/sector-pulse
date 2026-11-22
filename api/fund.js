import { getHistory, getBestHistory, align, tail, retDays, cagr, dailyReturns, mean, stdev, maxDrawdown, monthEnds, rebased, idxAtOrBefore, cacheHeaders, round, DAY } from './_lib.js';
import { DD_BENCHMARKS } from './_config.js';

function autoBench(category, name) {
  const s = (category + ' ' + name).toLowerCase();
  if (s.includes('mid cap') && !s.includes('large & mid')) return 'mid150';
  if (s.includes('small cap')) return 'small250';
  if (/bank|financial/.test(s)) return /psu bank/.test(s) ? 'psubank' : 'bank';
  if (/technology|\bit\b|digital/.test(s)) return 'it';
  if (/pharma|health/.test(s)) return 'health';
  if (/infra/.test(s)) return 'infra';
  if (/consumption|fmcg/.test(s)) return 'consumption';
  if (/nasdaq/.test(s)) return 'ndx';
  if (/s&p 500|us equity|us specific/.test(s)) return 'sp500';
  return 'nifty50';
}

function windowCagr(pts) {
  if (pts.length < 2) return null;
  const days = (pts[pts.length - 1][0] - pts[0][0]) / DAY;
  if (days < 180) return null;
  return Math.pow(pts[pts.length - 1][1] / pts[0][1], 365.25 / days) - 1;
}

function monthlyRets(pts) {
  const m = monthEnds(pts);
  const r = [];
  for (let i = 1; i < m.length; i++) r.push([m[i][0], m[i][1] / m[i - 1][1] - 1]);
  return r;
}

function capture(fm, bm, up) {
  const sel = [];
  for (let i = 0; i < bm.length; i++) if (up ? bm[i][1] > 0 : bm[i][1] < 0) sel.push([fm[i][1], bm[i][1]]);
  if (sel.length < 3) return null;
  const g = arr => Math.pow(arr.reduce((p, x) => p * (1 + x), 1), 1 / arr.length) - 1;
  const gf = g(sel.map(x => x[0])), gb = g(sel.map(x => x[1]));
  return gb === 0 ? null : gf / gb;
}

function calendarYears(f, b) {
  const last = new Date(f[f.length - 1][0]).getUTCFullYear();
  const out = [];
  for (let y = last; y >= last - 6; y--) {
    const endT = y === last ? f[f.length - 1][0] : Date.UTC(y, 11, 31, 23);
    const startT = Date.UTC(y, 0, 1) - 1;
    if (f[0][0] > Date.UTC(y, 0, 10)) break; // need full year (or YTD with history at year start)
    const fi0 = idxAtOrBefore(f, startT), fi1 = idxAtOrBefore(f, endT);
    const bi0 = idxAtOrBefore(b, startT), bi1 = idxAtOrBefore(b, endT);
    if (fi0 < 0 || bi0 < 0) break;
    out.push({ year: y === last ? `${y} YTD` : String(y), fund: round(f[fi1][1] / f[fi0][1] - 1), bench: round(b[bi1][1] / b[bi0][1] - 1) });
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    const code = (url.searchParams.get('code') || '').replace(/\D/g, '');
    if (!code) throw new Error('Missing scheme code');
    const rf = Math.min(15, Math.max(0, parseFloat(url.searchParams.get('rf') || '6.5'))) / 100;

    const fund = await getHistory(code);
    const benchKey = url.searchParams.get('bench') || autoBench(fund.category, fund.name);
    const bdef = DD_BENCHMARKS.find(b => b.key === benchKey) || DD_BENCHMARKS[0];
    const bench = await getBestHistory(bdef.codes, 0);
    if (!bench) throw new Error('Benchmark data unavailable');

    const [fA, bA] = align(fund.pts, bench.pts);
    if (fA.length < 120) throw new Error('Not enough overlapping history between fund and benchmark (need ~6 months).');

    const spanDays = (fA[fA.length - 1][0] - fA[0][0]) / DAY;
    const winYears = spanDays >= 3 * 365 ? 3 : Math.floor(spanDays / 365 * 10) / 10;
    const fw = tail(fA, Math.round(winYears * 365.25)), bw = tail(bA, Math.round(winYears * 365.25));

    // risk / return over the analysis window
    const fr = dailyReturns(fw).map(x => x[1]), br = dailyReturns(bw).map(x => x[1]);
    const n = Math.min(fr.length, br.length);
    const fCagrW = windowCagr(fw), bCagrW = windowCagr(bw);
    const volF = stdev(fr) * Math.sqrt(252), volB = stdev(br) * Math.sqrt(252);
    const rfD = Math.pow(1 + rf, 1 / 252) - 1;
    const downDev = a => Math.sqrt(mean(a.map(x => Math.min(0, x - rfD) ** 2))) * Math.sqrt(252);
    const mf = mean(fr.slice(0, n)), mb = mean(br.slice(0, n));
    let cov = 0, varB = 0;
    for (let i = 0; i < n; i++) { cov += (fr[i] - mf) * (br[i] - mb); varB += (br[i] - mb) ** 2; }
    const beta = varB ? cov / varB : null;
    const diffs = fr.slice(0, n).map((x, i) => x - br[i]);
    const te = stdev(diffs) * Math.sqrt(252);
    const sharpeF = fCagrW !== null ? (fCagrW - rf) / volF : null;
    const sharpeB = bCagrW !== null ? (bCagrW - rf) / volB : null;
    const sortinoF = fCagrW !== null ? (fCagrW - rf) / downDev(fr) : null;
    const alpha = fCagrW !== null && beta !== null ? fCagrW - (rf + beta * (bCagrW - rf)) : null;
    const ir = fCagrW !== null && te ? (fCagrW - bCagrW) / te : null;
    const ddF = maxDrawdown(fw), ddB = maxDrawdown(bw), ddFull = maxDrawdown(fund.pts);

    const fm = monthlyRets(fw), bm = monthlyRets(bw);
    const mlen = Math.min(fm.length, bm.length);
    const upCap = capture(fm.slice(0, mlen), bm.slice(0, mlen), true);
    const downCap = capture(fm.slice(0, mlen), bm.slice(0, mlen), false);
    let beatMonths = 0; for (let i = 0; i < mlen; i++) if (fm[i][1] > bm[i][1]) beatMonths++;
    const battingAvg = mlen ? beatMonths / mlen : null;

    // rolling returns (3Y if enough history, else 1Y), weekly sampled across full overlap
    const rollYears = spanDays >= 4 * 365 ? 3 : 1;
    const rollDays = Math.round(rollYears * 365.25);
    const rolling = [];
    for (let i = 0; i < fA.length; i += 5) {
      const t = fA[i][0];
      if (t - rollDays * DAY < fA[0][0]) continue;
      const j = idxAtOrBefore(fA, t - rollDays * DAY);
      const fc = Math.pow(fA[i][1] / fA[j][1], 1 / rollYears) - 1;
      const bc = Math.pow(bA[i][1] / bA[j][1], 1 / rollYears) - 1;
      rolling.push([t, round(fc), round(bc)]);
    }
    const rollStats = rolling.length ? {
      windows: rolling.length,
      beatRate: round(rolling.filter(r => r[1] > r[2]).length / rolling.length, 3),
      avgExcess: round(mean(rolling.map(r => r[1] - r[2]))),
      fundMin: round(Math.min(...rolling.map(r => r[1]))), fundMax: round(Math.max(...rolling.map(r => r[1]))),
      fundMedian: round([...rolling.map(r => r[1])].sort((a, b) => a - b)[Math.floor(rolling.length / 2)])
    } : null;

    // ---------- automated due-diligence flags ----------
    const isPassive = /index|etf/i.test(fund.category + ' ' + fund.name);
    const flags = [];
    const add = (level, area, text) => flags.push({ level, area, text });
    if (spanDays < 3 * 365) add('amber', 'Track record', `Only ${(spanDays / 365).toFixed(1)} years of history. Under 3 years is too short to judge skill.`);
    else add('green', 'Track record', `${(spanDays / 365).toFixed(1)} years of overlapping history with the benchmark.`);
    if (isPassive) {
      if (te > 0.02) add('amber', 'Tracking', `Tracking error of ${(te * 100).toFixed(2)}% is high for a passive fund. Check its index and costs.`);
      else add('green', 'Tracking', `Tracking error of ${(te * 100).toFixed(2)}%, consistent with a passive mandate.`);
    } else {
      if (rollStats) {
        const b = rollStats.beatRate;
        add(b >= 0.6 ? 'green' : b >= 0.4 ? 'amber' : 'red', 'Consistency', `Beat the benchmark in ${(b * 100).toFixed(0)}% of rolling ${rollYears}-year windows.`);
      }
      if (ir !== null) add(ir >= 0.5 ? 'green' : ir >= 0 ? 'amber' : 'red', 'Skill (information ratio)', `Information ratio ${ir.toFixed(2)} over ${winYears} years (above 0.5 is good, below 0 means no added value).`);
      if (downCap !== null) add(downCap <= 1 ? 'green' : downCap <= 1.1 ? 'amber' : 'red', 'Downside protection', `Down-market capture ${(downCap * 100).toFixed(0)}% (below 100% means it fell less than the benchmark).`);
      if (te < 0.025 && ir !== null && ir < 0.3) add('amber', 'Closet indexing', `Low tracking error (${(te * 100).toFixed(1)}%) with little excess return: possibly paying active fees for index-like returns.`);
      if (ddF && ddB && ddF.mdd < ddB.mdd - 0.05) add('amber', 'Drawdown', `Max drawdown ${(ddF.mdd * 100).toFixed(1)}% vs benchmark ${(ddB.mdd * 100).toFixed(1)}%: noticeably deeper falls.`);
      if (sharpeF !== null && sharpeB !== null) add(sharpeF >= sharpeB ? 'green' : 'amber', 'Risk-adjusted return', `Sharpe ${sharpeF.toFixed(2)} vs benchmark ${sharpeB.toFixed(2)}.`);
    }
    const reds = flags.filter(f => f.level === 'red').length, ambers = flags.filter(f => f.level === 'amber').length;
    const verdict = reds >= 2 ? 'Review for replacement' : (reds === 1 || ambers >= 2) ? 'Watchlist' : 'Retain';

    cacheHeaders(res, 21600);
    res.status(200).send(JSON.stringify({
      generatedAt: Date.now(),
      fund: { code: fund.code, name: fund.name, category: fund.category, house: fund.house, from: fund.pts[0][0], asOf: fund.pts[fund.pts.length - 1][0], nav: fund.pts[fund.pts.length - 1][1], isPassive },
      benchmark: { key: bdef.key, label: bdef.label, proxy: bench.name, proxyCode: bench.code },
      benchmarks: DD_BENCHMARKS.map(b => ({ key: b.key, label: b.label })),
      rf, windowYears: winYears, overlapFrom: fA[0][0],
      trailing: [
        { label: '1Y', fund: round(retDays(fA, 365)), bench: round(retDays(bA, 365)) },
        { label: '3Y CAGR', fund: round(cagr(fA, 3)), bench: round(cagr(bA, 3)) },
        { label: '5Y CAGR', fund: round(cagr(fA, 5)), bench: round(cagr(bA, 5)) },
        { label: '10Y CAGR', fund: round(cagr(fA, 10)), bench: round(cagr(bA, 10)) }
      ],
      risk: {
        cagrFund: round(fCagrW), cagrBench: round(bCagrW), volFund: round(volF), volBench: round(volB),
        sharpeFund: round(sharpeF, 2), sharpeBench: round(sharpeB, 2), sortinoFund: round(sortinoF, 2),
        beta: round(beta, 2), alpha: round(alpha), trackingError: round(te), infoRatio: round(ir, 2),
        upCapture: round(upCap, 3), downCapture: round(downCap, 3), battingAvg: round(battingAvg, 3), months: mlen,
        mddFund: ddF ? round(ddF.mdd) : null, mddFundFrom: ddF?.from, mddFundTo: ddF?.to,
        mddBench: ddB ? round(ddB.mdd) : null, mddSinceInception: ddFull ? round(ddFull.mdd) : null
      },
      rollYears, rollStats, rolling,
      calendar: calendarYears(fA, bA),
      growth: { fund: rebased(fw, Math.round(winYears * 365.25), 5), bench: rebased(bw, Math.round(winYears * 365.25), 5) },
      flags, verdict
    }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
