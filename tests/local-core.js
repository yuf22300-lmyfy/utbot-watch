// Local validation runner (JScript/cscript). Splice after core.js:
//   cat core.js tests/local-core.js > _merged.js
//   cscript //nologo _merged.js <dataFile> [key] [alen]
// dataFile format: "ts open high low close" per line, ascending, ms timestamps.
var fso = new ActiveXObject("Scripting.FileSystemObject");
var fname = WScript.Arguments.Item(0).replace(/\//g, "\\");
var f = fso.OpenTextFile(fname, 1);
var raw = [];
while (!f.AtEndOfStream) {
  var ln = f.ReadLine();
  if (ln.replace(/\s+/g, "").length > 0) raw.push(ln);
}
f.Close();
var bars = [];
for (var i = 0; i < raw.length; i++) {
  var p = raw[i].split(" ");
  bars.push({ ts: parseInt(p[0], 10), o: parseFloat(p[1]), h: parseFloat(p[2]), l: parseFloat(p[3]), c: parseFloat(p[4]) });
}
// mirror cloud: drop unclosed last bar(s)
var nowMs = new Date().getTime();
var cut = bars.length;
while (cut > 0 && bars[cut - 1].ts + 900000 > nowMs + 1500) cut--;
bars = bars.slice(0, cut);

var KEY = WScript.Arguments.length > 1 ? parseFloat(WScript.Arguments.Item(1)) : 50;
var ALEN = WScript.Arguments.length > 2 ? parseInt(WScript.Arguments.Item(2), 10) : 10;
var sig = computeSignals(bars, KEY, ALEN, 900000);

function bj(ms) {
  var d = new Date(ms + 8 * 3600 * 1000);
  var mo = d.getUTCMonth() + 1; if (mo < 10) mo = "0" + mo;
  var da = d.getUTCDate(); if (da < 10) da = "0" + da;
  var hh = d.getUTCHours(); if (hh < 10) hh = "0" + hh;
  var mi = d.getUTCMinutes(); if (mi < 10) mi = "0" + mi;
  return d.getUTCFullYear() + "-" + mo + "-" + da + " " + hh + ":" + mi;
}

WScript.Echo("FILE=" + fname);
WScript.Echo("BARS=" + bars.length + " KEY=" + KEY + " ATR=" + ALEN + " warmup=" + WARMUP_BARS);
WScript.Echo("DIR=" + sig.dir);
WScript.Echo("SINCE_CLOSE_TS=" + sig.sinceCloseTs + " (BJ " + bj(sig.sinceCloseTs) + ")");
WScript.Echo("SINCE_SIG_PX=" + sig.sincePx.toFixed(2));
WScript.Echo("SINCE_STOP=" + sig.sinceStop.toFixed(2));
WScript.Echo("SINCE_FILL=" + (sig.sinceFill === null ? "null" : sig.sinceFill.toFixed(2)));
WScript.Echo("LOW_CONF=" + sig.lowConf);
WScript.Echo("STOP_NOW=" + sig.stopNow.toFixed(2) + " ATR_NOW=" + sig.atrNow.toFixed(2) + " LAST_CLOSE=" + sig.lastClose.toFixed(2));
WScript.Echo("RECENT_EVENTS=" + sig.recentEvents.length);
for (var q = 0; q < sig.recentEvents.length; q++) {
  var e = sig.recentEvents[q];
  WScript.Echo("  ev dir=" + e.dir + " closeTs=" + e.closeTs + " (BJ " + bj(e.closeTs) + ") px=" + e.px.toFixed(2) + " fill=" + (e.fill === null ? "null" : e.fill.toFixed(2)));
}
var st = { dir: sig.dir, sinceCloseTs: sig.sinceCloseTs };
WScript.Echo("DECIDE_SELF=" + decideAction(st, sig) + " DECIDE_SEED=" + decideAction(null, sig) + " DECIDE_FLIP=" + decideAction({ dir: -sig.dir, sinceCloseTs: sig.sinceCloseTs - 1 }, sig));
