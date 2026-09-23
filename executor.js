// executor.js - UT Bot cloud live executor (opt-in, dry-run by default)
// Mounted by watch.js AFTER signal computation. Never breaks the shadow pipeline
// (all failures are caught and logged by the caller).
//
// Enable:  repo file executor/ENABLE with content "DRY" or "LIVE" + OKX secrets in workflow env.
// Kill:    repo file executor/HALT present -> never places orders, logs reason.
// Safety rails:
//   - recompute-from-history design: each run reconciles engine dir vs real position (late, never wrong)
//   - sizing hysteresis: no re-order if position side matches and notional within 25% of target
//   - equity floor: never open below MIN_EQ USDT; existing position kept
//   - isolated margin, LEV x, market orders only, net position mode
//   - one flip per run max; state committed to executor/state.json for audit

const crypto = require('crypto');
const fs = require('fs');

const INST = process.env.UT_EXEC_INST || 'ETH-USDT-SWAP';
const LEV = parseInt(process.env.UT_EXEC_LEV || '2', 10);
const MIN_EQ = parseFloat(process.env.UT_EXEC_MIN_EQ || '80');
const HOSTS = ['https://www.okx.com', 'https://aws.okx.com'];

function sign(ts, method, path, body, secret) {
  const pre = ts + method + path + (body || '');
  return crypto.createHmac('sha256', secret).update(pre).digest('base64');
}
async function okxCall(method, path, bodyObj, cfg) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  let lastErr = null;
  for (const host of HOSTS) {
    for (let t = 1; t <= 3; t++) {
      try {
        const ts = new Date().toISOString();
        const r = await fetch(host + path, {
          method: method,
          headers: {
            'OK-ACCESS-KEY': cfg.key,
            'OK-ACCESS-SIGN': sign(ts, method, path, body, cfg.secret),
            'OK-ACCESS-TIMESTAMP': ts,
            'OK-ACCESS-PASSPHRASE': cfg.pass,
            'Content-Type': 'application/json'
          },
          body: body || undefined
        });
        const j = await r.json();
        if (j.code === '0') return j.data;
        lastErr = new Error('OKX code=' + j.code + ' msg=' + j.msg);
        if (String(j.code) === '50111' || String(j.code) === '50113') throw lastErr; // bad key: no retry
      } catch (e) { lastErr = e; }
      await new Promise(res => setTimeout(res, 300 * t));
    }
  }
  throw lastErr || new Error('OKX_CALL_FAILED');
}

async function runExecutor(sig, bjTime, utcTime) {
  const lines = [];
  const log = (s) => { lines.push(s); console.log('EXEC ' + s); };
  const live = fs.existsSync('executor/ENABLE') && fs.readFileSync('executor/ENABLE', 'utf8').trim() === 'LIVE';
  if (!live) log('mode=DRY-RUN (executor/ENABLE != LIVE) — no orders will be placed');
  if (fs.existsSync('executor/HALT')) { log('HALT file present — trading disabled'); return lines; }
  const cfg = { key: process.env.OKX_API_KEY, secret: process.env.OKX_API_SECRET, pass: process.env.OKX_API_PASSPHRASE };
  if (!cfg.key || !cfg.secret || !cfg.pass) { log('no keys in env — executor shadow only'); return lines; }

  // instrument meta
  const insts = await okxCall('GET', '/api/v5/public/instruments?instType=SWAP&instId=' + INST, null, cfg);
  const ctVal = parseFloat(insts[0].ctVal); // ETH per contract
  log('inst=' + INST + ' ctVal=' + ctVal + ' lev=' + LEV + 'x minEq=' + MIN_EQ);

  // position + equity
  const poss = await okxCall('GET', '/api/v5/account/positions?instId=' + INST, null, cfg);
  const pos = poss && poss.length ? poss[0] : null;
  const posSz = pos ? parseFloat(pos.pos) : 0; // net mode: +long / -short contracts
  const bal = await okxCall('GET', '/api/v5/account/balance?ccy=USDT', null, cfg);
  let eqU = 0;
  try { eqU = parseFloat(bal[0].details.filter(d => d.ccy === 'USDT')[0].eq) || 0; } catch (e) { eqU = 0; }
  log('equity=' + eqU.toFixed(2) + 'USDT pos=' + posSz + 'ct engineDir=' + sig.dir);

  const lastPx = sig.lastClose;
  const desiredNotional = LEV * eqU;
  const desiredCt = Math.max(0, Math.floor(desiredNotional / (ctVal * lastPx)));
  const posDir = posSz > 0 ? 1 : (posSz < 0 ? -1 : 0);

  if (posDir === sig.dir && Math.abs(Math.abs(posSz) - desiredCt) / Math.max(1, desiredCt) < 0.25) {
    log('position matches engine (hysteresis ok) — nothing to do');
  } else if (eqU < MIN_EQ && posDir === 0) {
    log('equity ' + eqU.toFixed(1) + ' < floor ' + MIN_EQ + ' — will not open');
  } else {
    const orders = [];
    if (posDir !== 0 && posDir !== sig.dir) orders.push({ side: posSz > 0 ? 'sell' : 'buy', sz: Math.abs(posSz), tag: 'CLOSE-old' });
    if (desiredCt > 0 && sig.dir !== 0) orders.push({ side: sig.dir === 1 ? 'buy' : 'sell', sz: desiredCt, tag: 'OPEN-' + (sig.dir === 1 ? 'LONG' : 'SHORT') });
    for (const o of orders) {
      const path = '/api/v5/trade/order';
      const body = { instId: INST, tdMode: 'isolated', side: o.side, posSide: 'net', ordType: 'market', sz: String(o.sz) };
      if (live) {
        if (o.tag.indexOf('OPEN') === 0) {
          try { await okxCall('POST', '/api/v5/account/set-leverage', { instId: INST, lever: String(LEV), mgnMode: 'isolated' }, cfg); } catch (e) { log('set-leverage: ' + e.message); }
        }
        const r = await okxCall('POST', path, body, cfg);
        log('LIVE ORDER ' + o.tag + ' ' + o.side + ' ' + o.sz + 'ct => ordId=' + r[0].ordId + ' state=' + r[0].sMsg);
      } else {
        log('DRY ORDER ' + o.tag + ' ' + o.side + ' ' + o.sz + 'ct (body=' + JSON.stringify(body) + ')');
      }
    }
  }
  // audit state
  try {
    fs.mkdirSync('executor', { recursive: true });
    fs.writeFileSync('executor/state.json', JSON.stringify({ ts: new Date().toISOString(), live: live, inst: INST, lev: LEV, eq: eqU, posCt: posSz, engineDir: sig.dir, desiredCt: desiredCt, since: bjTime(sig.sinceCloseTs), lines: lines }, null, 2) + '\n');
  } catch (e) {}
  return lines;
}

module.exports = { runExecutor };
