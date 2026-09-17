// Multi-factor rotation backtest: composite rank = mean of z-scored factor ranks.
// Factors: MOM14, TREND(close/SMA200-1), LOWVOL(-14d vol), VOLCHG(-vol14/vol90).
// All |pairwise spearman| <= 0.07 (verified). Weights via rank-average (robust).
// Engine mirrors ut_rotlive conventions: daily close signals -> next-day effective,
// top-2 longs (+ bottom-2 shorts optional), weekly rebalance R7 + daily neg-momentum exit,
// 0.1% fee per side, fills at next-day price. Compares:
//   BASE   = live single-factor (MOM14 only)
//   MF-eq  = equal-weight 4 factors
//   MF-mom+ = MOM weight 2x (tilt toward proven factor)
//   MF-2f  = MOM + LOWVOL only (2-factor minimal)
//   single-factor controls: MOM / TREND / LOWVOL / VOLCHG alone
// args: [mode] mode=1 adds bottom-2 shorts (short margin E/6 each, cash-book style)
var COINS = ["eth", "btc", "sol", "bnb", "xrp", "doge", "avax", "link"];
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var fso = new ActiveXObject("Scripting.FileSystemObject");
function loadDaily(coin) {
  var f = fso.OpenTextFile(DIR + "ut_" + coin + "15m_5y.txt", 1);
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
var MAPS = [];
for (var i = 0; i < COINS.length; i++) MAPS.push(loadDaily(COINS[i]));
var dateSet = {}, dateList = [];
for (var i2 = 0; i2 < MAPS.length; i2++) for (var k in MAPS[i2]) if (!dateSet[k]) { dateSet[k] = 1; dateList.push(k); }
dateList.sort();
var ND = dateList.length;
var price = [], ret = [];
for (var j = 0; j < COINS.length; j++) {
  var pr = new Array(ND), last = null;
  for (var d = 0; d < ND; d++) { var v = MAPS[j][dateList[d]]; if (v !== undefined) last = v; pr[d] = last; }
  price.push(pr);
  var r = new Array(ND);
  for (var d2 = 1; d2 < ND; d2++) r[d2] = (pr[d2 - 1] !== null && pr[d2] !== null) ? pr[d2] / pr[d2 - 1] - 1 : null;
  ret.push(r);
}
function stdevW(j, d, len) {
  var s = 0, s2 = 0, n = 0;
  for (var x = d - len + 1; x <= d; x++) { if (x < 1) return NaN; var v = ret[j][x]; if (v === null) return NaN; s += v; s2 += v * v; n++; }
  var m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}
function smaAt(j, d, len) {
  if (d - len + 1 < 0) return NaN;
  var s = 0;
  for (var x = d - len + 1; x <= d; x++) { if (price[j][x] === null) return NaN; s += price[j][x]; }
  return s / len;
}
function momAt(j, d, len) { if (d - len < 0 || price[j][d - len] === null || price[j][d] === null) return NaN; return price[j][d] / price[j][d - len] - 1; }
function facVals(j, d) {
  var sma = smaAt(j, d, 200);
  var v14 = stdevW(j, d, 14), v90 = stdevW(j, d, 90);
  return {
    MOM: momAt(j, d, 14),
    TREND: isNaN(sma) ? NaN : price[j][d] / sma - 1,
    LOWVOL: -v14,
    VOLCHG: isNaN(v90) ? NaN : -(v14 / v90)
  };
}
function ranks(d, weights) {
  // weights: {MOM:1, TREND:1, LOWVOL:1, VOLCHG:1} subset allowed
  var names = [];
  for (var w in weights) if (weights[w] > 0) names.push(w);
  var cols = {}, ok = true;
  for (var nn = 0; nn < names.length; nn++) {
    var col = [];
    for (var j2 = 0; j2 < COINS.length; j2++) {
      var v = facVals(j2, d)[names[nn]];
      if (isNaN(v)) { ok = false; break; }
      col.push(v);
    }
    if (!ok) return null;
    // rank ascending (higher value -> higher rank)
    var idx = [];
    for (var q = 0; q < col.length; q++) idx.push([col[q], q]);
    idx.sort(function (a, b) { return a[0] - b[0]; });
    var rk = new Array(col.length);
    for (var q2 = 0; q2 < idx.length; q2++) rk[idx[q2][1]] = q2;
    cols[names[nn]] = rk;
  }
  var score = new Array(COINS.length);
  for (var j3 = 0; j3 < COINS.length; j3++) {
    var s = 0, tot = 0;
    for (var nn2 = 0; nn2 < names.length; nn2++) { s += cols[names[nn2]][j3] * weights[names[nn2]]; tot += weights[names[nn2]]; }
    score[j3] = s / tot;
  }
  return score;
}
function inArr(arr, v) { for (var z = 0; z < arr.length; z++) if (arr[z] === v) return true; return false; }
function run(name, weights, d0, d1, useShorts) {
  var equity = 100.0, peak = 100.0, maxDD = 0.0;
  var longs = [], shorts = [], lastRebal = -999;
  var FEE = 0.001, N = 2, R = 7;
  var trades = 0;
  var end1y = d1 - 365;
  var e1y = null;
  function momNeg(j, d) { var m = momAt(j, d, 14); return (m !== null && !isNaN(m) && m <= 0); }
  function momPos(j, d) { var m = momAt(j, d, 14); return (m !== null && !isNaN(m) && m >= 0); }
  for (var d = d0; d <= d1; d++) {
    // accrue today (positions held from yesterday)
    var port = 0;
    if (longs.length) { var s1 = 0, c1 = 0; for (var a = 0; a < longs.length; a++) { var r1 = ret[longs[a]][d]; if (r1 !== null) { s1 += r1; c1++; } } if (c1) port += (s1 / c1) * (longs.length / N); }
    if (useShorts && shorts.length) { var s2 = 0, c2 = 0; for (var b = 0; b < shorts.length; b++) { var r2 = ret[shorts[b]][d]; if (r2 !== null) { s2 += r2; c2++; } } if (c2) port -= (s2 / c2) * (shorts.length / N); }
    equity *= (1 + port);
    if (d === end1y) e1y = equity;
    if (equity > peak) peak = equity;
    var dd = (peak - equity) / peak; if (dd > maxDD) maxDD = dd;
    // daily exit: long momentum <=0 -> out; short momentum >=0 -> out
    var stillL = [], stillS = [];
    for (var a2 = 0; a2 < longs.length; a2++) if (!momNeg(longs[a2], d)) stillL.push(longs[a2]); else { equity *= (1 - FEE / N); trades++; }
    for (var b2 = 0; b2 < shorts.length; b2++) if (!momPos(shorts[b2], d)) stillS.push(shorts[b2]); else { equity *= (1 - FEE / N); trades++; }
    longs = stillL; shorts = stillS;
    // weekly rebalance
    if (d - lastRebal >= R) {
      var sc = ranks(d, weights);
      if (sc !== null) {
        var order = [];
        for (var c = 0; c < COINS.length; c++) order.push([sc[c], c]);
        order.sort(function (x, y) { return y[0] - x[0]; });
        var nL = [], nS = [];
        for (var o = 0; o < N && o < order.length; o++) if (momAt(order[o][1], d, 14) > 0) nL.push(order[o][1]);
        if (useShorts) for (var o2 = order.length - 1; o2 >= 0 && nS.length < N; o2--) if (momAt(order[o2][1], d, 14) < 0) nS.push(order[o2][1]);
        var chg = 0;
        for (var x2 = 0; x2 < nL.length; x2++) if (inArr(longs, nL[x2]) === false) chg++;
        for (var x3 = 0; x3 < longs.length; x3++) if (inArr(nL, longs[x3]) === false) chg++;
        equity *= (1 - FEE * chg / N);
        var chgS = 0;
        for (var y2 = 0; y2 < nS.length; y2++) if (inArr(shorts, nS[y2]) === false) chgS++;
        for (var y3 = 0; y3 < shorts.length; y3++) if (inArr(nS, shorts[y3]) === false) chgS++;
        if (useShorts) equity *= (1 - FEE * chgS / N);
        trades += chg + (useShorts ? chgS : 0);
        longs = nL; shorts = useShorts ? nS : [];
        lastRebal = d;
      }
    }
  }
  var ret5y = (equity / 100 - 1) * 100;
  var r1y = e1y !== null ? (equity / e1y - 1) * 100 : NaN;
  WScript.Echo(name + ": 5y=" + (ret5y >= 0 ? "+" : "") + ret5y.toFixed(0) + "%  last1y=" + (r1y >= 0 ? "+" : "") + r1y.toFixed(0) + "%  dd=" + (maxDD * 100).toFixed(0) + "%  trades=" + trades);
}
var D0 = 250, D1 = ND - 1;
var MODE = (WScript.Arguments.length > 0) ? parseInt(WScript.Arguments.Item(0), 10) : 0;
WScript.Echo("days=" + ND + " window=" + dateList[D0] + ".." + dateList[D1] + " shorts=" + (MODE ? "ON(bottom2)" : "OFF"));
run("BASE  MOM14 only        ", { MOM: 1 }, D0, D1, MODE === 1);
run("MF-4  equal weight      ", { MOM: 1, TREND: 1, LOWVOL: 1, VOLCHG: 1 }, D0, D1, MODE === 1);
run("MF-3  no VOLCHG         ", { MOM: 1, TREND: 1, LOWVOL: 1 }, D0, D1, MODE === 1);
run("MF-2  MOM+LOWVOL        ", { MOM: 1, LOWVOL: 1 }, D0, D1, MODE === 1);
run("MF-T  MOMx2+others      ", { MOM: 2, TREND: 1, LOWVOL: 1, VOLCHG: 1 }, D0, D1, MODE === 1);
run("solo TREND              ", { TREND: 1 }, D0, D1, MODE === 1);
run("solo LOWVOL             ", { LOWVOL: 1 }, D0, D1, MODE === 1);
run("solo VOLCHG             ", { VOLCHG: 1 }, D0, D1, MODE === 1);
