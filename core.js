// UT Bot signal core - pure ES3, no IO. Shared verbatim by:
//   - GitHub Actions runner (watch.js, Node 18+)
//   - local validation (tests/local-core.js via cscript, spliced after this file)
// Logic ported from ut_bt.ps1 (validated key=50 ATR=10, ETH-USDT-SWAP 15m):
//   Wilder ATR, Pine v4 trailing-stop recursion with nz(prev,0),
//   crossover events on CLOSED bars only, i>=2 guard.
// Signal convention: an event fires at the close moment of its signal bar
// (= signal bar ts + barMs). TV alert time matches this convention.

var WARMUP_BARS = 700; // ~7.3 days of 15m; stop recursion convergence margin

function computeSignals(bars, key, alen, barMs) {
  var n = bars.length;
  var tr = new Array(n), atr = new Array(n);
  tr[0] = bars[0].h - bars[0].l;
  for (var i = 1; i < n; i++) {
    var x1 = bars[i].h - bars[i].l;
    var x2 = Math.abs(bars[i].h - bars[i - 1].c);
    var x3 = Math.abs(bars[i].l - bars[i - 1].c);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3;
    tr[i] = m;
  }
  var seed = 0.0;
  for (var i2 = 0; i2 < alen; i2++) seed += tr[i2];
  atr[alen - 1] = seed / alen;
  for (var i3 = alen; i3 < n; i3++) atr[i3] = (atr[i3 - 1] * (alen - 1) + tr[i3]) / alen;

  var stop = new Array(n);
  stop[0] = NaN;
  for (var i4 = 1; i4 < n; i4++) {
    var prev = isNaN(stop[i4 - 1]) ? 0.0 : stop[i4 - 1];
    var nl = key * atr[i4];
    var c = bars[i4].c, cp = bars[i4 - 1].c;
    if (c > prev && cp > prev) stop[i4] = Math.max(prev, c - nl);
    else if (c < prev && cp < prev) stop[i4] = Math.min(prev, c + nl);
    else if (c > prev) stop[i4] = c - nl;
    else stop[i4] = c + nl;
  }

  var events = [];
  for (var i5 = 2; i5 < n; i5++) {
    if (isNaN(stop[i5 - 1])) continue;
    var up = (bars[i5].c > stop[i5]) && (bars[i5 - 1].c <= stop[i5 - 1]);
    var dn = (bars[i5].c < stop[i5]) && (bars[i5 - 1].c >= stop[i5 - 1]);
    if (up || dn) {
      events.push({
        i: i5,
        dir: up ? 1 : -1,
        closeTs: bars[i5].ts + barMs,
        barTs: bars[i5].ts,
        px: bars[i5].c,
        stop: stop[i5],
        fill: (i5 + 1 < n) ? bars[i5 + 1].o : null
      });
    }
  }

  var lastTrusted = null;
  for (var k = events.length - 1; k >= 0; k--) {
    if (events[k].i >= WARMUP_BARS) { lastTrusted = events[k]; break; }
  }
  var lowConf = false;
  if (!lastTrusted && events.length > 0) { lastTrusted = events[events.length - 1]; lowConf = true; }

  var recent = [];
  for (var k2 = Math.max(0, events.length - 5); k2 < events.length; k2++) recent.push(events[k2]);

  return {
    barCount: n,
    dir: lastTrusted ? lastTrusted.dir : 0,
    sinceCloseTs: lastTrusted ? lastTrusted.closeTs : 0,
    sinceBarTs: lastTrusted ? lastTrusted.barTs : 0,
    sincePx: lastTrusted ? lastTrusted.px : 0,
    sinceStop: lastTrusted ? lastTrusted.stop : 0,
    sinceFill: lastTrusted ? lastTrusted.fill : null,
    lowConf: lowConf,
    recentEvents: recent,
    stopNow: stop[n - 1],
    atrNow: atr[n - 1],
    lastClose: bars[n - 1].c,
    lastTs: bars[n - 1].ts
  };
}

// state: {dir, sinceCloseTs} persisted in state.json; sig: computeSignals result
function decideAction(state, sig) {
  if (!state || typeof state !== "object") return "seed";
  if (state.dir === sig.dir && state.sinceCloseTs === sig.sinceCloseTs) return "nochange";
  return "flip";
}

// Equity replay for the handbook page: mirrors ut_bt.ps1 backtest semantics
// (compound 100% of equity per entry, fee per side on qty*price, fill at next
// bar open after the signal bar close). Sim starts flat at WARMUP_BARS so the
// curve's first trade is never a cold-start artifact. Curve sampled every 4h.
function computeEquity(bars, key, alen, barMs, feeRate, initCap) {
  var n = bars.length;
  var tr = new Array(n), atr = new Array(n);
  tr[0] = bars[0].h - bars[0].l;
  for (var i = 1; i < n; i++) {
    var x1 = bars[i].h - bars[i].l;
    var x2 = Math.abs(bars[i].h - bars[i - 1].c);
    var x3 = Math.abs(bars[i].l - bars[i - 1].c);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3;
    tr[i] = m;
  }
  var seed = 0.0;
  for (var i2 = 0; i2 < alen; i2++) seed += tr[i2];
  atr[alen - 1] = seed / alen;
  for (var i3 = alen; i3 < n; i3++) atr[i3] = (atr[i3 - 1] * (alen - 1) + tr[i3]) / alen;
  var stop = new Array(n);
  stop[0] = NaN;
  for (var i4 = 1; i4 < n; i4++) {
    var prev = isNaN(stop[i4 - 1]) ? 0.0 : stop[i4 - 1];
    var nl = key * atr[i4];
    var c = bars[i4].c, cp = bars[i4 - 1].c;
    if (c > prev && cp > prev) stop[i4] = Math.max(prev, c - nl);
    else if (c < prev && cp < prev) stop[i4] = Math.min(prev, c + nl);
    else if (c > prev) stop[i4] = c - nl;
    else stop[i4] = c + nl;
  }
  var SAMPLE = 4 * 3600 * 1000;
  var cash = initCap, dir = 0, qty = 0.0, entryPx = 0.0, entryTs = 0, entryFee = 0.0;
  var pend = 0, pendTs = 0;
  var trades = [], curve = [], peak = initCap, maxDD = 0.0, wins = 0;
  var realized = 0.0;
  var markEq = function (i) { var e = cash; if (dir !== 0) e += dir * qty * (bars[i].c - entryPx); return e; };
  for (var i5 = WARMUP_BARS; i5 < n; i5++) {
    if (pend !== 0) {
      var fill = bars[i5].o;
      if (dir !== 0) {
        var feeOut = feeRate * qty * fill;
        var pnl = dir * qty * (fill - entryPx) - feeOut;
        cash += pnl;
        realized += pnl;
        var notional = qty * entryPx;
        var pct = notional > 0 ? 100 * (pnl - 0) / notional : 0;
        // pct mirrors ut_bt worst/best convention: net incl. both-side fees
        var pctNet = 100 * (pnl - entryFee) / notional;
        if (pnl - entryFee > 0) wins++;
        trades.push({ dir: dir, inTs: entryTs, inPx: entryPx, outTs: bars[i5].ts, outPx: fill, pnl: Math.round((pnl - entryFee) * 100) / 100, pct: Math.round(pctNet * 100) / 100, eq: Math.round(cash * 100) / 100 });
        dir = 0; qty = 0;
      }
      if (pend !== 0) {
        dir = pend;
        entryPx = fill;
        entryTs = bars[i5].ts;
        qty = cash / entryPx;
        entryFee = feeRate * qty * entryPx;
        cash -= entryFee;
        pend = 0;
      }
    }
    if (i5 < n - 1 && !isNaN(stop[i5 - 1])) {
      var up = (bars[i5].c > stop[i5]) && (bars[i5 - 1].c <= stop[i5 - 1]);
      var dn = (bars[i5].c < stop[i5]) && (bars[i5 - 1].c >= stop[i5 - 1]);
      if (up) { pend = 1; pendTs = bars[i5].ts + barMs; }
      else if (dn) { pend = -1; pendTs = bars[i5].ts + barMs; }
    }
    if (bars[i5].ts % SAMPLE === 0 || i5 === n - 1) {
      var e2 = markEq(i5);
      curve.push([bars[i5].ts, Math.round(e2 * 100) / 100]);
      if (e2 > peak) peak = e2;
      var dd = (peak - e2) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  var eqNow = markEq(n - 1);
  var position = null;
  if (dir !== 0) {
    var notionalNow = qty * entryPx;
    var uplAbs = dir * qty * (bars[n - 1].c - entryPx) - entryFee - feeRate * qty * bars[n - 1].c;
    position = {
      dir: dir, sinceCloseTs: entryTs, entryPx: entryPx, qty: Math.round(qty * 100000) / 100000,
      markPx: bars[n - 1].c, markTs: bars[n - 1].ts,
      upl: Math.round(uplAbs * 100) / 100,
      uplPct: notionalNow > 0 ? Math.round(10000 * uplAbs / notionalNow) / 100 : 0
    };
  }
  return {
    windowStart: bars[WARMUP_BARS].ts, windowEnd: bars[n - 1].ts,
    eq: Math.round(eqNow * 100) / 100,
    retPct: Math.round(100 * (eqNow / initCap - 1) * 100) / 100,
    realized: Math.round(realized * 100) / 100,
    initCap: initCap, fee: feeRate,
    trades: trades, wins: wins, winRate: trades.length > 0 ? Math.round(100 * wins / trades.length * 10) / 10 : 0,
    maxDDPct: Math.round(maxDD * 10000) / 100,
    curve: curve, position: position
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeSignals: computeSignals, decideAction: decideAction, WARMUP_BARS: WARMUP_BARS };
}
