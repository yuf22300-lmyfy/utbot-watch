// GitHub top-strategy lab: core logic of the most-starred real strategies, tested on
// the SAME data/conventions as our UT Bot archive (ETH 15m SWAP 5y, 100U compound,
// 0.05%/side, fill=next bar open, warmup 250). Approximations of strategy cores, labeled.
// args: <dataFile>;  cscript //nologo ut_github_lab.js ut_eth15m_swap5y.txt
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + WScript.Arguments.Item(0), 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length) raw.push(ln); }
f.Close();
var bars = [];
for (var i = 0; i < raw.length; i++) {
  var p = raw[i].split(" ");
  bars.push({ ts: parseInt(p[0], 10), o: parseFloat(p[1]), h: parseFloat(p[2]), l: parseFloat(p[3]), c: parseFloat(p[4]) });
}
var N = bars.length, FEE = 0.0005, INIT = 100.0, WARM = 250;
var idx1y = N - 1 - 365 * 96;

function smaArr(src, len) {
  var out = new Array(N), s = 0.0;
  for (var i = 0; i < N; i++) { s += src[i]; if (i >= len) s -= src[i - len]; out[i] = (i >= len - 1) ? s / len : NaN; }
  return out;
}
function emaArr(src, len) {
  var out = new Array(N), k = 2.0 / (len + 1), seed = 0.0;
  for (var i = 0; i < N; i++) {
    if (i < len) { seed += src[i]; out[i] = NaN; if (i === len - 1) out[i] = seed / len; }
    else out[i] = src[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}
function rsiArr(src, len) {
  var out = new Array(N), g = 0.0, l = 0.0;
  for (var i = 1; i <= len; i++) { var d = src[i] - src[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= len; l /= len;
  out[len] = (l === 0) ? 100.0 : 100.0 - 100.0 / (1.0 + g / l);
  for (var j = len + 1; j < N; j++) {
    var d2 = src[j] - src[j - 1], gg = d2 > 0 ? d2 : 0, ll = d2 < 0 ? -d2 : 0;
    g = (g * (len - 1) + gg) / len; l = (l * (len - 1) + ll) / len;
    out[j] = (l === 0) ? 100.0 : 100.0 - 100.0 / (1.0 + g / l);
  }
  for (var k0 = 0; k0 <= len - 1; k0++) out[k0] = NaN;
  return out;
}
function atrArr(len) {
  var tr = new Array(N), out = new Array(N);
  tr[0] = bars[0].h - bars[0].l;
  for (var i = 1; i < N; i++) {
    var x1 = bars[i].h - bars[i].l, x2 = Math.abs(bars[i].h - bars[i - 1].c), x3 = Math.abs(bars[i].l - bars[i - 1].c);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3; tr[i] = m;
  }
  var s = 0.0; for (var j = 0; j < len; j++) s += tr[j];
  out[len - 1] = s / len;
  for (var k = len; k < N; k++) out[k] = (out[k - 1] * (len - 1) + tr[k]) / len;
  for (var q = 0; q < len - 1; q++) out[q] = NaN;
  return out;
}
var C = new Array(N), O = new Array(N);
for (var z = 0; z < N; z++) { C[z] = bars[z].c; O[z] = bars[z].o; }
var ema200 = emaArr(C, 200), rsi14 = rsiArr(C, 14), atr10 = atrArr(10);
var smaC10 = smaArr(C, 10), smaO10 = smaArr(O, 10);
var bbM = smaArr(C, 20), bbU = new Array(N), bbL = new Array(N);
for (var b = 0; b < N; b++) {
  if (b < 19) { bbU[b] = NaN; bbL[b] = NaN; continue; }
  var v = 0.0;
  for (var w = 0; w < 20; w++) v += (C[b - w] - bbM[b]) * (C[b - w] - bbM[b]);
  var sd = Math.sqrt(v / 20);
  bbU[b] = bbM[b] + 2 * sd; bbL[b] = bbM[b] - 2 * sd;
}
var stop = new Array(N); stop[0] = NaN;
var KEY = 50.0;
for (var i2 = 1; i2 < N; i2++) {
  var prev = isNaN(stop[i2 - 1]) ? 0.0 : stop[i2 - 1];
  var nl = KEY * atr10[i2], c = C[i2], cp = C[i2 - 1];
  if (c > prev && cp > prev) stop[i2] = Math.max(prev, c - nl);
  else if (c < prev && cp < prev) stop[i2] = Math.min(prev, c + nl);
  else if (c > prev) stop[i2] = c - nl;
  else stop[i2] = c + nl;
}

// generic executor: signalFn(i) returns TARGET position (0 flat / 1 long / -1 short);
// any change vs held position executes at next bar open.
function runStrategy(name, signalFn) {
  var cash = INIT, dir = 0, qty = 0.0, entry = 0.0, pend = null;
  var trades = 0, wins = 0, peak = INIT, maxDD = 0.0, eq1y = INIT, eqEnd = INIT;
  for (var i = WARM; i < N; i++) {
    // 1) execute pending order at THIS bar's open (signal came from bar i-1 close)
    if (pend !== null) {
      var fo = bars[i].o;
      if (dir !== 0) {
        var feeOut = FEE * qty * fo;
        var pnl = dir * qty * (fo - entry) - feeOut;
        cash += pnl; trades++; if (pnl > 0) wins++;
        dir = 0; qty = 0;
      }
      if (pend !== 0) { dir = pend; entry = fo; qty = cash / entry; cash -= FEE * qty * entry; }
      pend = null;
    }
    // 2) evaluate signal on this bar's close (fills next bar)
    var want = signalFn(i);
    if (want !== dir && want !== null && !isNaN(want)) pend = want;
    // 3) mark equity at close
    var e = cash + (dir !== 0 ? dir * qty * (C[i] - entry) : 0);
    if (i === idx1y) eq1y = e;
    eqEnd = e;
    if (e > peak) peak = e;
    var dd = (peak - e) / peak; if (dd > maxDD) maxDD = dd;
  }
  WScript.Echo(name + ": ret=" + ((eqEnd / INIT - 1) * 100).toFixed(0) + "%  recent1y=" + ((eqEnd / eq1y - 1) * 100).toFixed(0) +
    "% trades=" + trades + " wr=" + (trades ? (100 * wins / trades).toFixed(0) : 0) + "% dd=" + (maxDD * 100).toFixed(0) + "%");
}

// 0) BASELINE: our UT Bot 50/10 (SAR)
(function () {
  var d = 0;
  runStrategy("UTBot50/10  [baseline]", function (i) {
    if (!isNaN(stop[i - 1])) {
      if (C[i] > stop[i] && C[i - 1] <= stop[i - 1]) d = 1;
      else if (C[i] < stop[i] && C[i - 1] >= stop[i - 1]) d = -1;
    }
    return d;
  });
})();

// 1) NostalgiaForInfinity CORE thesis (approx): long-only dip-buy in uptrend, small target
(function () {
  var inPos = false, entry = 0;
  runStrategy("NFI-core    [approx] ", function (i) {
    if (isNaN(ema200[i]) || isNaN(rsi14[i])) return 0;
    if (!inPos && C[i] > ema200[i] && rsi14[i] < 30) { inPos = true; entry = C[i]; return 1; }
    if (inPos && (rsi14[i] > 60 || C[i] > entry * 1.03 || C[i] < entry * 0.95)) { inPos = false; return 0; }
    return inPos ? 1 : 0;
  });
})();

// 2) freqtrade BbandRsi-style: BB(20,2) lower-band + RSI<35 entry; mid-band/stop exit
(function () {
  var inPos = false, entry = 0;
  runStrategy("BB+RSI      [approx] ", function (i) {
    if (isNaN(bbL[i]) || isNaN(rsi14[i])) return 0;
    if (!inPos && C[i] < bbL[i] && rsi14[i] < 35) { inPos = true; entry = C[i]; return 1; }
    if (inPos && (C[i] > bbM[i] || C[i] < entry * 0.95)) { inPos = false; return 0; }
    return inPos ? 1 : 0;
  });
})();

// 3) Open-Close Cross (famous Pine strategy): SMA(close,10) x SMA(open,10), SAR both dirs
(function () {
  var cur = 0;
  runStrategy("OCC(10/10)  [SAR]    ", function (i) {
    if (isNaN(smaC10[i]) || isNaN(smaO10[i])) return 0;
    return smaC10[i] > smaO10[i] ? 1 : -1;
  });
})();

// 4) buy & hold reference
(function () {
  var bought = false;
  runStrategy("BuyHold     [ref]    ", function (i) { return 1; });
})();
