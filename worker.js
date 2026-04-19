/**
 * @fileoverview Web Worker for bounded counterexample search (Auto-Refuter).
 * Runs in a separate thread to avoid blocking the UI.
 * Consumes pre-compiled models (DFA/CNF) from the main thread for
 * perfect consistency and performance.
 * @module worker
 */

/** @type {boolean} */
let cancelled = false;

/**
 * DFA membership test runner.
 * @param {Object} model - Serialized DFA transitions and start/accept data.
 * @param {string} s - String to test.
 * @returns {boolean}
 */
function runDFA(model, s) {
  let current = model.start;
  for (const ch of s) {
    const trans = model.transitions[current];
    if (!trans || trans[ch] === undefined) return false;
    current = trans[ch];
  }
  return model.accepting.includes(current);
}

/**
 * CYK membership test runner using CNF rules.
 * @param {Object} model - Serialized CNF rules and start symbol.
 * @param {string} s - String to test.
 * @returns {boolean}
 */
function runCYK(model, s) {
  const { start, rules } = model;
  const n = s.length;

  if (n === 0) {
    // Check if start symbol can derive epsilon
    const startRules = rules[start];
    return startRules ? startRules.some(p => p.length === 1 && p[0] === '') : false;
  }

  // CYK table initialized as bitsets or sets
  // For simplicity inside worker, we use Arrays of Strings (nonterminals)
  const table = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => new Set())
  );

  // Terminals (Diagonal)
  for (let i = 0; i < n; i++) {
    const ch = s[i];
    for (const [lhs, prods] of Object.entries(rules)) {
      for (const prod of prods) {
        if (prod.length === 1 && prod[0] === ch) {
          table[i][i].add(lhs);
        }
      }
    }
  }

  // Nonterminals (Upper Triangle)
  for (let span = 2; span <= n; span++) {
    for (let i = 0; i <= n - span; i++) {
      const j = i + span - 1;
      for (let k = i; k < j; k++) {
        const setB = table[i][k];
        const setC = table[k + 1][j];
        if (setB.size === 0 || setC.size === 0) continue;

        for (const [lhs, prods] of Object.entries(rules)) {
          for (const prod of prods) {
            if (prod.length === 2 && setB.has(prod[0]) && setC.has(prod[1])) {
              table[i][j].add(lhs);
            }
          }
        }
      }
    }
  }

  return table[0][n - 1].has(start);
}

/**
 * Generate strings over an alphabet in lexicographic order.
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
 * Enumerate valid decompositions according to the pumping lemma mode.
 * @param {string} w
 * @param {number} p
 * @param {'REGULAR'|'CFL'} mode
 * @returns {number[][]}
 */
function enumerateDecomps(w, p, mode) {
  const n = w.length;
  const results = [];
  if (mode === 'REGULAR') {
    // xyz: |xy| <= p, |y| >= 1
    for (let c1 = 0; c1 <= Math.min(p - 1, n - 1); c1++) {
      for (let c2 = c1 + 1; c2 <= Math.min(p, n); c2++) {
        results.push([c1, c2]);
      }
    }
  } else {
    // uvxyz: |vxy| <= p, |vy| >= 1
    for (let c1 = 0; c1 <= n; c1++) {
      const maxC4 = Math.min(c1 + p, n);
      for (let c4 = c1 + 1; c4 <= maxC4; c4++) {
        for (let c2 = c1; c2 <= c4; c2++) {
          for (let c3 = c2; c3 <= c4; c3++) {
            // Check |vy| >= 1
            if ((c2 - c1) + (c4 - c3) >= 1) {
              results.push([c1, c2, c3, c4]);
            }
          }
        }
      }
    }
  }
  return results;
}

/**
 * Pump a string given decomposition.
 * @param {string} w
 * @param {number[]} cuts
 * @param {number} i
 * @param {'REGULAR'|'CFL'} mode
 * @returns {string}
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
    let oracleFunc;

    try {
      if (spec.type === 'REGEX') {
        oracleFunc = (s) => runDFA(spec.model, s);
      } else if (spec.type === 'CFG') {
        oracleFunc = (s) => runCYK(spec.model, s);
      } else if (spec.type === 'MEMBERSHIP') {
        oracleFunc = new Function('s', spec.membershipBody);
      } else {
        self.postMessage({ type: 'ERROR', message: `Unknown spec type: ${spec.type}` });
        return;
      }
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: `Oracle initialization error: ${err.message}` });
      return;
    }

    const alpha = alphabet || ['a', 'b'];
    const mLen = maxLen || 15;
    const mResults = maxResults || 3;
    const modeVal = mode || 'REGULAR';
    const results = [];
    let lastProgressTime = 0;
    let stringsChecked = 0;

    // Search loop
    for (const w of generateStrings(alpha, mLen)) {
      if (cancelled) {
        self.postMessage({ type: 'DONE', total: results.length, elapsed: performance.now() - startTime, cancelled: true });
        return;
      }

      stringsChecked++;

      // Progress update
      const now = performance.now();
      if (now - lastProgressTime > 100) {
        lastProgressTime = now;
        self.postMessage({
          type: 'PROGRESS',
          pct: Math.min(99, (w.length / mLen) * 100), // Pct based on length for visibility
          currentLen: w.length,
          stringsChecked
        });
      }

      // 1. String must be at least length p
      if (w.length < p) continue;

      // 2. String must be in the language
      if (!oracleFunc(w)) continue;

      // 3. Find if EVERY decomposition fails (counterexample to pumping lemma)
      const decomps = enumerateDecomps(w, p, modeVal);
      if (decomps.length === 0) continue;

      let allFail = true;
      const failures = [];

      for (const cuts of decomps) {
        let thisDecompFails = false;
        // Check small i values (usually enough for common counterexamples)
        for (let i = 0; i <= 6; i++) {
          if (i === 1) continue;
          const wi = pumpStr(w, cuts, i, modeVal);
          if (!oracleFunc(wi)) {
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

      if (allFail) {
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
