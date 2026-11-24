// Advisor Desk calculation engine. Pure functions: no DOM, so it can be tested in Node.
// Works on the market.json produced by scripts/fetch-market.mjs.
(function (root) {
  'use strict';

  // ---------------- house models (weights in % by asset class) ----------------
  const MODELS = [
    { id: 1, name: 'Conservative', blurb: 'Capital preservation and income; equity limited to about a fifth of the portfolio.',
      w: { us_large: 12, us_small: 2, intl_dev: 5, em: 1, us_agg: 30, short_tsy: 20, ig_corp: 8, high_yield: 2, tips: 7, reit: 2, gold: 3, cash: 8 } },
    { id: 2, name: 'Moderately conservative', blurb: 'Income first with some growth; bonds remain the anchor.',
      w: { us_large: 22, us_small: 4, intl_dev: 9, em: 2, us_agg: 28, short_tsy: 10, ig_corp: 7, high_yield: 3, tips: 5, reit: 3, gold: 3, cash: 4 } },
    { id: 3, name: 'Moderate', blurb: 'Balanced growth and stability, roughly 60/40.',
      w: { us_large: 32, us_small: 6, intl_dev: 13, em: 4, us_agg: 22, short_tsy: 4, ig_corp: 5, high_yield: 3, tips: 3, reit: 4, gold: 2, cash: 2 } },
    { id: 4, name: 'Moderately aggressive', blurb: 'Growth-oriented, about three-quarters in equities.',
      w: { us_large: 40, us_small: 8, intl_dev: 16, em: 6, us_agg: 14, ig_corp: 3, high_yield: 3, tips: 2, reit: 4, gold: 2, cash: 2 } },
    { id: 5, name: 'Aggressive', blurb: 'Long-horizon growth; accepts deep drawdowns.',
      w: { us_large: 47, us_small: 10, intl_dev: 19, em: 8, us_agg: 6, high_yield: 2, reit: 4, gold: 2, cash: 2 } }
  ];
  const PROXY = { us_large: 'SPY', us_small: 'IWM', intl_dev: 'EFA', em: 'EEM', us_agg: 'AGG', short_tsy: 'SHY', long_tsy: 'TLT', ig_corp: 'LQD', high_yield: 'HYG', muni: 'MUB', tips: 'TIP', reit: 'VNQ', gold: 'GLD', commod: 'DBC', cash: 'BIL' };
  const CLASS_ORDER = ['us_large', 'us_small', 'intl_dev', 'em', 'us_agg', 'short_tsy', 'long_tsy', 'ig_corp', 'high_yield', 'muni', 'tips', 'reit', 'gold', 'commod', 'cash'];
  // Funds that track the same index (overlap check)
  const SAME_INDEX = { SPY: 'S&P 500', VOO: 'S&P 500', IVV: 'S&P 500', VFIAX: 'S&P 500', FXAIX: 'S&P 500', VTI: 'US total market', VTSAX: 'US total market', AGG: 'US aggregate bonds', BND: 'US aggregate bonds', VBTLX: 'US aggregate bonds', BIL: 'T-bills', SGOV: 'T-bills', EFA: 'Developed ex-US', VEA: 'Developed ex-US', EEM: 'Emerging markets', VWO: 'Emerging markets' };
  // Tax character of each class for asset location
  const TAX_INEFFICIENT = ['high_yield', 'ig_corp', 'reit', 'tips', 'us_agg', 'commod'];
  const ACCOUNTS = { taxable: { label: 'Taxable brokerage', deferred: false }, ira: { label: 'Traditional IRA', deferred: true }, k401: { label: '401(k)', deferred: true }, roth: { label: 'Roth IRA', deferred: true } };

  // Muni substitution for high-bracket taxable investors: half of core bonds into munis
  function modelWeights(id, opts = {}) {
    const m = MODELS.find(x => x.id === id) || MODELS[2];
    const w = Object.assign({}, m.w);
    if (opts.munis && w.us_agg) { const shift = Math.round(w.us_agg / 2); w.us_agg -= shift; w.muni = (w.muni || 0) + shift; }
    return w;
  }

  // ---------------- risk profile ----------------
  const QUESTIONS = [
    { id: 'horizon', kind: 'capacity', q: 'When will the client need to draw on a significant part of this money?', a: ['Within 3 years', '3 to 5 years', '6 to 10 years', '11 to 20 years', 'More than 20 years'] },
    { id: 'objective', kind: 'willingness', q: 'What is the main goal for the portfolio?', a: ['Preserve capital', 'Income with some stability', 'Balance of income and growth', 'Long-term growth', 'Maximum growth'] },
    { id: 'drop', kind: 'willingness', q: 'If the portfolio fell 20% in a year, what would the client most likely do?', a: ['Sell everything', 'Sell some to limit losses', 'Hold and wait', 'Hold and rebalance', 'Invest more'] },
    { id: 'tradeoff', kind: 'willingness', q: 'Which range of one-year outcomes is most acceptable on $100,000?', a: ['$97k to $106k', '$92k to $112k', '$86k to $119k', '$80k to $127k', '$72k to $136k'] },
    { id: 'experience', kind: 'willingness', q: 'How experienced is the client with investing?', a: ['None', 'Limited: savings and CDs', 'Moderate: funds and ETFs', 'Good: stocks and bonds', 'Extensive: active investor'] },
    { id: 'income', kind: 'capacity', q: 'How stable is the client\'s income over the next five years?', a: ['Very uncertain', 'Somewhat uncertain', 'Stable', 'Stable and growing', 'Very secure, multiple sources'] },
    { id: 'reserve', kind: 'capacity', q: 'Outside this portfolio, how many months of expenses are held in cash?', a: ['None', 'Less than 3 months', '3 to 6 months', '6 to 12 months', 'More than 12 months'] }
  ];
  function riskProfile(ans) {
    const sc = k => QUESTIONS.filter(q => q.kind === k).map(q => ans[q.id]).filter(v => v !== undefined && v !== null);
    const will = sc('willingness'), cap = sc('capacity');
    if (will.length < 4 || cap.length < 3) return null;
    const toModel = arr => 1 + Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);  // 0..4 → 1..5
    const willingness = Math.min(5, Math.max(1, toModel(will)));
    let capacity = Math.min(5, Math.max(1, toModel(cap)));
    if (ans.horizon === 0) capacity = Math.min(capacity, 1);
    else if (ans.horizon === 1) capacity = Math.min(capacity, 2);
    const model = Math.min(willingness, capacity);
    const score = Math.round((will.concat(cap).reduce((a, b) => a + b, 0) / (4 * (will.length + cap.length))) * 100);
    return { willingness, capacity, model, score, bound: willingness === capacity ? 'both' : willingness < capacity ? 'willingness' : 'capacity' };
  }

  // ---------------- returns ----------------
  // monthly total-return series → { 'YYYY-MM': return }
  function monthlyReturns(sec) {
    const m = sec.monthly, out = {};
    for (let i = 1; i < m.length; i++) out[m[i][0]] = m[i][1] / m[i - 1][1] - 1;
    return out;
  }
  function classReturns(data) {
    const out = {};
    for (const c of CLASS_ORDER) { const s = data.securities[PROXY[c]]; if (s) out[c] = monthlyReturns(s); }
    return out;
  }
  const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } } return out; };
  const lastMonth = data => { let lm = null; for (const s of Object.values(data.securities)) { const l = s.monthly[s.monthly.length - 1][0]; if (!lm || l > lm) lm = l; } return lm; };

  // Back-test a weight vector {class: %} with monthly rebalancing. Returns aligned month list and returns.
  function backtest(weights, CR, fromMonth, toMonth) {
    const cls = Object.keys(weights).filter(c => weights[c] > 0);
    const months = monthsBetween(fromMonth, toMonth);
    const rets = [], used = [];
    for (const m of months) {
      let r = 0, ok = true;
      for (const c of cls) { const x = CR[c]?.[m]; if (x === undefined) { ok = false; break; } r += weights[c] / 100 * x; }
      if (ok) { rets.push(r); used.push(m); }
    }
    return { months: used, rets };
  }
  // Start month where all classes with weight have history
  function commonStart(weights, CR) {
    let s = '1900-01';
    for (const c of Object.keys(weights)) { if (!(weights[c] > 0)) continue; const ks = Object.keys(CR[c] || {}).sort(); if (!ks.length) return null; if (ks[0] > s) s = ks[0]; }
    return s;
  }
  function stats(rets, rf) {
    const n = rets.length; if (n < 12) return null;
    let g = 1, peak = 1, mdd = 0; const path = [];
    for (const r of rets) { g *= 1 + r; path.push(g); peak = Math.max(peak, g); mdd = Math.min(mdd, g / peak - 1); }
    const mean = rets.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
    const cagr = Math.pow(g, 12 / n) - 1, vol = sd * Math.sqrt(12);
    let worst12 = Infinity; for (let i = 12; i <= n; i++) { let x = 1; for (let j = i - 12; j < i; j++) x *= 1 + rets[j]; worst12 = Math.min(worst12, x - 1); }
    let rfa = 0; if (rf && rf.length === n) { let gr = 1; for (const x of rf) gr *= 1 + x; rfa = Math.pow(gr, 12 / n) - 1; }
    return { cagr, vol, mdd, worst12, sharpe: vol ? (cagr - rfa) / vol : null, months: n, growth: path };
  }
  const SCENARIOS = [
    { id: 'gfc', name: 'Global financial crisis', from: '2007-10', to: '2009-02' },
    { id: 'q418', name: 'Q4 2018 sell-off', from: '2018-09', to: '2018-12' },
    { id: 'covid', name: 'COVID crash', from: '2020-01', to: '2020-03' },
    { id: 'r2022', name: '2022 inflation & rate shock', from: '2021-12', to: '2022-09' }
  ];
  // Scenario return: compound from the month AFTER `from` (month-end level) through `to`
  function scenarioReturn(weights, CR, sc) {
    const months = monthsBetween(sc.from, sc.to).slice(1);
    let g = 1;
    for (const m of months) { let r = 0; for (const c of Object.keys(weights)) { if (!(weights[c] > 0)) continue; const x = CR[c]?.[m]; if (x === undefined) return null; r += weights[c] / 100 * x; } g *= 1 + r; }
    return g - 1;
  }

  function modelStats(data, opts = {}) {
    const CR = classReturns(data);
    const end = lastMonth(data);
    const out = MODELS.map(m => {
      const w = modelWeights(m.id, opts);
      const start = commonStart(w, CR);
      const bt = backtest(w, CR, start, end);
      const rf = bt.months.map(mm => CR.cash?.[mm] ?? 0);
      return { ...m, weights: w, start: bt.months[0], end: bt.months[bt.months.length - 1], bt, stats: stats(bt.rets, rf), scenarios: SCENARIOS.map(sc => ({ ...sc, ret: scenarioReturn(w, CR, sc) })) };
    });
    return out;
  }

  // ---------------- portfolio review ----------------
  // holdings: [{ id, ticker, account, value, basis }]; ticker 'CASH' = bank cash
  function securityClass(data, t) { if (t === 'CASH') return 'cash'; return data.securities[t]?.cls || null; }

  function analysePortfolio(data, client, holdings) {
    const H = holdings.filter(h => h.value > 0 && securityClass(data, h.ticker));
    const total = H.reduce((a, h) => a + h.value, 0);
    if (!total) return null;
    const munis = !!client.munis;
    const target = modelWeights(client.model, { munis });
    const CR = classReturns(data);
    // allocation by class
    const cur = {}; for (const h of H) { const c = securityClass(data, h.ticker); cur[c] = (cur[c] || 0) + h.value; }
    const classes = CLASS_ORDER.filter(c => cur[c] || target[c]);
    const alloc = classes.map(c => ({ cls: c, value: cur[c] || 0, w: (cur[c] || 0) / total * 100, t: target[c] || 0, diff: (cur[c] || 0) / total * 100 - (target[c] || 0) }));
    const drift = alloc.reduce((a, x) => a + Math.abs(x.diff), 0) / 2;
    const grp = g => alloc.filter(a => data.classes[a.cls]?.group === g).reduce((s, a) => s + a.w, 0);
    const grpT = g => alloc.filter(a => data.classes[a.cls]?.group === g).reduce((s, a) => s + a.t, 0);
    const groups = ['Equity', 'Fixed income', 'Real assets', 'Cash'].map(g => ({ g, w: grp(g), t: grpT(g) }));

    // holdings detail + manager check for active funds / stocks
    const end = lastMonth(data);
    const detail = H.map(h => {
      const s = data.securities[h.ticker]; const c = securityClass(data, h.ticker);
      const d = { ...h, cls: c, name: h.ticker === 'CASH' ? 'Cash (bank deposit)' : s.name, type: h.ticker === 'CASH' ? 'Cash' : s.type, w: h.value / total * 100 };
      if (s && s.type === 'Mutual fund' && !SAME_INDEX[h.ticker]) {   // actively managed funds only
        const fr = monthlyReturns(s), pr = CR[c];
        const ms = monthsBetween(shiftMonth(end, -59), end).filter(m => fr[m] !== undefined && pr?.[m] !== undefined);
        if (ms.length >= 36) {
          const ex = ms.map(m => fr[m] - pr[m]);
          const cg = arr => Math.pow(arr.reduce((g, m) => g * (1 + m), 1), 12 / arr.length) - 1;
          const te = sd(ex) * Math.sqrt(12);
          d.vsProxy = { months: ms.length, fund: cg(ms.map(m => fr[m])), proxy: cg(ms.map(m => pr[m])), te, ir: te ? (cg(ms.map(m => fr[m])) - cg(ms.map(m => pr[m]))) / te : null, proxyT: PROXY[c] };
        }
      }
      return d;
    }).sort((a, b) => b.value - a.value);

    // flags
    const flags = [];
    const add = (level, area, text, fix) => flags.push({ level, area, text, fix });
    for (const d of detail) {
      if (d.type === 'Stock' && d.w >= 10) add(d.w >= 20 ? 'red' : 'amber', 'Concentration', `${d.ticker} is ${d.w.toFixed(1)}% of the household portfolio.`, d.w >= 20 ? 'Discuss a staged diversification plan (e.g., sell over 2 tax years, exchange fund, collar or charitable gifting of low-basis shares).' : 'Set a target weight and trim gradually; avoid adding new money.');
    }
    const stockW = detail.filter(d => d.type === 'Stock').reduce((a, d) => a + d.w, 0);
    if (stockW > 25) add('amber', 'Concentration', `Individual stocks make up ${stockW.toFixed(0)}% of the portfolio.`, 'Single-stock risk is uncompensated; consider moving part into diversified funds.');
    const byIndex = {}; for (const d of detail) { const k = SAME_INDEX[d.ticker]; if (k) (byIndex[k] = byIndex[k] || []).push(d.ticker); }
    for (const [k, ts] of Object.entries(byIndex)) if (new Set(ts).size > 1) add('amber', 'Overlap', `${[...new Set(ts)].join(', ')} all track the ${k} index.`, 'Consolidate into one low-cost vehicle per account to simplify and reduce cost.');
    const off = alloc.filter(a => Math.abs(a.diff) >= 3).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    if (drift >= 5 && off.length) {
      const fmt = a => `${data.classes[a.cls].label} ${a.diff > 0 ? '+' : ''}${a.diff.toFixed(0)} pts`;
      const over = off.filter(a => a.diff > 0), under = off.filter(a => a.diff < 0);
      add(drift >= 15 ? 'red' : 'amber', 'Drift', `${drift.toFixed(0)}% of assets are out of line with the model.${over.length ? ' Overweight: ' + over.slice(0, 3).map(fmt).join(', ') + '.' : ''}${under.length ? ' Underweight: ' + under.slice(0, 3).map(fmt).join(', ') + '.' : ''}`, 'Rebalance towards the target allocation (see Rebalance).');
    }
    const cashW = alloc.find(a => a.cls === 'cash')?.w || 0, cashT = target.cash || 0;
    if (cashW - cashT >= 5) add('amber', 'Cash drag', `Cash is ${cashW.toFixed(1)}% vs ${cashT}% target.`, 'Keep the emergency reserve outside the investment plan; invest the excess per the model.');
    const intlW = (cur.intl_dev || 0) / total * 100 + (cur.em || 0) / total * 100, intlT = (target.intl_dev || 0) + (target.em || 0);
    if (intlT && intlW < intlT / 2) add('amber', 'Diversification', `International equity is ${intlW.toFixed(1)}% vs ${intlT}% target (home bias).`, 'Add developed and emerging-market exposure.');
    for (const d of detail) {
      if (d.vsProxy && d.vsProxy.fund < d.vsProxy.proxy - 0.01) add('amber', 'Manager review', `${d.ticker} trailed its asset-class benchmark (${d.vsProxy.proxyT}) by ${((d.vsProxy.proxy - d.vsProxy.fund) * 100).toFixed(1)} pts a year over ${Math.round(d.vsProxy.months / 12)} years.`, 'Review the manager or replace with the model\'s preferred vehicle.');
      if (d.cls === 'muni' && ACCOUNTS[d.account]?.deferred) add('amber', 'Asset location', `${d.ticker} (tax-exempt munis) is held in a ${ACCOUNTS[d.account].label}.`, 'Munis belong in taxable accounts; use taxable bonds in tax-deferred accounts.');
      if (d.account === 'taxable' && ['high_yield', 'ig_corp', 'reit'].includes(d.cls) && d.w >= 3) add('amber', 'Asset location', `${d.ticker} (${data.classes[d.cls].label.toLowerCase()}) produces income taxed at ordinary rates but sits in the taxable account.`, 'Where possible hold it in the IRA/401(k) and keep equities in taxable.');
      if (d.cls === 'long_tsy' && d.w >= 8 && client.model <= 3) add('amber', 'Interest-rate risk', `${d.ticker} (long-duration Treasuries) is ${d.w.toFixed(1)}% for a ${MODELS[client.model - 1].name.toLowerCase()} client.`, 'Long bonds swing like equities when rates move; shorten duration towards core bonds.');
    }
    if (client.taxHigh && !(cur.muni) && detail.some(d => d.account === 'taxable' && ['us_agg', 'ig_corp'].includes(d.cls))) add('green', 'Tax efficiency', 'Taxable bonds are held in the taxable account by a high-bracket investor.', 'Consider municipal bonds for the taxable bond sleeve.');

    // risk: current vs target, monthly back-test of the actual mix (holdings with short history use their class proxy)
    const wCur = {}; for (const a of alloc) if (a.w > 0) wCur[a.cls] = a.w;
    const hr = holdingWeightsReturns(data, detail, CR);
    const start = commonStart(target, CR);
    const months = monthsBetween(start, end).filter(m => hr(m) !== null);
    const curRets = months.map(m => hr(m));
    const tgt = backtest(target, CR, months[0], months[months.length - 1]);
    const rf = months.map(m => CR.cash?.[m] ?? 0);
    const curStats = stats(curRets, rf), tgtStats = stats(tgt.rets, tgt.months.map(m => CR.cash?.[m] ?? 0));
    const spy = CR.us_large; const beta = (() => { const x = months.map(m => spy[m]), y = curRets; const mx = avg(x), my = avg(y); let cv = 0, vx = 0; for (let i = 0; i < x.length; i++) { cv += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; } return vx ? cv / vx : null; })();
    const scen = SCENARIOS.map(sc => {
      const ms = monthsBetween(sc.from, sc.to).slice(1);
      let g = 1, ok = true; for (const m of ms) { const r = hr(m); if (r === null) { ok = false; break; } g *= 1 + r; }
      return { ...sc, current: ok ? g - 1 : null, target: scenarioReturn(target, CR, sc), dollars: ok ? (g - 1) * total : null };
    });
    if (curStats && tgtStats && curStats.vol > tgtStats.vol * 1.25) add('red', 'Suitability', `Portfolio volatility ${(curStats.vol * 100).toFixed(1)}% is well above the ${MODELS[client.model - 1].name.toLowerCase()} model (${(tgtStats.vol * 100).toFixed(1)}%).`, 'Risk exceeds the client\'s profile; rebalance and document the discussion.');
    else if (curStats && tgtStats && curStats.vol < tgtStats.vol * 0.7) add('amber', 'Suitability', `Portfolio volatility ${(curStats.vol * 100).toFixed(1)}% is well below the model (${(tgtStats.vol * 100).toFixed(1)}%): the client may be taking too little risk to meet goals.`, 'Confirm the goal plan still works; invest towards the model.');
    const order = { red: 0, amber: 1, green: 2 };
    flags.sort((a, b) => order[a.level] - order[b.level]);

    return { total, target, alloc, groups, drift, detail, flags, risk: { current: curStats, target: tgtStats, beta, from: months[0], to: months[months.length - 1] }, scenarios: scen, curWeights: wCur };
  }
  function holdingWeightsReturns(data, detail, CR) {
    const total = detail.reduce((a, d) => a + d.value, 0);
    const series = detail.map(d => ({ w: d.value / total, own: d.ticker === 'CASH' ? null : monthlyReturns(data.securities[d.ticker]), proxy: CR[d.cls], cash: d.ticker === 'CASH' }));
    return m => { let r = 0; for (const s of series) { const x = s.cash ? (s.proxy?.[m] ?? null) : (s.own[m] ?? s.proxy?.[m]); if (x === undefined || x === null) return null; r += s.w * x; } return r; };
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = a => { const m = avg(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
  function shiftMonth(m, k) { let [y, mm] = m.split('-').map(Number); mm += k; while (mm < 1) { mm += 12; y--; } while (mm > 12) { mm -= 12; y++; } return `${y}-${String(mm).padStart(2, '0')}`; }

  // ---------------- tax-aware rebalance ----------------
  // Rebalances the household towards target, trading inside each account (money can't move between accounts).
  // Tax-deferred accounts are used first; in taxable, losses are harvested first and low-gain lots sold before high-gain.
  function rebalance(data, client, holdings, opts = {}) {
    const H = holdings.filter(h => h.value > 0 && securityClass(data, h.ticker)).map(h => ({ ...h, cls: securityClass(data, h.ticker) }));
    const total = H.reduce((a, h) => a + h.value, 0); if (!total) return null;
    const target = modelWeights(client.model, { munis: !!client.munis });
    const band = opts.band ?? 0;   // pts; 0 = rebalance fully
    const need = {}; for (const c of new Set([...Object.keys(target), ...H.map(h => h.cls)])) { const cur = H.filter(h => h.cls === c).reduce((a, h) => a + h.value, 0); need[c] = (target[c] || 0) / 100 * total - cur; }
    for (const c of Object.keys(need)) if (Math.abs(need[c]) / total * 100 < band) need[c] = 0;
    const trades = [];
    const ltcg = client.ltcg ?? 0.15;
    const accOrder = ['ira', 'k401', 'roth', 'taxable'];
    const preferred = (acct, c) => { if (c === 'muni' && acct !== 'taxable') return null; const own = H.find(h => h.account === acct && h.cls === c && h.ticker !== 'CASH'); return own ? own.ticker : (c === 'cash' ? 'SGOV' : PROXY[c]); };
    for (const acct of accOrder) {
      const inAcct = H.filter(h => h.account === acct);
      if (!inAcct.length) continue;
      // sell candidates: holdings in over-weight classes
      const sells = inAcct.filter(h => need[h.cls] < -1).map(h => ({ h, gainPct: h.basis > 0 ? (h.value - h.basis) / h.value : (acct === 'taxable' ? null : 0) }));
      if (acct === 'taxable') sells.sort((a, b) => (a.gainPct ?? 0.5) - (b.gainPct ?? 0.5)); // losses first, then lowest gain
      if (opts.trimConcentration) { const conc = x => (x.h.ticker !== 'CASH' && data.securities[x.h.ticker]?.type === 'Stock' && x.h.value / total >= 0.1) ? 0 : 1; sells.sort((a, b) => conc(a) - conc(b)); }
      let raised = 0;
      for (const s of sells) {
        const amt = Math.min(s.h.value, -need[s.h.cls]); if (amt < 1) continue;
        const buyRoom = Object.entries(need).filter(([c, v]) => v > 1 && !(c === 'muni' && acct !== 'taxable')).reduce((a, [, v]) => a + v, 0);
        const x = Math.min(amt, buyRoom); if (x < 1) continue;
        const gain = acct === 'taxable' && s.h.basis > 0 ? x * (s.h.value - s.h.basis) / s.h.value : 0;
        trades.push({ account: acct, side: 'Sell', ticker: s.h.ticker, cls: s.h.cls, amount: x, gain, tax: gain > 0 ? gain * ltcg : 0, harvest: gain < 0 });
        need[s.h.cls] += x; raised += x; s.h.value -= x; if (s.h.basis) s.h.basis = s.h.basis * (s.h.value / (s.h.value + x));
      }
      // spend raised cash on under-weight classes, largest gap first
      // asset location: traditional IRA/401(k) take tax-inefficient classes first; Roth and taxable take equities first
      const locRank = c => { const ineff = TAX_INEFFICIENT.includes(c) || ['short_tsy', 'long_tsy'].includes(c); return (ACCOUNTS[acct].deferred && acct !== 'roth') ? (ineff ? 0 : 1) : (ineff ? 1 : 0); };   // Roth: highest-growth assets
      for (const [c, v] of Object.entries(need).filter(([c, v]) => v > 1 && !(c === 'muni' && acct !== 'taxable')).sort((a, b) => locRank(a[0]) - locRank(b[0]) || b[1] - a[1])) {
        if (raised < 1) break;
        const x = Math.min(v, raised); const t = preferred(acct, c); if (!t) continue;
        trades.push({ account: acct, side: 'Buy', ticker: t, cls: c, amount: x, gain: 0, tax: 0 });
        need[c] -= x; raised -= x;
      }
      if (raised >= 1) { trades.push({ account: acct, side: 'Buy', ticker: 'SGOV', cls: 'cash', amount: raised, gain: 0, tax: 0, note: 'Unallocated proceeds parked in T-bills' }); need.cash = (need.cash || 0) - raised; }
    }
    // resulting weights
    const after = {}; for (const h of H) after[h.cls] = (after[h.cls] || 0) + 0; // init
    const cur = {}; for (const h of holdings.filter(h => h.value > 0 && securityClass(data, h.ticker))) { const c = securityClass(data, h.ticker); cur[c] = (cur[c] || 0) + h.value; }
    for (const t of trades) cur[t.cls] = (cur[t.cls] || 0) + (t.side === 'Buy' ? t.amount : -t.amount);
    const resWeights = {}; for (const [c, v] of Object.entries(cur)) if (v > 0.5) resWeights[c] = v / total * 100;
    const residual = Object.entries(resWeights).reduce((a, [c, w]) => a + Math.abs(w - (target[c] || 0)), 0) / 2 + Object.entries(target).filter(([c]) => !(c in resWeights)).reduce((a, [, w]) => a + w, 0) / 2;
    const sum = k => trades.reduce((a, t) => a + (t[k] || 0), 0);
    return { trades, after: resWeights, residualDrift: residual, turnover: trades.filter(t => t.side === 'Sell').reduce((a, t) => a + t.amount, 0), realizedGain: trades.filter(t => t.gain > 0).reduce((a, t) => a + t.gain, 0), harvested: -trades.filter(t => t.gain < 0).reduce((a, t) => a + t.gain, 0), tax: sum('tax') };
  }

  // ---------------- Monte Carlo retirement plan ----------------
  // Block bootstrap of 12-month blocks from the model's own historical monthly returns (keeps fat tails and
  // autocorrelation; no normality assumption). Real (inflation-adjusted) terms: returns are deflated by `infl`.
  function monteCarlo(data, weights, plan, sims = 2000, seed = 7) {
    const CR = classReturns(data);
    const start = commonStart(weights, CR), end = lastMonth(data);
    const bt = backtest(weights, CR, start, end);
    const R = bt.rets; const n = R.length; if (n < 60) return null;
    let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const years = Math.max(1, plan.endAge - plan.age);
    const inflM = Math.pow(1 + plan.infl, 1 / 12) - 1;
    const feeM = (plan.fee || 0) / 12;
    const pct = [0.1, 0.5, 0.9];
    const paths = new Array(years + 1).fill(0).map(() => []);
    let success = 0; const ending = [];
    for (let k = 0; k < sims; k++) {
      let w = plan.assets; let failed = false; let failAge = null;
      paths[0].push(w);
      for (let y = 1; y <= years; y++) {
        const age = plan.age + y - 1;
        const b = Math.floor(rnd() * (n - 12));
        for (let m = 0; m < 12; m++) {
          const real = (1 + R[b + m] - feeM) / (1 + inflM) - 1;
          w *= 1 + real;
          const retired = age >= plan.retireAge;
          const flow = retired ? -(plan.spend - (age >= plan.ssAge ? plan.ss : 0)) / 12 : plan.save / 12;
          w += flow;
          if (w <= 0) { w = 0; if (!failed) { failed = true; failAge = age; } }
        }
        paths[y].push(w);
      }
      if (!failed) success++;
      ending.push(w);
    }
    const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
    return { prob: success / sims, years, bands: paths.map((a, y) => ({ age: plan.age + y, p10: q(a, 0.1), p50: q(a, 0.5), p90: q(a, 0.9) })), medianEnd: q(ending, 0.5), p10End: q(ending, 0.1), histFrom: bt.months[0], histTo: bt.months[bt.months.length - 1], histCagr: stats(R)?.cagr };
  }
  // Smallest change that lifts success to `goal`: extra annual saving, or lower spending
  function solvePlan(data, weights, plan, goal = 0.85) {
    const p = monteCarlo(data, weights, plan, 1000); if (!p || p.prob >= goal) return { ok: true };
    const bis = (f, lo, hi) => { for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (f(mid)) hi = mid; else lo = mid; } return hi; };
    const yearsToRetire = plan.retireAge - plan.age;
    const save = yearsToRetire > 0 ? bis(x => monteCarlo(data, weights, { ...plan, save: plan.save + x }, 600).prob >= goal, 0, plan.spend * 3) : null;
    const cut = bis(x => monteCarlo(data, weights, { ...plan, spend: plan.spend - x }, 600).prob >= goal, 0, plan.spend);
    return { ok: false, extraSave: save, spendCut: cut };
  }

  const API = { MODELS, PROXY, CLASS_ORDER, ACCOUNTS, QUESTIONS, SCENARIOS, TAX_INEFFICIENT, modelWeights, riskProfile, monthlyReturns, classReturns, backtest, commonStart, stats, modelStats, analysePortfolio, rebalance, monteCarlo, solvePlan, monthsBetween, lastMonth, shiftMonth, scenarioReturn };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
