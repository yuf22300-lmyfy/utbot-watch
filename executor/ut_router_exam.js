// EXAM for the hybrid execution router + signal core. Splice: cat core.js ut_hybrid.js ut_router_exam.js > _exam.js
// Run:    cscript //nologo _exam.js EXAM
// Answer keys are INDEPENDENT of the code under test: hand arithmetic or the
// previously 10x-verified archive (591.8/573.2/720.8..., anchors 1719.96/2415.58...).
var PASS = 0, FAIL = 0, FAILLIST = [];
function Q(id, desc, expected, actual, tol) {
  var ok;
  if (typeof expected === "number" && typeof actual === "number") {
    var t = (tol === undefined ? 0.000001 : tol);
    ok = Math.abs(actual - expected) <= t;
  } else { ok = (String(expected) === String(actual)); }
  if (ok) { PASS++; WScript.Echo("[PASS] Q" + id + " " + desc); }
  else { FAIL++; FAILLIST.push("Q" + id); WScript.Echo("[FAIL] Q" + id + " " + desc + " | expected=" + expected + " actual=" + actual); }
}
function near(a, b, t) { return Math.abs(a - b) <= t; }

// ---------- Part A: routing units on synthetic data ----------
// Q1 fee routing: hybrid long pays spot 0.1%, all other legs 0.05%
Q(1, "fee routing", "0.0010/0.0005/0.0005/0.0005",
  feeFor(1, true).toFixed(4) + "/" + feeFor(-1, true).toFixed(4) + "/" + feeFor(1, false).toFixed(4) + "/" + feeFor(-1, false).toFixed(4));

// Q2 fill-price routing: hybrid long -> SPOT open; hybrid short & pure both -> SWAP open
swap = [{ ts: 1000, o: 2000, h: 2000, l: 2000, c: 2000 }];
spotOpen = { 1000: 1990 }; spotClose = { 1000: 1991 };
Q(2, "fill routing", "1990/2000/2000",
  fillPrice(0, 1, true) + "/" + fillPrice(0, -1, true) + "/" + fillPrice(0, 1, false));

// Q3 spot bar missing -> fallback to swap open, no NaN
spotOpen = {};
Q(3, "missing-spot fallback", 2000, fillPrice(0, 1, true));

// Q4 funding applicability: hybrid long exempt; short & pure legs accrue
Q(4, "funding applicability", "false/true/true/true",
  fundingApplies(1, true) + "/" + fundingApplies(-1, true) + "/" + fundingApplies(1, false) + "/" + fundingApplies(-1, false));

// ---------- Part B: end-to-end accounting on synthetic series ----------
// gentle rise then crash then rise: forces at least one flip each way
function mkbars() {
  var arr = [], ts = 1600000000000, c = 600;
  for (var k = 0; k < 12; k++) { arr.push({ ts: ts, o: c, h: c + 1, l: c - 1, c: c }); ts += BARMS; c += 1; }     // rise 100..111
  for (var k2 = 0; k2 < 6; k2++) { arr.push({ ts: ts, o: c, h: c + 1, l: c - 1, c: c - 35 }); c -= 35; ts += BARMS; } // crash -> -99
  for (var k3 = 0; k3 < 10; k3++) { arr.push({ ts: ts, o: c, h: c + 1, l: c - 1, c: c + 40 }); c += 40; ts += BARMS; } // recover -> 301
  for (var k4 = 0; k4 < 8; k4++) { arr.push({ ts: ts, o: c, h: c + 1, l: c - 1, c: c - 80 }); c -= 80; ts += BARMS; }  // deep dip
  return arr;
}
swap = mkbars(); spotOpen = {}; spotClose = {};
for (var s0 = 0; s0 < swap.length; s0++) { spotOpen[swap[s0].ts] = swap[s0].o * 1.001; spotClose[swap[s0].ts] = swap[s0].c * 1.001; }
n = swap.length; stop = buildStop(swap); WARM = 5;
var R1 = sim(true, 0.0001), R2 = sim(false, 0.0001);

// Q5 accounting identity incl. open-position entry fee (leak detector)
var idsum = 0;
for (var q5 = 0; q5 < R1.log.length; q5++) idsum += R1.log[q5].pnlGross - R1.log[q5].fee;
var openFee = (R1.openPos && typeof R1.openPos === "object") ? R1.openPos.entryFee : 0;
Q(5, "accounting identity (hybrid, " + R1.t + " trades)", 1,
  (R1.t >= 2 && near(R1.eq - INIT, idsum - R1.fund - openFee, 0.01)) ? 1 : 0);

// Q6 curve finite and never NaN/negative-beyond-margin (equity > -INIT)
var ok6 = true;
for (var q6 = 0; q6 < R1.curve.length; q6++) { if (isNaN(R1.curve[q6]) || R1.curve[q6] < -INIT) { ok6 = false; break; } }
Q(6, "curve finite & bounded", 1, ok6 ? 1 : 0);

// Q7 trades strictly alternate direction (SAR router must reverse every flip)
var ok7 = R1.log.length >= 2;
for (var q7 = 1; q7 < R1.log.length; q7++) { if (R1.log[q7].dir === R1.log[q7 - 1].dir) { ok7 = false; break; } }
Q(7, "alternating directions", 1, ok7 ? 1 : 0);

// Q8 determinism: two runs identical
var R1b = sim(true, 0.0001);
Q(8, "determinism", 1, (R1b.eq === R1.eq && R1b.t === R1.t && R1b.dd === R1.dd) ? 1 : 0);

// ---------- Part C: real-data anchors (previously verified archive) ----------
var swap5 = loadBars("C:/Users/asus/.zcode/workspace/default/ut_eth15m_swap5y.txt");
var spot5 = loadBars("C:/Users/asus/.zcode/workspace/default/ut_eth15m_5ym.txt");
spotOpen = {}; spotClose = {};
for (var q9a = 0; q9a < spot5.length; q9a++) { spotOpen[spot5[q9a].ts] = spot5[q9a].o; spotClose[spot5[q9a].ts] = spot5[q9a].c; }
swap = swap5; n = swap.length; stop = buildStop(swap); WARM = 700;
var A0 = sim(false, 0), B0 = sim(true, 0), A10 = sim(false, 0.0001), B10 = sim(true, 0.0001);

Q(9, "PURE fund=0 archive eq", 591.8, A0.eq, 0.05);
Q(10, "HYBRID fund=0 archive eq", 573.2, B0.eq, 0.05);
Q(11, "funding signs: pure pays +, hybrid receives -", 1,
  (near(A10.fund, 23.0, 0.2) && near(B10.fund, -67.0, 0.2) && near(B10.eq, 720.8, 0.05)) ? 1 : 0);

// Q12 routing anchor: the 2026-07-03 08:30 long ? PURE fills at swap open 1719.26, HYBRID at spot open 1719.96
function findLongAt(log, px, tol) { for (var z = 0; z < log.length; z++) if (log[z].dir === 1 && near(log[z].inPx, px, tol)) return log[z]; return null; }
Q(12, "7/3 long fill: pure=swap 1719.26 / hybrid=spot 1719.96", 1,
  (findLongAt(A0.log, 1719.26, 0.01) !== null && findLongAt(B0.log, 1719.96, 0.01) !== null) ? 1 : 0);

// Q13 9/15 flip: last closed long exits 14:45UTC ? pure at swap open 2415.58, hybrid at spot open 2416.97
var la = A0.log[A0.log.length - 1], lb = B0.log[B0.log.length - 1];
Q(13, "9/15 exit: pure 2415.58 / hybrid 2416.97", 1,
  (la.dir === 1 && near(la.outPx, 2415.58, 0.01) && lb.dir === 1 && near(lb.outPx, 2416.97, 0.01)) ? 1 : 0);

// ---------- Part D: signal core + fault injection ----------
// Q14 wipe all spot bars for hybrid longs: sim must still complete, finite, same trade count
spotOpen = {}; spotClose = {};
var B0w = sim(true, 0);
Q(14, "spot fully missing: finite & trades preserved", 1, (!isNaN(B0w.eq) && B0w.t === B0.t && B0w.eq > 0) ? 1 : 0);
spotOpen = {}; spotClose = {};
for (var q14b = 0; q14b < spot5.length; q14b++) { spotOpen[spot5[q14b].ts] = spot5[q14b].o; spotClose[spot5[q14b].ts] = spot5[q14b].c; }

// Q15 decideAction state machine
Q(15, "decideAction seed/nochange/flip", "seed/nochange/flip",
  decideAction(null, { dir: -1, sinceCloseTs: 5 }) + "/" +
  decideAction({ dir: -1, sinceCloseTs: 5 }, { dir: -1, sinceCloseTs: 5 }) + "/" +
  decideAction({ dir: 1, sinceCloseTs: 5 }, { dir: -1, sinceCloseTs: 6 }));

// Q16 computeSignals live anchor on swap feed: SHORT since 1789483500000 @2415.57
var cut = swap5.length, nowMs = new Date().getTime();
while (cut > 0 && swap5[cut - 1].ts + 900000 > nowMs + 1500) cut--;
var sig = computeSignals(swap5.slice(0, cut), 50, 10, 900000);
Q(16, "live signal anchor", 1,
  (sig.dir === -1 && sig.sinceCloseTs === 1789483500000 && near(sig.sincePx, 2415.57, 0.01) && near(sig.sinceFill, 2415.58, 0.01)) ? 1 : 0);

WScript.Echo("================================");
WScript.Echo("SCORE: " + PASS + "/" + (PASS + FAIL) + (FAIL === 0 ? "  => PASS (executor certified)" : "  => FAIL: " + FAILLIST.join(",")));


