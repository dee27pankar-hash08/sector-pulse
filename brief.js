// Sector Pulse: auto-drafted sector briefs.
// Combines live data (returns, relative strength, trend, risk) with a playbook of the
// standard fundamental drivers, risks and review triggers analysts track for each sector.
// Loaded after the main script; replaces the manual brief builder.

const PLAYBOOK = {
  bank: {
    what: 'large private and public sector banks',
    drivers: ['loan growth running ahead of nominal GDP', 'net interest margins (NIMs) holding up through the rate cycle', 'clean asset quality, with gross NPAs near multi-year lows', 'steady deposit growth funding the loan book'],
    risks: ['NIM compression as RBI rate cuts reprice loans faster than deposits', 'stress in unsecured retail and microfinance loans', 'deposit competition pushing up funding costs'],
    triggers: ['NIMs fall for two straight quarters', 'credit costs or slippages start rising', 'deposit growth lags loan growth for several quarters'],
    followups: ['How do RBI rate cuts affect bank margins?', 'Private banks or PSU banks, and why?']
  },
  fin: {
    what: 'banks, NBFCs, insurers and capital-market companies',
    drivers: ['credit growth across banks and NBFCs', 'rising financialisation of household savings (SIPs, insurance, demat accounts)', 'stable asset quality across lenders'],
    risks: ['regulatory tightening on unsecured lending', 'funding-cost pressure for NBFCs', 'a market correction hurting capital-market earnings'],
    triggers: ['RBI raises risk weights or tightens lending norms', 'asset-quality slippages rise across lenders'],
    followups: ['What is financialisation of savings and why does it matter?', 'How are NBFCs different from banks?']
  },
  finxb: {
    what: 'NBFCs, insurers, AMCs, exchanges and brokers (banks excluded)',
    drivers: ['growth in SIP flows and mutual fund AUM', 'low insurance penetration with room to grow', 'NBFC credit growth in retail and MSME segments'],
    risks: ['regulatory changes on fees, commissions or F&O trading', 'NBFC funding costs and asset-quality cycles', 'earnings tied closely to market activity'],
    triggers: ['monthly SIP flows start declining', 'SEBI or IRDAI cut fee or commission structures'],
    followups: ['Why might an AMC or exchange stock be called a "toll on the market"?', 'What drives insurance company valuations?']
  },
  psubank: {
    what: 'government-owned banks such as SBI, Bank of Baroda, PNB and Canara Bank',
    drivers: ['much stronger balance sheets after the NPA clean-up of FY16–FY20', 'healthy return on assets compared with history', 'valuations at a discount to private banks (lower price-to-book)', 'higher dividend payouts to the government'],
    risks: ['NIM pressure in a falling-rate cycle', 'government ownership: policy-directed lending and stake sales', 'high beta, so they fall harder when markets correct'],
    triggers: ['gross NPAs or slippages start rising again', 'NIMs compress for two quarters', 'the government announces large stake sales (supply overhang)'],
    followups: ['Why have PSU banks re-rated over the last few years?', 'What is price-to-book and why is it used for banks?']
  },
  capmkt: {
    what: 'exchanges, depositories, brokers, AMCs and registrars',
    drivers: ['record retail participation and demat account growth', 'rising SIP flows and mutual fund AUM', 'strong trading volumes and new listings (IPOs)'],
    risks: ['SEBI curbs on derivatives trading reducing volumes', 'earnings fall sharply in a market downturn', 'fee and pricing pressure from competition'],
    triggers: ['exchange volumes fall for several months', 'new demat account additions slow sharply'],
    followups: ['How do SEBI F&O rules affect brokers?', 'Why are AMC earnings tied to markets?']
  },
  it: {
    what: 'IT services exporters such as TCS, Infosys, HCLTech and Wipro',
    drivers: ['deal wins and order books from US and European clients', 'a weaker rupee lifting reported earnings', 'demand for cloud, data and AI-related services'],
    risks: ['clients cutting discretionary tech spending in a US slowdown', 'AI automating parts of traditional outsourcing work', 'visa and immigration policy changes in the US'],
    triggers: ['large deal wins pick up and revenue guidance is raised', 'US tech spending surveys turn positive'],
    followups: ['How does USD/INR affect IT company earnings?', 'Is AI a threat or an opportunity for Indian IT?']
  },
  pharma: {
    what: 'pharmaceutical companies, including large US generic exporters',
    drivers: ['steady US generics demand and new product launches', 'resilient domestic branded formulations business', 'defensive earnings that hold up in downturns', 'a weaker rupee helping exporters'],
    risks: ['US FDA inspection observations or import alerts', 'price erosion in US generics', 'US tariff or drug-pricing policy changes'],
    triggers: ['FDA warning letters at key plants', 'US price erosion accelerates'],
    followups: ['Why is pharma considered defensive?', 'What is an FDA warning letter and why does it matter?']
  },
  health: {
    what: 'pharma companies, hospitals and diagnostics',
    drivers: ['hospital capacity expansion and rising insurance coverage', 'defensive, steady earnings', 'growing medical tourism and healthcare spending'],
    risks: ['high valuations leaving little margin of safety', 'regulatory price controls', 'US FDA issues for pharma exporters'],
    triggers: ['hospital occupancy or revenue per bed falls', 'price-control measures expand'],
    followups: ['What drives hospital company earnings?', 'Is healthcare a growth or a defensive sector?']
  },
  fmcg: {
    what: 'consumer staples such as HUL, ITC, Nestle and Britannia',
    drivers: ['rural demand recovery after good monsoons', 'falling raw-material costs improving gross margins', 'defensive earnings in uncertain markets'],
    risks: ['weak urban consumption', 'commodity inflation (palm oil, wheat, milk) squeezing margins', 'rich valuations versus growth'],
    triggers: ['volume growth stays in low single digits', 'raw-material costs spike'],
    followups: ['Why do FMCG stocks trade at high P/E ratios?', 'How does the monsoon affect FMCG?']
  },
  consumption: {
    what: 'consumer-facing companies across staples, autos, retail and durables',
    drivers: ['rising disposable income and premiumisation', 'tax relief or lower rates supporting spending', 'rural recovery after good monsoons'],
    risks: ['slowing urban demand', 'inflation eating into household budgets', 'high valuations'],
    triggers: ['retail credit growth slows sharply', 'consumer confidence surveys weaken'],
    followups: ['What is premiumisation?', 'How do interest rates affect consumption stocks?']
  },
  auto: {
    what: 'car, two-wheeler, commercial vehicle and auto component makers',
    drivers: ['volume growth in two-wheelers and passenger vehicles', 'rural demand recovery', 'stable commodity (steel, aluminium) costs', 'EV transition creating new opportunities'],
    risks: ['demand slowdown after strong sales cycles', 'commodity cost inflation', 'disruption from the EV shift for traditional players'],
    triggers: ['monthly sales volumes decline for consecutive months', 'inventory builds up at dealers'],
    followups: ['How do interest rates affect auto sales?', 'Who wins and loses from EV adoption?']
  },
  realty: {
    what: 'listed real estate developers',
    drivers: ['housing demand and record pre-sales by large developers', 'consolidation towards branded, listed developers', 'falling interest rates improving affordability'],
    risks: ['highly cyclical and sensitive to interest rates', 'inventory build-up and slower sales', 'very high volatility'],
    triggers: ['pre-sales growth turns negative', 'home-loan rates rise'],
    followups: ['Why is real estate so sensitive to interest rates?', 'What are pre-sales and why do analysts watch them?']
  },
  infra: {
    what: 'infrastructure, construction, power, telecom and capital-goods companies',
    drivers: ['government capital expenditure on roads, railways and power', 'private capex recovery', 'strong order books for engineering companies'],
    risks: ['slower government spending (fiscal constraints)', 'execution delays', 'valuations already pricing in a long capex cycle'],
    triggers: ['budgeted capex is cut or under-spent', 'order inflows slow for two quarters'],
    followups: ['What is the capex cycle?', 'Government vs private capex: why does it matter?']
  },
  defence: {
    what: 'defence manufacturers such as HAL, BEL and shipbuilders',
    drivers: ['government push for indigenous defence manufacturing', 'large multi-year order books', 'growing export opportunities'],
    risks: ['very high valuations after a strong re-rating', 'dependence on government orders and payment timing', 'execution delays'],
    triggers: ['order inflows slow', 'valuations stay far above earnings growth'],
    followups: ['Why have defence stocks re-rated?', 'What is the risk of a sector that depends on one customer?']
  },
  metal: {
    what: 'steel, aluminium, zinc and mining companies',
    drivers: ['global metal prices, especially demand from China', 'domestic infrastructure and construction demand', 'trade protection (safeguard duties) for domestic producers'],
    risks: ['highly cyclical: earnings swing with global prices', 'cheap imports from China', 'a global growth slowdown'],
    triggers: ['global metal prices fall', 'China announces or withdraws stimulus'],
    followups: ['Why are metal stocks cyclical?', 'How does China affect Indian metal companies?']
  },
  commod: {
    what: 'companies in metals, energy, cement and chemicals',
    drivers: ['global commodity price cycles', 'domestic infrastructure and housing demand', 'capacity additions and pricing power'],
    risks: ['commodity price volatility', 'global growth slowdown', 'input-cost inflation'],
    triggers: ['global commodity indices turn down', 'capacity oversupply builds in cement or steel'],
    followups: ['What makes a sector cyclical vs defensive?', 'How do commodity prices feed into inflation?']
  },
  oilgas: {
    what: 'oil marketing, refining, upstream and gas companies',
    drivers: ['crude oil price movements (low crude helps marketers, high crude helps producers)', 'refining margins', 'government pricing and subsidy policy'],
    risks: ['crude price spikes from geopolitical events', 'government intervention in fuel pricing', 'long-term energy-transition risk'],
    triggers: ['Brent crude moves sharply in either direction', 'changes in fuel taxes or pricing policy'],
    followups: ['Who gains and who loses when crude falls?', 'What are refining margins?']
  },
  energy: {
    what: 'power generation, utilities, oil and gas and renewables',
    drivers: ['rising electricity demand', 'renewable energy capacity additions', 'regulated, predictable returns for utilities'],
    risks: ['regulatory tariff changes', 'high debt for capacity expansion', 'fuel price volatility'],
    triggers: ['peak power demand growth slows', 'renewable project execution is delayed'],
    followups: ['Why are utilities considered defensive?', 'How does India\'s renewable push affect power companies?']
  }
};

function suggestStance(r) {
  const rs = r.rs3m, rs1y = r.rs1y;
  if (rs === null || rs === undefined) return { stance: 'Neutral', why: 'not enough data for a signal' };
  if (rs >= 0.03 && r.above200) return { stance: 'Overweight', why: 'it is beating the Nifty by a clear margin and trading above its 200-day average' };
  if (rs <= -0.03 && r.above200 === false) return { stance: 'Underweight', why: 'it is lagging the Nifty and trading below its 200-day average' };
  if (rs >= 0.03) return { stance: 'Neutral', why: 'it is outperforming but has not yet regained its 200-day average, so the trend is unconfirmed' };
  if (rs <= -0.03) return { stance: 'Neutral', why: 'it is lagging recently but its longer-term trend is still intact' + (rs1y > 0 ? ' and it has beaten the Nifty over 1 year' : '') };
  return { stance: 'Neutral', why: 'it is moving broadly in line with the Nifty' };
}

function draftBrief(r, B, rank, total) {
  const p = PLAYBOOK[r.key] || { what: 'companies in this sector', drivers: ['earnings growth', 'valuations', 'policy support'], risks: ['earnings disappointment', 'valuation de-rating', 'macro slowdown'], triggers: ['earnings estimates are cut'], followups: [] };
  const s = suggestStance(r);
  const volRatio = r.vol1y && B.vol1y ? r.vol1y / B.vol1y : null;
  const position = rank <= 3 ? `one of the strongest sectors right now (rank ${rank} of ${total})` : rank > total - 3 ? `one of the weakest sectors right now (rank ${rank} of ${total})` : `in the middle of the pack (rank ${rank} of ${total})`;
  const trendLine = r.trend === 'Uptrend' ? 'it is in a confirmed uptrend' : r.trend === 'Downtrend' ? 'it is in a downtrend' : (r.above200 ? 'it has recovered above its long-term average, though the uptrend is not yet fully confirmed' : 'it is still below its long-term average');
  const riskLine = volRatio ? (volRatio > 1.3 ? `It is about ${volRatio.toFixed(1)} times as volatile as the Nifty, so position size should reflect that.` : volRatio < 0.9 ? 'It has been less volatile than the Nifty, a defensive profile.' : 'Its volatility is similar to the market.') : '';
  const data = `Nifty ${r.label} has returned ${pct(r.r3m)} over 3 months and ${pct(r.r1y)} over 1 year, versus ${pct(B.r3m)} and ${pct(B.r1y)} for the Nifty 50, making it ${position}. ${trendLine.charAt(0).toUpperCase() + trendLine.slice(1)}, and it is ${r.offHigh !== null && r.offHigh > -0.005 ? 'trading at its 52-week high' : pct(r.offHigh).replace('-', '') + ' below its 52-week high'}. ${riskLine}`;
  const why = p.drivers.map(d => '• ' + d.charAt(0).toUpperCase() + d.slice(1)).join('\n');
  const risks = p.risks.map(d => '• ' + d.charAt(0).toUpperCase() + d.slice(1)).join('\n');
  const change = p.triggers.map(d => '• ' + d.charAt(0).toUpperCase() + d.slice(1)).join('\n');
  const pitch = `"${r.label} is ${position}: up ${pct(r.r3m).replace('+', '')} over three months against ${pct(B.r3m)} for the Nifty. ${trendLine.charAt(0).toUpperCase() + trendLine.slice(1)}. The sector covers ${p.what}, and the case rests on ${p.drivers[0]} and ${p.drivers[1]}. The main risks are ${p.risks[0]} and ${p.risks[1]}. ${volRatio && volRatio > 1.3 ? `It is also about ${volRatio.toFixed(1)}x as volatile as the market. ` : ''}On balance I'd be ${s.stance.toLowerCase()}, and I'd revisit that if ${p.triggers[0]}."`;
  return { stance: s, data, why, risks, change, pitch, followups: p.followups, what: p.what };
}

function renderBrief() {
  const k = selected[selected.length - 1];
  if (!k) { $('#briefBody').innerHTML = '<span class="muted">Select a sector in the scorecard.</span>'; return; }
  $('#briefBody').classList.remove('muted');
  const r = SEC.sectors.find(s => s.key === k), B = SEC.benchmark;
  const ranked = [...SEC.sectors].filter(s => s.rs3m !== null && !s.error).sort((a, b) => b.rs3m - a.rs3m);
  const rank = ranked.findIndex(s => s.key === k) + 1, total = ranked.length;
  const d = draftBrief(r, B, rank, total);
  const saved = store.get('brief2-' + k, null);
  const v = saved || { why: d.why, risks: d.risks, change: d.change, stance: d.stance.stance };
  $('#briefBody').innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${esc(r.label)} · data as of ${dstr(r.asOf)}</h3>
    <label class="f" style="flex-direction:row;align-items:center;gap:8px">Stance <select id="bStance">${['Overweight', 'Neutral', 'Underweight'].map(s => `<option ${v.stance === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></div>
    <p class="note" style="margin:6px 0 0">Data-suggested stance: <b>${esc(d.stance.stance)}</b>, because ${esc(d.stance.why)}.</p>
    <p style="margin:10px 0">${esc(d.data)}</p>
    <div class="card" style="background:transparent;margin:10px 0">
      <h3>30-second pitch (say this out loud)</h3>
      <p id="bPitch" style="margin:0;font-size:15px;line-height:1.6">${esc(d.pitch)}</p>
    </div>
    <div class="grid g3">
      <label class="f">Why: fundamental drivers<textarea id="bWhy" style="min-height:130px">${esc(v.why)}</textarea></label>
      <label class="f">Key risks<textarea id="bRisks" style="min-height:130px">${esc(v.risks)}</textarea></label>
      <label class="f">What would change my view<textarea id="bChange" style="min-height:130px">${esc(v.change)}</textarea></label>
    </div>
    ${d.followups.length ? `<div class="section"><h3>Likely follow-up questions</h3><ul style="margin:0;padding-left:18px">${d.followups.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
    <div class="row" style="margin-top:12px"><button class="ghost" id="bCopy">Copy brief</button><button class="ghost" id="bReset">Reset to auto draft</button><span class="note" id="bMsg"></span></div>
    <p class="note">Drafted automatically: the numbers are live, and the drivers, risks and triggers are the standard factors analysts track for this sector. Before quoting specifics, check the latest quarterly results and RBI policy. You can edit any box; edits are saved in this browser. Proxy: ${esc(r.proxy)} (AMFI code ${esc(r.proxyCode)}).</p>`;
  const save = () => store.set('brief2-' + k, { why: $('#bWhy').value, risks: $('#bRisks').value, change: $('#bChange').value, stance: $('#bStance').value });
  ['#bWhy', '#bRisks', '#bChange', '#bStance'].forEach(id => $(id).addEventListener('input', save));
  $('#bReset').onclick = () => { try { localStorage.removeItem('brief2-' + k); } catch (e) {} renderBrief(); };
  $('#bCopy').onclick = async () => {
    save();
    const txt = `SECTOR BRIEF: Nifty ${r.label} (${$('#bStance').value})\nData as of ${dstr(r.asOf)} | Source: AMFI NAVs via passive index tracker\n\nWhat the numbers say:\n${d.data}\n\n30-second pitch:\n${d.pitch}\n\nWhy:\n${$('#bWhy').value || '-'}\n\nKey risks:\n${$('#bRisks').value || '-'}\n\nWhat would change my view:\n${$('#bChange').value || '-'}\n\nLikely follow-ups:\n${d.followups.map(q => '- ' + q).join('\n')}\n`;
    try { await navigator.clipboard.writeText(txt); $('#bMsg').textContent = 'Copied to clipboard.'; } catch (e) { $('#bMsg').textContent = 'Copy failed. Select the text manually.'; }
  };
}

// If the page already rendered a brief before this script loaded, redraw it with the new builder.
if (typeof SEC !== 'undefined' && SEC) renderBrief();

// Load role-aligned desk features (Monitoring, Controls, Role map, report).
(function () { const s = document.createElement('script'); s.src = '/desk.js'; document.body.appendChild(s); })();
