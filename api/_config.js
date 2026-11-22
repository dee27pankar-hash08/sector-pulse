// Sector proxies: passive Indian index funds / ETFs (Direct-Growth or ETF NAVs) that track
// each NSE sector index. Candidates are listed in order of preference (longest track record first);
// the API uses the first with >= 1 year of history.

export const BENCHMARK = { key: 'nifty50', label: 'Nifty 50', codes: ['120716', '119063', '118581'] };

export const SECTORS = [
  { key: 'bank', label: 'Bank', group: 'Financials', codes: ['147620', '149858', '148173'] },
  { key: 'fin', label: 'Financial Services', group: 'Financials', codes: ['149105', '152577'] },
  { key: 'finxb', label: 'Fin. Services ex-Bank', group: 'Financials', codes: ['151911', '150879'] },
  { key: 'psubank', label: 'PSU Bank', group: 'Financials', codes: ['140089', '151572', '151888'] },
  { key: 'capmkt', label: 'Capital Markets', group: 'Financials', codes: ['152951', '154754'] },
  { key: 'it', label: 'IT', group: 'Technology', codes: ['150468', '152355', '151785'] },
  { key: 'pharma', label: 'Pharma', group: 'Healthcare', codes: ['150930', '149008'] },
  { key: 'health', label: 'Healthcare', group: 'Healthcare', codes: ['148957', '148934', '153594'] },
  { key: 'fmcg', label: 'FMCG', group: 'Consumer', codes: ['149072', '154357'] },
  { key: 'consumption', label: 'India Consumption', group: 'Consumer', codes: ['128331', '149285', '149156'] },
  { key: 'auto', label: 'Auto', group: 'Consumer', codes: ['150643', '152557', '153064'] },
  { key: 'realty', label: 'Realty', group: 'Real Assets', codes: ['152521', '152541', '153060'] },
  { key: 'infra', label: 'Infrastructure', group: 'Industrials', codes: ['140102', '150526'] },
  { key: 'defence', label: 'Defence', group: 'Industrials', codes: ['152712', '152798'] },
  { key: 'metal', label: 'Metal', group: 'Materials & Energy', codes: ['152769', '152924'] },
  { key: 'commod', label: 'Commodities', group: 'Materials & Energy', codes: ['151207', '153353'] },
  { key: 'oilgas', label: 'Oil & Gas', group: 'Materials & Energy', codes: ['152748', '154552'] },
  { key: 'energy', label: 'Energy', group: 'Materials & Energy', codes: ['153945', '153931'] }
];

export const BROAD = [
  { key: 'mid150', label: 'Nifty Midcap 150', codes: ['147622', '148726'] },
  { key: 'small250', label: 'Nifty Smallcap 250', codes: ['147623', '148519'] }
];

export const US = [
  { key: 'sp500', label: 'S&P 500 (in INR)', codes: ['148381'] },
  { key: 'ndx', label: 'Nasdaq 100 (in INR)', codes: ['114984', '149219'] }
];

// Benchmarks offered in the fund due-diligence tool.
export const DD_BENCHMARKS = [
  { key: 'nifty50', label: 'Nifty 50 (large cap)', codes: BENCHMARK.codes },
  { key: 'mid150', label: 'Nifty Midcap 150', codes: BROAD[0].codes },
  { key: 'small250', label: 'Nifty Smallcap 250', codes: BROAD[1].codes },
  ...SECTORS.map(s => ({ key: s.key, label: 'Nifty ' + s.label, codes: s.codes })),
  { key: 'sp500', label: 'S&P 500 (INR)', codes: US[0].codes },
  { key: 'ndx', label: 'Nasdaq 100 (INR)', codes: US[1].codes }
];
