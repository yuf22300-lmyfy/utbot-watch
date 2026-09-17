// SOL Turtle V2 on 4h close-confirmed - detailed report (yearly, trade stats).
// Same engine as ut_ttf.js (signals+stops at bar close, fills next bar open).
// cscript //nologo ut_ttf4h.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + "ut_sol15m_5y.txt", 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length) raw.push(ln); }
f.Close();
var TFms = 14400000; // 4h
var bars = [], cur = null;
for (var i = 0; i < raw.length; i++) {
  var p = raw[i].split(" ");
  var t = parseInt(p[0], 10), o = +p[1], h = +p[2], l = +p[3], c = +p[4];
  var bkt = Math.floor(t / TFms) * TFms;
  if (!cur || cur.ts !== bkt) { if (cur) bars.push(cur); cur = { ts: bkt, o: o, h: h, l: l, c: c }; }
  else { if (h > cur.h) cur.h = h; if (l < cur.l) cur.l = l; cur.c = c; }
}
if (cur) bars.push(cur);
var N = bars.length;
var splitMs = (bars[N - 1].ts + TFms) - 730 * 86400000;
var atr = new Array(N); atr[0] = NaN;
var trs = [];
for (var j = 1; j < N; j++) {
  var x1 = bars[j].h - bars[j].l, x2 = Math.abs(bars[j].h - bars[j - 1].c), x3 = Math.abs(bars[j].l - bars[j - 1].c);
  var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3;
  trs.push(m);
  if (trs.length < 14) atr[j] = NaN;
  else if (trs.length === 14) { var s = 0; for (var q = 0; q < 14; q++) s += trs[q]; atr[j] = s / 14; }
  else atr[j] = (atr[j - 1] * 13 + m) / 14;
}
var sma = new Array(N);
{
  var s2 = 0.0;
  for (var k = 0; k < N; k++) { s2 += bars[k].c; if (k >= 200) s2 -= bars[k - 200].c; sma[k] = (k >= 199) ? s2 / 200 : NaN; }
}
function hh(d, L) { var mx = -1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && bars[x].c > mx) mx = bars[x].c; return mx; }
function ll(d, L) { var mn = 1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && bars[x].c < mn) mn = bars[x].c; return mn; }
var cash = 100.0, dir = 0, qty = 0, entry = 0, stopPx = 0, pendDir = 0, pendStop = 0, pendExit = false, entryFee = 0;
var trades = [], holdB = 0;
var eqArr = new Array(N), START = 250;
for (var d = START + 1; d < N; d++) {
  if (pendDir !== 0 || pendExit) {
    var fill = bars[d].o;
    if (dir !== 0) {
      var feeOut = 0.001 * qty * fill;
      var pnl = dir * qty * (fill - entry) - feeOut;
      cash += pnl;
      var pct = 100 * (pnl - entryFee) / (qty * entry);
      trades.push({ ts: bars[d].ts, d: dir, pnl: pnl, net: pnl - entryFee, pct: pct, hold: holdB });
      dir = 0; qty = 0;
    }
    if (pendDir !== 0) {
      dir = pendDir; entry = fill; qty = cash / entry;
      entryFee = 0.001 * qty * entry;
      cash -= entryFee; stopPx = pendStop; holdB = 0; pendDir = 0;
    }
    pendExit = false;
  }
  if (dir !== 0) holdB++;
  var e = cash;
  if (dir !== 0) e += dir * qty * (bars[d].c - entry);
  eqArr[d] = e;
  if (d < N - 1 && !isNaN(atr[d]) && !isNaN(sma[d])) {
    if (dir === 0) {
      if (bars[d].c > hh(d - 1, 55) && bars[d].c > sma[d]) { pendDir = 1; pendStop = bars[d].c - 2 * atr[d]; }
      else if (bars[d].c < ll(d - 1, 55) && bars[d].c < sma[d]) { pendDir = -1; pendStop = bars[d].c + 2 * atr[d]; }
    } else if (dir === 1 && (bars[d].c < ll(d - 1, 20) || bars[d].c <= stopPx)) pendExit = true;
    else if (dir === -1 && (bars[d].c > hh(d - 1, 20) || bars[d].c >= stopPx)) pendExit = true;
  }
}
for (var z = 0; z <= START; z++) eqArr[z] = 100;
// metrics
function isoD(ms) { var dt = new Date(ms); return dt.getUTCFullYear() + "-" + (dt.getUTCMonth() + 1 < 10 ? "0" : "") + (dt.getUTCMonth() + 1) + "-" + (dt.getUTCDate() < 10 ? "0" : "") + dt.getUTCDate(); }
var peak = -1, maxDD = 0;
for (var d2 = 0; d2 < N; d2++) { if (eqArr[d2] > peak) peak = eqArr[d2]; var dd = (peak - eqArr[d2]) / peak; if (dd > maxDD) maxDD = dd; }
var yrs = (bars[N - 1].ts - bars[START].ts) / 86400000 / 365.25;
var tot = eqArr[N - 1] / 100;
var cagr = Math.pow(tot, 1 / yrs) - 1;
var wins = 0, best = -1e9, worst = 1e9, holdSum = 0;
for (var t2 = 0; t2 < trades.length; t2++) { if (trades[t2].net > 0) wins++; if (trades[t2].pct > best) best = trades[t2].pct; if (trades[t2].pct < worst) worst = trades[t2].pct; holdSum += trades[t2].hold; }
WScript.Echo("SOL Turtle V2 4h close-confirmed | 55/20 bars, 2ATR lock, SMA200 gate | 0.1%/side, next-open fill");
WScript.Echo("window=" + isoD(bars[START].ts) + ".." + isoD(bars[N - 1].ts + TFms) + " (" + yrs.toFixed(2) + "y)");
WScript.Echo("TOTAL=" + ((tot - 1) * 100).toFixed(0) + "% CAGR=" + (cagr * 100).toFixed(1) + "%/yr maxDD=" + (maxDD * 100).toFixed(0) + "%");
WScript.Echo("TRADES=" + trades.length + " WR=" + (trades.length ? (100 * wins / trades.length).toFixed(0) : 0) + "% avgHold=" + (trades.length ? (holdSum / trades.length * 4 / 24).toFixed(1) : 0) + "d best=" + best.toFixed(0) + "% worst=" + worst.toFixed(0) + "%");
// yearly
var yStart = null, yPk = -1, yDD = 0, yr = "";
var out = [];
for (var d3 = START; d3 < N; d3++) {
  var y = isoD(bars[d3].ts).slice(0, 4);
  if (y !== yr) {
    if (yr !== "") out.push({ y: yr, ret: (eqArr[d3 - 1] / yStart - 1) * 100, dd: yDD * 100 });
    yr = y; yStart = eqArr[d3]; yPk = eqArr[d3]; yDD = 0;
  }
  if (eqArr[d3] > yPk) yPk = eqArr[d3];
  var dd2 = (yPk - eqArr[d3]) / yPk;
  if (dd2 > yDD) yDD = dd2;
}
out.push({ y: yr, ret: (eqArr[N - 1] / yStart - 1) * 100, dd: yDD * 100 });
WScript.Echo("YEARLY:");
for (var o2 = 0; o2 < out.length; o2++) WScript.Echo("  " + out[o2].y + ": " + (out[o2].ret >= 0 ? "+" : "") + out[o2].ret.toFixed(0) + "% (yr DD " + out[o2].dd.toFixed(0) + "%)");
// train/oos
var stT = null, enT = null, pkT = -1, ddT = 0, stO = null, enO = null, pkO = -1, ddO = 0;
for (var d4 = START; d4 < N; d4++) {
  var v = eqArr[d4];
  if (bars[d4].ts < splitMs) { if (stT === null) { stT = v; pkT = v; } enT = v; if (v > pkT) pkT = v; var ddT2 = (pkT - v) / pkT; if (ddT2 > ddT) ddT = ddT2; }
  else { if (stO === null) { stO = v; pkO = v; } enO = v; if (v > pkO) pkO = v; var ddO2 = (pkO - v) / pkO; if (ddO2 > ddO) ddO = ddO2; }
}
WScript.Echo("TRAIN(3y)=" + ((enT / stT - 1) * 100).toFixed(0) + "% | OOS(2y)=" + ((enO / stO - 1) * 100).toFixed(0) + "%");
// last 8 trades
WScript.Echo("LAST 8 TRADES:");
for (var t3 = Math.max(0, trades.length - 8); t3 < trades.length; t3++) {
  var T = trades[t3];
  WScript.Echo("  " + isoD(T.ts) + " d=" + T.d + " pct=" + (T.pct >= 0 ? "+" : "") + T.pct.toFixed(1) + "% hold=" + (T.hold * 4 / 24).toFixed(0) + "d");
}
