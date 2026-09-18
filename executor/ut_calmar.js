// Calmar ratios for the three live strategies (from verified archive numbers,
// plus recomputed equity streams for exact DD where available).
// UT Bot: ut_trades_swap5y replay marked on swap daily closes (5y).
// Rotation: MOM14 top2 engine (same as ADF/KPSS run).
// Turtle: daily engine ETH & SOL (turtle.html semantics).
// cscript //nologo ut_calmar.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
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
function calmar(name, eq, startY) {
  var peak = -1, maxDD = 0, first = eq[0], last = eq[eq.length - 1];
  for (var i = 0; i < eq.length; i++) {
    if (eq[i] > peak) peak = eq[i];
    var dd = (peak - eq[i]) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  var days = eq.length; // daily marks
  var yrs = days / 365.25;
  var cagr = Math.pow(last / first, 1 / yrs) - 1;
  WScript.Echo(name + ": CAGR=" + (cagr * 100).toFixed(1) + "% maxDD=" + (maxDD * 100).toFixed(1) + "% CALMAR=" + (cagr / maxDD).toFixed(2) + "  (" + yrs.toFixed(2) + "y, " + eq.length + "d)");
}
function utbotEquity() {
  var m = loadDailyClose(DIR + "ut_eth15m_swap5y.txt");
  var dts = [];
  for (var k in m) dts.push(k);
  dts.sort();
  var f = fso.OpenTextFile(DIR + "ut_trades_swap5y.txt", 1);
  var tr = [];
  while (!f.AtEndOfStream) {
    var g = /dir=(-?\d) in=([\d-]+) (\d\d:\d\d) @([\d.]+) out=([\d-]+) (\d\d:\d\d) @([\d.]+)/.exec(f.ReadLine());
    if (g) tr.push({ dir: +g[1], inD: g[2].slice(0, 10), outD: g[5].slice(0, 10) });
  }
  f.Close();
  var eq = 100, pos = null, out = [], ti = 0;
  for (var i = 1; i < dts.length; i++) {
    while (ti < tr.length && tr[ti].inD <= dts[i]) { pos = tr[ti]; ti++; }
    var px = m[dts[i]], prev = m[dts[i - 1]];
    if (pos && pos.outD > dts[i] && px && prev) eq *= (1 + pos.dir * (px / prev - 1));
    if (pos && pos.outD <= dts[i]) pos = null;
    out.push(eq);
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
    out.push(eq);
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
      if (dir !== 0) { eq *= (1 + dir * (fill / entry - 1) * 0.998); dir = 0; }
      if (pendDir !== 0) { dir = pendDir; entry = fill; stopPx = pendStop; eq *= 0.999; }
      pendDir = 0; pendExit = false;
    }
    if (dir === 1 && px[d2] <= stopPx) { eq *= (1 + (stopPx / entry - 1) * 0.998); dir = 0; }
    else if (dir === -1 && px[d2] >= stopPx) { eq *= (1 - (stopPx / entry - 1) * 0.998); dir = 0; }
    var mk = eq;
    if (dir !== 0) mk = eq * (1 + dir * (px[d2] / entry - 1));
    out.push(mk);
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
calmar("Rotation MOM14 top2    (5y) ", rotationEquity());
calmar("Turtle V2 ETH daily    (5y) ", turtleEquity("eth"));
calmar("Turtle V2 SOL daily    (5y) ", turtleEquity("sol"));
// OOS-window Calmar (last 2y) for turtle SOL per exam calibration
function last2y(eq) { return eq.slice(eq.length - 730); }
var tsol = turtleEquity("sol");
calmar("Turtle V2 SOL (OOS 2y)      ", last2y(tsol));
var teth = turtleEquity("eth");
calmar("Turtle V2 ETH (OOS 2y)      ", last2y(teth));
var rot = rotationEquity();
calmar("Rotation (OOS 2y)           ", last2y(rot));
