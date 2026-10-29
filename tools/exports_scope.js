#!/usr/bin/env node
// R6 Step 9 (Stage C, docs/REFACTOR_MAP.md 5.3): scope analysis of apps/v3/mission1/*.js, used by
// tools/exports.py. Parses each file with acorn (tools/vendor/acorn.js, MIT) and resolves every
// identifier with a small ES5 scope model: function scopes (params, `arguments`, hoisted `var`s,
// function declarations), named function expressions, `catch` bindings, and block scopes for
// function declarations inside blocks (strict mode). An unwrapped file is analysed as if wrapped
// in a function, so its top-level names are the file's own scope; a wrapped file's own scope is
// its IIFE.
//
//   node tools/exports_scope.js scan            -> JSON: per file, top-level declarations, the
//        references that leave the file (bare names and M1.x), writes, load-time flags
//   node tools/exports_scope.js wrap <file> <spec.json>
//        -> rewrites apps/v3/mission1/*.js in place to namespace <file> (spec from exports.py)
'use strict';
var fs = require('fs');
var path = require('path');
var acorn = require('./vendor/acorn.js');

var DIR = path.join(__dirname, '..', 'apps', 'v3', 'mission1');
var ORDER = ['core', 'present', 'info', 'roster', 'setup', 'operations', 'contact', 'rounds', 'verbs',
  'german', 'combat', 'save', 'seams'];
var PRE = '(function(){';

function isWrapped(src) {
  return /^\(function \(\) \{$/m.test(src);
}

function Scope(kind, node, parent) {
  this.kind = kind; this.node = node; this.parent = parent; this.names = Object.create(null);
}

// Walk the AST: build scopes, collect bindings and references.
function analyze(code) {
  var ast = acorn.parse(code, { ecmaVersion: 5, sourceType: 'script', locations: true, ranges: true,
    allowReserved: true });
  var refs = [], members = [];
  var global = new Scope('global', ast, null);

  function fnScope(s) { while (s.kind !== 'function' && s.kind !== 'global') s = s.parent; return s; }
  function declare(scope, id, kind, node) { scope.names[id.name] = { kind: kind, node: node, id: id }; }
  function ref(id, scope, write, init, parent) {
    refs.push({ name: id.name, start: id.start, end: id.end, line: id.loc.start.line, scope: scope,
      write: !!write, init: !!init, parent: parent });
  }

  function visit(node, scope, parent) {
    if (!node || typeof node.type !== 'string') return;
    node._parent = parent;
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression': {
        if (node.type === 'FunctionDeclaration') declare(scope, node.id, 'function', node);
        var fs_ = new Scope('function', node, scope);
        node._scope = fs_;
        if (node.type === 'FunctionExpression' && node.id) {
          var named = new Scope('fname', node, scope);
          declare(named, node.id, 'fname', node);
          fs_.parent = named;
        }
        fs_.names.arguments = { kind: 'arguments' };
        node.params.forEach(function (p) { p._parent = node; declare(fs_, p, 'param', node); });
        node.body._parent = node;
        node.body.body.forEach(function (st) { visit(st, fs_, node.body); });
        return;
      }
      case 'BlockStatement': {
        var bs = new Scope('block', node, scope);
        node.body.forEach(function (st) { visit(st, bs, node); });
        return;
      }
      case 'CatchClause': {
        var cs = new Scope('catch', node, scope);
        declare(cs, node.param, 'catch', node);
        visit(node.body, cs, node);
        return;
      }
      case 'VariableDeclaration':
        node.declarations.forEach(function (d) {
          d._parent = node;
          declare(fnScope(scope), d.id, 'var', d);
          d.id._parent = d;
          if (d.init) { ref(d.id, scope, true, true, d); visit(d.init, scope, d); }
        });
        return;
      case 'Identifier':
        ref(node, scope, false, false, parent);
        return;
      case 'MemberExpression':
        visit(node.object, scope, node);
        if (node.computed) visit(node.property, scope, node);
        else if (node.object.type === 'Identifier' && node.object.name === 'M1') {
          members.push({ prop: node.property.name, start: node.start, end: node.end, line: node.loc.start.line,
            scope: scope, node: node, objStart: node.object.start });
        }
        return;
      case 'Property':
        if (node.computed) visit(node.key, scope, node);
        visit(node.value, scope, node);
        return;
      case 'LabeledStatement':
        visit(node.body, scope, node);
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
        return;
      case 'AssignmentExpression':
        if (node.left.type === 'Identifier') { node.left._parent = node; ref(node.left, scope, true, false, node); }
        else visit(node.left, scope, node);
        visit(node.right, scope, node);
        return;
      case 'UpdateExpression':
        if (node.argument.type === 'Identifier') { node.argument._parent = node; ref(node.argument, scope, true, false, node); }
        else visit(node.argument, scope, node);
        return;
      case 'ForInStatement':
        if (node.left.type === 'Identifier') { node.left._parent = node; ref(node.left, scope, true, false, node); }
        else visit(node.left, scope, node);
        visit(node.right, scope, node);
        visit(node.body, scope, node);
        return;
    }
    for (var k in node) {
      if (k === '_parent' || k === '_scope' || k === 'loc' || k === 'range') continue;
      var v = node[k];
      if (Array.isArray(v)) v.forEach(function (c) { if (c && typeof c.type === 'string') visit(c, scope, node); });
      else if (v && typeof v.type === 'string') visit(v, scope, node);
    }
  }
  ast.body.forEach(function (st) { visit(st, global, ast); });

  function resolve(name, scope) {
    for (var s = scope; s; s = s.parent) if (s.names[name]) return s;
    return null;
  }
  refs.forEach(function (r) { r.resolved = resolve(r.name, r.scope); });
  members.forEach(function (m) { m.m1 = resolve('M1', m.scope); });
  return { ast: ast, global: global, refs: refs, members: members };
}

// The file's own scope: the wrapper function (unwrapped) or the IIFE (wrapped).
function fileScope(an) {
  var st = an.ast.body.filter(function (s) { return s.type === 'ExpressionStatement' &&
    s.expression.type === 'CallExpression' && s.expression.callee.type === 'FunctionExpression'; })[0];
  return st.expression.callee._scope;
}

// Load time: every function between the reference and the file scope is called on the spot.
function isLoadTime(scope, top) {
  for (var s = scope; s && s !== top; s = s.parent) {
    if (s.kind !== 'function') continue;
    var fn = s.node, p = fn._parent;
    var iife = p && p.type === 'CallExpression' && p.callee === fn;
    var callMember = p && p.type === 'MemberExpression' && p.object === fn && p._parent &&
      p._parent.type === 'CallExpression';
    if (!iife && !callMember) return false;
  }
  return true;
}

function load(f) {
  var src = fs.readFileSync(path.join(DIR, f + '.js'), 'utf8');
  var wrapped = isWrapped(src);
  var code = wrapped ? src : PRE + src + '\n})();';
  var an = analyze(code);
  return { file: f, src: src, wrapped: wrapped, off: wrapped ? 0 : PRE.length, an: an, top: fileScope(an) };
}

function scan() {
  var files = ORDER.map(load);
  var out = { order: ORDER, files: {} };
  files.forEach(function (F) {
    var top = F.top, decls = {};
    Object.keys(top.names).forEach(function (n) {
      if (n === 'arguments') return;
      var d = top.names[n];
      decls[n] = { kind: d.kind, line: d.id.loc.start.line, writes: [] };
    });
    var through = [], m1 = [];
    F.an.refs.forEach(function (r) {
      if (r.resolved === top && decls[r.name] && r.write && !r.init) decls[r.name].writes.push(r.line);
      if (r.resolved && r.resolved !== F.an.global) return;
      through.push({ name: r.name, line: r.line, write: r.write, load: isLoadTime(r.scope, top) });
    });
    F.an.members.forEach(function (m) {
      var p = m.node._parent;
      var write = (p.type === 'AssignmentExpression' && p.left === m.node) ||
        (p.type === 'UpdateExpression' && p.argument === m.node);
      m1.push({ prop: m.prop, line: m.line, write: write, load: isLoadTime(m.scope, top) });
    });
    out.files[F.file] = { wrapped: F.wrapped, decls: decls, through: through, m1: m1 };
  });
  return out;
}

// spec: { exports: [...], mutable: [...], viaM1Inside: [...] } for file `target`.
function wrap(target, spec) {
  var exp = {}, mut = {}, inside = {};
  spec.exports.forEach(function (n) { exp[n] = 1; });
  spec.mutable.forEach(function (n) { mut[n] = 1; });
  (spec.viaM1Inside || []).forEach(function (n) { inside[n] = 1; });
  var files = ORDER.map(load);
  files.forEach(function (F) {
    var edits = [];  // [start, end, text] in code coordinates
    if (F.file !== target) {
      F.an.refs.forEach(function (r) {
        if (r.resolved && r.resolved !== F.an.global) return;
        if (exp[r.name]) edits.push([r.start, r.end, 'M1.' + r.name]);
      });
    } else {
      if (F.wrapped) throw new Error(target + ' is already wrapped');
      var top = F.top, an = F.an;
      // declarations of exported vars
      an.ast.body[0].expression.callee.body.body.forEach(function (st) {
        if (st.type !== 'VariableDeclaration') return;
        var hit = st.declarations.filter(function (d) { return exp[d.id.name]; });
        if (!hit.length) return;
        var hitMut = hit.filter(function (d) { return mut[d.id.name]; });
        if (hitMut.length) {
          if (st.declarations.length !== 1) throw new Error('mutable ' + hitMut[0].id.name + ' shares a var statement');
          var d = st.declarations[0];
          // `var x = init;` -> `M1.x = init;`
          edits.push([st.start, d.id.end, 'M1.' + d.id.name]);
          if (!d.init) edits.push([d.id.end, d.id.end, ' = undefined']);
          return;
        }
        if (target === 'core') return;  // core: M1 is created part-way down, so its exports go at the end
        hit.forEach(function (d) {
          if (!d.init) throw new Error('exported var ' + d.id.name + ' has no initialiser');
          edits.push([d.init.start, d.init.start, 'M1.' + d.id.name + ' = ']);
        });
      });
      an.refs.forEach(function (r) {
        if (r.resolved !== top) return;
        if (r.init) return;  // declarator ids handled above
        if (mut[r.name] || inside[r.name]) edits.push([r.start, r.end, 'M1.' + r.name]);
      });
      // check every exported var was found at the top level
      Object.keys(exp).forEach(function (n) {
        var d = top.names[n];
        if (!d) throw new Error(n + ' is not declared in ' + target);
        if (d.kind === 'var' && d.node._parent._parent !== an.ast.body[0].expression.callee.body)
          throw new Error(n + ' is not a top-level var statement');
      });
    }
    if (!edits.length && F.file !== target) return;
    edits.sort(function (a, b) { return b[0] - a[0]; });
    for (var i = 1; i < edits.length; i++) if (edits[i][1] > edits[i - 1][0]) throw new Error('overlapping edits in ' + F.file);
    var code = F.wrapped ? F.src : PRE + F.src + '\n})();';
    edits.forEach(function (e) { code = code.slice(0, e[0]) + e[2] + code.slice(e[1]); });
    var src = F.wrapped ? code : code.slice(PRE.length, code.length - '\n})();'.length);
    if (F.file === target) {
      var fns = spec.exports.filter(function (n) {
        return target === 'core' ? n !== 'M1' : F.top.names[n].kind === 'function'; });
      src = wrapSource(src, target, fns);
    }
    fs.writeFileSync(path.join(DIR, F.file + '.js'), src);
  });
}

// 'use strict'; + header comment lines + body  ->  header + IIFE(body) with the function exports on top.
function wrapSource(src, target, fns) {
  var lines = src.split('\n');
  if (lines[0] !== "'use strict';") throw new Error(target + ': line 1 is not \'use strict\';');
  lines.shift();
  var h = 0;
  while (h < lines.length && /^\/\//.test(lines[h])) h++;
  var head = lines.slice(0, h), body = lines.slice(h);
  while (body.length && body[body.length - 1] === '') body.pop();
  var open = ['(function () {', "  'use strict';"];
  if (target !== 'core') open.push('  var M1 = window.AmbushM1;');
  if (fns.length) {
    var ln = '', block = [];
    fns.forEach(function (n) {
      var piece = 'M1.' + n + ' = ' + n + ';';
      if (ln && (ln + ' ' + piece).length > 110) { block.push(ln); ln = ''; }
      ln = ln ? ln + ' ' + piece : '  ' + piece;
    });
    if (ln) block.push(ln);
    if (target !== 'core') open = open.concat(['  // Exported functions (hoisted, so they are on M1 before any line below runs).'], block);
    else body = body.concat(['', '  // Exports. core.js creates M1 part-way down (after the engine aliases its state needs),',
      '  // so everything it shares goes on M1 here, before any other file loads. None is reassigned.'], block);
  }
  return head.concat(open, body, ['})();', '']).join('\n');
}

var cmd = process.argv[2];
if (cmd === 'scan') process.stdout.write(JSON.stringify(scan()));
else if (cmd === 'wrap') wrap(process.argv[3], JSON.parse(fs.readFileSync(process.argv[4], 'utf8')));
else { console.error('usage: exports_scope.js scan | wrap <file> <spec.json>'); process.exit(2); }
