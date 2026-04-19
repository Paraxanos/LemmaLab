/**
 * @fileoverview Web Worker for bounded counterexample search (Auto-Refuter).
 * Runs in a separate thread to avoid blocking the UI.
 * @module worker
 */

// We inline the necessary logic since module workers may have import limitations
// in some environments. The worker contains self-contained compilation and validation logic.

/** @type {boolean} */
let cancelled = false;

/**
 * Compile a regex pattern to a DFA accepts function (simplified inline version).
 * Mirrors the logic from compiler.js for worker isolation.
 */
function compileRegexWorker(pattern) {
  // EPSILON constant
  const EPS = 'ε';
  let stateCounter = 0;
  const newState = () => stateCounter++;

  // Tokenize
  const tokens = [];
  let idx = 0;
  while (idx < pattern.length) {
    const ch = pattern[idx];
    switch (ch) {
      case '\\': idx++; if (idx < pattern.length) tokens.push({ type: 'CHAR', value: pattern[idx] }); break;
      case '(': tokens.push({ type: 'LPAREN' }); break;
      case ')': tokens.push({ type: 'RPAREN' }); break;
      case '*': tokens.push({ type: 'STAR' }); break;
      case '+': tokens.push({ type: 'PLUS' }); break;
      case '?': tokens.push({ type: 'QUESTION' }); break;
      case '|': tokens.push({ type: 'PIPE' }); break;
      case '.': tokens.push({ type: 'DOT' }); break;
      default: tokens.push({ type: 'CHAR', value: ch });
    }
    idx++;
  }
  tokens.push({ type: 'EOF' });

  // Parse
  let pos = 0;
  function peek() { return tokens[pos]; }
  function advance() { return tokens[pos++]; }

  function parseExpr() {
    let left = parseConcat();
    while (peek().type === 'PIPE') { advance(); left = { type: 'ALT', left, right: parseConcat() }; }
    return left;
  }
  function parseConcat() {
    const parts = [];
    while (peek().type !== 'EOF' && peek().type !== 'PIPE' && peek().type !== 'RPAREN') parts.push(parseRepeat());
    if (parts.length === 0) return { type: 'EMPTY' };
    return parts.reduce((a, b) => ({ type: 'CONCAT', left: a, right: b }));
  }
  function parseRepeat() {
    let node = parseAtom();
    while (peek().type === 'STAR' || peek().type === 'PLUS' || peek().type === 'QUESTION') {
      const op = advance();
      if (op.type === 'STAR') node = { type: 'STAR', child: node };
      else if (op.type === 'PLUS') node = { type: 'PLUS', child: node };
      else node = { type: 'QUESTION', child: node };
    }
    return node;
  }
  function parseAtom() {
    const tok = peek();
    if (tok.type === 'CHAR') { advance(); return { type: 'LITERAL', value: tok.value }; }
    if (tok.type === 'DOT') { advance(); return { type: 'DOT' }; }
    if (tok.type === 'LPAREN') { advance(); const inner = parseExpr(); advance(); return inner; }
    throw new Error(`Unexpected token: ${tok.type}`);
  }

  const ast = parseExpr();
  const alphabet = new Set();
  const transitions = new Map();

  function addTrans(from, symbol, to) {
    if (!transitions.has(from)) transitions.set(from, new Map());
    const m = transitions.get(from);
    if (!m.has(symbol)) m.set(symbol, new Set());
    m.get(symbol).add(to);
  }

  function buildNFA(node) {
    switch (node.type) {
      case 'EMPTY': { const s = newState(), a = newState(); addTrans(s, EPS, a); return { start: s, accept: a }; }
      case 'LITERAL': { const s = newState(), a = newState(); alphabet.add(node.value); addTrans(s, node.value, a); return { start: s, accept: a }; }
      case 'CONCAT': { const l = buildNFA(node.left), r = buildNFA(node.right); addTrans(l.accept, EPS, r.start); return { start: l.start, accept: r.accept }; }
      case 'ALT': { const s = newState(), a = newState(), l = buildNFA(node.left), r = buildNFA(node.right); addTrans(s, EPS, l.start); addTrans(s, EPS, r.start); addTrans(l.accept, EPS, a); addTrans(r.accept, EPS, a); return { start: s, accept: a }; }
      case 'STAR': { const s = newState(), a = newState(), inner = buildNFA(node.child); addTrans(s, EPS, inner.start); addTrans(s, EPS, a); addTrans(inner.accept, EPS, inner.start); addTrans(inner.accept, EPS, a); return { start: s, accept: a }; }
      case 'PLUS': { const inner = buildNFA(node.child); const s = newState(), a = newState(); addTrans(s, EPS, inner.start); addTrans(inner.accept, EPS, a); addTrans(inner.accept, EPS, inner.start); return { start: s, accept: a }; }
      case 'QUESTION': { const s = newState(), a = newState(), inner = buildNFA(node.child); addTrans(s, EPS, inner.start); addTrans(s, EPS, a); addTrans(inner.accept, EPS, a); return { start: s, accept: a }; }
      default: throw new Error('Unknown node type');
    }
  }

  const nfa = buildNFA(ast);

  // Epsilon closure
  function epsClosure(states) {
    const closure = new Set(states);
    const stack = [...states];
    while (stack.length > 0) {
      const s = stack.pop();
      const t = transitions.get(s);
      if (t && t.has(EPS)) for (const n of t.get(EPS)) if (!closure.has(n)) { closure.add(n); stack.push(n); }
    }
    return closure;
  }

  // Subset construction
  const startClosure = epsClosure(new Set([nfa.start]));
  const stateKey = (ss) => [...ss].sort((a, b) => a - b).join(',');
  const dfaMap = new Map();
  const dfaSets = new Map();
  const dfaTrans = new Map();
  const dfaAccepting = new Set();
  let dfaId = 0;

  const sk = stateKey(startClosure);
  dfaMap.set(sk, dfaId);
  dfaSets.set(sk, startClosure);
  if (startClosure.has(nfa.accept)) dfaAccepting.add(dfaId);
  dfaId++;
  const worklist = [sk];

  while (worklist.length > 0) {
    const ck = worklist.pop();
    const cid = dfaMap.get(ck);
    const cset = dfaSets.get(ck);
    if (!dfaTrans.has(cid)) dfaTrans.set(cid, new Map());

    for (const sym of alphabet) {
      const moved = new Set();
      for (const s of cset) {
        const t = transitions.get(s);
        if (t && t.has(sym)) for (const n of t.get(sym)) moved.add(n);
      }
      if (moved.size === 0) continue;
      const cl = epsClosure(moved);
      if (cl.size === 0) continue;
      const key = stateKey(cl);
      if (!dfaMap.has(key)) {
        dfaMap.set(key, dfaId);
        dfaSets.set(key, cl);
        if (cl.has(nfa.accept)) dfaAccepting.add(dfaId);
        dfaId++;
        worklist.push(key);
      }
      dfaTrans.get(cid).set(sym, dfaMap.get(key));
    }
  }

  return {
    accepts: (s) => {
      let cur = 0; // DFA start is always 0
      for (const ch of s) {
        const t = dfaTrans.get(cur);
        if (!t || !t.has(ch)) return false;
        cur = t.get(ch);
      }
      return dfaAccepting.has(cur);
    }
  };
}

/**
 * Compile a CFG to a CYK oracle (simplified inline version).
 */
function compileCFGWorker(specText) {
  // Parse CFG
  const lines = specText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const rules = {};
  const nonterminals = new Set();
  let start = null;

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_']*)\s*(?:→|->)\s*(.+)$/);
    if (!match) continue;
    const lhs = match[1];
    const rhsText = match[2];
    if (!start) start = lhs;
    nonterminals.add(lhs);
    if (!rules[lhs]) rules[lhs] = [];

    const alts = rhsText.split('|');
    for (const alt of alts) {
      const trimmed = alt.trim();
      if (trimmed === 'ε' || trimmed === '') { rules[lhs].push(['']); continue; }
      const syms = [];
      let i = 0;
      while (i < trimmed.length) {
        if (trimmed[i] === ' ') { i++; continue; }
        if (trimmed[i] === 'ε') { syms.push(''); i++; continue; }
        if (/[A-Z]/.test(trimmed[i])) {
          let sym = trimmed[i]; i++;
          while (i < trimmed.length && /[A-Z0-9_']/.test(trimmed[i])) { sym += trimmed[i]; i++; }
          syms.push(sym);
        } else {
          syms.push(trimmed[i]); i++;
        }
      }
      rules[lhs].push(syms);
    }
  }

  // Convert to CNF (simplified)
  const newStart = 'S0';
  rules[newStart] = [[start]];
  nonterminals.add(newStart);
  start = newStart;

  // Find nullable
  const nullable = new Set();
  for (const [lhs, prods] of Object.entries(rules)) {
    for (const prod of prods) {
      if (prod.length === 0 || (prod.length === 1 && prod[0] === '')) nullable.add(lhs);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, prods] of Object.entries(rules)) {
      if (nullable.has(lhs)) continue;
      for (const prod of prods) {
        if (prod.every(s => s === '' || nullable.has(s))) { nullable.add(lhs); changed = true; break; }
      }
    }
  }

  // Eliminate epsilon
  const newRules = {};
  for (const [lhs, prods] of Object.entries(rules)) {
    newRules[lhs] = [];
    for (const prod of prods) {
      if (prod.length === 1 && prod[0] === '') continue;
      const nullablePos = [];
      for (let i = 0; i < prod.length; i++) if (nullable.has(prod[i])) nullablePos.push(i);
      for (let mask = 0; mask < (1 << nullablePos.length); mask++) {
        const removed = new Set();
        for (let bit = 0; bit < nullablePos.length; bit++) if (mask & (1 << bit)) removed.add(nullablePos[bit]);
        const np = prod.filter((_, idx) => !removed.has(idx));
        if (np.length === 0) { if (lhs === start) newRules[lhs].push(['']); continue; }
        const key = np.join('\x00');
        if (!newRules[lhs].some(p => p.join('\x00') === key)) newRules[lhs].push(np);
      }
    }
  }
  if (nullable.has(start)) {
    if (!newRules[start]?.some(p => p.length === 1 && p[0] === '')) {
      if (!newRules[start]) newRules[start] = [];
      newRules[start].push(['']);
    }
  }

  // Eliminate unit productions
  for (const A of Object.keys(newRules)) {
    const unitClosure = new Set([A]);
    let ch2 = true;
    while (ch2) {
      ch2 = false;
      for (const B of unitClosure) {
        if (!newRules[B]) continue;
        for (const prod of newRules[B]) {
          if (prod.length === 1 && nonterminals.has(prod[0]) && !unitClosure.has(prod[0])) {
            unitClosure.add(prod[0]); ch2 = true;
          }
        }
      }
    }
    const expanded = [];
    for (const B of unitClosure) {
      if (!newRules[B]) continue;
      for (const prod of newRules[B]) {
        if (prod.length === 1 && nonterminals.has(prod[0])) continue;
        const key = prod.join('\x00');
        if (!expanded.some(p => p.join('\x00') === key)) expanded.push([...prod]);
      }
    }
    newRules[A] = expanded;
  }

  // Binarize
  let freshIdx = 0;
  const bnRules = {};
  for (const [lhs, prods] of Object.entries(newRules)) {
    bnRules[lhs] = [];
    for (const prod of prods) {
      if (prod.length <= 2) { bnRules[lhs].push([...prod]); }
      else {
        let cur = lhs;
        for (let i = 0; i < prod.length - 2; i++) {
          const fresh = `BN${freshIdx++}`;
          nonterminals.add(fresh);
          if (cur === lhs) bnRules[lhs].push([prod[i], fresh]);
          else bnRules[cur] = [[prod[i], fresh]];
          cur = fresh;
        }
        bnRules[cur] = [[prod[prod.length - 2], prod[prod.length - 1]]];
      }
    }
  }

  // Separate terminals in binary rules
  let termIdx = 0;
  const termVars = new Map();
  const finalRules = {};
  for (const [lhs, prods] of Object.entries(bnRules)) {
    finalRules[lhs] = [];
    for (const prod of prods) {
      if (prod.length === 2) {
        const np = prod.map(s => {
          if (!nonterminals.has(s) && s !== '') {
            if (!termVars.has(s)) { const tv = `TV${termIdx++}`; termVars.set(s, tv); nonterminals.add(tv); }
            return termVars.get(s);
          }
          return s;
        });
        finalRules[lhs].push(np);
      } else {
        finalRules[lhs].push([...prod]);
      }
    }
  }
  for (const [t, v] of termVars) finalRules[v] = [[t]];

  // CYK
  function accepts(w) {
    if (w.length === 0) return finalRules[start]?.some(p => p.length === 1 && p[0] === '') || false;
    const n = w.length;
    const table = Array.from({ length: n }, () => Array.from({ length: n }, () => new Set()));
    for (let i = 0; i < n; i++) {
      for (const [lhs, prods] of Object.entries(finalRules)) {
        for (const prod of prods) {
          if (prod.length === 1 && prod[0] === w[i]) table[i][i].add(lhs);
        }
      }
    }
    for (let span = 2; span <= n; span++) {
      for (let i = 0; i <= n - span; i++) {
        const j = i + span - 1;
        for (let k = i; k < j; k++) {
          for (const B of table[i][k]) {
            for (const C of table[k + 1][j]) {
              for (const [A, prods] of Object.entries(finalRules)) {
                for (const prod of prods) {
                  if (prod.length === 2 && prod[0] === B && prod[1] === C) table[i][j].add(A);
                }
              }
            }
          }
        }
      }
    }
    return table[0][n - 1].has(start);
  }

  return { accepts };
}

/**
 * Generate strings over an alphabet in lexicographic order of increasing length.
 * @param {string[]} alpha - Alphabet characters.
 * @param {number} maxLen - Maximum string length.
 * @yields {string}
 */
function* generateStrings(alpha, maxLen) {
  yield '';
  for (let len = 1; len <= maxLen; len++) {
    const indices = new Array(len).fill(0);
    while (true) {
      yield indices.map(i => alpha[i]).join('');
      let carry = len - 1;
      while (carry >= 0) {
        indices[carry]++;
        if (indices[carry] < alpha.length) break;
        indices[carry] = 0;
        carry--;
      }
      if (carry < 0) break;
    }
  }
}

/**
 * Enumerate valid decompositions.
 */
function enumerateDecomps(w, p, mode) {
  const n = w.length;
  const results = [];
  if (mode === 'REGULAR') {
    for (let c1 = 0; c1 <= Math.min(p - 1, n); c1++) {
      for (let c2 = c1 + 1; c2 <= Math.min(p, n); c2++) {
        results.push([c1, c2]);
      }
    }
  } else {
    for (let c1 = 0; c1 <= n; c1++) {
      const maxC4 = Math.min(c1 + p, n);
      for (let c4 = c1; c4 <= maxC4; c4++) {
        for (let c2 = c1; c2 <= c4; c2++) {
          for (let c3 = c2; c3 <= c4; c3++) {
            if ((c2 - c1) + (c4 - c3) >= 1) results.push([c1, c2, c3, c4]);
          }
        }
      }
    }
  }
  return results;
}

/**
 * Pump a string given decomposition.
 */
function pumpStr(w, cuts, i, mode) {
  if (mode === 'REGULAR') {
    return w.substring(0, cuts[0]) + w.substring(cuts[0], cuts[1]).repeat(i) + w.substring(cuts[1]);
  } else {
    const [c1, c2, c3, c4] = cuts;
    return w.substring(0, c1) + w.substring(c1, c2).repeat(i) + w.substring(c2, c3) + w.substring(c3, c4).repeat(i) + w.substring(c4);
  }
}

// ═══════════════════════════════════════════════
// MESSAGE HANDLER
// ═══════════════════════════════════════════════

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'CANCEL') {
    cancelled = true;
    return;
  }

  if (msg.type === 'START') {
    cancelled = false;
    const { spec, p, alphabet, maxLen, maxResults, mode } = msg;
    const startTime = performance.now();
    let oracle;

    try {
      if (spec.type === 'REGEX') {
        oracle = compileRegexWorker(spec.source);
      } else if (spec.type === 'CFG') {
        oracle = compileCFGWorker(spec.source);
      } else if (spec.type === 'MEMBERSHIP') {
        // For irregular languages with custom membership
        // The membership function is serialized as a string
        // eslint-disable-next-line no-eval
        oracle = { accepts: new Function('s', spec.membershipBody) };
      } else {
        self.postMessage({ type: 'ERROR', message: `Unknown spec type: ${spec.type}` });
        return;
      }
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: `Compilation error: ${err.message}` });
      return;
    }

    const alpha = alphabet || ['a', 'b'];
    const mLen = maxLen || 15;
    const mResults = maxResults || 3;
    const modeVal = mode || 'REGULAR';
    const results = [];
    let lastProgressTime = 0;
    let stringsChecked = 0;
    const totalEstimate = Math.pow(alpha.length, mLen); // rough

    for (const w of generateStrings(alpha, mLen)) {
      if (cancelled) {
        self.postMessage({ type: 'DONE', total: results.length, elapsed: performance.now() - startTime, cancelled: true });
        return;
      }

      stringsChecked++;

      // Progress update every 50ms
      const now = performance.now();
      if (now - lastProgressTime > 50) {
        lastProgressTime = now;
        self.postMessage({
          type: 'PROGRESS',
          pct: Math.min(99, (stringsChecked / totalEstimate) * 100),
          currentLen: w.length,
          stringsChecked
        });
      }

      if (w.length < p) continue;
      if (!oracle.accepts(w)) continue;

      // Check if this w is a counterexample
      const decomps = enumerateDecomps(w, p, modeVal);
      let allFail = true;
      const failures = [];

      for (const cuts of decomps) {
        let thisDecompFails = false;
        for (let i = 0; i <= 8; i++) {
          if (i === 1) continue;
          const wi = pumpStr(w, cuts, i, modeVal);
          if (!oracle.accepts(wi)) {
            failures.push({ cuts, i, wiString: wi });
            thisDecompFails = true;
            break;
          }
        }
        if (!thisDecompFails) {
          allFail = false;
          break;
        }
      }

      if (allFail && decomps.length > 0) {
        const result = {
          w,
          failingDecompositions: failures,
          explanation: `Every valid decomposition of "${w}" (|w|=${w.length}) can be pumped to produce a string not in L.`
        };
        results.push(result);
        self.postMessage({ type: 'RESULT', counterexample: result });

        if (results.length >= mResults) break;
      }
    }

    self.postMessage({
      type: 'DONE',
      total: results.length,
      elapsed: performance.now() - startTime,
      cancelled: false
    });
  }
};
