// KPSS stationarity tests for the three live strategies (complement to ADF).
// KPSS: H0 = stationary. LM = sum of partial sums^2 / (T^2 * long-run var).
// Long-run variance via Newey-West (Bartlett kernel), bandwidth = int(4*(T/100)^.25).
// p-values via Monte Carlo under H0 (stationary series = iid normal), plus
// simulated critical values cross-checked against KPSS tables (~0.46 level, ~0.15 trend).
// Series tested: (a) daily log-returns with constant (H0: level-stationary);
// (b) log-equity detrended? No - for equity use spec=trend (H0: trend-stationary).
// cscript //nologo ut_kpss.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");

function kpssStat(y, spec) { // spec: "c" or "ct"
  var T = y.length, i, t;
  // detrending by OLS on [1, t]
  var X = [];
  for (t = 0; t < T; t++) { X.push(spec === "ct" ? [1, t] : [1]); }
  // OLS via normal equations (2x2 or 1x1)
  var p = X[0].length;
  var XtX = [], Xty = new Array(p);
  for (i = 0; i < p; i++) { XtX.push(new Array(p)); Xty[i] = 0; }
  for (i = 0; i < p; i++) for (var j = 0; j < p; j++) XtX[i][j] = 0;
  for (t = 0; t < T; t++) for (i = 0; i < p; i++) { Xty[i] += X[t][i] * y[t]; for (j = i; j < p; j++) XtX[i][j] += X[t][i] * X[t][j]; }
  for (i = 0; i < p; i++) for (j = 0; j < i; j++) XtX[i][j] = XtX[j][i];
  // solve small system
  var b;
  if (p === 1) b = [Xty[0] / XtX[0][0]];
  else {
    var det = XtX[0][0] * XtX[1][1] - XtX[0][1] * XtX[1][0];
    b = [(Xty[0] * XtX[1][1] - Xty[1] * XtX[0][1]) / det, (Xty[1] * XtX[0][0] - Xty[0] * XtX[0][1]) / det];
  }
  var e = new Array(T);
  for (t = 0; t < T; t++) {
    var fit = b[0] + (p === 2 ? b[1] * t : 0);
    e[t] = y[t] - fit;
  }
  // partial sums
  var S = new Array(T);
  S[0] = e[0];
  for (t = 1; t < T; t++) S[t] = S[t - 1] + e[t];
  var sumS2 = 0;
  for (t = 0; t < T; t++) sumS2 += S[t] * S[t];
  // long-run variance, Newey-West
  var sig2 = 0;
  for (t = 0; t < T; t++) sig2 += e[t] * e[t];
  sig2 /= T;
  var L = Math.floor(4 * Math.pow(T / 100, 0.25));
  var lrv = sig2;
  for (var l = 1; l <= L; l++) {
    var g = 0;
    for (t = l; t < T; t++) g += e[t] * e[t - l];
    g /= T;
    lrv += 2 * (1 - l / (L + 1)) * g;
  }
  if (lrv <= 0) lrv = sig2;
  return sumS2 / (T * T * lrv); // LM = sum(S^2) / (T^2 * long-run variance)
}
function randn() {
  var u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function mcKpss(T, spec, sims) {
  var stats = [];
  for (var s = 0; s < sims; s++) {
    var y = new Array(T);
    for (var t = 0; t < T; t++) y[t] = randn();
    var st = kpssStat(y, spec);
    if (!isNaN(st)) stats.push(st);
  }
  stats.sort(function (a, b) { return a - b; });
  return stats;
}
function report(name, eqSeries) {
  var rets = [];
  for (var i = 1; i < eqSeries.length; i++) rets.push(Math.log(eqSeries[i] / eqSeries[i - 1]));
  var logs = [];
  for (i = 0; i < eqSeries.length; i++) logs.push(Math.log(eqSeries[i]));
  var lm1 = kpssStat(rets, "c");
  var lm2 = kpssStat(logs, "ct");
  var mc1 = mcKpss(rets.length, "c", 3000);
  var mc2 = mcKpss(logs.length, "ct", 3000);
  function pOf(arr, obs) { var c = 0; for (var q = 0; q < arr.length; q++) if (arr[q] <= obs) c++; return c / arr.length; }
  var q1 = { "10": mc1[Math.floor(0.90 * mc1.length)], "5": mc1[Math.floor(0.95 * mc1.length)], "1": mc1[Math.floor(0.99 * mc1.length)] };
  var q2 = { "10": mc2[Math.floor(0.90 * mc2.length)], "5": mc2[Math.floor(0.95 * mc2.length)], "1": mc2[Math.floor(0.99 * mc2.length)] };
  WScript.Echo("[" + name + "] T=" + eqSeries.length);
  WScript.Echo("  daily-returns KPSS(level): LM=" + lm1.toFixed(3) + " MC-p=" + pOf(mc1, lm1).toFixed(3) +
    " [MC cv 10%=" + q1["10"].toFixed(2) + " 5%=" + q1["5"].toFixed(2) + " 1%=" + q1["1"].toFixed(2) + " vs table .347/.463/.739]");
  WScript.Echo("  log-equity   KPSS(trend): LM=" + lm2.toFixed(3) + " MC-p=" + pOf(mc2, lm2).toFixed(3) +
    " [MC cv 10%=" + q2["10"].toFixed(2) + " 5%=" + q2["5"].toFixed(2) + " 1%=" + q2["1"].toFixed(2) + " vs table .119/.146/.216]");
}

// ---- data (same loaders as ut_adf.js) ----
function loadDailyClose(path) {
  var f = fso.OpenTextFile(path, 1);
  var map = {};
  while (!f.AtEndOfStream) {
    var p = f.ReadLine().split(" ");
    if (p.length < 5) continue;
    var dt = new Date(parseInt(p[0], 10));
    var d = dt.getUTCFullYear() + "-" + (dt.getUTCMonth() + 1 < 10 ? "0" : "") + (dt.getUTCMonth() + 1) + "-" + (dt.getUTCDate() < 10 ? "0" : "") + dt.getUTCDate();
    map[d] = parseFloat(p[4]);
  }
  f.Close();
  return map;
}
function utbotEquity() {
  var m = loadDailyClose(DIR + "ut_eth15m_swap5y.txt");
  var dts = [];
  for (var k in m) dts.push(k);
  dts.sort();
  var f = fso.OpenTextFile(DIR + "ut_trades_swap5y.txt", 1);
  var tr = [];
  while (!f.AtEndOfStream) {
    var ln = f.ReadLine();
    var g = /dir=(-?\d) in=([\d-]+) (\d\d:\d\d) @([\d.]+) out=([\d-]+) (\d\d:\d\d) @([\d.]+)/.exec(ln);
    if (g) tr.push({ dir: +g[1], inD: g[2].slice(0, 10), inPx: +g[4], outD: g[5].slice(0, 10), outPx: +g[7] });
  }
  f.Close();
  var eq = 100, pos = null, out = [], ti = 0;
  for (var i = 1; i < dts.length; i++) {
    while (ti < tr.length && tr[ti].inD <= dts[i]) { pos = tr[ti]; ti++; }
    var px = m[dts[i]], prev = m[dts[i - 1]];
    if (pos && pos.outD > dts[i] && px && prev) eq *= (1 + pos.dir * (px / prev - 1));
    if (pos && pos.outD <= dts[i]) pos = null;
    if (dts[i] >= "2021-10-01") out.push(eq);
  }
  return out;
}
function rotationEquity() {
  var COINS = ["eth", "btc", "sol", "bnb", "xrp", "doge", "avax", "link"];
  var MAPS = [];
  for (var c = 0; c < COINS.length; c++) MAPS.push(loadDailyClose(DIR + "ut_" + COINS[c] + "15m_5y.txt"));
  var dSet = {}, dl = [];
  for (c = 0; c < MAPS.length; c++) for (var k2 in MAPS[c]) if (!dSet[k2]) { dSet[k2] = 1; dl.push(k2); }
  dl.sort();
  var price = [];
  for (c = 0; c < COINS.length; c++) {
    var pr = new Array(dl.length), last = null;
    for (var x = 0; x < dl.length; x++) { var v = MAPS[c][dl[x]]; if (v !== undefined) last = v; pr[x] = last; }
    price.push(pr);
  }
  function mom(j, d, L) { if (d - L < 0) return null; var a = price[j][d - L]; return (a !== null) ? price[j][d] / a - 1 : null; }
  function inA(arr, v) { for (var z = 0; z < arr.length; z++) if (arr[z] === v) return true; return false; }
  var eq = 100, longs = [], lastR = -999, out = [];
  for (var d = 250; d < dl.length; d++) {
    var port = 0;
    if (longs.length) { var s = 0; for (var a2 = 0; a2 < longs.length; a2++) s += price[longs[a2]][d] / price[longs[a2]][d - 1] - 1; port = s / longs.length; }
    eq *= (1 + port);
    var still = [];
    for (a2 = 0; a2 < longs.length; a2++) { var mm = mom(longs[a2], d, 14); if (mm === null || mm > 0) still.push(longs[a2]); else eq *= (1 - 0.001 / 2); }
    longs = still;
    if (d - lastR >= 7) {
      var cand = [];
      for (var j2 = 0; j2 < COINS.length; j2++) { var m2 = mom(j2, d, 14); if (m2 !== null && m2 > 0) cand.push([m2, j2]); }
      cand.sort(function (p2, q2) { return q2[0] - p2[0]; });
      var nL = [];
      for (var o = 0; o < 2 && o < cand.length; o++) nL.push(cand[o][1]);
      var chg = 0;
      for (var y = 0; y < nL.length; y++) if (!inA(longs, nL[y])) chg++;
      for (y = 0; y < longs.length; y++) if (!inA(nL, longs[y])) chg++;
      eq *= (1 - 0.001 * chg / 2);
      longs = nL; lastR = d;
    }
    if (dl[d] >= "2021-10-01") out.push(eq);
  }
  return out;
}
function turtleEquity(coin) {
  var m = loadDailyClose(DIR + "ut_" + coin + "15m_5y.txt");
  var dts2 = [];
  for (var k3 in m) dts2.push(k3);
  dts2.sort();
  var N = dts2.length, px = new Array(N);
  for (var i2 = 0; i2 < N; i2++) px[i2] = m[dts2[i2]];
  var sma = new Array(N);
  for (i2 = 0; i2 < N; i2++) {
    if (i2 < 199) { sma[i2] = NaN; continue; }
    var s3 = 0; for (var x2 = i2 - 199; x2 <= i2; x2++) s3 += px[x2];
    sma[i2] = s3 / 200;
  }
  var atr = new Array(N); atr[0] = NaN;
  var trs = [];
  for (i2 = 1; i2 < N; i2++) {
    var t1 = Math.abs(px[i2] - px[i2 - 1]);
    trs.push(t1);
    if (trs.length < 14) atr[i2] = NaN;
    else if (trs.length === 14) { var s4 = 0; for (var q3 = 0; q3 < 14; q3++) s4 += trs[q3]; atr[i2] = s4 / 14; }
    else atr[i2] = (atr[i2 - 1] * 13 + t1) / 14;
  }
  function hh(d, L) { var mx = -1e18; for (var x3 = d - L + 1; x3 <= d; x3++) if (x3 >= 0 && px[x3] > mx) mx = px[x3]; return mx; }
  function ll(d, L) { var mn = 1e18; for (var x4 = d - L + 1; x4 <= d; x4++) if (x4 >= 0 && px[x4] < mn) mn = px[x4]; return mn; }
  var eq = 100, dir = 0, entry = 0, pendDir = 0, pendStop = 0, stopPx = 0, pendExit = false, out = [];
  for (var d2 = 1; d2 < N; d2++) {
    if (pendDir !== 0 || pendExit) {
      var fill = px[d2 - 1];
      if (dir !== 0) eq *= (1 + dir * (fill / entry - 1) * 0.998);
      if (pendDir !== 0) { dir = pendDir; entry = fill; stopPx = pendStop; eq *= 0.999; }
      pendDir = 0; pendExit = false;
    }
    if (dir === 1 && px[d2] <= stopPx) { eq *= (1 + (stopPx / entry - 1) * 0.998); dir = 0; }
    else if (dir === -1 && px[d2] >= stopPx) { eq *= (1 - (stopPx / entry - 1) * 0.998); dir = 0; }
    var mk = eq;
    if (dir !== 0) mk = eq * (1 + dir * (px[d2] / entry - 1));
    if (dts2[d2] >= "2021-10-01") out.push(mk);
    if (d2 < N - 1 && !isNaN(atr[d2]) && !isNaN(sma[d2])) {
      if (dir === 0) {
        if (px[d2] > hh(d2 - 1, 55) && px[d2] > sma[d2]) { pendDir = 1; pendStop = px[d2] - 2 * atr[d2]; }
        else if (px[d2] < ll(d2 - 1, 55) && px[d2] < sma[d2]) { pendDir = -1; pendStop = px[d2] + 2 * atr[d2]; }
      } else if (dir === 1 && px[d2] < ll(d2 - 1, 20)) pendExit = true;
      else if (dir === -1 && px[d2] > hh(d2 - 1, 20)) pendExit = true;
    }
  }
  return out;
}
report("UT Bot ETH 15m 50/10 (swap)", utbotEquity());
report("Rotation MOM14 top2 (8 coins)", rotationEquity());
report("Turtle V2 ETH daily", turtleEquity("eth"));
report("Turtle V2 SOL daily", turtleEquity("sol"));
(function () {
  var m = loadDailyClose(DIR + "ut_eth15m_swap5y.txt");
  var dts3 = [];
  for (var k4 in m) dts3.push(k4);
  dts3.sort();
  var out = [];
  for (var i3 = 0; i3 < dts3.length; i3++) if (dts3[i3] >= "2021-10-01") out.push(m[dts3[i3]]);
  report("ETH Buy&Hold (reference)", out);
})();
