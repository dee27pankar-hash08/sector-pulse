// One-off connectivity probe for candidate data sources from the CI runner.
const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': '*/*' };
const urls = [
  'https://stooq.com/q/d/l/?s=spy.us&i=d',
  'https://stooq.com/q/d/l/?s=vfiax.us&i=m',
  'https://stooq.pl/q/d/l/?s=agg.us&i=m',
  'https://api.nasdaq.com/api/quote/SPY/historical?assetclass=etf&fromdate=2025-01-01&limit=5',
  'https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d',
  'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10',
  'https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&file_type=json',
  'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026',
  'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv',
  'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/5.json',
  'https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0',
  'https://www.freddiemac.com/pmms/docs/PMMS_history.csv',
  'https://api.tiingo.com/tiingo/daily/spy/prices',
  'https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=SPY&apikey=demo',
  'https://api.marketdata.app/v1/stocks/candles/D/SPY?countback=3',
  'https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=SPY',
  'https://data.nasdaq.com/api/v3/datasets/FRED/DGS10.json?rows=2'
];
await Promise.all(urls.map(async u => {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(25000) });
    const b = (await r.text()).replace(/\s+/g, ' ').slice(0, 140);
    console.log(`PROBE ${r.status} ${Date.now() - t0}ms ${u}\n      ${b}`);
  } catch (e) { console.log(`PROBE ERR ${Date.now() - t0}ms ${u} ${e.name}: ${e.message} ${e.cause?.code || ''}`); }
}));
