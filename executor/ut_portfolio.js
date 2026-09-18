// Portfolio lab: spliced AFTER core.js (uses verified computeEquity for UT Bot).
// 1) Turtle SOL yearly breakdown; 2) rotation OOS long-only vs long+short;
// 3) pairwise daily-return correlations; 4) portfolio Calmar (monthly rebalance).
// Run: cat core.js ut_portfolio.js > _pf.js && cscript //nologo _pf.js
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
// ---- UT Bot daily equity via VERIFIED core.computeEquity ----
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
// ---- turtle daily equity (fixed engine, cross-validated) ----
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
// ---- rotation: long-only AND long+short variants (daily maps) ----
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

// ============ RUN ============
var UB = utbotDaily(), TS = turtleDaily("sol"), TE = turtleDaily("eth"), RL = rotationDaily(false), RS = rotationDaily(true);
// --- Q1: turtle SOL yearly ---
WScript.Echo("=== [Q1] Turtle V2 SOL yearly ===");
(function () {
  var dts = [];
  for (var k in TS) dts.push(k);
  dts.sort();
  var yr = "", yStart = 0, yPk = -1, yDD = 0;
  for (var i = 0; i < dts.length; i++) {
    var y = dts[i].slice(0, 4);
    if (y !== yr) {
      if (yr !== "" && i > 0) WScript.Echo("  " + yr + ": " + ((TS[dts[i - 1]] / yStart - 1) * 100).toFixed(0) + "% (yrDD " + (yDD * 100).toFixed(0) + "%)");
      yr = y; yStart = TS[dts[i]]; yPk = yStart; yDD = 0;
    }
    if (TS[dts[i]] > yPk) yPk = TS[dts[i]];
    var dd = (yPk - TS[dts[i]]) / yPk;
    if (dd > yDD) yDD = dd;
  }
  WScript.Echo("  " + yr + "(to 9/12): " + ((TS[dts[dts.length - 1]] / yStart - 1) * 100).toFixed(0) + "% (yrDD " + (yDD * 100).toFixed(0) + "%)");
})();
// --- Q2: rotation OOS long-only vs long+short ---
function cagrDD(map, fromD) {
  var dts = [];
  for (var k in map) if (k >= fromD) dts.push(k);
  dts.sort();
  var st = map[dts[0]], pk = -1, dd = 0;
  for (var i = 0; i < dts.length; i++) {
    if (map[dts[i]] > pk) pk = map[dts[i]];
    var d2 = (pk - map[dts[i]]) / pk;
    if (d2 > dd) dd = d2;
  }
  var yrs = dts.length / 365.25;
  var cg = Math.pow(map[dts[dts.length - 1]] / st, 1 / yrs) - 1;
  return { cagr: cg, dd: dd, cal: cg / dd };
}
WScript.Echo("=== [Q2] Rotation OOS(24-09..) long-only vs long+short(bottom2, 25% each) ===");
(function () {
  var a = cagrDD(RL, "2024-09-13"), b = cagrDD(RS, "2024-09-13");
  WScript.Echo("  long-only : CAGR=" + (a.cagr * 100).toFixed(0) + "% DD=" + (a.dd * 100).toFixed(0) + "% Calmar=" + a.cal.toFixed(2));
  WScript.Echo("  long+short: CAGR=" + (b.cagr * 100).toFixed(0) + "% DD=" + (b.dd * 100).toFixed(0) + "% Calmar=" + b.cal.toFixed(2));
})();
// --- common window & correlations ---
var STARTC = "2022-05-15";
function datesOf(map) { var a = []; for (var k in map) if (k >= STARTC) a.push(k); return a; }
var dUB = datesOf(UB), dTS = datesOf(TS), dTE = datesOf(TE), dRL = datesOf(RL);
var common = {};
for (var i3 = 0; i3 < dUB.length; i3++) common[dUB[i3]] = 1;
var others = [dTS, dTE, dRL];
for (var g2 = 0; g2 < others.length; g2++) {
  var s = {};
  for (var i4 = 0; i4 < others[g2].length; i4++) s[others[g2][i4]] = 1;
  for (var k3 in common) if (!s[k3]) delete common[k3];
}
var cdt = [];
for (var k4 in common) cdt.push(k4);
cdt.sort();
WScript.Echo("=== common window: " + cdt[0] + ".." + cdt[cdt.length - 1] + " (" + cdt.length + "d) ===");
function rets(map) {
  var r = [];
  for (var i5 = 1; i5 < cdt.length; i5++) r.push(map[cdt[i5]] / map[cdt[i5 - 1]] - 1);
  return r;
}
var rUB = rets(UB), rTS = rets(TS), rTE = rets(TE), rRL = rets(RL);
function corr(a, b) {
  var n = a.length, ma = 0, mb = 0;
  for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  var num = 0, va = 0, vb = 0;
  for (var j = 0; j < n; j++) { num += (a[j] - ma) * (b[j] - mb); va += (a[j] - ma) * (a[j] - ma); vb += (b[j] - mb) * (b[j] - mb); }
  return num / Math.sqrt(va * vb);
}
WScript.Echo("=== [corr] daily returns ===");
WScript.Echo("  UB~TurtleSOL=" + corr(rUB, rTS).toFixed(2) + "  UB~TurtleETH=" + corr(rUB, rTE).toFixed(2) + "  UB~Rot=" + corr(rUB, rRL).toFixed(2));
WScript.Echo("  TurtleSOL~TurtleETH=" + corr(rTS, rTE).toFixed(2) + "  TurtleSOL~Rot=" + corr(rTS, rRL).toFixed(2) + "  TurtleETH~Rot=" + corr(rTE, rRL).toFixed(2));
// --- singles on common window (fair baseline) ---
function single(name, map) { var s = cagrDD(map, STARTC); WScript.Echo("  " + name + ": CAGR=" + (s.cagr * 100).toFixed(0) + "% DD=" + (s.dd * 100).toFixed(0) + "% Calmar=" + s.cal.toFixed(2)); }
WScript.Echo("=== singles on common window ===");
single("UT Bot        ", UB);
single("Turtle SOL    ", TS);
single("Turtle ETH    ", TE);
single("Rotation      ", RL);
// --- portfolio combos, monthly rebalance ---
function combo(name, maps, ws) {
  var eqs = [], i;
  for (i = 0; i < maps.length; i++) eqs.push(100 * ws[i]);
  var month = "", tot = 0;
  var pk = -1, dd = 0, curve = [];
  for (var d = 0; d < cdt.length; d++) {
    var dt = cdt[d];
    if (d > 0) {
      for (i = 0; i < maps.length; i++) {
        var r = maps[i][dt] / maps[i][cdt[d - 1]] - 1;
        eqs[i] *= (1 + r);
      }
      var mo = dt.slice(0, 7);
      if (mo !== month) {
        tot = 0;
        for (i = 0; i < eqs.length; i++) tot += eqs[i];
        for (i = 0; i < eqs.length; i++) eqs[i] = tot * ws[i];
      }
      month = mo;
    }
    tot = 0;
    for (i = 0; i < eqs.length; i++) tot += eqs[i];
    curve.push(tot);
    if (tot > pk) pk = tot;
    var d2 = (pk - tot) / pk;
    if (d2 > dd) dd = d2;
  }
  var yrs = cdt.length / 365.25;
  var cg = Math.pow(curve[curve.length - 1] / curve[0], 1 / yrs) - 1;
  WScript.Echo("  " + name + ": CAGR=" + (cg * 100).toFixed(0) + "% DD=" + (dd * 100).toFixed(0) + "% Calmar=" + (cg / dd).toFixed(2));
}
WScript.Echo("=== [Q4] portfolio combos (monthly rebalance) ===");
combo("UTBot+轮动 50/50 (=现役形态) ", [UB, RL], [0.5, 0.5]);
combo("UTBot+轮动 44/56 (=实盘80/100)", [UB, RL], [0.44, 0.56]);
combo("SOL龟+UTBot  50/50      ", [TS, UB], [0.5, 0.5]);
combo("ETH龟+轮动   50/50      ", [TE, RL], [0.5, 0.5]);
combo("ETH龟+UTBot+轮动 40/30/30", [TE, UB, RL], [0.4, 0.3, 0.3]);
combo("ETH龟+UTBot+轮动 34/33/33", [TE, UB, RL], [0.34, 0.33, 0.33]);
combo("SOL龟+UTBot+轮动 40/30/30", [TS, UB, RL], [0.4, 0.3, 0.3]);
combo("全部四腿 ETH龟+SOL龟+UB+轮动 25x4", [TE, TS, UB, RL], [0.25, 0.25, 0.25, 0.25]);
