// Portfolio STRESS lab (spliced after core.js):
// A) rebalance cost stress (fee on monthly turnover): 0 / 0.1% / 0.2%
// B) extreme-event windows: FTX 2022-11, squeeze 2024-03, carry-unwind 2024-08
//    + worst-5 rolling 7d returns + event-window correlation spike
// C) SOL-legacy-free windows: 2024-01->, OOS 2024-09-> Calmar for key combos
// ASCII labels only. Run: cat core.js ut_pf_stress.js > _ps.js && cscript //nologo _ps.js
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
function dOf(ms) {
  var dt = new Date(ms);
  return dt.getUTCFullYear() + "-" + (dt.getUTCMonth() + 1 < 10 ? "0" : "") + (dt.getUTCMonth() + 1) + "-" + (dt.getUTCDate() < 10 ? "0" : "") + dt.getUTCDate();
}
function utbotDaily() {
  var f = fso.OpenTextFile(DIR + "ut_eth15m_swap5y.txt", 1);
  var bars = [];
  while (!f.AtEndOfStream) {
    var p = f.ReadLine().split(" ");
    if (p.length < 5) continue;
    bars.push({ ts: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4] });
  }
  f.Close();
  var eqr = computeEquity(bars, 50, 10, 900000, 0.001, 100);
  var map = {};
  for (var i = 0; i < eqr.curve.length; i++) map[dOf(eqr.curve[i][0] + 900000)] = eqr.curve[i][1];
  return map;
}
function turtleDaily(coin) {
  var m = loadDailyClose(DIR + "ut_" + coin + "15m_5y.txt");
  var dts = [];
  for (var k in m) dts.push(k);
  dts.sort();
  var N = dts.length, px = new Array(N);
  for (var i2 = 0; i2 < N; i2++) px[i2] = m[dts[i2]];
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
  var eq = 100, dir = 0, entry = 0, pendDir = 0, pendStop = 0, stopPx = 0, pendExit = false, out = {};
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
    out[dts[d2]] = mk;
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
function rotationDaily(useShort) {
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
  var eq = 100, longs = [], shorts = [], lastR = -999, out = {};
  for (var d = 250; d < dl.length; d++) {
    var port = 0;
    if (longs.length) { var s = 0; for (var a2 = 0; a2 < longs.length; a2++) s += price[longs[a2]][d] / price[longs[a2]][d - 1] - 1; port += 0.5 * s / longs.length; }
    if (useShort && shorts.length) { var s2 = 0; for (var b2 = 0; b2 < shorts.length; b2++) s2 += price[shorts[b2]][d] / price[shorts[b2]][d - 1] - 1; port -= 0.5 * s2 / shorts.length; }
    eq *= (1 + port);
    var stillL = [], stillS = [];
    for (a2 = 0; a2 < longs.length; a2++) { var mm = mom(longs[a2], d, 14); if (mm === null || mm > 0) stillL.push(longs[a2]); else eq *= (1 - 0.001 * 0.5 / 2); }
    for (b2 = 0; b2 < shorts.length; b2++) { var ms = mom(shorts[b2], d, 14); if (ms === null || ms < 0) stillS.push(shorts[b2]); else eq *= (1 - 0.001 * 0.5 / 2); }
    longs = stillL; shorts = stillS;
    if (d - lastR >= 7) {
      var cand = [];
      for (var j2 = 0; j2 < COINS.length; j2++) { var m2 = mom(j2, d, 14); if (m2 !== null) cand.push([m2, j2]); }
      cand.sort(function (p2, q2) { return q2[0] - p2[0]; });
      var nL = [], nS = [];
      for (var o = 0; o < 2; o++) if (cand[o] && cand[o][0] > 0) nL.push(cand[o][1]);
      if (useShort) for (var o2 = cand.length - 1; o2 >= 0 && nS.length < 2; o2--) if (cand[o2][0] < 0) nS.push(cand[o2][1]);
      var chg = 0;
      for (var y = 0; y < nL.length; y++) if (!inA(longs, nL[y])) chg++;
      for (y = 0; y < longs.length; y++) if (!inA(nL, longs[y])) chg++;
      for (y = 0; y < nS.length; y++) if (!inA(shorts, nS[y])) chg++;
      for (y = 0; y < shorts.length; y++) if (!inA(nS, shorts[y])) chg++;
      eq *= (1 - 0.001 * chg / 4);
      longs = nL; shorts = nS; lastR = d;
    }
    out[dl[d]] = eq;
  }
  return out;
}
var UB = utbotDaily(), TS = turtleDaily("sol"), TE = turtleDaily("eth"), RS = rotationDaily(true);
var STARTC = "2022-05-15";
function datesOf(map) { var a = []; for (var k in map) if (k >= STARTC) a.push(k); return a; }
var dUB = datesOf(UB), dTS = datesOf(TS), dTE = datesOf(TE), dRS = datesOf(RS);
var common = {};
for (var i3 = 0; i3 < dUB.length; i3++) common[dUB[i3]] = 1;
var others = [dTS, dTE, dRS];
for (var g2 = 0; g2 < others.length; g2++) {
  var sSet = {};
  for (var i4 = 0; i4 < others[g2].length; i4++) sSet[others[g2][i4]] = 1;
  for (var k3 in common) if (!sSet[k3]) delete common[k3];
}
var cdt = [];
for (var k4 in common) cdt.push(k4);
cdt.sort();
// generic combo with fee on monthly rebalance turnover; optional window
function comboRun(maps, ws, fee, fromD, toD) {
  var eqs = [], i;
  for (i = 0; i < maps.length; i++) eqs.push(100 * ws[i]);
  var month = "", tot0 = 0;
  var pk = -1, dd = 0, curve = [], tots = [];
  for (var d = 0; d < cdt.length; d++) {
    var dt = cdt[d];
    if (dt < fromD) continue;
    if (toD && dt > toD) break;
    if (d > 0 && cdt[d - 1] >= fromD) {
      for (i = 0; i < maps.length; i++) eqs[i] *= (1 + maps[i][dt] / maps[i][cdt[d - 1]] - 1);
    }
    var mo = dt.slice(0, 7);
    if (mo !== month && month !== "") {
      var tot = 0;
      for (i = 0; i < eqs.length; i++) tot += eqs[i];
      var turn = 0;
      for (i = 0; i < eqs.length; i++) turn += Math.abs(eqs[i] / tot - ws[i]);
      var totA = tot * (1 - turn * fee);
      for (i = 0; i < eqs.length; i++) eqs[i] = totA * ws[i];
    }
    month = mo;
    var t2 = 0;
    for (i = 0; i < eqs.length; i++) t2 += eqs[i];
    curve.push({ d: dt, eq: t2 });
    if (t2 > pk) pk = t2;
    var dd2 = (pk - t2) / pk;
    if (dd2 > dd) dd = dd2;
  }
  var yrs = curve.length / 365.25;
  var cg = Math.pow(curve[curve.length - 1].eq / curve[0].eq, 1 / yrs) - 1;
  return { cagr: cg, dd: dd, cal: cg / dd, curve: curve };
}
var W4 = [TE, TS, UB, RS], WS4 = [0.25, 0.25, 0.25, 0.25];
var W2 = [UB, RS], WS2 = [0.44, 0.56];
var W3S = [TS, UB, RS], WS3S = [0.4, 0.3, 0.3];
// UB at 2x: double the daily returns of the verified 1x curve (fee/liq approx noted)
var UB1 = {};
for (var k5 in UB) UB1[k5] = UB[k5];
var UB2 = {};
(function () {
  var ds = [];
  for (var k6 in UB1) ds.push(k6);
  ds.sort();
  var e = 100;
  UB2[ds[0]] = 100;
  for (var i6 = 1; i6 < ds.length; i6++) {
    var r = UB1[ds[i6]] / UB1[ds[i6 - 1]] - 1;
    e *= (1 + 2 * r);
    UB2[ds[i6]] = e;
  }
})();
function show(name, maps, ws) {
  var a = comboRun(maps, ws, 0.001, STARTC, null);
  var b = comboRun(maps, ws, 0.001, "2024-09-13", null);
  WScript.Echo("  " + name + ": full CAGR=" + (a.cagr * 100).toFixed(0) + "% DD=" + (a.dd * 100).toFixed(0) + "% Calmar=" + a.cal.toFixed(2) + " | OOS CAGR=" + (b.cagr * 100).toFixed(0) + "% DD=" + (b.dd * 100).toFixed(0) + "% Calmar=" + b.cal.toFixed(2));
}
WScript.Echo("=== live shape: UT Bot leg at 2x leverage ===");
show("UB2x/ROT 150/60 (=真实现役)", [UB2, RS], [0.714, 0.286]);
show("UB2x/ROT 50/50            ", [UB2, RS], [0.5, 0.5]);
show("UB2x/ROT 44/56            ", [UB2, RS], [0.44, 0.56]);
WScript.Echo("=== final 3-leg: UB at 1x vs 2x ===");
show("3LEG UB1x 40/30/30(龟/UB/轮)", [TE, UB, RS], [0.4, 0.3, 0.3]);
show("3LEG UB2x 40/30/30         ", [TE, UB2, RS], [0.4, 0.3, 0.3]);
show("3LEG UB2x 25/25/50         ", [TE, UB2, RS], [0.25, 0.25, 0.5]);
