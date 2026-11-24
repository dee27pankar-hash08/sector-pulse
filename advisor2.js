// Advisor Desk UI, part 2: goal plan, markets & house view, data & controls, role map, client review pack.
(function () {
  'use strict';
  const A = window.AD, E = A.E, { $, esc, pct, pctu, pts, usd, usdK, num, cls, dstr, mstr, store, icon, chart, legend, mts, COL } = A;

  // ================= GOAL PLAN =================
  function planInputs() {
    const CL = A.CL, a = A.analyse();
    const p = Object.assign({ endAge: 95, save: 20000, spend: 80000, ss: 30000, ssAge: 67, infl: 0.025, fee: 0.0075 }, CL.plan || {});
    return { ...p, age: CL.age, retireAge: Math.max(CL.retireAge, CL.age), assets: p.assetsOverride || (a ? a.total : p.assets || 500000) };
  }
  A.planCompute = () => {
    if (A.plan) return A.plan;
    if (!A.hasPrices()) return null;
    const CL = A.CL, plan = planInputs();
    const tgtW = E.modelWeights(CL.model, { munis: CL.munis });
    const a = A.analyse();
    const mcT = E.monteCarlo(A.D, tgtW, plan);
    const mcC = a ? E.monteCarlo(A.D, a.curWeights, plan) : null;
    const models = E.MODELS.map(m => ({ ...m, mc: E.monteCarlo(A.D, E.modelWeights(m.id, { munis: CL.munis }), plan, 1000) }));
    A.plan = { plan, mcT, mcC, models, solve: null };
    return A.plan;
  };
  A.planSolve = () => { const P = A.planCompute(); if (P && !P.solve) P.solve = E.solvePlan(A.D, E.modelWeights(A.CL.model, { munis: A.CL.munis }), P.plan, 0.85); return P?.solve; };
  const verdict = p => p >= 0.85 ? ['green', 'On track'] : p >= 0.7 ? ['amber', 'Workable: monitor and adjust'] : ['red', 'At risk: changes needed'];

  A.onTab.plan = function renderPlan() {
    const el = $('#t-plan'), CL = A.CL;
    if (!A.hasPrices()) { el.innerHTML = '<div class="card"><div class="skel">The goal plan needs security prices, which are still loading.</div></div>'; return; }
    const p = planInputs(), a = A.analyse();
    const f = (id, label, val, step = 1000, w = 130, hint = '') => `<label class="f" title="${esc(hint)}">${label}<input id="${id}" type="number" step="${step}" value="${val}" style="width:${w}px"></label>`;
    el.innerHTML = `
      <div class="card"><div class="sectionhead"><h2>Retirement goal plan${CL.name ? ' · ' + esc(CL.name) : ''}</h2><span class="note">All amounts in today's dollars</span></div>
        <p class="sub">Monte Carlo simulation: 2,000 market paths built by resampling 12-month blocks of the model's own historical returns, so crashes and recoveries appear as they actually happened (no bell-curve assumption). Spending rises with inflation; the advisory fee is deducted.</p>
        <div class="row">
          ${f('pAssets', 'Investable assets ($)', Math.round(p.assets), 10000, 150, a ? 'Defaults to the household total from the portfolio review' : '')}
          ${f('pAge', 'Age', p.age, 1, 80)}${f('pRet', 'Retire at', p.retireAge, 1, 90)}${f('pEnd', 'Plan to age', p.endAge, 1, 90)}
          ${f('pSave', 'Annual saving until retirement ($)', p.save, 1000, 150)}${f('pSpend', 'Annual spending in retirement ($)', p.spend, 1000, 150)}
          ${f('pSS', 'Social Security / pension ($/yr)', p.ss, 1000, 150)}${f('pSSA', 'Starting at age', p.ssAge, 1, 90)}
          ${f('pInf', 'Inflation (%)', (p.infl * 100).toFixed(1), 0.1, 90)}${f('pFee', 'Advisory fee (%)', (p.fee * 100).toFixed(2), 0.05, 90)}
          <button class="btn" id="pRun">Run plan</button>
        </div></div>
      <div id="pOut"><div class="card section"><div class="skel">Running 2,000 simulations…</div></div></div>`;
    $('#pRun').onclick = () => {
      const g = id => +$(id).value;
      CL.age = g('#pAge') || CL.age; CL.retireAge = g('#pRet') || CL.retireAge;
      CL.plan = { ...CL.plan, endAge: g('#pEnd'), save: g('#pSave'), spend: g('#pSpend'), ss: g('#pSS'), ssAge: g('#pSSA'), infl: g('#pInf') / 100, fee: g('#pFee') / 100, assetsOverride: a && Math.round(a.total) === g('#pAssets') ? null : g('#pAssets') };
      A.derive(); A.plan = null; A.bump(); A.logEvent('Goal plan run', `Spend ${usd(CL.plan.spend)}/yr from age ${CL.retireAge}`); A.onTab.plan();
    };
    setTimeout(paintPlan, 30);
  };
  function paintPlan() {
    const P = A.planCompute(), out = $('#pOut'), CL = A.CL; if (!P || !out) return;
    const { mcT, mcC, models, plan } = P, mdl = E.MODELS[CL.model - 1];
    if (!mcT) { out.innerHTML = '<div class="card section"><div class="skel">Not enough history to simulate.</div></div>'; return; }
    const [lv, lt] = verdict(mcT.prob);
    out.innerHTML = `
      <div class="grid g4 section">
        <div class="card kpi"><div class="l">Probability of success · ${esc(mdl.name)} model</div><div class="big">${Math.round(mcT.prob * 100)}%</div><div class="s">${icon(lv)} ${lt}</div></div>
        <div class="card kpi"><div class="l">Probability of success · current portfolio</div><div class="big">${mcC ? Math.round(mcC.prob * 100) + '%' : '–'}</div><div class="s">${mcC ? (mcC.prob < mcT.prob - 0.02 ? 'Rebalancing improves the odds' : mcC.prob > mcT.prob + 0.02 ? 'Current mix scores higher, but with more risk than the profile allows' : 'Similar to the model') : 'Enter holdings to compare'}</div></div>
        <div class="card kpi"><div class="l">Median wealth at ${plan.endAge}</div><div class="v">${usdK(mcT.medianEnd)}</div><div class="s">In today's dollars</div></div>
        <div class="card kpi"><div class="l">Poor-markets case (10th percentile)</div><div class="v">${usdK(mcT.p10End)}</div><div class="s">1 in 10 outcomes is worse than this</div></div>
      </div>
      <div class="grid g3 section">
        <div class="card" style="grid-column:span 2"><h2>Projected wealth by age</h2><p class="sub">Shaded band: 10th to 90th percentile of outcomes for the ${esc(mdl.name)} model. Retirement at ${plan.retireAge}.</p><div id="pLeg"></div><div class="chart" id="pChart"></div></div>
        <div class="card"><h2>What would get to 85%?</h2><div id="pSolve"><div class="skel">Solving…</div></div></div>
      </div>
      <div class="card section"><h2>Plan success by model</h2><p class="sub">Same goals, different risk levels. More risk does not always help: it raises the median but also the chance of running out after a bad early sequence.</p>
        <div class="tblx"><table><thead><tr><th>Model</th><th>Probability of success</th><th>Median wealth at ${plan.endAge}</th><th>10th percentile</th></tr></thead><tbody>${models.map(m => `<tr style="cursor:default" class="${m.id === CL.model ? 'model-hi' : ''}"><td>${m.id} · ${esc(m.name)}${m.id === CL.model ? ' <span class="tag">client</span>' : ''}</td><td>${m.mc ? Math.round(m.mc.prob * 100) + '%' : '–'}</td><td>${usdK(m.mc?.medianEnd)}</td><td>${usdK(m.mc?.p10End)}</td></tr>`).join('')}</tbody></table></div>
        <p class="note">Simulation draws from ${mstr(mcT.histFrom)} – ${mstr(mcT.histTo)} model returns (${pctu(mcT.histCagr)} a year nominal over that period). Results are estimates, not guarantees.</p></div>`;
    const b = mcT.bands, ser = [{ name: 'Median', color: COL[0], pts: b.map(x => [x.age, x.p50]) }, { name: '10th percentile', color: COL[1], pts: b.map(x => [x.age, x.p10]), dash: true }];
    $('#pLeg').innerHTML = legend(ser.concat([{ name: '10th–90th percentile range', color: 'rgba(42,120,214,.35)' }]));
    chart($('#pChart'), { series: ser, xType: 'num', xFmt: v => String(Math.round(v)), tipX: v => 'Age ' + Math.round(v), yFmt: v => usdK(v), band: { hi: b.map(x => [x.age, x.p90]), lo: b.map(x => [x.age, x.p10]), color: COL[0] }, zero: true, label: 'Projected wealth by age' });
    setTimeout(() => {
      const s = A.planSolve(), el = $('#pSolve'); if (!el) return;
      el.innerHTML = s.ok ? `<p>${icon('green')} The plan already meets the 85% confidence level. Options to discuss: retire earlier, spend more, or reduce risk.</p>`
        : `<p class="sub">Any one of these lifts the probability of success to 85%:</p>
          ${s.extraSave !== null ? `<div class="metric"><span>Save more each year until retirement</span><b>+${usd(Math.ceil(s.extraSave / 500) * 500)}</b></div>` : ''}
          <div class="metric"><span>Spend less each year in retirement</span><b>-${usd(Math.ceil(s.spendCut / 500) * 500)}</b></div>
          <div class="metric"><span>Or work longer</span><b>${workLonger(P.plan)}</b></div>
          <p class="note section">Combinations of smaller changes work too; re-run the plan to test them.</p>`;
    }, 40);
  }
  function workLonger(plan) {
    const w = E.modelWeights(A.CL.model, { munis: A.CL.munis });
    for (let k = 1; k <= 8; k++) { const r = E.monteCarlo(A.D, w, { ...plan, retireAge: plan.retireAge + k, ssAge: Math.max(plan.ssAge, Math.min(70, plan.retireAge + k)) }, 600); if (r && r.prob >= 0.85) return `Retire at ${plan.retireAge + k}`; }
    return 'More than 8 years';
  }

  // ================= MARKETS & HOUSE VIEW =================
  const PROX = ['SPY', 'IWM', 'EFA', 'EEM', 'AGG', 'SHY', 'TLT', 'LQD', 'HYG', 'MUB', 'TIP', 'VNQ', 'GLD', 'DBC', 'BIL'];
  function perf(sec) {
    const d = sec.daily, m = sec.monthly, last = d[d.length - 1];
    const back = k => d.length > k ? last[1] / d[d.length - 1 - k][1] - 1 : null;
    const ytdBase = d.slice().reverse().find(p => p[0] < last[0].slice(0, 4) + '-01-01');
    const ann = yrs => { const n = yrs * 12; return m.length > n ? Math.pow(m[m.length - 1][1] / m[m.length - 1 - n][1], 1 / yrs) - 1 : null; };
    const r36 = []; for (let i = Math.max(1, m.length - 36); i < m.length; i++) r36.push(m[i][1] / m[i - 1][1] - 1);
    const mu = r36.reduce((a, b) => a + b, 0) / r36.length, vol = Math.sqrt(r36.reduce((a, b) => a + (b - mu) ** 2, 0) / (r36.length - 1)) * Math.sqrt(12);
    return { m1: back(21), m3: back(63), ytd: ytdBase ? last[1] / ytdBase[1] - 1 : null, y1: back(252), y3: ann(3), y5: ann(5), y10: ann(10), vol };
  }
  A.talkingPoints = () => {
    const D = A.D, M = D?.macro || {}, tp = [];
    if (M.DGS3MO && M.DGS10) {
      const sl = (M.DGS10.last - M.DGS3MO.last) * 100;
      tp.push(`<b>Cash vs bonds.</b> 3-month T-bills yield ${M.DGS3MO.last.toFixed(2)}% and the 10-year Treasury ${M.DGS10.last.toFixed(2)}%; the curve is ${sl < 0 ? `inverted by ${Math.abs(sl).toFixed(0)} bp, so cash still pays more than longer bonds, but locking in yields protects income if the Fed cuts` : `positively sloped by ${sl.toFixed(0)} bp, so investors are paid to extend maturity beyond cash`}.`);
    }
    if (M.REAL10) tp.push(`<b>Real yields.</b> The 10-year TIPS yield is ${M.REAL10.last.toFixed(2)}% above inflation${M.BE10 ? `, with breakeven inflation at ${M.BE10.last.toFixed(2)}%` : ''}. ${M.REAL10.last > 1.5 ? 'Bonds offer a meaningful real return for the first time in over a decade, which supports the fixed-income sleeve of conservative models.' : M.REAL10.last > 0 ? 'Real returns on high-quality bonds are positive but modest.' : 'Real yields are negative: high-quality bonds lose purchasing power before tax.'}`);
    if (M.CPI && M.EFFR) tp.push(`<b>Inflation and the Fed.</b> Headline CPI is ${M.CPI.last.toFixed(1)}% year on year${M.CORECPI ? ` (core ${M.CORECPI.last.toFixed(1)}%)` : ''} against the Fed's 2% goal${M.CPI.y1 !== null ? `, ${M.CPI.last < M.CPI.y1 ? 'down' : 'up'} from ${M.CPI.y1.toFixed(1)}% a year ago` : ''}. Fed funds is ${M.EFFR.target ? M.EFFR.target[0].toFixed(2) + '–' + M.EFFR.target[1].toFixed(2) + '%' : M.EFFR.last.toFixed(2) + '%'}${M.EFFR.y1 !== null ? `, ${M.EFFR.last < M.EFFR.y1 - 0.1 ? 'lower than' : M.EFFR.last > M.EFFR.y1 + 0.1 ? 'higher than' : 'about the same as'} a year ago` : ''}.`);
    if (A.hasPrices()) {
      const rows = PROX.filter(t => D.securities[t]).map(t => ({ t, cls: D.securities[t].cls, ...perf(D.securities[t]) })).filter(r => r.y1 !== null);
      const best = rows.slice().sort((a, b) => b.y1 - a.y1), lab = r => D.classes[r.cls].label.toLowerCase().replace(/^us /, 'US ').replace('(tips)', '(TIPS)').replace('(reits)', '(REITs)');
      tp.push(`<b>Leadership.</b> Over the past year ${lab(best[0])} led (${pct(best[0].y1)}) and ${lab(best[best.length - 1])} lagged (${pct(best[best.length - 1].y1)}). ${(() => { const us = rows.find(r => r.t === 'SPY'), intl = rows.find(r => r.t === 'EFA'); return us && intl ? (intl.y1 > us.y1 ? `International developed stocks beat the S&P 500 by ${((intl.y1 - us.y1) * 100).toFixed(1)} pts, a reminder of why the models hold non-US equity.` : `The S&P 500 beat international developed stocks by ${((us.y1 - intl.y1) * 100).toFixed(1)} pts; concentration in US mega-caps is a risk to watch in client portfolios.`) : ''; })()}`);
      const gold = rows.find(r => r.t === 'GLD'), agg = rows.find(r => r.t === 'AGG');
      if (gold && agg) tp.push(`<b>Diversifiers.</b> Gold returned ${pct(gold.y1)} and core bonds ${pct(agg.y1)} over 12 months. ${gold.y1 > agg.y1 ? 'Real assets have done more of the diversifying work recently.' : 'Core bonds are again providing ballast.'}`);
    }
    if (M.VIX) { const vs = M.VIX.monthly.map(x => x[1]).sort((a, b) => a - b), med = vs[Math.floor(vs.length / 2)]; tp.push(`<b>Volatility.</b> The VIX is ${M.VIX.last.toFixed(1)} versus a median of ${med.toFixed(1)} since 2005: ${M.VIX.last > med * 1.3 ? 'markets are pricing above-normal turbulence; a good time to review clients\' risk comfort before they call.' : M.VIX.last < med * 0.85 ? 'calm markets, a sensible moment to rebalance and harvest gains rather than chase.' : 'roughly normal conditions.'}`); }
    return tp;
  };
  A.onTab.markets = function renderMarkets() {
    const el = $('#t-markets'), D = A.D;
    if (!D) { el.innerHTML = '<div class="card"><div class="skel">Market data unavailable.</div></div>'; return; }
    const M = D.macro || {};
    const tile = (id, label, opts = {}) => { const m = M[id]; if (!m) return ''; const v = opts.val ? opts.val(m) : m.last; const ch = opts.noChange ? null : m.y1 !== null && m.y1 !== undefined ? (v - (opts.val ? opts.prev(m) : m.y1)) : null; const unit = m.unit === '%' || opts.pctUnit ? '%' : ''; return `<div class="card kpi" title="Source: ${esc(m.source || '')}"><div class="l">${esc(label)}</div><div class="v">${opts.fmt ? opts.fmt(m) : v.toFixed(opts.d ?? 2) + unit}</div><div class="s">${ch !== null && isFinite(ch) ? `<span class="${opts.goodDown ? cls(-ch) : ''}">${ch > 0 ? '+' : ''}${opts.goodDown ? ch.toFixed(1) + ' pts' : unit ? (ch * 100).toFixed(0) + ' bp' : ch.toFixed(1)}</span> vs 1 year ago · ` : ''}${dstr(m.lastDate)}</div></div>`; };
    const sp = M.DGS10 && M.DGS2 ? { label: '2s10s curve spread', unit: '%', last: M.DGS10.last - M.DGS2.last, y1: (M.DGS10.y1 ?? NaN) - (M.DGS2.y1 ?? NaN), lastDate: M.DGS10.lastDate, source: 'US Department of the Treasury' } : null;
    if (sp) M.SPREAD = sp;
    el.innerHTML = `
      <div class="card"><div class="sectionhead"><h2>House view: talking points for client conversations</h2><span class="note">Generated from today's data · not investment advice</span></div><ul class="tp">${A.talkingPoints().map(t => `<li>${t}</li>`).join('')}</ul></div>
      <div class="grid g4 section">
        ${tile('EFFR', 'Fed funds (effective)', { fmt: m => m.target ? `${m.target[0].toFixed(2)}–${m.target[1].toFixed(2)}%` : m.last.toFixed(2) + '%' })}
        ${tile('DGS3MO', '3-month T-bill')}${tile('DGS2', '2-year Treasury')}${tile('DGS10', '10-year Treasury')}
        ${tile('SPREAD', '2s10s curve spread', { fmt: m => (m.last * 100).toFixed(0) + ' bp' })}${tile('REAL10', '10-year real yield (TIPS)')}
        ${M.BE10 ? `<div class="card kpi" title="${esc(M.BE10.source)}"><div class="l">10-year breakeven inflation</div><div class="v">${M.BE10.last.toFixed(2)}%</div><div class="s">${dstr(M.BE10.lastDate)}</div></div>` : ''}
        ${tile('MORT30', '30-year mortgage rate')}
        ${tile('CPI', 'CPI inflation (y/y)', { d: 1, goodDown: true })}${tile('CORECPI', 'Core CPI (y/y)', { d: 1, goodDown: true })}${tile('UNRATE', 'Unemployment rate', { d: 1, goodDown: true })}${tile('VIX', 'VIX (equity volatility)', { d: 1, fmt: m => m.last.toFixed(1) })}
      </div>
      <div class="grid g2 section">
        <div class="card"><h2>Treasury yield curve</h2><p class="sub">Today vs one year ago. Source: US Treasury.</p><div id="ycLeg"></div><div class="chart" id="ycChart"></div></div>
        <div class="card"><h2>Policy rate and Treasury yields</h2><p class="sub">Month-end, since 2005.</p><div id="rtLeg"></div><div class="chart" id="rtChart"></div></div>
      </div>
      <div class="card section" id="acCard"><h2>Asset-class performance</h2><p class="sub">Total returns of the ETFs used as asset-class proxies (dividends reinvested). 3, 5 and 10-year figures are annualized.</p><div id="acTbl"></div></div>`;
    if (M.UST) {
      const ten = M.UST.tenors, mk = (arr, name, color) => ({ name, color, markers: true, pts: arr ? arr.map((v, i) => [i, v]).filter(p => p[1] !== null) : [] });
      const ser = [mk(M.UST.curve, 'Today', COL[0]), mk(M.UST.curve1y, '1 year ago', COL[1])];
      $('#ycLeg').innerHTML = legend(ser.filter(s => s.pts.length));
      chart($('#ycChart'), { series: ser, xType: 'num', xTicks: ten.map((_, i) => i), xFmt: i => ten[Math.round(i)] || '', tipX: i => ten[Math.round(i)] + ' maturity', yFmt: v => v.toFixed(2) + '%', label: 'Treasury yield curve' });
    }
    const ms = (id, name, color) => M[id] ? { name, color, pts: M[id].monthly.map(x => [mts(x[0]), x[1]]) } : null;
    const rs = [ms('EFFR', 'Fed funds', COL[2]), ms('DGS2', '2-year', COL[1]), ms('DGS10', '10-year', COL[0])].filter(Boolean);
    $('#rtLeg').innerHTML = legend(rs);
    chart($('#rtChart'), { series: rs, yFmt: v => v.toFixed(1) + '%', zero: true, label: 'Policy rate and Treasury yields' });
    if (A.hasPrices()) {
      const rows = PROX.filter(t => D.securities[t]).map(t => ({ t, s: D.securities[t], ...perf(D.securities[t]) }));
      const c = x => `<td class="${cls(x)}">${pct(x)}</td>`;
      let html = '<div class="tblx"><table><thead><tr><th>Asset class</th><th>Proxy</th><th>1M</th><th>3M</th><th>YTD</th><th>1Y</th><th>3Y</th><th>5Y</th><th>10Y</th><th>Volatility (3Y)</th></tr></thead><tbody>';
      for (const g of ['Equity', 'Fixed income', 'Real assets', 'Cash']) {
        const rr = rows.filter(r => D.classes[r.s.cls].group === g); if (!rr.length) continue;
        html += `<tr style="cursor:default"><td colspan="10"><b>${g}</b></td></tr>` + rr.map(r => `<tr style="cursor:default"><td style="padding-left:18px">${esc(D.classes[r.s.cls].label)}</td><td class="muted">${r.t}</td>${c(r.m1)}${c(r.m3)}${c(r.ytd)}${c(r.y1)}${c(r.y3)}${c(r.y5)}${c(r.y10)}<td>${pctu(r.vol)}</td></tr>`).join('');
      }
      $('#acTbl').innerHTML = html + `</tbody></table></div><p class="note">Prices as of ${dstr(D.asOf)}.</p>`;
    } else $('#acTbl').innerHTML = '<div class="skel">Asset-class prices are still loading.</div>';
  };

  // ================= DATA & CONTROLS =================
  let onlyEx = true;
  A.onTab.controls = function renderControls() {
    const el = $('#t-controls'), D = A.D;
    const s = D?.summary || { total: 0, pass: 0, warn: 0, fail: 0 };
    const badge = st => icon(st === 'pass' ? 'green' : st === 'warn' ? 'amber' : 'red');
    const log = store.get('ad-log', []);
    el.innerHTML = `
      <div class="card"><h2>Daily data pipeline and first-line controls</h2>
        <p class="sub">An automated job runs every US trading day after the close (ready before the Mumbai morning). It extends each price history, rebuilds total returns independently from prices and distributions and reconciles them with the vendor's figures, checks timeliness, abnormal moves and history length, and pulls macro data from the official publishers. If a source fails, yesterday's data is kept and the failure is shown here.</p>
        <p class="note">Last run: <b>${D ? new Date(D.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '–'}</b> · prices: ${esc(D?.sources?.prices || '–')} · macro: ${esc(D?.sources?.macro || '–')}</p></div>
      <div class="grid g4 section">
        <div class="card kpi"><div class="l">Control tests</div><div class="v">${s.total}</div><div class="s">${Object.keys(D?.securities || {}).length} securities · ${Object.keys(D?.macro || {}).length} macro series</div></div>
        <div class="card kpi"><div class="l">${icon('green')} Pass</div><div class="v">${s.pass}</div><div class="s">${s.total ? (s.pass / s.total * 100).toFixed(0) : 0}% of tests</div></div>
        <div class="card kpi"><div class="l">${icon('amber')} Warning</div><div class="v">${s.warn}</div><div class="s">Review required</div></div>
        <div class="card kpi"><div class="l">${icon('red')} Fail</div><div class="v">${s.fail}</div><div class="s">${s.fail ? 'Escalate to the data owner' : 'None'}</div></div>
      </div>
      <div class="card section"><div class="sectionhead"><h2>Test results</h2><label class="f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="ctOnly" ${onlyEx ? 'checked' : ''}> Exceptions only</label></div><div class="tblx" id="ctTbl"></div></div>
      <div class="card section"><div class="sectionhead"><h2>Review and suitability log</h2><div class="row"><button class="ghost" id="lgCsv">Export CSV</button><button class="ghost" id="lgClr">Clear</button></div></div>
        <p class="sub">Audit trail of client reviews, risk-model overrides (with the reason recorded) and client packs produced. Saved in this browser.</p>
        <div class="tblx"><table><thead><tr><th>When</th><th>Client</th><th>Event</th><th>Detail</th></tr></thead><tbody>${log.length ? log.map(l => `<tr style="cursor:default"><td>${new Date(l.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td><td>${esc(l.client)}</td><td>${esc(l.type)}</td><td style="white-space:normal;text-align:left">${esc(l.detail)}</td></tr>`).join('') : '<tr><td colspan="4" class="skel">No events yet.</td></tr>'}</tbody></table></div></div>`;
    const paint = () => { const rows = (D?.controls || []).filter(c => !onlyEx || c.status !== 'pass'); $('#ctTbl').innerHTML = rows.length ? `<table><thead><tr><th>Series</th><th>Control</th><th>Result</th><th>Evidence</th><th>Action</th></tr></thead><tbody>${rows.map(c => `<tr style="cursor:default"><td><b>${esc(c.series)}</b>${D.securities?.[c.series] ? `<span class="grp">${esc(D.securities[c.series].name)}</span>` : D.macro?.[c.series] ? `<span class="grp">${esc(D.macro[c.series].label)}</span>` : ''}</td><td>${esc(c.control)}</td><td>${badge(c.status)}</td><td style="white-space:normal;text-align:left;min-width:260px">${esc(c.evidence)}</td><td style="white-space:normal;text-align:left;min-width:180px">${esc(c.action)}</td></tr>`).join('')}</tbody></table>` : `<div class="skel">${icon('green')} No exceptions: all ${s.total} tests passed.</div>`; };
    paint();
    $('#ctOnly').onchange = e => { onlyEx = e.target.checked; paint(); };
    $('#lgCsv').onclick = () => { const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`; const t = [['When', 'Client', 'Event', 'Detail']].concat(log.map(l => [l.at, l.client, l.type, l.detail])).map(r => r.map(q).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'review-log.csv'; a.click(); };
    $('#lgClr').onclick = () => { store.set('ad-log', []); A.onTab.controls(); };
  };

  // ================= ROLE MAP =================
  const ROLE = [
    ['Evaluate and monitor investment managers, strategies and products (people, process, operations, performance)', 'Portfolio review · India fund research', 'Every actively managed fund in a client portfolio is tested against its asset-class benchmark (excess return, information ratio). The India page adds a full due-diligence screen, the 4 Ps review and watchlist monitoring.'],
    ['Research industries, sectors, themes and trends; timely analysis of market developments', 'Markets · India fund research', 'Daily house view with talking points, yield curve, policy-rate history and asset-class performance; Indian sector scorecard on the India page.'],
    ['Partner with research, strategy and investment teams on diligence, monitoring and thought leadership', 'House models · Markets', 'Five strategic multi-asset models with back-tests and stress tests, and talking points that turn the house view into client language.'],
    ['Review fund documents, credit and loan files and business records in line with policy', 'Client & risk · Data & controls · India fund research', 'Risk questionnaire separating willingness from capacity, overrides require a recorded reason, fund-document checklist on the India page. Credit and loan files are outside the scope of public data.'],
    ['Prepare clear, data-driven reports, dashboards and presentations for management', 'Client review pack', 'One-page pack for the advisor: profile, allocation vs target, findings, tax-aware trades, stress tests, goal-plan odds and talking points. Prints or saves as PDF.'],
    ['Support first-line risk and control: surveillance, QA testing, audits; escalate issues', 'Data & controls · Portfolio review', 'Automated daily data controls (total-return reconciliation, timeliness, abnormal moves), suitability check of portfolio risk vs profile, and an audit log of reviews and overrides.'],
    ['Process improvement, documentation, controls, standardisation and automation', 'Data pipeline · review rules', 'Daily GitHub Actions pipeline with fallback to the previous day\'s data; standard flag rules for concentration, drift, overlap, asset location and cash drag.'],
    ['Collaborate with Operations, Credit, Legal, Risk and Compliance; coordinate onshore and offshore', 'Client pack · log exports', 'Data is refreshed after the US close so it is ready for an offshore team in the Mumbai morning; packs and CSV exports hand work back to US advisors.'],
    ['Manage requests within turnaround times and quality standards', 'Whole workflow', 'A full household review, rebalance and plan in minutes; every view shows its data date and stale data is flagged.'],
    ['Perform additional analysis and ad-hoc tasks', 'Goal plan · Rebalance', 'What-if planning (save more, spend less, retire later, change model) and rebalancing options (tolerance bands, concentrated-stock priority).']
  ];
  A.onTab.role = function () {
    $('#t-role').innerHTML = `<div class="card"><h2>How the Advisor Desk maps to the role</h2><p class="sub">Each responsibility in the Wealth Management Home Office apprenticeship, and where this app demonstrates it.</p>
      <div class="tblx"><table><thead><tr><th>Responsibility</th><th>Where</th><th>What it shows</th></tr></thead><tbody>${ROLE.map(r => `<tr style="cursor:default"><td style="white-space:normal;min-width:240px">${esc(r[0])}</td><td style="white-space:normal;text-align:left;min-width:160px"><b>${esc(r[1])}</b></td><td style="white-space:normal;text-align:left;min-width:300px">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
      <h2 class="section">The workflow it supports</h2>
      <p class="sub">Home-office research produces house models and a house view → the advisor profiles the client → the desk reviews the household portfolio against the model → proposes tax-aware trades → tests the retirement plan → hands the advisor a one-page pack for the meeting.</p>
      <p class="note">Known limits: no stock-level look-through of fund holdings (no reliable free source); tax estimates are federal only and assume long-term lots; fund expense ratios are not included.</p></div>`;
  };

  // ================= CLIENT REVIEW PACK =================
  $('#packBtn').onclick = () => {
    const CL = A.CL, D = A.D, a = A.analyse(), rb = A.rebal(), P = A.planCompute(), mdl = E.MODELS[CL.model - 1], prof = A.profile;
    if (!a) { alert('Load a client and enter holdings first (Client & risk, then Portfolio review).'); return; }
    const sv = A.planSolve();
    const tp = A.talkingPoints().slice(0, 4);
    const allocRows = a.alloc.map(x => `<tr><td>${esc(D.classes[x.cls].label)}</td><td>${x.w.toFixed(1)}%</td><td>${x.t}%</td><td>${(rb?.after[x.cls] || 0).toFixed(1)}%</td></tr>`).join('') + Object.keys(rb?.after || {}).filter(c => !a.alloc.find(x => x.cls === c)).map(c => `<tr><td>${esc(D.classes[c].label)}</td><td>0.0%</td><td>${a.target[c] || 0}%</td><td>${rb.after[c].toFixed(1)}%</td></tr>`).join('');
    const sum = acc => { const t = rb.trades.filter(x => x.account === acc); return t.length ? `<tr><td>${esc(E.ACCOUNTS[acc].label)}</td><td style="text-align:left">${t.filter(x => x.side === 'Sell').map(x => `${x.ticker === 'CASH' ? 'Cash' : x.ticker} ${usdK(x.amount)}`).join(', ') || '–'}</td><td style="text-align:left">${t.filter(x => x.side === 'Buy').map(x => `${x.ticker} ${usdK(x.amount)}`).join(', ') || '–'}</td></tr>` : ''; };
    let ov = $('#packOv'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'packOv';
    ov.innerHTML = `<div class="rep-bar noprint"><b>Client review pack</b><span style="flex:1"></span><button class="btn" id="pkPrint">Print / Save as PDF</button><button class="ghost" id="pkClose">Close</button></div>
      <div class="rep">
        <h1>Portfolio review: ${esc(CL.name || 'Client')}</h1>
        <p class="muted">Prepared ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} for advisor use · market data as of ${dstr(D.asOf)}</p>
        <h2>Client profile</h2>
        <div class="kv"><div>Age / retirement<b>${CL.age} / ${CL.retireAge}</b></div><div>Tax bracket<b>${CL.bracket}%</b></div><div>Risk willingness / capacity<b>${prof ? prof.willingness + ' / ' + prof.capacity : '–'}</b></div><div>Model<b>${CL.model} · ${esc(mdl.name)}${CL.munis ? ' (munis)' : ''}</b></div></div>
        ${CL.override ? `<p><b>Advisor override:</b> recommended ${esc(E.MODELS[(prof?.model || 3) - 1].name)}; ${esc(mdl.name)} chosen. Reason: ${esc(CL.override.reason || 'not recorded')}</p>` : ''}
        <h2>Snapshot</h2>
        <div class="kv"><div>Household assets<b>${usdK(a.total)}</b></div><div>Drift from model<b>${a.drift.toFixed(1)}%</b></div><div>Volatility now / model<b>${pctu(a.risk.current?.vol)} / ${pctu(a.risk.target?.vol)}</b></div><div>Plan success now / model<b>${P?.mcC ? Math.round(P.mcC.prob * 100) + '%' : '–'} / ${P?.mcT ? Math.round(P.mcT.prob * 100) + '%' : '–'}</b></div></div>
        <h2>Key findings</h2>${a.flags.length ? '<ol>' + a.flags.slice(0, 7).map(f => `<li><b>${esc(f.area)}:</b> ${esc(f.text)} <span class="muted">${esc(f.fix)}</span></li>`).join('') + '</ol>' : '<p>No issues found.</p>'}
        <h2>Allocation</h2><table><thead><tr><th>Asset class</th><th>Today</th><th>Target</th><th>After proposal</th></tr></thead><tbody>${allocRows}</tbody></table>
        <h2>Proposed rebalance</h2>${rb && rb.trades.length ? `<table><thead><tr><th>Account</th><th style="text-align:left">Sell</th><th style="text-align:left">Buy</th></tr></thead><tbody>${Object.keys(E.ACCOUNTS).map(sum).join('')}</tbody></table><p>Turnover ${usdK(rb.turnover)} · realized gains ${usdK(rb.realizedGain)} · estimated federal tax ${usd(rb.tax)}${rb.harvested ? ` · losses harvested ${usd(rb.harvested)}` : ''}.</p>` : '<p>No trades needed.</p>'}
        <h2>Stress tests (today's portfolio vs model)</h2><table><thead><tr><th>Scenario</th><th>Today</th><th>Model</th><th>Today ($)</th></tr></thead><tbody>${a.scenarios.map(s => `<tr><td>${esc(s.name)}</td><td>${pct(s.current)}</td><td>${pct(s.target)}</td><td>${usdK(s.dollars)}</td></tr>`).join('')}</tbody></table>
        <h2>Retirement plan</h2>${P?.mcT ? `<p>Spending ${usd(P.plan.spend)} a year from age ${P.plan.retireAge} (today's dollars), Social Security ${usd(P.plan.ss)} from ${P.plan.ssAge}: <b>${Math.round(P.mcT.prob * 100)}% probability of success</b> on the ${esc(mdl.name)} model; median wealth at ${P.plan.endAge} ${usdK(P.mcT.medianEnd)}. ${sv && !sv.ok ? `To reach 85%: save ${usd(Math.ceil((sv.extraSave || 0) / 500) * 500)} more a year, or spend ${usd(Math.ceil(sv.spendCut / 500) * 500)} less.` : ''}</p>` : '<p>Not run.</p>'}
        <h2>Market talking points</h2><ul>${tp.map(t => `<li>${t}</li>`).join('')}</ul>
        <p class="muted" style="margin-top:18px">Back-tests use asset-class ETFs with monthly rebalancing; past performance does not guarantee future results. Tax figures are estimates (federal, long-term rates) and are not tax advice. Prices: Tiingo; macro: US Treasury, NY Fed, Cboe, BLS, Freddie Mac. Prepared with Advisor Desk for analysis and education.</p>
      </div>`;
    document.body.appendChild(ov); document.body.classList.add('pack-open');
    $('#pkClose').onclick = () => { ov.remove(); document.body.classList.remove('pack-open'); };
    $('#pkPrint').onclick = () => window.print();
    A.logEvent('Client pack generated', `${mdl.name}; ${a.flags.length} findings; ${rb?.trades.length || 0} proposed trades`);
  };

  A.onTab.ready = true;
  A.boot();
})();
