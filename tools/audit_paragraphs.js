// audit_paragraphs.js — Mission 1 paragraph-data audit (docs/PARAGRAPH_DATA_GAPS.md).
// Follows every Mission 1 mission-card cell (all four Conditions, hex and Random Event
// columns) through `goto` ops and reports: reachable paragraphs with no program, cells the
// engine's own parseCellValue can't read, bespoke ops left in reachable programs, and
// paragraphs whose ToolBox text differs from the errata booklet. Exit 1 on any gap.
//   node tools/audit_paragraphs.js [--quiet]
global.window = global;
var path = require('path');
var fs = require('fs');
var root = path.join(__dirname, '..');
require(path.join(root, 'assets/data/paragraphs.js'));
require(path.join(root, 'assets/data/paragraph_programs.js'));
require(path.join(root, 'assets/data/mission_cards.js'));
require(path.join(root, 'apps/game/paragraphinterpreter.js'));
require(path.join(root, 'apps/game/operationsloop.js'));

var TEXT = window.AMBUSH_PARAGRAPHS.paragraphs || window.AMBUSH_PARAGRAPHS;
var PROG = window.AMBUSH_PARAGRAPH_PROGRAMS;
var CARDS = window.AMBUSH_MISSION_CARDS.mission_cards['1'];
var parse = window.AmbushOperations.parseCellValue;
var quiet = process.argv.indexOf('--quiet') !== -1;

// ---- reachability ---------------------------------------------------------
var from = {};
var badCells = [];
var queue = [];
Object.keys(CARDS).forEach(function (cond) {
  Object.keys(CARDS[cond]).forEach(function (cell) {
    var c = parse(CARDS[cond][cell]);
    if (c.type === 'unknown') badCells.push('C' + cond + ' ' + cell + ' ' + JSON.stringify(c.raw));
    if (c.type === 'paragraph' && !from[c.paragraph]) { from[c.paragraph] = 'C' + cond + ' ' + cell; queue.push(c.paragraph); }
  });
});
function targets(instrs, out) {
  (instrs || []).forEach(function (ins) {
    if (ins.op === 'goto') out.push(ins.target);
    ['then', 'else', 'onSuccess', 'onFail', 'onNone'].forEach(function (k) { targets(ins[k], out); });
    (ins.branches || []).forEach(function (b) { targets(b.then, out); });
  });
  return out;
}
while (queue.length) {
  var n = queue.shift();
  targets(PROG[n], []).forEach(function (t) { if (!from[t]) { from[t] = n; queue.push(t); } });
}
var reach = Object.keys(from).sort(function (a, b) { return a - b; });
var missing = reach.filter(function (n) { return PROG[n] === undefined && TEXT[n] !== undefined; });
var bespoke = [];
reach.forEach(function (n) {
  (function walk(instrs) {
    (instrs || []).forEach(function (ins) {
      if (ins.op === 'bespoke') bespoke.push(n + ': ' + ins.note);
      ['then', 'else', 'onSuccess', 'onFail', 'onNone'].forEach(function (k) { walk(ins[k]); });
      (ins.branches || []).forEach(function (b) { walk(b.then); });
    });
  })(PROG[n]);
});

// ---- booklet cross-check (errata booklet is the source of truth) ----------
var bookletFile = path.join(root, 'source/converted/Ambush_Paragraph_Booklet_Pages_with_Errata_v1.md');
var booklet = {};
var cur = null;
// Paragraphs open with a 3-digit number ("007. It must ..."); "1." / "2." lines are numbered
// items inside a paragraph, continuation lines and "* If ..." bullets belong to the open one.
fs.readFileSync(bookletFile, 'utf8').split('\n').forEach(function (line) {
  var m = /^(\d{3})\. (.*)$/.exec(line);
  if (m) { cur = String(parseInt(m[1], 10)); booklet[cur] = m[2]; return; }
  if (/^#|^Reference:/.test(line)) { cur = null; return; }
  if (cur && line.trim()) booklet[cur] += ' ' + line.replace(/^\*\s*/, '');
});
// Hex ids print as 'K-13' in the ToolBox and 'K13' in the booklet; numbers as '180' or '180.'.
function norm(s) { return String(s || '').replace(/\b([A-Y])-(\d)/g, '$1$2').replace(/[*\s.,;:()\-–]+/g, ' ').trim().toLowerCase(); }
var textDiff = reach.filter(function (n) { return booklet[n] && norm(booklet[n]) !== norm(TEXT[n]); });
var notInBooklet = reach.filter(function (n) { return !booklet[n]; });

function show(title, list) {
  console.log(title + ': ' + list.length);
  if (!quiet) list.forEach(function (x) { console.log('  ' + x); });
}
console.log('reachable paragraphs: ' + reach.length);
show('missing programs', missing.map(function (n) { return n + ' <- ' + from[n]; }));
show('unparseable cells', badCells);
show('bespoke ops', bespoke);
show('text differs from booklet', textDiff.map(function (n) { return n + '\n    toolbox: ' + TEXT[n].replace(/\n/g, ' ') + '\n    booklet: ' + booklet[n]; }));
show('not in booklet', notInBooklet);
process.exit(missing.length || badCells.length || bespoke.length ? 1 : 0);
