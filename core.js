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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeSignals: computeSignals, decideAction: decideAction, WARMUP_BARS: WARMUP_BARS };
}
