// FVG + liquidity-sweep SMC strategy - mechanical test on ETH 15m (5y swap).
// Rules (from the video, codified):
//   1) 4h bullish FVG: low(b3) > high(b1) -> zone [high(b1), low(b3)] (bearish mirrored)
//   2) wait price mitigates zone on 15m
//   3) sweep: 15m bar takes out min-low of prior 24 bars but closes back above
//   4) within 24 bars after sweep, a bullish 15m FVG forms -> limit entry at its top
//   5) stop = sweep low; target = entry + 3R; time-stop 96 bars (24h) at close
//   6) fees 0.05%/side (swap taker), 100U all-in compound, stop-priority same bar
// Volume hook: if vol present, tag each trade with sweepVol > 1.5x avg20 (filter test).
// cscript //nologo ut_fvg.js <dataFile> (file: ts o h l c [vol])
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
var f = fso.OpenTextFile(DIR + WScript.Arguments.Item(0), 1);
var B = [];
while (!f.AtEndOfStream) {
  var p = f.ReadLine().split(" ");
  if (p.length < 5) continue;
  var bar = { ts: +p[0], o: +p[1], h: +p[2], l: +p[3], c: +p[4], v: p.length > 5 ? +p[5] : NaN };
  B.push(bar);
}
f.Close();
var N = B.length;
var HASV = !isNaN(B[0].v);
// aggregate 4h
var Z4 = [], cur4 = null;
for (var i = 0; i < N; i++) {
  var bk = Math.floor(B[i].ts / 14400000) * 14400000;
  if (!cur4 || cur4.ts !== bk) { if (cur4) Z4.push(cur4); cur4 = { ts: bk, o: B[i].o, h: B[i].h, l: B[i].l, c: B[i].c }; }
  else { if (B[i].h > cur4.h) cur4.h = B[i].h; if (B[i].l < cur4.l) cur4.l = B[i].l; cur4.c = B[i].c; }
}
if (cur4) Z4.push(cur4);
// 4h FVG zones
var zones = [];
for (var z = 2; z < Z4.length; z++) {
  if (Z4[z].l > Z4[z - 2].h) zones.push({ dir: 1, top: Z4[z].l, bot: Z4[z - 2].h, ts: Z4[z].ts + 14400000 });
  else if (Z4[z].h < Z4[z - 2].l) zones.push({ dir: -1, top: Z4[z - 2].l, bot: Z4[z].h, ts: Z4[z].ts + 14400000 });
}
function minLow(j, L) { var m = 1e18; for (var x = j - L; x < j; x++) if (x >= 0 && B[x].l < m) m = B[x].l; return m; }
function maxHigh(j, L) { var m = -1e18; for (var x = j - L; x < j; x++) if (x >= 0 && B[x].h > m) m = B[x].h; return m; }
// sim
var eq = 100, peak = 100, maxDD = 0;
var zPtr = 0, state = 0; // 0=hunt zone,1=armed(wait sweep),2=swept(wait fvg),3=wait fill
var zone = null, armedAt = 0, sweepIdx = 0, sweepLow = 0, fvgTop = 0, entry = 0, stop = 0, target = 0, qty = 0, fillIdx = 0;
var trades = [], funnel = { zones: 0, armed: 0, swept: 0, fvg: 0, filled: 0 };
var sweepVolHigh = false;
var START = 200;
for (var i2 = START; i2 < N; i2++) {
  // manage open position first
  if (state === 4) {
    var exited = 0, exPx = 0;
    if (zone.dirLong) {
      if (B[i2].l <= stop) { exited = 1; exPx = stop; }
      else if (B[i2].h >= target) { exited = 1; exPx = target; }
    } else {
      if (B[i2].h >= stop) { exited = 1; exPx = stop; }
      else if (B[i2].l <= target) { exited = 1; exPx = target; }
    }
    if (!exited && i2 - fillIdx >= 96) { exited = 1; exPx = B[i2].c; }
    if (exited) {
      var pnl = zone.dirLong ? qty * (exPx - entry) : qty * (entry - exPx);
      var fees = 0.0005 * qty * (entry + exPx);
      eq += pnl - fees;
      var risk = zone.dirLong ? (entry - stop) * qty : (stop - entry) * qty;
      trades.push({ r: risk > 0 ? (pnl - fees) / risk : 0, hold: i2 - fillIdx, volHi: sweepVolHigh, dir: zone.dirLong ? 1 : -1 });
      state = 0; zone = null;
    }
  } else {
    // advance to freshest formed zone
    while (zPtr < zones.length && zones[zPtr].ts <= B[i2].ts) { zone = zones[zPtr]; zPtr++; if (state === 0) { state = 1; armedAt = i2; funnel.zones++; } else { /* refresh zone, keep sub-state */ state = 1; armedAt = i2; } }
    if (!zone) continue;
    zone.dirLong = zone.dir === 1;
    if (state === 1) {
      // wait mitigation + sweep within 48 bars of arming
      if (i2 - armedAt > 48) { state = 1; armedAt = i2; } // re-arm on timeout
      var mitig = zone.dirLong ? (B[i2].l <= zone.top) : (B[i2].h >= zone.bot);
      if (mititg === undefined) var mititg = 0;
      if (mitig) funnel.armed++;
      var sl = minLow(i2, 24), sh = maxHigh(i2, 24);
      var sweepNow = zone.dirLong ? (B[i2].l < sl && B[i2].c > sl) : (B[i2].h > sh && B[i2].c < sh);
      if (mitig && sweepNow) {
        sweepIdx = i2; sweepLow = zone.dirLong ? B[i2].l : B[i2].h;
        sweepVolHigh = HASV ? (B[i2].v > 1.5 * (function () { var s = 0, n = 0; for (var q = i2 - 20; q < i2; q++) { if (q >= 0 && !isNaN(B[q].v)) { s += B[q].v; n++; } } return n ? s / n : NaN; })()) : false;
        state = 2; funnel.swept++;
      }
    } else if (state === 2) {
      // wait 15m FVG in trend direction within 24 bars
      if (i2 - sweepIdx > 24) { state = 1; armedAt = i2; }
      else if (i2 >= 2) {
        var fvgOK = zone.dirLong ? (B[i2].l > B[i2 - 2].h) : (B[i2].h < B[i2 - 2].l);
        if (fvgOK) {
          fvgTop = zone.dirLong ? B[i2].l : B[i2].h; // retrace limit
          var riskUnit = zone.dirLong ? (fvgTop - sweepLow) : (sweepLow - fvgTop);
          if (riskUnit > 0) {
            entry = fvgTop; stop = sweepLow;
            target = zone.dirLong ? entry + 3 * riskUnit : entry - 3 * riskUnit;
            state = 3; funnel.fvg++;
          }
        }
      }
    } else if (state === 3) {
      // wait fill within 16 bars; invalidate through stop
      if (i2 - (sweepIdx) > 24 + 16) { state = 1; armedAt = i2; }
      if (zone.dirLong) {
        if (B[i2].l <= stop) { state = 1; armedAt = i2; }
        else if (B[i2].l <= entry) {
          qty = eq / entry; eq -= 0; // fee charged at exit net; entry fee folded below
          eq -= 0.0005 * qty * entry;
          fillIdx = i2; state = 4; funnel.filled++;
        }
      } else {
        if (B[i2].h >= stop) { state = 1; armedAt = i2; }
        else if (B[i2].h >= entry) {
          qty = eq / entry;
          eq -= 0.0005 * qty * entry;
          fillIdx = i2; state = 4; funnel.filled++;
        }
      }
    }
  }
  // mark equity
  var mk = eq;
  if (state === 4) mk = eq + (zone.dirLong ? qty * (B[i2].c - entry) : qty * (entry - B[i2].c));
  if (mk > peak) peak = mk;
  var dd = (peak - mk) / peak;
  if (dd > maxDD) maxDD = dd;
}
// stats
var wins = 0, sumR = 0, hi = [], lo = [];
for (var t = 0; t < trades.length; t++) { if (trades[t].r > 0) wins++; sumR += trades[t].r; (trades[t].volHi ? hi : lo).push(trades[t]); }
function grp(arr, name) {
  if (!arr.length) { WScript.Echo("  " + name + ": no trades"); return; }
  var w = 0, s = 0;
  for (var q2 = 0; q2 < arr.length; q2++) { if (arr[q2].r > 0) w++; s += arr[q2].r; }
  WScript.Echo("  " + name + ": n=" + arr.length + " WR=" + (100 * w / arr.length).toFixed(0) + "% avgR=" + (s / arr.length).toFixed(2));
}
WScript.Echo("FVG+sweep SMC 5y ETH swap | zones=" + funnel.zones + " armed=" + funnel.armed + " swept=" + funnel.swept + " fvg=" + funnel.fvg + " filled=" + funnel.filled);
WScript.Echo("TRADES=" + trades.length + " WR=" + (trades.length ? (100 * wins / trades.length).toFixed(0) : 0) + "% avgR=" + (trades.length ? (sumR / trades.length).toFixed(2) : 0) +
  " EQ=" + eq.toFixed(1) + " (" + (eq - 100).toFixed(0) + "%) maxDD=" + (maxDD * 100).toFixed(0) + "%");
if (HASV) { WScript.Echo("volume filter (sweep vol > 1.5x avg20):"); grp(hi, "vol-HIGH"); grp(lo, "vol-LOW "); }
else WScript.Echo("(no volume column - run 1y vol file for filter test)");
