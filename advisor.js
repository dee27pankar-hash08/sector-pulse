// Advisor Desk UI, part 1: shared helpers, data loading, client & risk, house models, portfolio review, rebalance.
(function () {
  'use strict';
  const E = window.Engine;
  const DATA_URL = 'https://raw.githubusercontent.com/dee27pankar-hash08/sector-pulse/data/market.json';

  // ---------------- helpers ----------------
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ok = x => x !== null && x !== undefined && isFinite(x);
  const pct = (x, d = 1) => ok(x) ? (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%' : '–';     // fraction, signed
  const pctu = (x, d = 1) => ok(x) ? (x * 100).toFixed(d) + '%' : '–';                         // fraction, unsigned
  const pts = (x, d = 1) => ok(x) ? (x > 0 ? '+' : '') + x.toFixed(d) : '–';                    // percentage points
  const usd = x => ok(x) ? (x < 0 ? '-$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US') : '–';
  const usdK = x => !ok(x) ? '–' : Math.abs(x) >= 1e6 ? (x < 0 ? '-' : '') + '$' + (Math.abs(x) / 1e6).toFixed(2) + 'M' : Math.abs(x) >= 1e3 ? (x < 0 ? '-' : '') + '$' + Math.round(Math.abs(x) / 1e3) + 'k' : usd(x);
  const num = (x, d = 2) => ok(x) ? x.toFixed(d) : '–';
  const cls = x => x > 0 ? 'up' : x < 0 ? 'dn' : '';
  const dstr = s => s ? new Date(s.length === 7 ? s + '-01' : s).toLocaleDateString('en-US', { day: s.length === 7 ? undefined : 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';
  const mstr = m => m ? new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const icon = l => `<span class="ic ${l}">${l === 'green' ? '&#10003;' : l === 'amber' ? '!' : '&#10005;'}</span>`;
  const COL = ['var(--s1)', 'var(--s2)', 'var(--s3)'];

  // ---------------- charts (line, with crosshair tooltip) ----------------
  const charts = [];
  function chart(el, opts) { const spec = { el, opts }; charts.push(spec); draw(spec); return spec; }
  function redraw() { for (let i = charts.length - 1; i >= 0; i--) { if (!document.body.contains(charts[i].el)) charts.splice(i, 1); else draw(charts[i]); } }
  window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(redraw, 150); });
  function draw({ el, opts }) {
    if (!el.offsetParent) return;
    const W = el.clientWidth || 600, H = opts.height || 280, m = { t: 10, r: opts.endLabels === false ? 16 : 104, b: 26, l: 54 };
    const series = opts.series.filter(s => s.pts && s.pts.length);
    if (!series.length) { el.innerHTML = '<div class="skel">No data</div>'; return; }
    const all = series.flatMap(s => s.pts).concat(opts.band ? opts.band.hi.concat(opts.band.lo) : []);
    const x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0]));
    let y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
    if (opts.zero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
    const pad = (y1 - y0) * 0.08 || 1; y0 -= pad; y1 += pad; if (opts.zero && y0 > -pad) y0 = Math.min(y0, 0);
    const X = t => m.l + (t - x0) / (x1 - x0 || 1) * (W - m.l - m.r), Y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const yrsSpan = (x1 - x0) / 3.156e10; const yf = opts.yFmt || (v => v.toFixed(0)), xf = opts.xFmt || (t => yrsSpan > 2.5 ? String(new Date(t).getUTCFullYear()) : new Date(t).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }));
    const nice = (lo, hi, n) => { const span = hi - lo, st0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(st0))); const st = [1, 2, 2.5, 5, 10].map(k => k * mag).find(k => span / k <= n) || mag * 10; const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(10)); return out; };
    let xt;
    if (opts.xTicks) xt = opts.xTicks;
    else if (opts.xType === 'num') xt = nice(x0, x1, 8).filter(v => v >= x0 && v <= x1);
    else { xt = []; const yrs = (x1 - x0) / 3.156e10; const maxT = Math.max(3, Math.floor((W - m.l - m.r) / 64)); const stepY = Math.max(1, Math.ceil(yrs / maxT)); if (yrs > 2.5) { for (let y = new Date(x0).getUTCFullYear() + 1; ; y += stepY) { const t = Date.UTC(y, 0, 1); if (t > x1) break; xt.push(t); } } else { const d0 = new Date(x0); let d = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1); const st = yrs > 1 ? 3 : 1; while (d <= x1) { const dd = new Date(d); if (dd.getUTCMonth() % st === 0) xt.push(d); d = Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + 1, 1); } } }
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'chart')}">`;
    nice(y0, y1, 5).forEach(v => { s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${yf(v)}</text>`; });
    if (opts.baseline !== undefined && opts.baseline > y0 && opts.baseline < y1) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(opts.baseline)}" y2="${Y(opts.baseline)}" stroke="var(--axis)"/>`;
    xt.forEach(t => { s += `<text x="${X(t)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(xf(t))}</text>`; });
    if (opts.band) { const b = opts.band; const up = b.hi.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`), dn = b.lo.slice().reverse().map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`); s += `<polygon points="${up.concat(dn).join(' ')}" fill="${b.color}" opacity="0.12"/>`; }
    series.forEach(se => { s += `<path d="${se.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')}" fill="none" stroke="${se.color}" stroke-width="2" ${se.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`; if (se.markers) se.pts.forEach(p => { s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="3.5" fill="${se.color}" stroke="var(--card)" stroke-width="2"/>`; }); });
    if (opts.endLabels !== false) {
      const labs = series.map(se => { const p = se.pts[se.pts.length - 1]; return { y: Y(p[1]), txt: se.name.length > 16 ? se.name.slice(0, 15) + '…' : se.name, val: yf(p[1]) }; }).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 26) labs[i].y = labs[i - 1].y + 26;
      labs.forEach(l => { s += `<text x="${W - m.r + 8}" y="${l.y}" font-size="11" fill="var(--ink2)">${esc(l.txt)}</text><text x="${W - m.r + 8}" y="${l.y + 12}" font-size="11" font-weight="600" fill="var(--ink)">${esc(l.val)}</text>`; });
    }
    s += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--axis)" visibility="hidden"/>`;
    series.forEach((se, i) => { s += `<circle class="dot" r="4" fill="${se.color}" stroke="var(--card)" stroke-width="2" visibility="hidden"/>`; });
    s += `<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg><div class="tip"></div>`;
    el.innerHTML = s;
    const svg = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = svg.querySelector('.xh'), dots = svg.querySelectorAll('.dot');
    const near = (p, t) => { let lo = 0, hi = p.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid][0] < t) lo = mid; else hi = mid; } return Math.abs(p[lo][0] - t) <= Math.abs(p[hi][0] - t) ? p[lo] : p[hi]; };
    const hide = () => { xh.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); tip.style.display = 'none'; };
    svg.addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * W / r.width;
      if (sx < m.l || sx > W - m.r) return hide();
      const t = x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0), ref = near(series[0].pts, t);
      xh.setAttribute('x1', X(ref[0])); xh.setAttribute('x2', X(ref[0])); xh.setAttribute('visibility', 'visible');
      let h = `<div class="muted" style="margin-bottom:4px">${esc(opts.tipX ? opts.tipX(ref[0]) : opts.xType === 'num' ? xf(ref[0]) : new Date(ref[0]).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }))}</div>`;
      series.forEach((se, i) => { const p = near(se.pts, ref[0]); dots[i].setAttribute('cx', X(p[0])); dots[i].setAttribute('cy', Y(p[1])); dots[i].setAttribute('visibility', 'visible'); h += `<div class="r"><span><i style="background:${se.color}"></i>${esc(se.name)}</span><b>${esc(yf(p[1]))}</b></div>`; });
      tip.innerHTML = h; tip.style.display = 'block';
      const px = X(ref[0]) / W * r.width; tip.style.left = Math.max(4, Math.min(px + 14, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = '8px';
    });
    svg.addEventListener('mouseleave', hide);
  }
  const legend = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  const mts = m => Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1);

  // ---------------- state ----------------
  const BRACKETS = [10, 12, 22, 24, 32, 35, 37];
  const ltcgFor = b => b <= 12 ? 0 : b >= 37 ? 0.2 : 0.15;
  const SAMPLES = {
    prer: {
      name: 'The Patels (sample)', note: 'Pre-retiree couple, 58, retiring at 65', age: 58, retireAge: 65, bracket: 24,
      answers: { horizon: 3, objective: 2, drop: 2, tradeoff: 2, experience: 2, income: 3, reserve: 3 },
      holdings: [
        { account: 'taxable', ticker: 'VTI', value: 420000, basis: 210000 }, { account: 'taxable', ticker: 'AAPL', value: 185000, basis: 38000 },
        { account: 'taxable', ticker: 'CASH', value: 160000, basis: 0 }, { account: 'ira', ticker: 'AGTHX', value: 310000, basis: 0 },
        { account: 'ira', ticker: 'PIMIX', value: 95000, basis: 0 }, { account: 'ira', ticker: 'MUB', value: 45000, basis: 0 },
        { account: 'roth', ticker: 'QQQ', value: 62000, basis: 0 }],
      plan: { endAge: 95, save: 40000, spend: 105000, ss: 52000, ssAge: 67, infl: 0.025, fee: 0.0075 }
    },
    tech: {
      name: 'Sarah Chen (sample)', note: 'Tech employee, 34, concentrated in employer-related stock', age: 34, retireAge: 60, bracket: 35,
      answers: { horizon: 4, objective: 3, drop: 3, tradeoff: 3, experience: 3, income: 3, reserve: 2 },
      holdings: [
        { account: 'taxable', ticker: 'NVDA', value: 285000, basis: 31000 }, { account: 'taxable', ticker: 'VOO', value: 82000, basis: 64000 },
        { account: 'taxable', ticker: 'IVV', value: 41000, basis: 35000 }, { account: 'taxable', ticker: 'CASH', value: 65000, basis: 0 },
        { account: 'k401', ticker: 'FXAIX', value: 128000, basis: 0 }, { account: 'roth', ticker: 'TSLA', value: 24000, basis: 0 }],
      plan: { endAge: 95, save: 55000, spend: 120000, ss: 38000, ssAge: 67, infl: 0.025, fee: 0.0075 }
    },
    ret: {
      name: 'Robert & Linda Hayes (sample)', note: 'Retired couple, 71, living on portfolio income', age: 71, retireAge: 71, bracket: 22,
      answers: { horizon: 2, objective: 1, drop: 2, tradeoff: 1, experience: 2, income: 2, reserve: 3 },
      holdings: [
        { account: 'taxable', ticker: 'JNJ', value: 125000, basis: 52000 }, { account: 'taxable', ticker: 'XOM', value: 92000, basis: 70000 },
        { account: 'taxable', ticker: 'HYG', value: 150000, basis: 158000 }, { account: 'taxable', ticker: 'SGOV', value: 210000, basis: 210000 },
        { account: 'ira', ticker: 'VBTLX', value: 400000, basis: 0 }, { account: 'ira', ticker: 'DODGX', value: 155000, basis: 0 },
        { account: 'ira', ticker: 'TLT', value: 125000, basis: 0 }],
      plan: { endAge: 95, save: 0, spend: 98000, ss: 58000, ssAge: 70, infl: 0.025, fee: 0.0075 }
    }
  };
  const blankClient = () => ({ name: '', age: 45, retireAge: 65, bracket: 24, answers: {}, override: null, useMunis: null, holdings: [], plan: { endAge: 95, save: 20000, spend: 80000, ss: 30000, ssAge: 67, infl: 0.025, fee: 0.0075 } });
  let CL = store.get('ad-client', null) || blankClient();
  const A = window.AD = { D: null, CL, E, $, esc, pct, pctu, pts, usd, usdK, num, cls, dstr, mstr, store, icon, chart, redraw, legend, mts, COL, analysis: null, reb: null, onTab: {}, profile: null };

  function derive() {
    const p = E.riskProfile(CL.answers || {});
    A.profile = p;
    CL.model = CL.override?.model || p?.model || 3;
    CL.taxHigh = CL.bracket >= 32;
    CL.munis = CL.useMunis === null || CL.useMunis === undefined ? CL.taxHigh : !!CL.useMunis;
    CL.ltcg = ltcgFor(CL.bracket);
    A.CL = CL; store.set('ad-client', CL);
    const mdl = E.MODELS[CL.model - 1];
    $('#chip').innerHTML = CL.name ? `Client: <b>${esc(CL.name)}</b> · ${esc(mdl.name)} (${CL.model}/5)${CL.override ? ' <span class="tag">override</span>' : ''}` : 'No client loaded';
  }
  A.derive = derive;
  A.invalidate = () => { A.analysis = null; A.reb = null; A.plan = null; };
  A.logEvent = (type, detail) => { const l = store.get('ad-log', []); l.unshift({ at: new Date().toISOString(), client: CL.name || '(unnamed)', type, detail }); store.set('ad-log', l.slice(0, 200)); };

  // ---------------- tabs ----------------
  const rendered = {};
  function show(t) {
    document.querySelectorAll('#nav button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 't-' + t));
    const fn = { client: renderClient, models: renderModels, review: renderReview, rebal: renderRebal }[t] || A.onTab[t];
    if (fn && (!rendered[t] || rendered[t] !== A.version)) { fn(); rendered[t] = A.version; }
    redraw();
    try { history.replaceState(null, '', '#' + t); } catch (e) {}
  }
  A.show = show; A.version = 1;
  A.bump = () => { A.version++; };
  document.querySelectorAll('#nav button[data-t]').forEach(b => b.onclick = () => show(b.dataset.t));

  // ---------------- data ----------------
  async function load() {
    try {
      const r = await fetch(DATA_URL + '?v=' + Math.floor(Date.now() / 36e5), { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      A.D = await r.json();
    } catch (e) { $('#asof').innerHTML = `<span class="err">Market data unavailable (${esc(e.message)})</span>`; A.D = null; }
    const D = A.D;
    if (D) {
      const nSec = Object.keys(D.securities || {}).length;
      $('#asof').innerHTML = `Prices as of <b>${dstr(D.asOf)}</b><br>Refreshed ${new Date(D.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
      if (!nSec) $('#banner').innerHTML = `<div class="banner warn">Security prices are being loaded for the first time. Macro data is live; portfolio analytics appear once prices arrive.</div>`;
    }
    A.bump();
    const t = (location.hash || '#client').slice(1);
    show(document.querySelector(`#nav button[data-t="${t}"]`) ? t : 'client');
  }
  A.hasPrices = () => A.D && Object.keys(A.D.securities || {}).length > 10;

  // ================= CLIENT & RISK =================
  function renderClient() {
    const p = A.profile;
    const qs = E.QUESTIONS.map(q => `<div class="q"><p>${esc(q.q)} <span class="tag">${q.kind === 'capacity' ? 'Risk capacity' : 'Risk willingness'}</span></p><div class="opts">${q.a.map((a, i) => `<label class="${CL.answers?.[q.id] === i ? 'on' : ''}"><input type="radio" name="q_${q.id}" value="${i}" ${CL.answers?.[q.id] === i ? 'checked' : ''}>${esc(a)}</label>`).join('')}</div></div>`).join('');
    const mdl = n => E.MODELS[n - 1].name;
    $('#t-client').innerHTML = `
      <div class="grid g3">
        <div class="card" style="grid-column:span 2">
          <div class="sectionhead"><h2>Client details</h2><div class="row">${Object.entries(SAMPLES).map(([k, s]) => `<button class="ghost" data-sample="${k}" title="${esc(s.note)}">${esc(s.name.replace(' (sample)', ''))}</button>`).join('')}<button class="ghost" id="cNew">New client</button></div></div>
          <p class="sub">Load a fictional sample household or enter a new client. Everything is saved in this browser only.</p>
          <div class="row">
            <label class="f" style="flex:2;min-width:200px">Client name<input id="cName" value="${esc(CL.name)}" placeholder="e.g. The Smith household"></label>
            <label class="f">Age<input id="cAge" type="number" min="18" max="95" value="${CL.age}" style="width:90px"></label>
            <label class="f">Retirement age<input id="cRet" type="number" min="40" max="90" value="${CL.retireAge}" style="width:110px"></label>
            <label class="f">Federal tax bracket<select id="cBr">${BRACKETS.map(b => `<option ${b === CL.bracket ? 'selected' : ''} value="${b}">${b}%</option>`).join('')}</select></label>
          </div>
          <label class="f" style="flex-direction:row;align-items:center;gap:8px;margin-top:10px"><input type="checkbox" id="cMuni" ${CL.munis ? 'checked' : ''}> Use municipal bonds for half of the core bond sleeve (usually worthwhile from the 32% bracket)</label>
          <div class="section"><h3>Sample households</h3>${Object.values(SAMPLES).map(s => `<div class="metric"><span><b style="color:var(--ink)">${esc(s.name.replace(' (sample)', ''))}</b> · ${esc(s.note)}</span><span class="muted">${usdK(s.holdings.reduce((a, h) => a + h.value, 0))}</span></div>`).join('')}
          <p class="note">Each sample is built to surface typical review issues: concentrated stock, idle cash, home bias, overlapping funds, poor asset location and duration risk.</p></div>
        </div>
        <div class="card" id="cResult"></div>
      </div>
      <div class="card section"><h2>Risk questionnaire</h2><p class="sub">Separates <b>willingness</b> to take risk (attitude) from <b>capacity</b> to take risk (time horizon, income, reserves). The recommended model is the lower of the two, which is standard suitability practice.</p>${qs}</div>`;
    renderResult();
    document.querySelectorAll('[data-sample]').forEach(b => b.onclick = () => { const s = JSON.parse(JSON.stringify(SAMPLES[b.dataset.sample])); CL = Object.assign(blankClient(), s, { override: null, useMunis: null }); A.CL = CL; delete CL.note; derive(); A.invalidate(); A.bump(); A.logEvent('Client loaded', s.note); show('client'); });
    $('#cNew').onclick = () => { CL = blankClient(); A.CL = CL; derive(); A.invalidate(); A.bump(); show('client'); };
    const upd = () => { CL.name = $('#cName').value.trim(); CL.age = +$('#cAge').value || CL.age; CL.retireAge = +$('#cRet').value || CL.retireAge; CL.bracket = +$('#cBr').value; derive(); A.invalidate(); A.bump(); rendered.client = A.version; renderResult(); };
    ['#cName', '#cAge', '#cRet', '#cBr'].forEach(s => $(s).onchange = upd);
    $('#cMuni').onchange = e => { CL.useMunis = e.target.checked; derive(); A.invalidate(); A.bump(); rendered.client = A.version; renderResult(); };
    document.querySelectorAll('.q input').forEach(i => i.onchange = () => {
      CL.answers[i.name.slice(2)] = +i.value; i.closest('.opts').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(i)));
      derive(); A.invalidate(); A.bump(); rendered.client = A.version; renderResult();
    });
    function renderResult() {
      const p = A.profile, el = $('#cResult');
      if (!p) { el.innerHTML = `<h2>Risk profile</h2><p class="sub">Answer the questionnaire to get a recommended model.</p><div class="skel">${Object.keys(CL.answers || {}).length} of ${E.QUESTIONS.length} answered</div>`; return; }
      el.innerHTML = `<h2>Risk profile</h2><p class="sub">Score ${p.score}/100</p>
        <div class="metric"><span>Willingness</span><b>${p.willingness} · ${mdl(p.willingness)}</b></div>
        <div class="metric"><span>Capacity</span><b>${p.capacity} · ${mdl(p.capacity)}</b></div>
        <div class="metric"><span>Recommended model</span><b>${p.model} · ${mdl(p.model)}</b></div>
        <p class="note">${p.bound === 'both' ? 'Willingness and capacity agree.' : p.bound === 'capacity' ? 'Capped by <b>capacity</b>: the client is willing to take more risk than their horizon, income or reserves can support.' : 'Capped by <b>willingness</b>: the client could afford more risk but is not comfortable with it; revisit if goals are not met.'}</p>
        <div class="section"><label class="f">Advisor decision<select id="cOv"><option value="">Accept recommendation (${mdl(p.model)})</option>${E.MODELS.filter(m => m.id !== p.model).map(m => `<option value="${m.id}" ${CL.override?.model === m.id ? 'selected' : ''}>Override to ${m.id} · ${m.name}</option>`).join('')}</select></label>
        <label class="f section" id="cOvR" style="display:${CL.override ? 'flex' : 'none'}">Reason for override (recorded in the suitability log)<textarea id="cOvT" placeholder="e.g. Client has a defined-benefit pension covering essential spending">${esc(CL.override?.reason || '')}</textarea></label>
        <button class="btn section" id="cOvS" style="display:${CL.override && !CL.override.saved ? 'inline-block' : 'none'}">Record decision</button></div>
        <p class="note section">Model in use: <b>${CL.model} · ${mdl(CL.model)}</b>${CL.munis ? ' with municipal bonds' : ''}.</p>`;
      $('#cOv').onchange = e => { const v = +e.target.value; if (!v) { if (CL.override) A.logEvent('Override removed', `Back to recommended ${mdl(p.model)}`); CL.override = null; } else { CL.override = { model: v, reason: CL.override?.reason || '', saved: false }; } derive(); A.invalidate(); A.bump(); rendered.client = A.version; renderResult(); };
      const sv = $('#cOvS'); if (sv) sv.onclick = () => { const r = $('#cOvT').value.trim(); if (!r) { $('#cOvT').focus(); $('#cOvT').placeholder = 'A reason is required to override the recommended model'; return; } CL.override.reason = r; CL.override.saved = true; CL.override.at = new Date().toISOString(); derive(); A.logEvent('Risk override', `Recommended ${mdl(p.model)}, chose ${mdl(CL.override.model)}: ${r}`); renderResult(); };
    }
  }

  // ================= HOUSE MODELS =================
  let MS = null, MSkey = null;
  A.modelStats = () => { const k = CL.munis ? 'm' : 'n'; if (!MS || MSkey !== k) { MS = E.modelStats(A.D, { munis: CL.munis }); MSkey = k; } return MS; };
  function renderModels() {
    const el = $('#t-models');
    if (!A.hasPrices()) { el.innerHTML = '<div class="card"><div class="skel">Model back-tests need security prices, which are still loading.</div></div>'; return; }
    const ms = A.modelStats(), D = A.D, cm = CL.model;
    const classes = E.CLASS_ORDER.filter(c => ms.some(m => m.weights[c]));
    const groups = ['Equity', 'Fixed income', 'Real assets', 'Cash'];
    const hi = id => id === cm ? 'model-hi' : '';
    let rows = '';
    for (const g of groups) {
      const cs = classes.filter(c => D.classes[c].group === g); if (!cs.length) continue;
      rows += `<tr style="cursor:default"><td><b>${g}</b></td>${ms.map(m => `<td class="${hi(m.id)}"><b>${cs.reduce((a, c) => a + (m.weights[c] || 0), 0)}%</b></td>`).join('')}<td></td></tr>`;
      rows += cs.map(c => `<tr style="cursor:default"><td style="padding-left:18px">${esc(D.classes[c].label)}</td>${ms.map(m => `<td class="${hi(m.id)}">${m.weights[c] ? m.weights[c] + '%' : '<span class="muted">–</span>'}</td>`).join('')}<td class="muted">${E.PROXY[c]}</td></tr>`).join('');
    }
    const st = (lab, f, fmt) => `<tr style="cursor:default"><td>${lab}</td>${ms.map(m => `<td class="${hi(m.id)}">${fmt(f(m))}</td>`).join('')}<td></td></tr>`;
    const s0 = ms[0];
    el.innerHTML = `
      <div class="card"><div class="sectionhead"><h2>House model portfolios</h2><span class="note">Back-test ${mstr(s0.start)} – ${mstr(s0.end)} · monthly rebalanced · before fees</span></div>
        <p class="sub">Five strategic allocations across 15 asset classes. Each client is mapped to one model by the risk profile; the client's model is highlighted. ${CL.munis ? 'Municipal bonds replace half of core bonds for this client.' : ''}</p>
        <div class="tblx"><table><thead><tr><th>Asset class</th>${ms.map(m => `<th class="${hi(m.id)}">${m.id} · ${esc(m.name)}</th>`).join('')}<th>Proxy</th></tr></thead><tbody>${rows}
          <tr style="cursor:default"><td colspan="${ms.length + 2}" style="padding-top:16px"><b>Historical behaviour</b></td></tr>
          ${st('Annual return', m => m.stats.cagr, pctu)}${st('Volatility (annual)', m => m.stats.vol, pctu)}${st('Maximum drawdown', m => m.stats.mdd, pct)}${st('Worst 12 months', m => m.stats.worst12, pct)}${st('Sharpe ratio (vs T-bills)', m => m.stats.sharpe, x => num(x))}
          <tr style="cursor:default"><td colspan="${ms.length + 2}" style="padding-top:16px"><b>Stress tests (actual asset-class returns)</b></td></tr>
          ${E.SCENARIOS.map(sc => st(`${sc.name} <span class="grp">${mstr(E.shiftMonth(sc.from, 1))} – ${mstr(sc.to)}</span>`, m => m.scenarios.find(x => x.id === sc.id).ret, x => `<span class="${cls(x)}">${pct(x)}</span>`)).join('')}
        </tbody></table></div></div>
      <div class="grid g2 section">
        <div class="card"><h2>Growth of $100</h2><p class="sub">Client's model against the most conservative and most aggressive models.</p><div id="mLeg"></div><div class="chart" id="mChart"></div></div>
        <div class="card"><h2>Return vs risk</h2><p class="sub">Each step up the scale adds return and drawdown. The client's model is in blue.</p><div class="chart" id="mScatter"></div></div>
      </div>`;
    const pick = [...new Set([1, cm, 5])].map(id => { const m = ms[id - 1]; let g = 100; return { name: m.name, color: id === cm ? COL[0] : id === 1 ? COL[2] : COL[1], pts: m.bt.months.map((mm, k) => { g *= 1 + m.bt.rets[k]; return [mts(mm), g]; }) }; });
    $('#mLeg').innerHTML = legend(pick);
    chart($('#mChart'), { series: pick, yFmt: v => '$' + v.toFixed(0), tipX: t => mstr(new Date(t).toISOString().slice(0, 7)), label: 'Growth of $100 by model' });
    // scatter: vol (x) vs return (y)
    const sc = $('#mScatter'); const W = 520, H = 260, mg = { l: 54, r: 20, t: 14, b: 34 };
    const xs = ms.map(m => m.stats.vol), ys = ms.map(m => m.stats.cagr);
    const xmax = Math.max(...xs) * 1.15, ymin = Math.min(0, Math.min(...ys)), ymax = Math.max(...ys) * 1.2;
    const X = v => mg.l + v / xmax * (W - mg.l - mg.r), Y = v => mg.t + (1 - (v - ymin) / (ymax - ymin)) * (H - mg.t - mg.b);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Return versus volatility by model">`;
    for (let k = 0; k <= 4; k++) { const v = ymin + (ymax - ymin) * k / 4; s += `<line x1="${mg.l}" x2="${W - mg.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--grid)"/><text x="${mg.l - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${(v * 100).toFixed(1)}%</text>`; }
    for (let k = 0; k <= 4; k++) { const v = xmax * k / 4; s += `<text x="${X(v)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--muted)">${(v * 100).toFixed(0)}%</text>`; }
    s += `<text x="${(W + mg.l) / 2}" y="${H - 1}" text-anchor="middle" font-size="11" fill="var(--ink2)">Volatility (annual)</text>`;
    s += `<path d="${ms.map((m, i) => (i ? 'L' : 'M') + X(m.stats.vol) + ',' + Y(m.stats.cagr)).join('')}" fill="none" stroke="var(--axis)" stroke-width="1.5"/>`;
    ms.forEach(m => { const c = m.id === cm; s += `<circle cx="${X(m.stats.vol)}" cy="${Y(m.stats.cagr)}" r="${c ? 7 : 5}" fill="${c ? COL[0] : 'var(--muted)'}" stroke="var(--card)" stroke-width="2"><title>${m.name}: ${(m.stats.cagr * 100).toFixed(1)}% return, ${(m.stats.vol * 100).toFixed(1)}% volatility</title></circle><text x="${X(m.stats.vol) + 9}" y="${Y(m.stats.cagr) + 4}" font-size="11" fill="${c ? 'var(--ink)' : 'var(--ink2)'}" ${c ? 'font-weight="600"' : ''}>${m.id} · ${esc(m.name)}</text>`; });
    sc.innerHTML = s + '</svg>';
  }

  // ================= PORTFOLIO REVIEW =================
  const ACC = E.ACCOUNTS;
  function secOptions(sel) {
    const S = A.D.securities, groups = [['Asset-class ETFs', t => S[t].proxy], ['Other ETFs', t => !S[t].proxy && S[t].type === 'ETF'], ['Mutual funds', t => S[t].type === 'Mutual fund'], ['Stocks', t => S[t].type === 'Stock']];
    let o = `<option value="CASH" ${sel === 'CASH' ? 'selected' : ''}>CASH · Cash (bank deposit)</option>`;
    for (const [g, f] of groups) o += `<optgroup label="${g}">${Object.keys(S).filter(f).sort().map(t => `<option value="${t}" ${t === sel ? 'selected' : ''}>${t} · ${esc(S[t].name)}</option>`).join('')}</optgroup>`;
    return o;
  }
  A.analyse = () => { if (!A.analysis && A.hasPrices() && CL.holdings.length) A.analysis = E.analysePortfolio(A.D, CL, CL.holdings); return A.analysis; };
  function renderReview() {
    const el = $('#t-review');
    if (!A.hasPrices()) { el.innerHTML = '<div class="card"><div class="skel">Portfolio analytics need security prices, which are still loading.</div></div>'; return; }
    el.innerHTML = `
      <div class="card"><div class="sectionhead"><h2>Holdings${CL.name ? ' · ' + esc(CL.name) : ''}</h2><span class="note">Target: <b>${CL.model} · ${esc(E.MODELS[CL.model - 1].name)}</b>${CL.munis ? ' with munis' : ''} · <a href="#client" id="rvToClient">change</a></span></div>
        <p class="sub">Household view across accounts. Cost basis is only needed for taxable holdings (used for capital-gains estimates in the rebalance).</p>
        <div class="tblx"><table class="hold"><thead><tr><th>Account</th><th>Security</th><th>Market value ($)</th><th>Cost basis ($)</th><th></th></tr></thead><tbody id="hBody"></tbody></table></div>
        <div class="row section"><button class="ghost" id="hAdd">+ Add holding</button><button class="btn" id="hRun">Analyse portfolio</button><span class="note" id="hMsg"></span></div>
      </div>
      <div id="rvOut"></div>`;
    $('#rvToClient').onclick = e => { e.preventDefault(); show('client'); };
    const body = $('#hBody');
    const rowHtml = (h, i) => `<tr style="cursor:default" data-i="${i}"><td><select class="acct">${Object.entries(ACC).map(([k, a]) => `<option value="${k}" ${k === h.account ? 'selected' : ''}>${a.label}</option>`).join('')}</select></td><td><select class="sec">${secOptions(h.ticker)}</select></td><td><input type="number" class="val" min="0" step="1000" value="${h.value || ''}"></td><td><input type="number" class="bas" min="0" step="1000" value="${h.basis || ''}" ${h.account !== 'taxable' ? 'disabled placeholder="n/a"' : ''}></td><td><button class="ghost mini rm" title="Remove">&times;</button></td></tr>`;
    const paint = () => { body.innerHTML = CL.holdings.length ? CL.holdings.map(rowHtml).join('') : '<tr><td colspan="5" class="skel">No holdings yet. Add one, or load a sample client on the Client &amp; risk tab.</td></tr>'; wire(); };
    const sync = () => { body.querySelectorAll('tr[data-i]').forEach(tr => { const h = CL.holdings[+tr.dataset.i]; h.account = tr.querySelector('.acct').value; h.ticker = tr.querySelector('.sec').value; h.value = +tr.querySelector('.val').value || 0; h.basis = h.account === 'taxable' ? (+tr.querySelector('.bas').value || 0) : 0; }); store.set('ad-client', CL); A.invalidate(); A.bump(); rendered.review = A.version; };
    function wire() { body.querySelectorAll('select,input').forEach(x => x.onchange = () => { sync(); if (x.classList.contains('acct')) paint(); }); body.querySelectorAll('.rm').forEach(b => b.onclick = () => { CL.holdings.splice(+b.closest('tr').dataset.i, 1); sync(); paint(); }); }
    paint();
    $('#hAdd').onclick = () => { sync(); CL.holdings.push({ account: 'taxable', ticker: 'VTI', value: 0, basis: 0 }); paint(); };
    $('#hRun').onclick = () => { sync(); A.invalidate(); runReview(); A.logEvent('Portfolio review', `${CL.holdings.length} holdings analysed against ${E.MODELS[CL.model - 1].name}`); };
    if (CL.holdings.length) runReview();
  }
  function runReview() {
    const out = $('#rvOut'); const a = A.analyse();
    if (!a) { out.innerHTML = '<div class="card section"><div class="skel">Add holdings with a market value to analyse.</div></div>'; return; }
    const D = A.D, mdl = E.MODELS[CL.model - 1];
    const r = a.risk, sev = { red: a.flags.filter(f => f.level === 'red').length, amber: a.flags.filter(f => f.level === 'amber').length };
    const allocRows = a.alloc.map(x => `<tr style="cursor:default"><td>${esc(D.classes[x.cls].label)}<span class="grp">${esc(D.classes[x.cls].group)}</span></td><td>${usdK(x.value)}</td><td>${x.w.toFixed(1)}%</td><td>${x.t}%</td><td class="${Math.abs(x.diff) >= 5 ? (x.diff > 0 ? 'dn' : 'up') : ''}">${pts(x.diff)}</td><td style="min-width:160px"><div class="bar" title="Current ${x.w.toFixed(1)}% · target ${x.t}%"><i style="width:${Math.min(100, x.w / Math.max(50, ...a.alloc.map(z => Math.max(z.w, z.t))) * 100)}%"></i><b style="left:${Math.min(100, x.t / Math.max(50, ...a.alloc.map(z => Math.max(z.w, z.t))) * 100)}%"></b></div></td></tr>`).join('');
    const det = a.detail.map(d => `<tr style="cursor:default"><td><b>${esc(d.ticker === 'CASH' ? 'Cash' : d.ticker)}</b><span class="grp">${esc(d.name)}</span></td><td>${esc(ACC[d.account].label)}</td><td>${esc(D.classes[d.cls].label)}</td><td>${usd(d.value)}</td><td>${d.w.toFixed(1)}%</td><td>${d.account === 'taxable' && d.basis ? `<span class="${cls(d.value - d.basis)}">${usdK(d.value - d.basis)}</span>` : '<span class="muted">–</span>'}</td><td>${d.vsProxy ? `<span class="${cls(d.vsProxy.fund - d.vsProxy.proxy)}">${pts((d.vsProxy.fund - d.vsProxy.proxy) * 100)} pts/yr</span><span class="grp">vs ${d.vsProxy.proxyT}, ${Math.round(d.vsProxy.months / 12)}y · IR ${num(d.vsProxy.ir)}</span>` : '<span class="muted">–</span>'}</td></tr>`).join('');
    out.innerHTML = `
      <div class="grid g4 section">
        <div class="card kpi"><div class="l">Household assets</div><div class="v">${usdK(a.total)}</div><div class="s">${a.detail.length} holdings · ${new Set(a.detail.map(d => d.account)).size} accounts</div></div>
        <div class="card kpi"><div class="l">Drift from ${esc(mdl.name)}</div><div class="v">${a.drift.toFixed(1)}%</div><div class="s">Share of assets that would need to move</div></div>
        <div class="card kpi"><div class="l">Volatility: current vs model</div><div class="v">${pctu(r.current?.vol)} <span style="font-size:15px;color:var(--ink2)">vs ${pctu(r.target?.vol)}</span></div><div class="s">Beta to S&amp;P 500: ${num(r.beta)}</div></div>
        <div class="card kpi"><div class="l">Review flags</div><div class="v">${a.flags.length}</div><div class="s">${sev.red} high · ${sev.amber} medium</div></div>
      </div>
      <div class="grid g2 section">
        <div class="card"><h2>Allocation vs target</h2><p class="sub">Bar = current weight; black tick = ${esc(mdl.name)} target.</p><div class="tblx"><table><thead><tr><th>Asset class</th><th>Value</th><th>Current</th><th>Target</th><th>Gap (pts)</th><th></th></tr></thead><tbody>${allocRows}</tbody></table></div>
          <div class="kv section" style="display:flex;gap:18px;flex-wrap:wrap">${a.groups.map(g => `<div><span class="muted">${g.g}</span><br><b>${g.w.toFixed(0)}%</b> <span class="muted">vs ${g.t}%</span></div>`).join('')}</div></div>
        <div class="card"><h2>Review flags</h2><p class="sub">What the advisor should raise with the client, most important first.</p>${a.flags.length ? a.flags.map(f => `<div class="flag">${icon(f.level)}<div><b>${esc(f.area)}</b> · ${esc(f.text)}<br><span class="note">${esc(f.fix)}</span></div></div>`).join('') : `<div class="flag">${icon('green')}<div>No issues found: the portfolio is in line with the model.</div></div>`}</div>
      </div>
      <div class="grid g2 section">
        <div class="card"><h2>Risk: current portfolio vs model</h2><p class="sub">Monthly back-test of today's holdings, ${mstr(r.from)} – ${mstr(r.to)}. Holdings with shorter histories use their asset-class proxy before launch.</p>
          <div class="tblx"><table><thead><tr><th>Measure</th><th>Current</th><th>${esc(mdl.name)}</th></tr></thead><tbody>
          <tr style="cursor:default"><td>Annual return</td><td>${pctu(r.current?.cagr)}</td><td>${pctu(r.target?.cagr)}</td></tr>
          <tr style="cursor:default"><td>Volatility</td><td>${pctu(r.current?.vol)}</td><td>${pctu(r.target?.vol)}</td></tr>
          <tr style="cursor:default"><td>Maximum drawdown</td><td class="dn">${pct(r.current?.mdd)}</td><td class="dn">${pct(r.target?.mdd)}</td></tr>
          <tr style="cursor:default"><td>Worst 12 months</td><td class="dn">${pct(r.current?.worst12)}</td><td class="dn">${pct(r.target?.worst12)}</td></tr>
          <tr style="cursor:default"><td>Sharpe ratio</td><td>${num(r.current?.sharpe)}</td><td>${num(r.target?.sharpe)}</td></tr></tbody></table></div></div>
        <div class="card"><h2>Stress tests</h2><p class="sub">How today's portfolio and the model would have fared in past market shocks, in dollars at today's value.</p>
          <div class="tblx"><table><thead><tr><th>Scenario</th><th>Current</th><th>Model</th><th>Current ($)</th></tr></thead><tbody>${a.scenarios.map(s => `<tr style="cursor:default"><td>${esc(s.name)}<span class="grp">${mstr(E.shiftMonth(s.from, 1))} – ${mstr(s.to)}</span></td><td class="${cls(s.current)}">${pct(s.current)}</td><td class="${cls(s.target)}">${pct(s.target)}</td><td class="${cls(s.dollars)}">${usdK(s.dollars)}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
      <div class="card section"><h2>Holdings detail</h2><p class="sub">Actively managed funds are checked against their asset-class benchmark over the last 5 years (excess return per year and information ratio).</p><div class="tblx"><table><thead><tr><th>Holding</th><th>Account</th><th>Asset class</th><th>Value</th><th>Weight</th><th>Unrealized gain</th><th>Active fund vs benchmark</th></tr></thead><tbody>${det}</tbody></table></div>
        <div class="row section"><button class="btn" id="goRebal">Build rebalance proposal &rarr;</button><button class="ghost" id="goPlan">Run goal plan &rarr;</button></div></div>`;
    $('#goRebal').onclick = () => show('rebal'); $('#goPlan').onclick = () => show('plan');
  }

  // ================= REBALANCE =================
  let RBopts = store.get('ad-rbopts', { band: 0, trim: true });
  A.rebal = () => { if (!A.reb && A.analyse()) A.reb = E.rebalance(A.D, CL, CL.holdings, { band: RBopts.band, trimConcentration: RBopts.trim }); return A.reb; };
  function renderRebal() {
    const el = $('#t-rebal');
    if (!A.hasPrices()) { el.innerHTML = '<div class="card"><div class="skel">Needs security prices, which are still loading.</div></div>'; return; }
    const a = A.analyse();
    if (!a) { el.innerHTML = '<div class="card"><div class="skel">Enter holdings on the Portfolio review tab first.</div></div>'; return; }
    const rb = A.rebal(), D = A.D, mdl = E.MODELS[CL.model - 1];
    const byAcct = Object.keys(ACC).filter(k => rb.trades.some(t => t.account === k));
    const tradeRows = byAcct.map(k => `<tr style="cursor:default"><td colspan="6"><b>${ACC[k].label}</b> <span class="muted">${ACC[k].deferred ? (k === 'roth' ? '· tax-free, no tax on trades' : '· tax-deferred, no tax on trades') : '· taxable: gains are realized'}</span></td></tr>` + rb.trades.filter(t => t.account === k).map(t => `<tr style="cursor:default"><td style="padding-left:18px"><span class="tag" style="${t.side === 'Sell' ? 'border-color:var(--crit)' : 'border-color:var(--good)'}">${t.side}</span> <b>${esc(t.ticker === 'CASH' ? 'Cash' : t.ticker)}</b><span class="grp">${esc(t.ticker === 'CASH' ? 'Bank deposit' : D.securities[t.ticker]?.name || '')}${t.note ? ' · ' + esc(t.note) : ''}</span></td><td>${esc(D.classes[t.cls].label)}</td><td>${usd(t.amount)}</td><td>${t.gain ? `<span class="${cls(t.gain)}">${usd(t.gain)}</span>${t.harvest ? '<span class="grp">loss harvested</span>' : ''}` : '<span class="muted">–</span>'}</td><td>${t.tax ? usd(t.tax) : '<span class="muted">–</span>'}</td></tr>`).join('')).join('');
    const after = E.CLASS_ORDER.filter(c => a.alloc.find(x => x.cls === c) || rb.after[c]).map(c => { const cur = a.alloc.find(x => x.cls === c); return `<tr style="cursor:default"><td>${esc(D.classes[c].label)}</td><td>${(cur?.w || 0).toFixed(1)}%</td><td><b>${(rb.after[c] || 0).toFixed(1)}%</b></td><td>${a.target[c] || 0}%</td></tr>`; }).join('');
    const harvest = rb.trades.some(t => t.harvest);
    el.innerHTML = `
      <div class="card"><div class="sectionhead"><h2>Tax-aware rebalance proposal</h2><span class="note">Towards ${esc(mdl.name)} · long-term capital gains rate ${(CL.ltcg * 100).toFixed(0)}% (from the ${CL.bracket}% bracket)</span></div>
        <p class="sub">Trades stay inside each account, because money can't move between accounts without tax or contribution limits. Retirement accounts are rebalanced first (no tax); in the taxable account, losses are harvested first, then the lowest-gain positions are sold. New money is placed by tax efficiency: bonds and REITs into the IRA/401(k), growth assets into the Roth and taxable account.</p>
        <div class="row"><label class="f">Tolerance band<select id="rbBand">${[[0, 'Rebalance fully to target'], [3, 'Only classes off by 3+ pts'], [5, 'Only classes off by 5+ pts']].map(([v, l]) => `<option value="${v}" ${RBopts.band === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="rbTrim" ${RBopts.trim ? 'checked' : ''}> Reduce concentrated stock positions first, even if the gain is higher</label></div></div>
      <div class="grid g4 section">
        <div class="card kpi"><div class="l">Turnover (sells)</div><div class="v">${usdK(rb.turnover)}</div><div class="s">${(rb.turnover / a.total * 100).toFixed(1)}% of assets · ${rb.trades.length} trades</div></div>
        <div class="card kpi"><div class="l">Realized gains</div><div class="v">${usdK(rb.realizedGain)}</div><div class="s">Taxable account only</div></div>
        <div class="card kpi"><div class="l">Estimated tax</div><div class="v">${usdK(rb.tax)}</div><div class="s">${(rb.tax / a.total * 100).toFixed(2)}% of assets · federal only</div></div>
        <div class="card kpi"><div class="l">Drift after trades</div><div class="v">${rb.residualDrift.toFixed(1)}%</div><div class="s">from ${a.drift.toFixed(1)}% today</div></div>
      </div>
      <div class="grid g2 section">
        <div class="card" style="grid-column:span 2"><h2>Proposed trades</h2>${rb.trades.length ? `<div class="tblx"><table><thead><tr><th>Trade</th><th>Asset class</th><th>Amount</th><th>Gain / (loss) realized</th><th>Est. tax</th></tr></thead><tbody>${tradeRows}</tbody></table></div>` : '<div class="skel">No trades needed within the tolerance band.</div>'}
          ${harvest ? '<p class="note section">Wash-sale rule: after harvesting a loss, do not buy back the same or a substantially identical security within 30 days. The proposal buys a different fund for the same asset class.</p>' : ''}
          <p class="note">Tax estimates assume all lots are held over one year and ignore state tax and the 3.8% net investment income tax. Confirm lot-level details before trading.</p></div>
        <div class="card"><h2>Allocation before and after</h2><div class="tblx"><table><thead><tr><th>Asset class</th><th>Today</th><th>After</th><th>Target</th></tr></thead><tbody>${after}</tbody></table></div></div>
        <div class="card"><h2>What the client gets</h2><ul class="tp">
          <li>Risk brought back in line with the <b>${esc(mdl.name)}</b> profile (volatility ${pctu(a.risk.current?.vol)} today vs ${pctu(a.risk.target?.vol)} for the model).</li>
          ${a.flags.some(f => f.area === 'Concentration') ? '<li>Lower single-stock risk: one company\'s bad news no longer dominates the outcome.</li>' : ''}
          ${a.flags.some(f => f.area === 'Diversification') ? '<li>International diversification restored.</li>' : ''}
          ${a.flags.some(f => f.area === 'Cash drag') ? '<li>Idle cash put to work according to the plan.</li>' : ''}
          ${a.flags.some(f => f.area === 'Asset location') ? '<li>Better asset location, which lowers the annual tax bill on income.</li>' : ''}
          <li>Estimated one-off tax cost of ${usd(rb.tax)}${rb.harvested ? `, partly offset by ${usd(rb.harvested)} of harvested losses` : ''}.</li></ul>
          <button class="btn section" id="goPlan2">Check the goal plan with this allocation &rarr;</button></div>
      </div>`;
    $('#rbBand').onchange = e => { RBopts.band = +e.target.value; store.set('ad-rbopts', RBopts); A.reb = null; A.plan = null; renderRebal(); };
    $('#rbTrim').onchange = e => { RBopts.trim = e.target.checked; store.set('ad-rbopts', RBopts); A.reb = null; A.plan = null; renderRebal(); };
    $('#goPlan2').onclick = () => show('plan');
  }

  // boot: part 2 (advisor2.js) calls A.boot() once its tabs are registered
  derive();
  let booted = false;
  A.boot = () => { if (booted) return; booted = true; load(); };
  window.addEventListener('load', () => setTimeout(A.boot, 0));
})();
