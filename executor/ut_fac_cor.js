// Factor correlation matrix on the 8-coin universe (daily closes from 15m aggregation).
// Factors (computed at each rebalance date, cross-sectionally):
//   MOM  = 14d return (current live factor)
//   TREND = close/SMA200d - 1 (trend strength, bounded)
//   LOWVOL = -(stdev of daily returns, 14d) (low-vol anomaly; score = negative vol)
//   VOLCHG = 14d vol / 90d vol (vol regime change; score = negative => falling vol good)
// Output: pairwise Spearman rank correlation averaged across all rebalance dates,
// plus average cross-sectional dispersion of each factor.
// args: none; reads ut_<coin>15m_5y.txt for 8 coins.
var DIR = "C:/Users/asus/.zcode/workspace/default/";
var COINS = ["eth", "btc", "sol", "bnb", "xrp", "doge", "avax", "link"];
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
var price = [];
for (var j = 0; j < COINS.length; j++) {
  var pr = new Array(ND), last = null;
  for (var d = 0; d < ND; d++) { var v = MAPS[j][dateList[d]]; if (v !== undefined) last = v; pr[d] = last; }
  price.push(pr);
}
// daily returns
var ret = [];
for (var j2 = 0; j2 < COINS.length; j2++) {
  var r = new Array(ND);
  for (var d2 = 1; d2 < ND; d2++) r[d2] = price[j2][d2] / price[j2][d2 - 1] - 1;
  ret.push(r);
}
function stdevWindow(arr, d, len) {
  var s = 0, s2 = 0, n = 0;
  for (var x = d - len + 1; x <= d; x++) { if (x < 1) return NaN; var v = arr[x]; s += v; s2 += v * v; n++; }
  var m = s / n;
  return Math.sqrt(Math.max(0, s2 / n - m * m));
}
function smaAt(arr, d, len) {
  if (d - len + 1 < 0) return NaN;
  var s = 0;
  for (var x = d - len + 1; x <= d; x++) s += arr[x];
  return s / len;
}
function momAt(j, d, len) { if (d - len < 0) return NaN; return price[j][d] / price[j][d - len] - 1; }

// factor values per coin per date
function facVals(d) {
  var out = [];
  for (var j3 = 0; j3 < COINS.length; j3++) {
    var f = {};
    f.MOM = momAt(j3, d, 14);
    var sma = smaAt(price[j3], d, 200);
    f.TREND = isNaN(sma) ? NaN : price[j3][d] / sma - 1;
    f.LOWVOL = -stdevWindow(ret[j3], d, 14);
    var v14 = stdevWindow(ret[j3], d, 14), v90 = stdevWindow(ret[j3], d, 90);
    f.VOLCHG = isNaN(v90) ? NaN : -(v14 / v90);
    out.push(f);
  }
  return out;
}
// spearman between two factor columns across coins, for a given date
function rankArr(vals) {
  var idx = [];
  for (var q = 0; q < vals.length; q++) idx.push([vals[q], q]);
  idx.sort(function (a, b) { return a[0] - b[0]; });
  var r = new Array(vals.length);
  for (var q2 = 0; q2 < idx.length; q2++) r[idx[q2][1]] = q2;
  return r;
}
function spearman(a, b) {
  var n = a.length, ra = rankArr(a), rb = rankArr(b);
  var num = 0;
  for (var i = 0; i < n; i++) num += ra[i] * rb[i];
  var mean = (n - 1) / 2;
  var va = 0, vb = 0;
  for (var i2 = 0; i2 < n; i2++) { va += (ra[i2] - mean) * (ra[i2] - mean); vb += (rb[i2] - mean) * (rb[i2] - mean); }
  return num / (va * vb);
}
var NAMES = ["MOM", "TREND", "LOWVOL", "VOLCHG"];
var sum = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], cnt = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
var dates = 0;
for (var d3 = 220; d3 < ND; d3 += 1) {
  var fv = facVals(d3);
  var cols = {};
  var ok = true;
  for (var f4 = 0; f4 < 4; f4++) {
    var col = [];
    for (var cc = 0; cc < COINS.length; cc++) {
      var v = fv[cc][NAMES[f4]];
      if (isNaN(v)) { ok = false; break; }
      col.push(v);
    }
    if (!ok) break;
    cols[NAMES[f4]] = col;
  }
  if (!ok) continue;
  dates++;
  for (var A = 0; A < 4; A++) for (var B = A + 1; B < 4; B++) {
    var sp = spearman(cols[NAMES[A]], cols[NAMES[B]]);
    sum[A][B] += sp; cnt[A][B]++;
  }
}
WScript.Echo("dates=" + dates + " (daily cross-sections, 8 coins)");
WScript.Echo("avg Spearman rank corr:");
WScript.Echo("          MOM     TREND   LOWVOL  VOLCHG");
for (var A2 = 0; A2 < 4; A2++) {
  var line = "  " + NAMES[A2] + "     ";
  for (var B2 = 0; B2 < 4; B2++) {
    if (A2 === B2) line += "   -    ";
    else {
      var lo = Math.min(A2, B2), hi = Math.max(A2, B2);
      var cv = cnt[lo][hi] ? sum[lo][hi] / cnt[lo][hi] : NaN;
      line += (cv >= 0 ? "+" : "") + cv.toFixed(2) + "   ";
    }
  }
  WScript.Echo(line);
}
// note appended: low-vol solo has best recent year; see ut_mulfac.js results.
