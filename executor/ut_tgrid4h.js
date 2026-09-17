// SOL Turtle 4h close-confirmed PARAM GRID with 3y train / 2y OOS exam.
// Same engine as ut_ttf4h.js (close-only signals, next-open fills).
// cscript //nologo ut_tgrid4h.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + "ut_sol15m_5y.txt", 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length) raw.push(ln); }
f.Close();
var TFms = 14400000;
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
var hhC = {}, llC = {};
function hh(d, L) {
  var key = d * 100 + L;
  if (hhC[key] !== undefined) return hhC[key];
  var mx = -1e18;
  for (var x = d - L + 1; x <= d; x++) if (x >= 0 && bars[x].c > mx) mx = bars[x].c;
  hhC[key] = mx;
  return mx;
}
function ll(d, L) {
  var key = d * 100 + L;
  if (llC[key] !== undefined) return llC[key];
  var mn = 1e18;
  for (var x = d - L + 1; x <= d; x++) if (x >= 0 && bars[x].c < mn) mn = bars[x].c;
  llC[key] = mn;
  return mn;
}
function runG(ent, ext, stopM, gate) {
  var cash = 100.0, dir = 0, qty = 0, entry = 0, stopPx = 0, pendDir = 0, pendStop = 0, pendExit = false, entryFee = 0;
  var seg = [{ st: 100, eq: 100, pk: 100, dd: 0, tr: 0, win: 0, bars: 0 }, { st: 100, eq: 100, pk: 100, dd: 0, tr: 0, win: 0, bars: 0 }];
  var START = 250;
  function W(i) { return bars[i].ts < splitMs ? seg[0] : seg[1]; }
  for (var d = START + 1; d < N; d++) {
    if (pendDir !== 0 || pendExit) {
      var fill = bars[d].o;
      if (dir !== 0) {
        var feeOut = 0.001 * qty * fill;
        var pnl = dir * qty * (fill - entry) - feeOut;
        cash += pnl;
        var sb = W(d);
        sb.tr++; if (pnl - entryFee > 0) sb.win++;
        dir = 0; qty = 0;
      }
      if (pendDir !== 0) {
        dir = pendDir; entry = fill; qty = cash / entry;
        entryFee = 0.001 * qty * entry;
        cash -= entryFee; stopPx = pendStop; pendDir = 0;
      }
      pendExit = false;
    }
    var e = cash;
    if (dir !== 0) e += dir * qty * (bars[d].c - entry);
    var sg = W(d);
    if (sg.bars === 0) { sg.st = e; sg.pk = e; }
    sg.bars++; sg.eq = e;
    if (e > sg.pk) sg.pk = e;
    var dd = (sg.pk - e) / sg.pk;
    if (dd > sg.dd) sg.dd = dd;
    if (d < N - 1 && !isNaN(atr[d]) && !isNaN(sma[d])) {
      var gL = gate ? bars[d].c > sma[d] : true;
      var gS = gate ? bars[d].c < sma[d] : true;
      if (dir === 0) {
        if (bars[d].c > hh(d - 1, ent) && gL) { pendDir = 1; pendStop = bars[d].c - stopM * atr[d]; }
        else if (bars[d].c < ll(d - 1, ent) && gS) { pendDir = -1; pendStop = bars[d].c + stopM * atr[d]; }
      } else if (dir === 1 && (bars[d].c < ll(d - 1, ext) || bars[d].c <= stopPx)) pendExit = true;
      else if (dir === -1 && (bars[d].c > hh(d - 1, ext) || bars[d].c >= stopPx)) pendExit = true;
    }
  }
  function cagrOf(s) {
    if (s.bars < 30) return NaN;
    var yrs = s.bars * TFms / 86400000 / 365.25;
    return Math.pow(s.eq / s.st, 1 / yrs) - 1;
  }
  var full = seg[0].eq / seg[0].st * seg[1].eq / seg[1].st;
  var yrsF = (seg[0].bars + seg[1].bars) * TFms / 86400000 / 365.25;
  return {
    T: { cagr: cagrOf(seg[0]) * 100, dd: seg[0].dd * 100, tr: seg[0].tr },
    O: { cagr: cagrOf(seg[1]) * 100, dd: seg[1].dd * 100, tr: seg[1].tr },
    F: { cagr: (Math.pow(full, 1 / yrsF) - 1) * 100, tr: seg[0].tr + seg[1].tr }
  };
}
var rows = [];
var ENTS = [20, 40, 55, 90], EXTS = [10, 15, 20, 30], STS = [2, 3], GS = [1, 0];
for (var a = 0; a < ENTS.length; a++) for (var b = 0; b < EXTS.length; b++) {
  if (EXTS[b] >= ENTS[a]) continue;
  for (var c = 0; c < STS.length; c++) for (var g = 0; g < GS.length; g++) {
    var r = runG(ENTS[a], EXTS[b], STS[c], GS[g]);
    rows.push({ ent: ENTS[a], ext: EXTS[b], st: STS[c], g: GS[g], T: r.T, O: r.O, F: r.F });
  }
}
function fmt(x) { return isNaN(x) ? "  n/a" : (x >= 0 ? "+" : "") + x.toFixed(0); }
WScript.Echo("SOL Turtle 4h grid | TRAIN 3y / OOS 2y | close-confirmed, next-open fills");
for (var w = 0; w < rows.length; w++) {
  var R = rows[w];
  var mk = (R.ent === 55 && R.ext === 20 && R.st === 2 && R.g === 1) ? " <= DEFAULT" : "";
  WScript.Echo("  " + R.ent + "/" + R.ext + "/" + R.st + "/g" + R.g + " | train " + fmt(R.T.cagr) + "% DD" + R.T.dd.toFixed(0) + "% " + R.T.tr + "t" +
    " | OOS " + fmt(R.O.cagr) + "% DD" + R.O.dd.toFixed(0) + "% " + R.O.tr + "t" +
    " | full " + fmt(R.F.cagr) + "% " + R.F.tr + "t" + mk);
}
rows.sort(function (x, y) { return (y.T.cagr / Math.max(1, y.T.dd)) - (x.T.cagr / Math.max(1, x.T.dd)); });
WScript.Echo("TOP-5 TRAIN Calmar -> OOS:");
for (var w2 = 0; w2 < 5 && w2 < rows.length; w2++) {
  var R2 = rows[w2];
  WScript.Echo("  " + R2.ent + "/" + R2.ext + "/" + R2.st + "/g" + R2.g + ": train " + fmt(R2.T.cagr) + "%/" + R2.T.dd.toFixed(0) + "% -> OOS " + fmt(R2.O.cagr) + "%/" + R2.O.dd.toFixed(0) + "%");
}
rows.sort(function (x, y) { return y.O.cagr - x.O.cagr; });
WScript.Echo("TOP-5 OOS CAGR (hindsight):");
for (var w3 = 0; w3 < 5 && w3 < rows.length; w3++) {
  var R3 = rows[w3];
  WScript.Echo("  " + R3.ent + "/" + R3.ext + "/" + R3.st + "/g" + R3.g + ": OOS " + fmt(R3.O.cagr) + "%/" + R3.O.dd.toFixed(0) + "% (train was " + fmt(R3.T.cagr) + "%)");
}
