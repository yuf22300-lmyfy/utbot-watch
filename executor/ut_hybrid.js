// Hybrid execution router (longs->SPOT 0.1%/side no funding; shorts->SWAP 0.05%/side
// with funding). Signals always on the SWAP feed. 100U 1x compound, fill=next bar open.
// Refactored into pure functions for the exam (ut_router_exam.js splices after this file
// with arg0=="EXAM" to skip the default main).
// Usage (normal):  cscript //nologo ut_hybrid.js <swapFile> <spotFile> [warmupBars]
var KEY = 50.0, ALEN = 10, BARMS = 900000, INIT = 100.0;
var FUND_MS = 8 * 3600 * 1000;
var swap = [], spot = [], spotOpen = {}, spotClose = {}, stop = [], n = 0, WARM = 700;

var fso = new ActiveXObject("Scripting.FileSystemObject");
function loadBars(path) {
  var f = fso.OpenTextFile(path.replace(/\//g, "\\"), 1);
  var arr = [];
  while (!f.AtEndOfStream) {
    var ln = f.ReadLine();
    if (ln.replace(/\s+/g, "").length === 0) continue;
    var p = ln.split(" ");
    arr.push({ ts: parseInt(p[0], 10), o: parseFloat(p[1]), h: parseFloat(p[2]), l: parseFloat(p[3]), c: parseFloat(p[4]) });
  }
  f.Close();
  return arr;
}
function buildStop(bars) {
  var nn = bars.length;
  var trr = new Array(nn), atr = new Array(nn);
  trr[0] = bars[0].h - bars[0].l;
  for (var j = 1; j < nn; j++) {
    var x1 = bars[j].h - bars[j].l, x2 = Math.abs(bars[j].h - bars[j - 1].c), x3 = Math.abs(bars[j].l - bars[j - 1].c);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3; trr[j] = m;
  }
  var seed = 0.0;
  for (var j2 = 0; j2 < ALEN; j2++) seed += trr[j2];
  atr[ALEN - 1] = seed / ALEN;
  for (var j3 = ALEN; j3 < nn; j3++) atr[j3] = (atr[j3 - 1] * (ALEN - 1) + trr[j3]) / ALEN;
  var st = new Array(nn); st[0] = NaN;
  for (var j4 = 1; j4 < nn; j4++) {
    var prev = isNaN(st[j4 - 1]) ? 0.0 : st[j4 - 1];
    var nl = KEY * atr[j4], c = bars[j4].c, cp = bars[j4 - 1].c;
    if (c > prev && cp > prev) st[j4] = Math.max(prev, c - nl);
    else if (c < prev && cp < prev) st[j4] = Math.min(prev, c + nl);
    else if (c > prev) st[j4] = c - nl;
    else st[j4] = c + nl;
  }
  return st;
}
// router primitives under test:
function feeFor(dir, hybrid) { return (hybrid && dir === 1) ? 0.001 : 0.0005; }
function fillPrice(i, dir, hybrid) {
  if (hybrid && dir === 1) { var so = spotOpen[swap[i].ts]; return (so !== undefined) ? so : swap[i].o; }
  return swap[i].o;
}
function markPrice(i, dir, hybrid) {
  if (hybrid && dir === 1) { var sc = spotClose[swap[i].ts]; return (sc !== undefined) ? sc : swap[i].c; }
  return swap[i].c;
}
function fundingApplies(dir, hybrid) { return !(hybrid && dir === 1); }

function sim(hybrid, fundPer8h) {
  var cash = INIT, dir = 0, qty = 0.0, entry = 0.0, entryFee = 0.0;
  var pend = 0, trades = 0, wins = 0, peak = INIT, maxDD = 0.0, fundPaid = 0.0, feePaid = 0.0;
  var tradeLog = [], curve = [];
  for (var i = WARM; i < n; i++) {
    if (pend !== 0) {
      var fo = fillPrice(i, dir, hybrid);
      if (dir !== 0) {
        var feeOut = feeFor(dir, hybrid) * qty * fo;
        var pnl = dir * qty * (fo - entry) - feeOut;
        cash += pnl; trades++; feePaid += feeOut + entryFee;
        if (pnl - entryFee > 0) wins++;
        tradeLog.push({ dir: dir, inPx: entry, outPx: fo, pnlGross: dir * qty * (fo - entry), fee: feeOut + entryFee, eq: cash });
        dir = 0; qty = 0;
      }
      var fp = fillPrice(i, pend, hybrid);
      dir = pend; entry = fp; qty = cash / entry;
      entryFee = feeFor(dir, hybrid) * qty * entry;
      cash -= entryFee; pend = 0;
    }
    if (dir !== 0 && swap[i].ts % FUND_MS === 0 && fundingApplies(dir, hybrid)) {
      var fpay = dir * qty * swap[i].c * fundPer8h;
      cash -= fpay; fundPaid += fpay;
    }
    if (i < n - 1 && !isNaN(stop[i - 1])) {
      var up = (swap[i].c > stop[i]) && (swap[i - 1].c <= stop[i - 1]);
      var dn = (swap[i].c < stop[i]) && (swap[i - 1].c >= stop[i - 1]);
      if (up) pend = 1; else if (dn) pend = -1;
    }
    var e = cash; if (dir !== 0) e += dir * qty * (markPrice(i, dir, hybrid) - entry);
    curve.push(e);
    if (e > peak) peak = e;
    var dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd;
  }
  var openPos = null;
  if (dir !== 0) openPos = { dir: dir, qty: qty, entry: entry, entryFee: entryFee };
  return { eq: cash, t: trades, w: wins, dd: maxDD, fund: fundPaid, fees: feePaid, log: tradeLog, curve: curve, openPos: openPos };
}

var EXAM = (WScript.Arguments.length > 0 && WScript.Arguments.Item(0) === "EXAM");
if (!EXAM) {
  var SWAPF = WScript.Arguments.Item(0), SPOTF = WScript.Arguments.Item(1);
  if (WScript.Arguments.length > 2) WARM = parseInt(WScript.Arguments.Item(2), 10);
  swap = loadBars(SWAPF); spot = loadBars(SPOTF);
  for (var q = 0; q < spot.length; q++) { spotOpen[spot[q].ts] = spot[q].o; spotClose[spot[q].ts] = spot[q].c; }
  n = swap.length; stop = buildStop(swap);
  WScript.Echo("SWAP_BARS=" + n + " SPOT_BARS=" + spot.length + " WARMUP=" + WARM);
  var rates = [0, 0.00005, 0.0001, 0.00015];
  for (var r = 0; r < rates.length; r++) {
    var A = sim(false, rates[r]);
    var B = sim(true, rates[r]);
    WScript.Echo("fund/8h=" + (rates[r] * 100).toFixed(3) + "%"
      + " | PURE-SWAP: eq=" + A.eq.toFixed(1) + " (" + (A.eq - INIT).toFixed(0) + "%) tr=" + A.t + " dd=" + (A.dd * 100).toFixed(1) + "% fund=" + A.fund.toFixed(1)
      + " | HYBRID: eq=" + B.eq.toFixed(1) + " (" + (B.eq - INIT).toFixed(0) + "%) tr=" + B.t + " dd=" + (B.dd * 100).toFixed(1) + "% fund=" + B.fund.toFixed(1)
      + " | edge=" + (B.eq - A.eq).toFixed(1) + "U");
  }
}
