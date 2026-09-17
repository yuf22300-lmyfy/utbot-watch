// SOL Turtle V2 grid on DAILY closes - EXACT same semantics as turtle.html engine
// (channels on daily closes, close-vs-stop exit, fill=signal-day close proxy).
// 3y TRAIN + 2y OOS split. cscript //nologo ut_tgrid_d.js
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + "ut_sol15m_5y.txt", 1);
var dayMap = {}, dayOrder = [];
while (!f.AtEndOfStream) {
  var p = f.ReadLine().split(" ");
  if (p.length < 5) continue;
  var dt = new Date(parseInt(p[0], 10));
  var d = dt.getUTCFullYear() + "-" + (dt.getUTCMonth() + 1 < 10 ? "0" : "") + (dt.getUTCMonth() + 1) + "-" + (dt.getUTCDate() < 10 ? "0" : "") + dt.getUTCDate();
  dayMap[d] = parseFloat(p[4]); // last 15m bar of day = daily close
}
f.Close();
for (var k in dayMap) dayOrder.push(k);
dayOrder.sort();
var N = dayOrder.length;
var px = new Array(N);
for (var i = 0; i < N; i++) px[i] = dayMap[dayOrder[i]];
var FEE = 0.001, INIT = 100;
var SPLIT = N - 730; // last 2y = OOS
// ATR14 on close-to-close
var atr = new Array(N); atr[0] = NaN;
{
  var trs = [];
  for (var j = 1; j < N; j++) {
    var t1 = Math.abs(px[j] - px[j - 1]);
    trs.push(t1);
    if (trs.length < 14) atr[j] = NaN;
    else if (trs.length === 14) { var s = 0; for (var q = 0; q < 14; q++) s += trs[q]; atr[j] = s / 14; }
    else atr[j] = (atr[j - 1] * 13 + t1) / 14;
  }
}
function runG(ent, ext, stopM, gate) {
  var sma = new Array(N);
  {
    var s2 = 0.0;
    for (var m = 0; m < N; m++) {
      s2 += px[m];
      if (m >= 200) s2 -= px[m - 200];
      sma[m] = (m >= 199) ? s2 / 200 : NaN;
    }
  }
  function hh(d, L) { var mx = -1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && px[x] > mx) mx = px[x]; return mx; }
  function ll(d, L) { var mn = 1e18; for (var x = d - L + 1; x <= d; x++) if (x >= 0 && px[x] < mn) mn = px[x]; return mn; }
  var cash = INIT, dir = 0, qty = 0, entry = 0, stopPx = 0, pendDir = 0, pendStop = 0, pendExit = false, tradeInD = 0, entryFee = 0;
  var seg = [{ st: INIT, eq: INIT, pk: INIT, dd: 0, tr: 0, win: 0, bars: 0 }, { st: INIT, eq: INIT, pk: INIT, dd: 0, tr: 0, win: 0, bars: 0 }];
  function mark(d) {
    var e = cash;
    if (dir !== 0) e = cash * (1 + dir * (px[d] / entry - 1));
    var s = (d < SPLIT) ? seg[0] : seg[1];
    if (s.bars === 0) { s.st = e; s.pk = e; }
    s.bars++; s.eq = e;
    if (e > s.pk) s.pk = e;
    var dd = (s.pk - e) / s.pk;
    if (dd > s.dd) s.dd = dd;
  }
  for (var d = 1; d < N; d++) {
    if (pendDir !== 0 || pendExit) {
      var fill = px[d - 1];
      if (dir !== 0) {
        var feeOut = FEE * (cash / entry);
        var gross = dir * (fill / entry - 1) * cash;
        cash += gross - feeOut;
        var sb = (d < SPLIT) ? seg[0] : seg[1];
        sb.tr++; if (gross - feeOut - entryFee > 0) sb.win++;
        dir = 0;
      }
      if (pendDir !== 0) {
        dir = pendDir; entry = fill; cash -= FEE * (cash / entry); qty = 1;
        entryFee = FEE * (cash / entry); stopPx = pendStop; pendDir = 0;
      }
      pendExit = false;
    }
    if (dir === 1 && px[d] <= stopPx) {
      var gS = (stopPx / entry - 1) * cash - FEE * (cash / entry);
      cash += gS;
      var sb2 = (d < SPLIT) ? seg[0] : seg[1];
      sb2.tr++; if (gS - entryFee > 0) sb2.win++;
      dir = 0;
    } else if (dir === -1 && px[d] >= stopPx) {
      var gS2 = -((stopPx / entry) - 1) * cash - FEE * (cash / entry);
      cash += gS2;
      var sb3 = (d < SPLIT) ? seg[0] : seg[1];
      sb3.tr++; if (gS2 - entryFee > 0) sb3.win++;
      dir = 0;
    }
    mark(d);
    if (d < N - 1 && !isNaN(atr[d]) && !isNaN(sma[d])) {
      var gateL = gate ? px[d] > sma[d] : true;
      var gateS = gate ? px[d] < sma[d] : true;
      if (dir === 0) {
        if (px[d] > hh(d - 1, ent) && gateL) { pendDir = 1; pendStop = px[d] - stopM * atr[d]; }
        else if (px[d] < ll(d - 1, ent) && gateS) { pendDir = -1; pendStop = px[d] + stopM * atr[d]; }
      } else if (dir === 1 && px[d] < ll(d - 1, ext)) pendExit = true;
      else if (dir === -1 && px[d] > hh(d - 1, ext)) pendExit = true;
    }
  }
  function cagrOf(s) {
    if (s.bars < 60) return NaN;
    var yrs = s.bars / 365.25;
    return Math.pow(s.eq / s.st, 1 / yrs) - 1;
  }
  var full = seg[0].eq / seg[0].st * seg[1].eq / seg[1].st;
  var yrsF = (seg[0].bars + seg[1].bars) / 365.25;
  return {
    T: { cagr: cagrOf(seg[0]) * 100, dd: seg[0].dd * 100, tr: seg[0].tr, wr: seg[0].tr ? 100 * seg[0].win / seg[0].tr : 0 },
    O: { cagr: cagrOf(seg[1]) * 100, dd: seg[1].dd * 100, tr: seg[1].tr, wr: seg[1].tr ? 100 * seg[1].win / seg[1].tr : 0 },
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
function fmt(x) { return isNaN(x) ? " n/a" : (x >= 0 ? "+" : "") + x.toFixed(0); }
WScript.Echo("SOL Turtle DAILY-close grid | TRAIN=" + dayOrder[0] + ".." + dayOrder[SPLIT - 1] + " OOS=" + dayOrder[SPLIT] + ".." + dayOrder[N - 1]);
WScript.Echo("ent/ext/stp/g | train | oos | full5y");
for (var w = 0; w < rows.length; w++) {
  var R = rows[w];
  var mk = (R.ent === 55 && R.ext === 20 && R.st === 2 && R.g === 1) ? " <= DEFAULT" : "";
  WScript.Echo("  " + R.ent + "/" + R.ext + "/" + R.st + "/g" + R.g + " | " + fmt(R.T.cagr) + "% " + R.T.dd.toFixed(0) + "%d " + R.T.tr + "t " + R.T.wr.toFixed(0) + "%w" +
    " | " + fmt(R.O.cagr) + "% " + R.O.dd.toFixed(0) + "%d " + R.O.tr + "t " + R.O.wr.toFixed(0) + "%w" +
    " | " + fmt(R.F.cagr) + "% " + R.F.tr + "t" + mk);
}
rows.sort(function (x, y) { return (y.T.cagr / Math.max(1, y.T.dd)) - (x.T.cagr / Math.max(1, x.T.dd)); });
WScript.Echo("TOP-5 TRAIN Calmar -> OOS:");
for (var w2 = 0; w2 < 5 && w2 < rows.length; w2++) {
  var R2 = rows[w2];
  WScript.Echo("  " + R2.ent + "/" + R2.ext + "/" + R2.st + "/g" + R2.g + ": train " + fmt(R2.T.cagr) + "%/" + R2.T.dd.toFixed(0) + "% -> OOS " + fmt(R2.O.cagr) + "%/" + R2.O.dd.toFixed(0) + "% | full " + fmt(R2.F.cagr) + "%");
}
