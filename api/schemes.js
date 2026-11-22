import { fetchText, cacheHeaders, DAY } from './_lib.js';

// Parses AMFI's official daily NAV file into a searchable list of active
// open-ended equity / hybrid / index / FoF schemes (Direct-Growth plans and ETFs).
export default async function handler(req, res) {
  try {
    const txt = await fetchText('https://www.amfiindia.com/spages/NAVAll.txt', 20000);
    const lines = txt.split(/\r?\n/);
    let category = '', amc = '';
    const out = [];
    const cutoff = Date.now() - 21 * DAY;
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (!l.includes(';')) {
        const m = l.match(/^(Open Ended|Close Ended|Interval Fund)[^()]*\((.*)\)\s*$/i);
        if (m) category = (m[1].toLowerCase().startsWith('open') ? '' : m[1] + ': ') + m[2].trim();
        else amc = l;
        continue;
      }
      const f = l.split(';');
      if (f.length < 8 || f[0] === 'Scheme Code') continue;
      if (category.includes(':')) continue; // skip close-ended / interval
      if (!/^(Equity|Hybrid|Other|Solution)/i.test(category)) continue;
      const name = f[3].trim(), plan = (f[4] || '').trim(), opt = (f[5] || '').trim();
      const isETF = /\bETF\b/i.test(name) && !/fund of fund|fof/i.test(name);
      const isDirectGrowth = /direct/i.test(plan) && /growth/i.test(opt);
      if (!isDirectGrowth && !(isETF && !/idcw|dividend/i.test(opt))) continue;
      const d = Date.parse(f[7].trim().replace(/-/g, ' ') + ' UTC');
      if (!isFinite(d) || d < cutoff) continue;
      out.push([f[0].trim(), name, category.replace(/ Scheme - /, ': '), amc.replace(/ Mutual Fund$/i, ''), parseFloat(f[6]), d]);
    }
    cacheHeaders(res, 43200);
    res.status(200).send(JSON.stringify({ generatedAt: Date.now(), count: out.length, schemes: out }));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json');
    res.status(502).send(JSON.stringify({ error: String(e.message || e) }));
  }
}
