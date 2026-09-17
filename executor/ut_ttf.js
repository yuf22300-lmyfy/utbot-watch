// SOL Turtle V2 on CLOSE-CONFIRMED timeframes: 1h / 4h / 12h / 1d (anchor).
// Semantics: all signals & stops evaluated at bar CLOSE only (no intrabar),
// ALL fills at next bar open (fully executable). Channels over closes,
// 55/20 bars, 2xATR(14 bars of TF) locked stop, SMA200(TF bars) gate.
// 100U compound, 0.1%/side. Reports full/train(3y)/oos(2y).
// cscript //nologo ut_ttf.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + "ut_sol15m_5y.txt", 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length) raw.push(ln); }
f.Close();
function agg(TFms) {
  var bars = [], cur = null;
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i].split(" ");
    var t = parseInt(p[0], 10), o = +p[1], h = +p[2], l = +p[3], c = +p[4];
    var bkt = Math.floor(t / TFms) * TFms;
    if (!cur || cur.ts !== bkt) {
      if (cur) bars.push(cur);
      cur = { ts: bkt, o: o, h: h, l: l, c: c };
    } else {
      if (h > cur.h) cur.h = h;
      if (l < cur.l) cur.l = l;
      cur.c = c;
    }
  }
  if (cur) bars.push(cur);
  return bars;
}
function runTF(name, TFms, entL, extL, stopM, gate) {
  var B = agg(TFms), N = B.length;
  var splitMs = (B[N - 1].ts + TFms) - 730 * 86400000;
  // ATR14 on TF bars
  var atr = new Array(N); atr[0] = NaN;
  var trs = [];
  for (var j = 1; j < N; j++) {
    var x1 = B[j].h - B[j].l, x2 = Math.abs(B[j].h - B[j - 1].c), x3 = Math.abs(B[j].l - B[j - 1].c);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3;
    trs.push(m);
    if (trs.length < 14) atr[j] = NaN;
    else if (trs.length === 14) { var s = 0; for (var q = 0; q < 14; q++) s += trs[q]; atr[j] = s / 14; }
    else atr[j] = (atr[j - 1] * 13 + m) / 14;
  }
  var sma = new Array(N);
  {
    var s2 = 0.0;
    for (var k = 0; k < N; k++) {
      s2 += B[k].c;
      if (k >= 200) s2 -= B[k - 200].c;
      sma[k] = (k >= 199) ? s2 / 200 : NaN;
    }
  }
  function hh(d, L) { var mx = -1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && B[x].c > mx) mx = B[x].c; return mx; }
  function ll(d, L) { var mn = 1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && B[x].c < mn) mn = B[x].c; return mn; }
  var cash = 100.0, dir = 0, qty = 0, entry = 0, stopPx = 0;
  var pendDir = 0, pendStop = 0, pendExit = false, entryFee = 0;
  var holdBars = 0, holdTot = 0, holdN = 0;
  var seg = [{ st: 100, eq: 100, pk: 100, dd: 0, tr: 0, win: 0, bars: 0 }, { st: 100, eq: 100, pk: 100, dd: 0, tr: 0, win: 0, bars: 0 }];
  var START = 250; // skip warmup bars
  function whichSeg(i) { return B[i].ts < splitMs ? seg[0] : seg[1]; }
  for (var i = START + 1; i < N; i++) {
    if (pendDir !== 0 || pendExit) {
      var fill = B[i].o;
      if (dir !== 0) {
        var feeOut = 0.001 * qty * fill;
        var pnl = dir * qty * (fill - entry) - feeOut;
        cash += pnl;
        var sb = whichSeg(i);
        sb.tr++; if (pnl - entryFee > 0) sb.win++;
        holdTot += holdBars; holdN++;
        dir = 0; qty = 0;
      }
      if (pendDir !== 0) {
        dir = pendDir; entry = fill; qty = cash / entry;
        entryFee = 0.001 * qty * entry;
        cash -= entryFee; stopPx = pendStop; holdBars = 0; pendDir = 0;
      }
      pendExit = false;
    }
    if (dir !== 0) holdBars++;
    var e = cash;
    if (dir !== 0) e += dir * qty * (B[i].c - entry);
    var sg = whichSeg(i);
    if (sg.bars === 0) { sg.st = e; sg.pk = e; }
    sg.bars++; sg.eq = e;
    if (e > sg.pk) sg.pk = e;
    var dd = (sg.pk - e) / sg.pk;
    if (dd > sg.dd) sg.dd = dd;
    if (i < N - 1 && !isNaN(atr[i]) && !isNaN(sma[i]) && !isNaN(hh(i - 1, entL))) {
      var gL = gate ? B[i].c > sma[i] : true;
      var gS = gate ? B[i].c < sma[i] : true;
      if (dir === 0) {
        if (B[i].c > hh(i - 1, entL) && gL) { pendDir = 1; pendStop = B[i].c - stopM * atr[i]; }
        else if (B[i].c < ll(i - 1, entL) && gS) { pendDir = -1; pendStop = B[i].c + stopM * atr[i]; }
      } else if (dir === 1 && (B[i].c < ll(i - 1, extL) || B[i].c <= stopPx)) pendExit = true;
      else if (dir === -1 && (B[i].c > hh(i - 1, extL) || B[i].c >= stopPx)) pendExit = true;
    }
  }
  function cagrOf(s) {
    if (s.bars < 30) return NaN;
    var yrs = s.bars * TFms / 86400000 / 365.25;
    return Math.pow(s.eq / s.st, 1 / yrs) - 1;
  }
  var full5 = seg[0].eq / seg[0].st * seg[1].eq / seg[1].st;
  var yrsF = (seg[0].bars + seg[1].bars) * TFms / 86400000 / 365.25;
  var trTot = seg[0].tr + seg[1].tr;
  var avgHoldD = holdN ? (holdTot / holdN) * TFms / 86400000 : 0;
  function fmt(x) { return isNaN(x) ? "  n/a" : (x >= 0 ? "+" : "") + x.toFixed(0); }
  WScript.Echo(name + " bars=" + N + " | FULL " + fmt((Math.pow(full5, 1 / yrsF) - 1) * 100) + "% " + trTot + "t hold~" + avgHoldD.toFixed(0) + "d" +
    " | TRAIN " + fmt(cagrOf(seg[0]) * 100) + "% DD" + (seg[0].dd * 100).toFixed(0) + "% " + seg[0].tr + "t" +
    " | OOS " + fmt(cagrOf(seg[1]) * 100) + "% DD" + (seg[1].dd * 100).toFixed(0) + "% " + seg[1].tr + "t wr" + (seg[1].tr ? (100 * seg[1].win / seg[1].tr).toFixed(0) : 0) + "%");
}
WScript.Echo("SOL Turtle close-confirmed timeframes | 55/20 bars, 2ATR lock, SMA200(TF) gate | next-open fills, 0.1%/side");
runTF("1h ", 3600000, 55, 20, 2, 1);
runTF("4h ", 14400000, 55, 20, 2, 1);
runTF("12h", 43200000, 55, 20, 2, 1);
runTF("1d ", 86400000, 55, 20, 2, 1);
WScript.Echo("--- no-gate variant (direction both ways) ---");
runTF("1h ", 3600000, 55, 20, 2, 0);
runTF("4h ", 14400000, 55, 20, 2, 0);
runTF("12h", 43200000, 55, 20, 2, 0);
runTF("1d ", 86400000, 55, 20, 2, 0);
