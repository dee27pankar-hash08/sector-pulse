// Sector Pulse: role-aligned desk features.
// Adds Monitoring (watchlist surveillance), Controls (data-quality QA + escalation log),
// Role map, a fund-document review checklist and a printable management report.
(function () {
  const RF = 6.5;
  const D = {
    esc: () => store.get('esc-log', []),
    saveEsc: v => store.set('esc-log', v),
    watch: () => store.get('watchlist2', null),
    saveWatch: v => store.set('watchlist2', v)
  };
  const STATUS = { pass: ['green', '✓', 'Pass'], warn: ['amber', '!', 'Warning'], fail: ['red', '✕', 'Fail'], green: ['green', '✓', 'Pass'], amber: ['amber', '!', 'Caution'], red: ['red', '✕', 'Fail'] };
  const badge = s => { const b = STATUS[s] || STATUS.warn; return `<span style="display:inline-flex;align-items:center;gap:6px"><span class="ic ${b[0]}" style="width:18px;height:18px;font-size:11px">${b[1]}</span>${b[2]}</span>`; };
  const icon = s => { const b = STATUS[s] || STATUS.warn; return `<span class="ic ${b[0]}" style="width:18px;height:18px;font-size:11px;vertical-align:-4px;margin-right:6px">${b[1]}</span>`; };
  const verdictRank = v => v === 'Retain' ? 0 : v === 'Watchlist' ? 1 : 2;
  const today = () => new Date().toISOString().slice(0, 10);
  const csv = rows => rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };

  function addEscalation(item) {
    const log = D.esc();
    log.unshift(Object.assign({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 6), date: today(), status: 'Open', owner: 'Analyst', severity: 'Medium' }, item));
    D.saveEsc(log);
    renderEscLog();
  }

  // ---------- add tabs ----------
  const css2 = document.createElement('style');
  css2.textContent = `.mini{font-size:12px;padding:4px 8px}.kv{display:flex;gap:16px;flex-wrap:wrap}.chip{display:inline-block;padding:2px 8px;border-radius:99px;border:1px solid var(--border);font-size:12px;color:var(--ink2)}
  #repOv{position:fixed;inset:0;z-index:50;background:#fff;color:#0b0b0b;overflow:auto}
  #repOv .rep-bar{position:sticky;top:0;display:flex;gap:8px;align-items:center;padding:10px 20px;background:#f9f9f7;border-bottom:1px solid #e1e0d9}
  #repOv .rep{font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;max-width:900px;margin:20px auto;padding:0 20px}#repOv h1{font-size:20px;margin:0}#repOv h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #e1e0d9;padding-bottom:4px}#repOv table{width:100%;border-collapse:collapse}#repOv th,#repOv td{padding:4px 6px;border-bottom:1px solid #eee;text-align:right;color:#0b0b0b;background:#fff;white-space:normal}#repOv th:first-child,#repOv td:first-child{text-align:left}#repOv .kv{display:flex;gap:24px;flex-wrap:wrap}#repOv .kv div b{display:block;font-size:16px}#repOv .muted{color:#52514e}#repOv .ghost{color:#0b0b0b;border-color:#c3c2b7}
  @media print{body.rep-open>*:not(#repOv){display:none!important}#repOv{position:static;overflow:visible}.noprint{display:none!important}}`;
  document.head.appendChild(css2);
  const nav = $('#nav'), method = nav.querySelector('[data-t="method"]');
  const main = document.querySelector('main');
  const newTabs = [
    { t: 'monitor', label: 'Monitoring' },
    { t: 'controls', label: 'Controls' },
    { t: 'role', label: 'Role map' }
  ];
  newTabs.forEach(nt => {
    const b = document.createElement('button'); b.dataset.t = nt.t; b.textContent = nt.label; nav.insertBefore(b, method);
    const sec = document.createElement('section'); sec.className = 'tab'; sec.id = 't-' + nt.t; main.insertBefore(sec, $('#t-method'));
  });
  const repBtn = document.createElement('button'); repBtn.textContent = 'Management report ⤓'; repBtn.style.marginLeft = 'auto'; repBtn.title = 'One-page summary to print or save as PDF'; nav.appendChild(repBtn);
  repBtn.onclick = managementReport;
  nav.querySelectorAll('button[data-t]').forEach(b => {
    if (!newTabs.find(n => n.t === b.dataset.t)) return;
    b.onclick = () => {
      nav.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 't-' + b.dataset.t));
      if (b.dataset.t === 'monitor') initMonitor();
      if (b.dataset.t === 'controls') initControls();
      redrawAll();
    };
  });

  // ================= MONITORING =================
  const DEFAULT_WATCH = ['parag parikh flexi cap', 'hdfc mid cap', 'nippon india small cap', 'icici prudential large cap', 'kotak flexicap', 'axis small cap'];
  // Match a scheme by keywords; avoid 'Large & Mid' funds unless the query asks for them.
  const matchScheme = q => { const t = q.split(' '); const c = SCH.filter(s => t.every(x => s.lc.includes(x))); return c.find(s => q.includes('mid') || (!/&/.test(s.name) && !/mid/i.test(s.name))) || c[0]; };
  let monInit = false, monData = [];
  $('#t-monitor').innerHTML = `
    <div class="card">
      <h2>Fund monitoring &amp; surveillance</h2>
      <p class="sub">Ongoing monitoring of approved funds. Each run re-screens every fund on the watchlist, compares the verdict with the previous run and raises alerts when a fund deteriorates. Alerts can be escalated to the Controls log.</p>
      <div class="row">
        <label class="f" style="flex:1;min-width:260px">Add a fund to the watchlist<input id="mAdd" list="mList" placeholder="Type a scheme name…"></label>
        <datalist id="mList"></datalist>
        <button class="ghost" id="mAddBtn">Add</button>
        <button class="btn" id="mRun">Run monitoring</button>
        <button class="ghost" id="mCsv">Export CSV</button>
      </div>
      <p class="note" id="mStatus" style="margin:8px 0 0">Loading scheme list…</p>
    </div>
    <div class="grid g4 section" id="mKpis"></div>
    <div class="card section" id="mAlertsCard" style="display:none"><h2>Surveillance alerts</h2><p class="sub">Funds that deteriorated since the last run or carry a failed check.</p><div id="mAlerts"></div></div>
    <div class="card section"><h2>Watchlist</h2><div class="tblx"><table id="mTable"><thead><tr><th>Fund</th><th>Verdict</th><th>Change</th><th>1Y fund / bench</th><th>3Y CAGR fund / bench</th><th>Info ratio</th><th>Down capture</th><th>Rolling beat rate</th><th>Flags</th><th></th></tr></thead><tbody><tr><td colspan="10" class="skel">Add funds, then run monitoring.</td></tr></tbody></table></div></div>`;

  async function initMonitor() {
    if (monInit) return; monInit = true;
    await loadSchemes();
    const wait = async () => { for (let i = 0; i < 60 && !SCH; i++) await new Promise(r => setTimeout(r, 250)); };
    await wait();
    if (!SCH) { $('#mStatus').innerHTML = '<span class="err">Scheme list unavailable. Refresh to retry.</span>'; monInit = false; return; }
    $('#mList').innerHTML = SCH.map(s => `<option value="${esc(s.name)}">`).join('');
    let w = D.watch();
    if (!w) { w = DEFAULT_WATCH.map(matchScheme).filter(Boolean).map(s => ({ code: s.code, name: s.name })); D.saveWatch(w); }
    monData = monData.filter(m => w.some(x => x.code === m.code));
    $('#mStatus').textContent = `${w.length} funds on the watchlist. Last run: ${monData.length ? store.get('mon-last-run', 'never') : 'never'}.`;
    renderMonTable(); renderMonKpis();
    $('#mAddBtn').onclick = () => {
      const s = SCH.find(x => x.name === $('#mAdd').value.trim()); if (!s) { $('#mStatus').textContent = 'Pick a scheme from the suggestions.'; return; }
      const list = D.watch() || []; if (!list.find(x => x.code === s.code)) list.push({ code: s.code, name: s.name }); D.saveWatch(list); $('#mAdd').value = ''; renderMonTable();
      $('#mStatus').textContent = `${list.length} funds on the watchlist. Run monitoring to screen the new fund.`;
    };
    $('#mRun').onclick = runMonitor;
    $('#mCsv').onclick = () => download(`watchlist-${today()}.csv`, csv([['Fund', 'Verdict', 'Previous verdict', '1Y fund', '1Y bench', '3Y CAGR fund', '3Y CAGR bench', 'Info ratio', 'Down capture', 'Rolling beat rate', 'Red flags', 'Amber flags']].concat(monData.map(m => [m.name, m.verdict, m.prev || '', m.t1f, m.t1b, m.t3f, m.t3b, m.ir, m.down, m.beat, m.reds, m.ambers]))));
  }

  function renderMonTable() {
    const list = D.watch() || [];
    const rows = list.map(w => { const m = monData.find(x => x.code === w.code); return { w, m }; });
    $('#mTable tbody').innerHTML = rows.length ? rows.map(({ w, m }) => `<tr style="cursor:default">
      <td style="min-width:240px"><a href="?fund=${w.code}#dd" title="Open full due diligence">${esc(w.name.replace(/ - Direct Plan.*$/i, ''))}</a>${m ? `<span class="grp">${esc(m.category)} · vs ${esc(m.bench)}</span>` : ''}</td>
      <td>${m ? (m.error ? '<span class="err">Error</span>' : icon(m.verdict === 'Retain' ? 'green' : m.verdict === 'Watchlist' ? 'amber' : 'red') + esc(m.verdict)) : '<span class="muted">Not run</span>'}</td>
      <td>${m && m.prev ? (m.prev === m.verdict ? '<span class="muted">No change</span>' : `${esc(m.prev)} → <b>${esc(m.verdict)}</b>`) : '<span class="muted">–</span>'}</td>
      <td>${m ? `${pct(m.t1f)} / ${pct(m.t1b)}` : ''}</td><td>${m ? `${pct(m.t3f)} / ${pct(m.t3b)}` : ''}</td>
      <td>${m ? num(m.ir) : ''}</td><td>${m ? pctu(m.down, 0) : ''}</td><td>${m ? pctu(m.beat, 0) : ''}</td>
      <td>${m && !m.error ? `<span class="chip">${m.reds} fail</span> <span class="chip">${m.ambers} caution</span>` : ''}</td>
      <td><button class="ghost mini" data-rm="${w.code}">Remove</button></td></tr>`).join('') : '<tr><td colspan="10" class="skel">Watchlist is empty. Add a fund above.</td></tr>';
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { D.saveWatch((D.watch() || []).filter(x => x.code !== b.dataset.rm)); monData = monData.filter(x => x.code !== b.dataset.rm); renderMonTable(); renderMonKpis(); });
  }

  async function runMonitor() {
    const list = D.watch() || []; if (!list.length) return;
    const prevMap = store.get('mon-last', {});
    $('#mRun').disabled = true; let done = 0;
    $('#mStatus').textContent = `Screening ${list.length} funds…`;
    const out = new Array(list.length); let i = 0;
    const worker = async () => { while (i < list.length) { const k = i++; const w = list[k];
      try {
        const d = await getJSON(`/api/fund?code=${w.code}&rf=${RF}`);
        out[k] = { code: w.code, name: d.fund.name, category: d.fund.category.replace(/^.*Scheme - /, ''), bench: d.benchmark.label, verdict: d.verdict, prev: prevMap[w.code] || null,
          t1f: d.trailing[0].fund, t1b: d.trailing[0].bench, t3f: d.trailing[1].fund, t3b: d.trailing[1].bench, ir: d.risk.infoRatio, down: d.risk.downCapture,
          beat: d.rollStats ? d.rollStats.beatRate : null, reds: d.flags.filter(f => f.level === 'red').length, ambers: d.flags.filter(f => f.level === 'amber').length,
          flags: d.flags.filter(f => f.level !== 'green') };
      } catch (e) { out[k] = { code: w.code, name: w.name, error: e.message, verdict: '-', category: '', bench: '' }; }
      done++; $('#mStatus').textContent = `Screening… ${done}/${list.length}`; } };
    await Promise.all([worker(), worker(), worker()]);
    monData = out.filter(Boolean);
    const newMap = {}; monData.forEach(m => { if (!m.error) newMap[m.code] = m.verdict; });
    store.set('mon-last', newMap); store.set('mon-last-run', new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })); store.set('mon-results', monData);
    $('#mRun').disabled = false;
    $('#mStatus').textContent = `Run complete: ${monData.length} funds screened at ${store.get('mon-last-run')}. Verdicts are compared with the previous run.`;
    renderMonTable(); renderMonKpis();
  }

  function renderMonKpis() {
    const ok = monData.filter(m => !m.error);
    if (!ok.length) { $('#mKpis').innerHTML = ''; $('#mAlertsCard').style.display = 'none'; return; }
    const c = v => ok.filter(m => m.verdict === v).length;
    const worsened = ok.filter(m => m.prev && verdictRank(m.verdict) > verdictRank(m.prev));
    $('#mKpis').innerHTML = `
      <div class="card kpi"><div class="l">Funds screened</div><div class="v">${ok.length}</div><div class="s">Benchmark-relative, last 3 years</div></div>
      <div class="card kpi"><div class="l">${icon('green')}Retain</div><div class="v">${c('Retain')}</div></div>
      <div class="card kpi"><div class="l">${icon('amber')}Watchlist</div><div class="v">${c('Watchlist')}</div></div>
      <div class="card kpi"><div class="l">${icon('red')}Review for replacement</div><div class="v">${c('Review for replacement')}</div><div class="s">${worsened.length} deteriorated since last run</div></div>`;
    const alerts = ok.filter(m => m.reds > 0 || (m.prev && verdictRank(m.verdict) > verdictRank(m.prev)));
    $('#mAlertsCard').style.display = alerts.length ? 'block' : 'none';
    $('#mAlerts').innerHTML = alerts.map((m, i) => `<div class="flag"><span class="ic ${m.reds ? 'red' : 'amber'}">${m.reds ? '✕' : '!'}</span><div style="flex:1"><b>${esc(m.name.replace(/ - Direct Plan.*$/i, ''))}</b> <span class="muted">· ${esc(m.verdict)}${m.prev && m.prev !== m.verdict ? ` (was ${esc(m.prev)})` : ''}</span><br>${m.flags.map(f => esc(f.area + ': ' + f.text)).join('<br>')}</div><button class="ghost mini" data-escm="${i}">Escalate</button></div>`).join('');
    document.querySelectorAll('[data-escm]').forEach(b => b.onclick = () => { const m = alerts[+b.dataset.escm]; addEscalation({ source: 'Monitoring', item: m.name, issue: `Verdict ${m.verdict}${m.prev && m.prev !== m.verdict ? ' (was ' + m.prev + ')' : ''}. ` + m.flags.map(f => f.area + ': ' + f.text).join(' '), severity: m.reds ? 'High' : 'Medium' }); b.textContent = 'Escalated ✓'; b.disabled = true; });
  }
  monData = store.get('mon-results', []);

  // ================= CONTROLS =================
  let ctlInit = false, CTL = null, onlyEx = true;
  $('#t-controls').innerHTML = `
    <div class="card">
      <h2>First-line controls: data-quality testing</h2>
      <p class="sub">Every series the app uses is tested on each run for availability, timeliness, completeness, accuracy (abnormal moves), corporate-action handling, history length and proxy selection. Exceptions can be escalated with an owner and tracked to resolution, the same surveillance → escalate → corrective-action loop a first-line risk team runs.</p>
      <div class="row"><button class="btn" id="cRun">Run control tests</button><label class="f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="cOnly" checked> Show exceptions only</label><button class="ghost" id="cCsv">Export results CSV</button></div>
      <p class="note" id="cStatus" style="margin:8px 0 0">Not run yet.</p>
    </div>
    <div class="grid g4 section" id="cKpis"></div>
    <div class="card section"><h2>Test results</h2><div class="tblx"><table id="cTable"><thead><tr><th>Series</th><th>Control</th><th>Result</th><th>Evidence</th><th>Corrective action</th><th></th></tr></thead><tbody><tr><td colspan="6" class="skel">Run the control tests.</td></tr></tbody></table></div></div>
    <div class="card section">
      <h2>Escalation &amp; issue log</h2>
      <p class="sub">Issues raised from control tests, monitoring alerts or manual review. Each has a severity, an owner and a status. Saved in this browser.</p>
      <div class="row">
        <label class="f" style="flex:1;min-width:200px">Item<input id="eItem" placeholder="e.g. Nifty Metal proxy"></label>
        <label class="f" style="flex:2;min-width:240px">Issue<input id="eIssue" placeholder="Describe the issue and evidence"></label>
        <label class="f">Severity<select id="eSev"><option>High</option><option selected>Medium</option><option>Low</option></select></label>
        <label class="f">Owner<input id="eOwner" value="Analyst" style="width:120px"></label>
        <button class="ghost" id="eAdd">Log issue</button><button class="ghost" id="eCsv">Export log CSV</button>
      </div>
      <div class="tblx section"><table id="eTable"><thead><tr><th>Date</th><th>Source</th><th>Item</th><th>Issue</th><th>Severity</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody></tbody></table></div>
    </div>`;

  function initControls() { if (ctlInit) return; ctlInit = true; renderEscLog(); runControls(); }
  async function runControls() {
    $('#cStatus').textContent = 'Running control tests on every data series… (about 10–20 seconds)';
    $('#cRun').disabled = true;
    try {
      CTL = await getJSON('/api/controls');
      const s = CTL.summary;
      $('#cKpis').innerHTML = `
        <div class="card kpi"><div class="l">Tests run</div><div class="v">${s.total}</div><div class="s">${new Date(CTL.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</div></div>
        <div class="card kpi"><div class="l">${badge('pass')}</div><div class="v">${s.pass}</div><div class="s">${(s.pass / s.total * 100).toFixed(0)}% of tests</div></div>
        <div class="card kpi"><div class="l">${badge('warn')}</div><div class="v">${s.warn}</div><div class="s">Review required</div></div>
        <div class="card kpi"><div class="l">${badge('fail')}</div><div class="v">${s.fail}</div><div class="s">${s.fail ? 'Escalate' : 'None'}</div></div>`;
      $('#cStatus').textContent = `Latest NAV in the universe: ${dstr(CTL.latestNav)}. Turnaround standard: NAVs no more than 1 business day old; exceptions flagged automatically.`;
      renderCtlTable();
    } catch (e) { $('#cStatus').innerHTML = `<span class="err">Control run failed: ${esc(e.message)}</span>`; }
    $('#cRun').disabled = false;
  }
  function renderCtlTable() {
    if (!CTL) return;
    const rows = CTL.checks.filter(c => !onlyEx || c.status !== 'pass');
    $('#cTable tbody').innerHTML = rows.length ? rows.map((c, i) => `<tr style="cursor:default"><td>${esc(c.series)}<span class="grp">${esc(c.proxy)}</span></td><td>${esc(c.control)}</td><td>${badge(c.status)}</td><td style="white-space:normal;min-width:220px">${esc(c.evidence)}</td><td style="white-space:normal;min-width:200px">${esc(c.action)}</td><td>${c.status !== 'pass' ? `<button class="ghost mini" data-escc="${i}">Escalate</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="6" class="skel">${badge('pass')} No exceptions: all ${CTL.summary.total} tests passed.</td></tr>`;
    document.querySelectorAll('[data-escc]').forEach(b => b.onclick = () => { const c = rows[+b.dataset.escc]; addEscalation({ source: 'Control test', item: `${c.series} (${c.control})`, issue: `${c.evidence}. Action: ${c.action}`, severity: c.status === 'fail' ? 'High' : 'Medium', owner: 'Data owner' }); b.textContent = 'Escalated ✓'; b.disabled = true; });
  }
  $('#cRun').onclick = runControls;
  $('#cOnly').onchange = e => { onlyEx = e.target.checked; renderCtlTable(); };
  $('#cCsv').onclick = () => CTL && download(`control-tests-${today()}.csv`, csv([['Series', 'Proxy', 'Control', 'Result', 'Evidence', 'Corrective action']].concat(CTL.checks.map(c => [c.series, c.proxy, c.control, c.status, c.evidence, c.action]))));
  $('#eAdd').onclick = () => { if (!$('#eItem').value.trim() || !$('#eIssue').value.trim()) return; addEscalation({ source: 'Manual', item: $('#eItem').value.trim(), issue: $('#eIssue').value.trim(), severity: $('#eSev').value, owner: $('#eOwner').value || 'Analyst' }); $('#eItem').value = ''; $('#eIssue').value = ''; };
  $('#eCsv').onclick = () => download(`escalation-log-${today()}.csv`, csv([['Date', 'Source', 'Item', 'Issue', 'Severity', 'Owner', 'Status']].concat(D.esc().map(e => [e.date, e.source, e.item, e.issue, e.severity, e.owner, e.status]))));
  function renderEscLog() {
    const log = D.esc();
    const tb = $('#eTable tbody'); if (!tb) return;
    tb.innerHTML = log.length ? log.map(e => `<tr style="cursor:default"><td>${esc(e.date)}</td><td>${esc(e.source)}</td><td style="white-space:normal">${esc(e.item)}</td><td style="white-space:normal;min-width:260px">${esc(e.issue)}</td><td>${badge(e.severity === 'High' ? 'red' : e.severity === 'Medium' ? 'amber' : 'green').replace(/Fail|Caution|Pass/, esc(e.severity))}</td><td>${esc(e.owner)}</td><td><button class="ghost mini" data-tog="${e.id}">${e.status === 'Open' ? 'Open → Resolve' : 'Resolved ✓'}</button></td><td><button class="ghost mini" data-del="${e.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="8" class="skel">No issues logged.</td></tr>';
    tb.querySelectorAll('[data-tog]').forEach(b => b.onclick = () => { const l = D.esc(); const x = l.find(e => e.id === b.dataset.tog); if (x) x.status = x.status === 'Open' ? 'Resolved' : 'Open'; D.saveEsc(l); renderEscLog(); });
    tb.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { D.saveEsc(D.esc().filter(e => e.id !== b.dataset.del)); renderEscLog(); });
  }

  // ================= ROLE MAP =================
  const ROLE = [
    ['Evaluate and monitor investment managers, strategies and products: people, process, operations, performance', 'Fund Due Diligence + Monitoring', 'Quantitative screen (rolling returns, information ratio, capture ratios, closet-indexing test), 4 Ps and operational due-diligence checklist, watchlist re-screening'],
    ['Research industries, sectors and companies; themes, trends and ideas; timely analysis of market developments', 'Market Pulse + Sector brief assistant + US & Macro', 'Daily sector scorecard, relative strength, breadth, risk appetite, auto-drafted sector views, US/FX/rates context'],
    ['Partner with research, strategy and investment teams on diligence, monitoring and thought leadership', 'Sector briefs, fund review memos, monitoring alerts', 'Copy-ready briefs and memos in a standard format others can review'],
    ['Review fund documents, credit and loan files and business records in line with policy', 'Fund document review checklist (in Fund Due Diligence)', 'A structured checklist for offer documents, factsheets, expenses, loads, risk labels and manager changes'],
    ['Prepare clear, data-driven reports, dashboards and presentations for management', 'Dashboards + Management report', 'One-page management report generated from live data, printable or savable as PDF'],
    ['Support first-line risk and control: surveillance, QA testing, audits, regulatory exams; escalate issues', 'Controls tab + Monitoring alerts', 'Automated data-quality tests with evidence, exception view, escalation log with severity, owner and status'],
    ['Contribute to process improvement, documentation, controls, standardisation and automation', 'Methodology + automation throughout', 'Documented methodology, automated split adjustment, standardised flags and verdict rules, CSV exports'],
    ['Collaborate across Operations, Credit, Legal, Risk and Compliance; coordinate onshore and offshore', 'Shareable links + exports', 'Deep links to any fund review, CSV exports and copy-ready memos for hand-offs across time zones'],
    ['Manage requests within turnaround times and quality standards', 'Timeliness controls + as-of dates', 'Every view shows its data date; stale data is flagged by the timeliness control'],
    ['Perform additional analysis and ad-hoc tasks', 'Fund DD with any benchmark and risk-free rate', 'Any of ~1,400 schemes against any of 23 benchmarks in seconds']
  ];
  $('#t-role').innerHTML = `<div class="card"><h2>How Sector Pulse maps to the role</h2><p class="sub">Each responsibility of the Wealth Management Home Office apprenticeship, and where this app demonstrates it.</p>
    <div class="tblx"><table><thead><tr><th>Responsibility</th><th>Where in the app</th><th>What it demonstrates</th></tr></thead><tbody>${ROLE.map(r => `<tr style="cursor:default"><td style="white-space:normal;min-width:260px">${esc(r[0])}</td><td style="white-space:normal;text-align:left;min-width:180px"><b>${esc(r[1])}</b></td><td style="white-space:normal;text-align:left;min-width:260px">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>
    <p class="note section">Known limit: company-level research is not included because free company data cannot be reliably retrieved from a cloud server; sector and fund analysis use official AMFI data instead. Credit and loan file review is outside the scope of public data.</p></div>`;

  // ================= FUND DOCUMENT CHECKLIST (wraps renderDD) =================
  const DOCS = [
    ['Scheme Information Document / KIM', 'Objective, benchmark and asset-allocation limits match how the fund is actually run'],
    ['Latest factsheet', 'Top holdings, sector concentration and market-cap mix consistent with the stated style'],
    ['Expense ratio (TER)', 'Direct-plan TER reasonable versus category peers; check recent changes'],
    ['Exit load', 'Load structure and holding period documented for client suitability'],
    ['Riskometer', 'Risk level appropriate for the target client segment'],
    ['Fund manager changes', 'Addenda and notices checked for manager changes in the last 3 years'],
    ['Portfolio turnover', 'Turnover consistent with the stated process (low for buy-and-hold styles)'],
    ['AUM and inflow restrictions', 'AUM trend reviewed; any limits on fresh inflows noted (capacity signal)'],
    ['Annual report and auditor', 'Audited accounts available; no auditor qualifications'],
    ['Regulatory disclosures', 'No SEBI actions or adverse disclosures against the AMC or scheme']
  ];
  const _renderDD = renderDD;
  renderDD = function (d) {
    _renderDD(d);
    const key = 'docs-' + d.fund.code, st = store.get(key, {});
    const card = document.createElement('div'); card.className = 'card section';
    card.innerHTML = `<h2>Fund document review</h2><p class="sub">Documentation checks performed before approval and at each annual review, in line with due-diligence policy. Ticks and notes are saved in this browser.</p>
      <div class="tblx"><table><thead><tr><th>Document / item</th><th>What to confirm</th><th>Reviewed</th><th>Note</th></tr></thead><tbody>${DOCS.map((r, i) => `<tr style="cursor:default"><td style="white-space:normal">${esc(r[0])}</td><td style="white-space:normal;text-align:left;min-width:260px">${esc(r[1])}</td><td><input type="checkbox" data-doc="${i}" ${st['c' + i] ? 'checked' : ''}></td><td><input data-docn="${i}" value="${esc(st['n' + i] || '')}" placeholder="Note" style="width:180px;padding:4px 8px"></td></tr>`).join('')}</tbody></table></div>
      <p class="note" id="docProg"></p>`;
    $('#ddOut').appendChild(card);
    const save = () => { const o = {}; card.querySelectorAll('[data-doc]').forEach(c => o['c' + c.dataset.doc] = c.checked); card.querySelectorAll('[data-docn]').forEach(c => o['n' + c.dataset.docn] = c.value); store.set(key, o); prog(); };
    const prog = () => { const n = card.querySelectorAll('[data-doc]:checked').length; card.querySelector('#docProg').textContent = `${n} of ${DOCS.length} items reviewed${n === DOCS.length ? ': documentation review complete.' : '.'}`; };
    card.querySelectorAll('[data-doc]').forEach(c => c.onchange = save); card.querySelectorAll('[data-docn]').forEach(c => c.oninput = save); prog();
  };
  // A deep-linked review may have rendered before this script loaded: re-render it once with the checklist.
  (function () {
    let tries = 0, fired = 0;
    const t = setInterval(() => {
      if (++tries > 120) return clearInterval(t);
      const out = document.querySelector('#ddOut');
      if (!out || !out.querySelector('.verdict')) return;
      const hasDocs = [...out.querySelectorAll('h2')].some(h => h.textContent === 'Fund document review');
      if (hasDocs) return clearInterval(t);
      if (fired < 2 && typeof pick !== 'undefined' && pick && tries % 10 === 1) { fired++; analyse(); }
    }, 500);
  })();

  // ================= MANAGEMENT REPORT =================
  async function managementReport() {
    try { if (SECP) await SECP; } catch (e) {}
    if (!SEC) { alertMsg('Market data has not loaded yet.'); return; }
    const B = SEC.benchmark, I = SEC.insights;
    const top = [...SEC.sectors].filter(s => s.rs3m !== null && !s.error).sort((a, b) => b.rs3m - a.rs3m);
    const rowsS = top.map(s => `<tr><td>${esc(s.label)}</td><td>${pct(s.r1m)}</td><td>${pct(s.r3m)}</td><td>${pct(s.r1y)}</td><td>${pct(s.rs3m)}</td><td>${esc(s.trend)}</td></tr>`).join('');
    const mon = store.get('mon-results', []).filter(m => !m.error);
    const esc2 = D.esc().filter(e => e.status === 'Open');
    let ov = $('#repOv'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'repOv';
    ov.innerHTML = `<div class="rep-bar noprint"><b>Management report</b><span style="flex:1"></span><button class="btn" id="repPrint">Print / Save as PDF</button><button class="ghost" id="repClose">Close</button></div><div class="rep">      <h1>Sector Pulse: market &amp; fund monitoring summary</h1><p class="muted">Data as of ${dstr(SEC.asOf)} (AMFI NAVs) · generated ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>
      <h2>Market</h2><div class="kv"><div>Nifty 50 3M<b>${pct(B.r3m)}</b></div><div>Nifty 50 1Y<b>${pct(B.r1y)}</b></div><div>Breadth (above 200-DMA)<b>${I.breadthCount}/${I.breadthTotal}</b></div><div>Risk appetite<b>${I.riskAppetite ? esc(I.riskAppetite.label) : '-'}</b></div></div>
      <p><b>Leaders (3M vs Nifty):</b> ${I.leaders.map(l => `${esc(l.label)} ${pct(l.rs3m)}`).join(', ')}. <b>Laggards:</b> ${I.laggards.map(l => `${esc(l.label)} ${pct(l.rs3m)}`).join(', ')}.</p>
      <h2>Sector scorecard (ranked by 3-month relative strength)</h2><table><thead><tr><th>Sector</th><th>1M</th><th>3M</th><th>1Y</th><th>RS 3M</th><th>Trend</th></tr></thead><tbody>${rowsS}</tbody></table>
      <h2>Fund monitoring</h2>${mon.length ? `<p class="muted">Last run: ${esc(store.get('mon-last-run', ''))}</p><table><thead><tr><th>Fund</th><th>Verdict</th><th>3Y CAGR fund / bench</th><th>Info ratio</th><th>Down capture</th><th>Fails</th></tr></thead><tbody>${mon.map(m => `<tr><td>${esc(m.name.replace(/ - Direct Plan.*$/i, ''))}</td><td>${esc(m.verdict)}</td><td>${pct(m.t3f)} / ${pct(m.t3b)}</td><td>${num(m.ir)}</td><td>${pctu(m.down, 0)}</td><td>${m.reds}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Monitoring has not been run in this browser yet.</p>'}
      <h2>Open escalations</h2>${esc2.length ? `<table><thead><tr><th>Date</th><th>Item</th><th>Issue</th><th>Severity</th><th>Owner</th></tr></thead><tbody>${esc2.map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.item)}</td><td style="text-align:left">${esc(e.issue)}</td><td>${esc(e.severity)}</td><td>${esc(e.owner)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No open issues.</p>'}
      <p class="muted" style="margin-top:20px">Sources: AMFI daily NAVs (sector returns via passive index trackers), US Treasury, ECB. For analysis only; not investment advice.</p></div>`;
    document.body.appendChild(ov); document.body.classList.add('rep-open');
    $('#repClose').onclick = () => { ov.remove(); document.body.classList.remove('rep-open'); };
    $('#repPrint').onclick = () => window.print();
  }
  function alertMsg(t) { $('#asof').insertAdjacentHTML('beforeend', `<br><span class="err">${esc(t)}</span>`); }
})();
