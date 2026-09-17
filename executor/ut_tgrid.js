// SOL Turtle V2 grid: 3y TRAIN (2021-09..2024-09) + 2y OOS (2024-09..2026-09).
// Same semantics as turtle.html engine (flat-only entry, ch-exit, locked stop),
// but on 15m bars (more precise than the daily proxy). Params: ent/ext/stopM/gate.
// 100U compound, 0.1%/side, fill=next bar open. cscript //nologo ut_tgrid.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + "ut_sol15m_5y.txt", 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length) raw.push(ln); }
f.Close();
var N = raw.length;
var ts = new Array(N), op = new Array(N), hi = new Array(N), lo = new Array(N), cl = new Array(N);
for (var i = 0; i < N; i++) {
  var p = raw[i].split(" ");
  ts[i] = parseInt(p[0], 10); op[i] = +p[1]; hi[i] = +p[2]; lo[i] = +p[3]; cl[i] = +p[4];
}
var BPD = 96, FEE = 0.001, INIT = 100;
var endMs = ts[N - 1] + 900000;
var splitMs = endMs - 730 * 86400000; // 2y OOS

// ATR14 (Wilder) once
var atr = new Array(N); atr[0] = NaN;
{
  var trs = [];
  for (var j = 1; j < N; j++) {
    var x1 = hi[j] - lo[j], x2 = Math.abs(hi[j] - cl[j - 1]), x3 = Math.abs(lo[j] - cl[j - 1]);
    var m = x1; if (x2 > m) m = x2; if (x3 > m) m = x3;
    trs.push(m);
    if (trs.length < 14) atr[j] = NaN;
    else if (trs.length === 14) { var s = 0; for (var q = 0; q < 14; q++) s += trs[q]; atr[j] = s / 14; }
    else atr[j] = (atr[j - 1] * 13 + m) / 14;
  }
}
// SMA200d (gate) once
var sma = new Array(N);
{
  var LEN = 200 * BPD, s2 = 0.0;
  for (var k = 0; k < N; k++) {
    s2 += cl[k];
    if (k >= LEN) s2 -= cl[k - LEN];
    sma[k] = (k >= LEN - 1) ? s2 / LEN : NaN;
  }
}
function rollMax(len) {
  var out = new Array(N), dq = new Array(N), h = 0, t = 0;
  for (var i = 0; i < N; i++) {
    while (t > h && hi[dq[t - 1]] <= hi[i]) t--;
    dq[t++] = i;
    if (dq[h] <= i - len) h++;
    out[i] = hi[dq[h]];
  }
  return out;
}
function rollMin(len) {
  var out = new Array(N), dq = new Array(N), h = 0, t = 0;
  for (var i = 0; i < N; i++) {
    while (t > h && lo[dq[t - 1]] >= lo[i]) t--;
    dq[t++] = i;
    if (dq[h] <= i - len) h++;
    out[i] = lo[dq[h]];
  }
  return out;
}
var hhCache = {}, llCache = {}, xuCache = {}, xlCache = {};
function HH(len) { if (!hhCache[len]) hhCache[len] = rollMax(len); return hhCache[len]; }
function LL(len) { if (!llCache[len]) llCache[len] = rollMin(len); return llCache[len]; }

function runGrid(ent, ext, stopM, gate) {
  var eL = ent * BPD, xL = ext * BPD;
  var cu = HH(eL), clv = LL(eL), xu = HH(xL), xl = LL(xL);
  var cash = INIT, dir = 0, qty = 0, entry = 0, stopPx = 0, pendDir = 0, pendStop = 0, pendExit = false;
  // segment trackers: [train, oos]
  var seg = [{ st: INIT, eq: INIT, pk: INIT, dd: 0, tr: 0, win: 0, bars: 0 }, { st: INIT, eq: INIT, pk: INIT, dd: 0, tr: 0, win: 0, bars: 0 }];
  var inD = 0, entryFee = 0;
  function mark(i) {
    var e = cash;
    if (dir !== 0) e += dir * qty * (cl[i] - entry);
    var s = (ts[i] < splitMs) ? seg[0] : seg[1];
    if (s.bars === 0) { s.st = e; s.pk = e; }
    s.bars++;
    s.eq = e;
    if (e > s.pk) s.pk = e;
    var dd = (s.pk - e) / s.pk;
    if (dd > s.dd) s.dd = dd;
  }
  for (var i = 200 * BPD; i < N; i++) {
    if (pendDir !== 0 || pendExit) {
      var fill = op[i];
      if (dir !== 0) {
        var feeOut = FEE * qty * fill;
        var pnl = dir * qty * (fill - entry) - feeOut;
        cash += pnl;
        var s2b = (ts[i] < splitMs) ? seg[0] : seg[1];
        s2b.tr++; if (pnl - entryFee > 0) s2b.win++;
        dir = 0; qty = 0;
      }
      if (pendDir !== 0) {
        dir = pendDir; entry = fill; qty = cash / entry;
        entryFee = FEE * qty * entry;
        cash -= entryFee; stopPx = pendStop; pendDir = 0;
      }
      pendExit = false;
    }
    if (dir === 1 && lo[i] <= stopPx) {
      cash += (stopPx - entry) * qty - FEE * qty * stopPx;
      var sb = (ts[i] < splitMs) ? seg[0] : seg[1];
      sb.tr++; if ((stopPx - entry) * qty - FEE * qty * stopPx - entryFee > 0) sb.win++;
      dir = 0; qty = 0;
    } else if (dir === -1 && hi[i] >= stopPx) {
      cash += (entry - stopPx) * qty - FEE * qty * stopPx;
      var sb2 = (ts[i] < splitMs) ? seg[0] : seg[1];
      sb2.tr++; if ((entry - stopPx) * qty - FEE * qty * stopPx - entryFee > 0) sb2.win++;
      dir = 0; qty = 0;
    }
    mark(i);
    if (i < N - 1 && !isNaN(atr[i]) && !isNaN(cu[i - 1])) {
      var gateL = gate ? cl[i] > sma[i - 1] : true;
      var gateS = gate ? cl[i] < sma[i - 1] : true;
      if (dir === 0) {
        if (cl[i] > cu[i - 1] && gateL) { pendDir = 1; pendStop = cl[i] - stopM * atr[i]; }
        else if (cl[i] < clv[i - 1] && gateS) { pendDir = -1; pendStop = cl[i] + stopM * atr[i]; }
      } else if (dir === 1 && cl[i] < xl[i - 1]) pendExit = true;
      else if (dir === -1 && cl[i] > xu[i - 1]) pendExit = true;
    }
  }
  // final open trade ignored for trade count; equity marks include it
  function cagrOf(s) {
    if (s.bars < BPD * 30) return NaN;
    var yrs = s.bars / BPD / 365.25;
    return Math.pow(s.eq / s.st, 1 / yrs) - 1;
  }
  return {
    train: { cagr: cagrOf(seg[0]) * 100, dd: seg[0].dd * 100, tr: seg[0].tr, wr: seg[0].tr ? 100 * seg[0].win / seg[0].tr : 0 },
    oos: { cagr: cagrOf(seg[1]) * 100, dd: seg[1].dd * 100, tr: seg[1].tr, wr: seg[1].tr ? 100 * seg[1].win / seg[1].tr : 0 },
    full: seg[0].st * seg[1].eq / (seg[1].st * seg[0].eq) // not used
  };
}
var rows = [];
var ENTS = [20, 40, 55, 90], EXTS = [10, 15, 20, 30], STS = [2, 3], GS = [1, 0];
for (var a = 0; a < ENTS.length; a++) for (var b = 0; b < EXTS.length; b++) {
  if (EXTS[b] >= ENTS[a]) continue;
  for (var c = 0; c < STS.length; c++) for (var g = 0; g < GS.length; g++) {
    var r = runGrid(ENTS[a], EXTS[b], STS[c], GS[g]);
    rows.push({ ent: ENTS[a], ext: EXTS[b], st: STS[c], g: GS[g], T: r.train, O: r.oos });
  }
}
function fmt(x) { return isNaN(x) ? "  n/a" : (x >= 0 ? "+" : "") + x.toFixed(0); }
WScript.Echo("SOL Turtle grid | TRAIN=3y(21-09..24-09) OOS=2y(24-09..26-09) | 15m bars, 0.1%/side, next-open fill");
WScript.Echo("ent ext stp g | trainCAGR trainDD tr wr | oosCAGR oosDD tr wr");
for (var w = 0; w < rows.length; w++) {
  var R = rows[w];
  var mark = (R.ent === 55 && R.ext === 20 && R.st === 2 && R.g === 1) ? " <= DEFAULT" : "";
  WScript.Echo(String(R.ent).replace(/^/, "  ") + "/" + R.ext + "/" + R.st + "/g" + R.g + " | " +
    fmt(R.T.cagr) + "% " + R.T.dd.toFixed(0) + "% " + R.T.tr + "t " + R.T.wr.toFixed(0) + "% | " +
    fmt(R.O.cagr) + "% " + R.O.dd.toFixed(0) + "% " + R.O.tr + "t " + R.O.wr.toFixed(0) + "%" + mark);
}
// rank: train Calmar top 5 -> show their OOS
rows.sort(function (x, y) { return (y.T.cagr / Math.max(1, y.T.dd)) - (x.T.cagr / Math.max(1, x.T.dd)); });
WScript.Echo("");
WScript.Echo("TOP-5 by TRAIN Calmar (CAGR/DD) -> their OOS:");
for (var w2 = 0; w2 < 5 && w2 < rows.length; w2++) {
  var R2 = rows[w2];
  WScript.Echo("  " + R2.ent + "/" + R2.ext + "/" + R2.st + "/g" + R2.g + ": train " + fmt(R2.T.cagr) + "%/" + R2.T.dd.toFixed(0) + "% -> OOS " + fmt(R2.O.cagr) + "%/" + R2.O.dd.toFixed(0) + "%");
}
rows.sort(function (x, y) { return (y.O.cagr / Math.max(1, y.O.dd)) - (x.O.cagr / Math.max(1, x.O.dd)); });
WScript.Echo("TOP-5 by OOS Calmar (hindsight, for reference):");
for (var w3 = 0; w3 < 5 && w3 < rows.length; w3++) {
  var R3 = rows[w3];
  WScript.Echo("  " + R3.ent + "/" + R3.ext + "/" + R3.st + "/g" + R3.g + ": OOS " + fmt(R3.O.cagr) + "%/" + R3.O.dd.toFixed(0) + "% (train was " + fmt(R3.T.cagr) + "%/" + R3.T.dd.toFixed(0) + "%)");
}
