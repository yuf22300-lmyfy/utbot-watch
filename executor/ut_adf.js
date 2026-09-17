// ADF stationarity tests for the three live strategies (JScript, no deps).
// Per strategy: (a) daily returns, spec=constant (should reject unit root);
// (b) log equity, spec=constant+trend (H0: random walk w/ drift; H1: trend-stationary).
// ADF via OLS with AIC lag selection (k=0..8), asymptotic MacKinnon critical values.
// cscript //nologo ut_adf.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");

// ---------- linear algebra ----------
function gaussSolve(A, b) { // A n*n, b n -> solution vector (mutates copies)
  var n = A.length, i, j, k;
  var M = [], v = [];
  for (i = 0; i < n; i++) { M.push(A[i].slice(0)); v.push(b[i]); }
  for (k = 0; k < n; k++) {
    var piv = k;
    for (i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
    if (Math.abs(M[piv][k]) < 1e-12) return null;
    var t = M[k]; M[k] = M[piv]; M[piv] = t;
    var tv = v[k]; v[k] = v[piv]; v[piv] = tv;
    for (i = k + 1; i < n; i++) {
      var f = M[i][k] / M[k][k];
      for (j = k; j < n; j++) M[i][j] -= f * M[k][j];
      v[i] -= f * v[k];
    }
  }
  var x = new Array(n);
  for (i = n - 1; i >= 0; i--) {
    var s = v[i];
    for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
function ols(X, y) { // returns {b, tstats, rss, n, p}
  var n = y.length, p = X[0].length, i, j, k2;
  var XtX = [], Xty = new Array(p);
  for (i = 0; i < p; i++) { XtX.push(new Array(p)); Xty[i] = 0; }
  for (i = 0; i < p; i++) for (j = 0; j < p; j++) XtX[i][j] = 0;
  for (var r = 0; r < n; r++) {
    for (i = 0; i < p; i++) {
      Xty[i] += X[r][i] * y[r];
      for (j = i; j < p; j++) XtX[i][j] += X[r][i] * X[r][j];
    }
  }
  for (i = 0; i < p; i++) for (j = 0; j < i; j++) XtX[i][j] = XtX[j][i];
  var b = gaussSolve(XtX, Xty);
  if (b === null) return null;
  var rss = 0;
  for (r = 0; r < n; r++) {
    var s2 = 0;
    for (i = 0; i < p; i++) s2 += X[r][i] * b[i];
    var e = y[r] - s2;
    rss += e * e;
  }
  // variance: sigma2 * (XtX)^-1 diag via solve for each unit vector
  var sigma2 = rss / (n - p);
  var t = new Array(p);
  for (i = 0; i < p; i++) {
    var ei = new Array(p);
    for (j = 0; j < p; j++) ei[j] = (i === j) ? 1 : 0;
    var col = gaussSolve(XtX, ei);
    if (col === null) { t[i] = NaN; continue; }
    var vj = sigma2 * col[i];
    t[i] = (vj > 0) ? b[i] / Math.sqrt(vj) : NaN;
  }
  return { b: b, t: t, rss: rss, n: n, p: p };
}
// ---------- ADF ----------
// spec: "c" (constant) or "ct" (constant+trend). gamma index: with k lags,
// columns = [const, (trend), y_{t-1}, d1..dk]; gammaIdx = (spec==="ct") ? 2 : 1.
function adf(series, spec) {
  var T = series.length;
  var best = null;
  for (var k = 0; k <= 8; k++) {
    var X = [], y = [];
    var start = 1 + k; // need y_{t-1} and k diffs
    for (var t = start; t < T; t++) {
      var row = [];
      row.push(1);
      if (spec === "ct") row.push(t);
      row.push(series[t - 1]);
      for (var l = 1; l <= k; l++) row.push(series[t - l] - series[t - l - 1]);
      X.push(row);
      y.push(series[t] - series[t - 1]);
    }
    var res = ols(X, y);
    if (res === null) continue;
    var aic = res.n * Math.log(res.rss / res.n) + 2 * res.p;
    if (best === null || aic < best.aic) best = { aic: aic, k: k, res: res };
  }
  var gammaIdx = (spec === "ct") ? 2 : 1;
  var tau = best.res.t[gammaIdx];
  var gamma = best.res.b[gammaIdx];
  var hl = (gamma < 0 && gamma > -2) ? Math.log(0.5) / Math.log(1 + gamma) : NaN;
  return { tau: tau, k: best.k, n: best.res.n, halfLife: hl, gamma: gamma };
}
var CV = {
  c: { "1%": -3.43, "5%": -2.86, "10%": -2.57 },
  ct: { "1%": -3.96, "5%": -3.41, "10%": -3.12 }
};
function verdict(tau, cv) {
  if (tau < cv["1%"]) return "reject@1%";
  if (tau < cv["5%"]) return "reject@5%";
  if (tau < cv["10%"]) return "reject@10%";
  return "CANNOT-reject (unit root)";
}
function report(name, eqSeries) {
  // eqSeries: array of equity (ascending dates), starting >= warmup
  var rets = [];
  for (var i = 1; i < eqSeries.length; i++) rets.push(Math.log(eqSeries[i] / eqSeries[i - 1]));
  var logs = [];
  for (i = 0; i < eqSeries.length; i++) logs.push(Math.log(eqSeries[i]));
  var a1 = adf(rets, "c");
  var a2 = adf(logs, "ct");
  WScript.Echo("[" + name + "] T=" + eqSeries.length);
  WScript.Echo("  daily-returns ADF(const): tau=" + a1.tau.toFixed(2) + " k=" + a1.k + " -> " + verdict(a1.tau, CV.c));
  WScript.Echo("  log-equity   ADF(c+t):  tau=" + a2.tau.toFixed(2) + " k=" + a2.k + " -> " + verdict(a2.tau, CV.ct) +
    (isNaN(a2.halfLife) ? "" : " | dev-from-trend half-life ~" + a2.halfLife.toFixed(0) + "d"));
}

// ---------- data loaders ----------
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

// ---- strategy 1: UT Bot ETH 15m 50/10 on SWAP (mark-to-market daily via trade replay) ----
function utbotEquity() {
  // replay from ut_trades_swap5y.txt (verified archive), mark daily with swap closes
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

// ---- strategy 2: Rotation MOM14 top2 + daily neg-exit (live shape, long-only) ----
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

// ---- strategy 3: Turtle V2 daily (ETH and SOL) ----
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
  var eq = 100, dir = 0, entry = 0, pendDir = 0, pendStop = 0, stopPx = 0, pendExit = false, inD = 0, out = [];
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
// reference: ETH buy & hold
(function () {
  var m = loadDailyClose(DIR + "ut_eth15m_swap5y.txt");
  var dts3 = [];
  for (var k4 in m) dts3.push(k4);
  dts3.sort();
  var out = [];
  for (var i3 = 0; i3 < dts3.length; i3++) if (dts3[i3] >= "2021-10-01") out.push(m[dts3[i3]]);
  report("ETH Buy&Hold (reference)", out);
})();
