// Local validation for computeEquity (JScript/cscript). Splice after core.js:
//   cat core.js tests/local-equity.js > _meq.js && cscript //nologo _meq.js <dataFile>
var fso = new ActiveXObject("Scripting.FileSystemObject");
var fname = WScript.Arguments.Item(0).replace(/\//g, "\\");
var f = fso.OpenTextFile(fname, 1);
var raw = [];
while (!f.AtEndOfStream) { var ln = f.ReadLine(); if (ln.replace(/\s+/g, "").length > 0) raw.push(ln); }
f.Close();
var bars = [];
for (var i = 0; i < raw.length; i++) {
  var p = raw[i].split(" ");
  bars.push({ ts: parseInt(p[0], 10), o: parseFloat(p[1]), h: parseFloat(p[2]), l: parseFloat(p[3]), c: parseFloat(p[4]) });
}
var nowMs = new Date().getTime();
var cut = bars.length;
while (cut > 0 && bars[cut - 1].ts + 900000 > nowMs + 1500) cut--;
bars = bars.slice(0, cut);

function bj(ms) {
  var d = new Date(ms + 8 * 3600 * 1000);
  function p2(x) { return (x < 10 ? "0" : "") + x; }
  return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()) + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes());
}

var eqr = computeEquity(bars, 50, 10, 900000, 0.001, 100);
WScript.Echo("BARS=" + bars.length + " warmupStart=" + bj(eqr.windowStart) + " end=" + bj(eqr.windowEnd + 900000));
WScript.Echo("EQ=" + eqr.eq + " RET=" + eqr.retPct + "% REALIZED=" + eqr.realized + " DD=" + eqr.maxDDPct + "% TRADES=" + eqr.trades.length + " WINS=" + eqr.wins + " WR=" + eqr.winRate + "%");
for (var q = 0; q < eqr.trades.length; q++) {
  var t = eqr.trades[q];
  WScript.Echo("  d=" + t.dir + " in=" + bj(t.inTs) + " @" + t.inPx.toFixed(2) + " out=" + bj(t.outTs) + " @" + t.outPx.toFixed(2) + " pnl=" + t.pnl + " pct=" + t.pct + "% eq=" + t.eq);
}
if (eqr.position) {
  var P = eqr.position;
  WScript.Echo("POSITION dir=" + P.dir + " since=" + bj(P.sinceCloseTs) + " entry=" + P.entryPx.toFixed(2) + " qty=" + P.qty + " mark=" + P.markPx.toFixed(2) + " upl=" + P.upl + " (" + P.uplPct + "%)");
} else { WScript.Echo("POSITION=flat"); }
WScript.Echo("CURVE_PTS=" + eqr.curve.length + " first=" + bj(eqr.curve[0][0]) + " last=" + bj(eqr.curve[eqr.curve.length - 1][0]) + " lastEq=" + eqr.curve[eqr.curve.length - 1][1]);
