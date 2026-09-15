// utbot-watch cloud runner (GitHub Actions, Node 18+). Shadow mode: computes and
// logs the UT Bot signal; NEVER places orders. Each run recomputes direction from
// candle history, so a missed/delayed run can only be late, never wrong.
const core = require('./core.js');
const fs = require('fs');

const INST = process.env.UT_INST || 'ETH-USDT-SWAP';
const BAR = process.env.UT_BAR || '15m';
const BARMS = 15 * 60 * 1000;
const KEY = parseFloat(process.env.UT_KEY || '50');
const ALEN = parseInt(process.env.UT_ATR || '10', 10);
const LOOKBACK_MS = 130 * 24 * 3600 * 1000; // ~12480 bars of 15m; avg hold ~19d, seen 74d
const MAX_PAGES = 300;
const HOSTS = ['https://www.okx.com', 'https://aws.okx.com'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function bjTime(ms) { return new Date(ms + 8 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16); }
function utcTime(ms) { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16); }

async function fetchPage(after, allowCandles) {
  const path = allowCandles
    ? `/api/v5/market/candles?instId=${INST}&bar=${BAR}&limit=300&after=${after}`
    : `/api/v5/market/history-candles?instId=${INST}&bar=${BAR}&limit=100&after=${after}`;
  let lastErr = null;
  for (let t = 1; t <= 8; t++) {
    for (const host of HOSTS) {
      try {
        const r = await fetch(host + path, { headers: { 'User-Agent': 'utbot-watch' } });
        const j = await r.json();
        if (j.code === '0' && Array.isArray(j.data)) return j.data;
        lastErr = new Error('API code=' + j.code + ' msg=' + j.msg);
      } catch (e) { lastErr = e; }
    }
    await sleep(400 * t);
  }
  throw lastErr || new Error('DOWNLOAD_FAILED after=' + after);
}

(async () => {
  const now = Date.now();
  const map = new Map();
  let after = now + 60000, pages = 0;
  while (pages < MAX_PAGES) {
    const d = await fetchPage(after, pages === 0);
    if (!d || d.length === 0) break;
    for (const k of d) {
      const ts = parseInt(k[0], 10);
      if (ts + BARMS <= now + 1500) map.set(ts, { ts: ts, o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]) });
    }
    const oldest = parseInt(d[d.length - 1][0], 10);
    pages++;
    if (oldest <= now - LOOKBACK_MS) break;
    after = oldest;
    await sleep(90);
  }
  const bars = [...map.values()].sort((a, b) => a.ts - b.ts);
  console.log(`BARS=${bars.length} pages=${pages} window=${utcTime(bars[0].ts)}..${utcTime(bars[bars.length - 1].ts)}`);
  if (bars.length < 1000) { console.error('INSUFFICIENT_BARS'); process.exit(1); }

  const sig = core.computeSignals(bars, KEY, ALEN, BARMS);
  console.log(`SIGNAL dir=${sig.dir === 1 ? 'LONG' : sig.dir === -1 ? 'SHORT' : 'NONE'} since=${bjTime(sig.sinceCloseTs)}BJ sigPx=${sig.sincePx.toFixed(2)} stopNow=${sig.stopNow.toFixed(2)} lastClose=${sig.lastClose.toFixed(2)} lowConf=${sig.lowConf}`);
  if (sig.dir === 0) { console.error('NO_SIGNAL_EVENT'); process.exit(1); }

  let state = null;
  try { state = JSON.parse(fs.readFileSync('state.json', 'utf8')); } catch (e) {}
  const act = core.decideAction(state, sig);

  if (act === 'nochange') {
    console.log(`NO_CHANGE dir=${state.dir} since=${bjTime(state.sinceCloseTs)}BJ`);
    return;
  }

  if (act === 'seed') {
    const st = {
      v: 1, inst: INST, bar: BAR, key: KEY, atr: ALEN,
      dir: sig.dir, sinceCloseTs: sig.sinceCloseTs, sincePx: sig.sincePx,
      sinceStop: sig.sinceStop, sinceFill: sig.sinceFill,
      seededAt: new Date().toISOString(), note: 'seed'
    };
    fs.writeFileSync('state.json', JSON.stringify(st, null, 2) + '\n');
    if (!fs.existsSync('flips.md')) {
      fs.writeFileSync('flips.md', '# UT Bot 翻转日志（影子引擎）\n\n| # | 北京时间 | 方向 | 信号收盘价 | 参考成交(次bar开盘) | 备注 |\n|---|---|---|---|---|---|\n');
    }
    fs.appendFileSync('flips.md', `| seed | ${bjTime(sig.sinceCloseTs)} | ${sig.dir === 1 ? '多头' : '空头'} | ${sig.sincePx.toFixed(2)} | ${sig.sinceFill ? sig.sinceFill.toFixed(2) : '—'} | 初始播种（沿用当前已有方向，非新信号） |\n`);
    console.log('SEEDED state.json');
    return;
  }

  // flip
  const idx = (state.flipCount || 0) + 1;
  const st = {
    v: 1, inst: INST, bar: BAR, key: KEY, atr: ALEN,
    dir: sig.dir, sinceCloseTs: sig.sinceCloseTs, sincePx: sig.sincePx,
    sinceStop: sig.sinceStop, sinceFill: sig.sinceFill,
    prevDir: state.dir, prevSinceCloseTs: state.sinceCloseTs,
    flipCount: idx, updatedAt: new Date().toISOString(),
    note: sig.sinceFill ? '' : 'fill-pending (signal bar is the newest closed bar)'
  };
  fs.writeFileSync('state.json', JSON.stringify(st, null, 2) + '\n');
  fs.appendFileSync('flips.md', `| ${idx} | ${bjTime(sig.sinceCloseTs)} | ${sig.dir === 1 ? '多头' : '空头'} | ${sig.sincePx.toFixed(2)} | ${sig.sinceFill ? sig.sinceFill.toFixed(2) : '待下根K线'} | 引擎翻转（前方向：${state.dir === 1 ? '多' : '空'} 自 ${bjTime(state.sinceCloseTs)}） |\n`);
  console.log(`FLIP #${idx} -> ${sig.dir === 1 ? 'LONG' : 'SHORT'} at ${bjTime(sig.sinceCloseTs)}BJ px=${sig.sincePx.toFixed(2)}`);
})().catch(e => { console.error('FATAL ' + (e && e.message ? e.message : e)); process.exit(1); });
