/**
 * @fileoverview Regex → NFA (Thompson) → DFA (Subset Construction) → Minimized DFA (Hopcroft).
 * Complete pipeline for regular language membership testing.
 * @module compiler
 */

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════

const EPSILON = 'ε';

/** Token types produced by the lexer */
const T = Object.freeze({
  CHAR: 'CHAR',
  STAR: 'STAR',
  PLUS: 'PLUS',
  QUESTION: 'QUESTION',
  PIPE: 'PIPE',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  DOT: 'DOT',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  EOF: 'EOF'
});

/** AST node types */
const N = Object.freeze({
  LITERAL: 'LITERAL',
  DOT: 'DOT',
  CHAR_CLASS: 'CHAR_CLASS',
  CONCAT: 'CONCAT',
  ALT: 'ALT',
  STAR: 'STAR',
  PLUS: 'PLUS',
  QUESTION: 'QUESTION',
  EMPTY: 'EMPTY'
});

// ═══════════════════════════════════════════════
// LEXER
// ═══════════════════════════════════════════════

/**
 * Tokenize a regex string into a token array.
 * @param {string} pattern
 * @returns {{ type: string, value?: string }[]}
 */
function tokenize(pattern) {
  const tokens = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    switch (ch) {
      case '\\':
        i++;
        if (i >= pattern.length) throw new Error('Trailing backslash in regex');
        tokens.push({ type: T.CHAR, value: pattern[i] });
        break;
      case '(':  tokens.push({ type: T.LPAREN }); break;
      case ')':  tokens.push({ type: T.RPAREN }); break;
      case '*':  tokens.push({ type: T.STAR }); break;
      case '+':  tokens.push({ type: T.PLUS }); break;
      case '?':  tokens.push({ type: T.QUESTION }); break;
      case '|':  tokens.push({ type: T.PIPE }); break;
      case '.':  tokens.push({ type: T.DOT }); break;
      case '[': {
        // Character class
        i++;
        let chars = '';
        while (i < pattern.length && pattern[i] !== ']') {
          if (pattern[i] === '\\' && i + 1 < pattern.length) {
            i++;
            chars += pattern[i];
          } else {
            chars += pattern[i];
          }
          i++;
        }
        if (i >= pattern.length) throw new Error('Unterminated character class [');
        tokens.push({ type: T.CHAR, value: chars, isClass: true });
        break;
      }
      default:
        tokens.push({ type: T.CHAR, value: ch });
    }
    i++;
  }
  tokens.push({ type: T.EOF });
  return tokens;
}

// ═══════════════════════════════════════════════
// PARSER (Recursive Descent → AST)
// ═══════════════════════════════════════════════

/**
 * Parse token array into an AST using recursive descent.
 * Grammar:
 *   expr     → concat ('|' concat)*
 *   concat   → repeat+
 *   repeat   → atom ('*' | '+' | '?')?
 *   atom     → CHAR | DOT | CHAR_CLASS | '(' expr ')'
 * @param {{ type: string, value?: string, isClass?: boolean }[]} tokens
 * @returns {Object} AST root node
 */
function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function advance() { return tokens[pos++]; }
  function expect(type) {
    const tok = advance();
    if (tok.type !== type) throw new Error(`Expected ${type} but got ${tok.type}`);
    return tok;
  }

  function parseExpr() {
    let left = parseConcat();
    while (peek().type === T.PIPE) {
      advance(); // consume '|'
      const right = parseConcat();
      left = { type: N.ALT, left, right };
    }
    return left;
  }

  function parseConcat() {
    const parts = [];
    while (
      peek().type !== T.EOF &&
      peek().type !== T.PIPE &&
      peek().type !== T.RPAREN
    ) {
      parts.push(parseRepeat());
    }
    if (parts.length === 0) return { type: N.EMPTY };
    if (parts.length === 1) return parts[0];
    return parts.reduce((a, b) => ({ type: N.CONCAT, left: a, right: b }));
  }

  function parseRepeat() {
    let node = parseAtom();
    while (
      peek().type === T.STAR ||
      peek().type === T.PLUS ||
      peek().type === T.QUESTION
    ) {
      const op = advance();
      if (op.type === T.STAR) node = { type: N.STAR, child: node };
      else if (op.type === T.PLUS) node = { type: N.PLUS, child: node };
      else node = { type: N.QUESTION, child: node };
    }
    return node;
  }

  function parseAtom() {
    const tok = peek();
    if (tok.type === T.CHAR) {
      advance();
      if (tok.isClass) {
        return { type: N.CHAR_CLASS, chars: [...new Set(tok.value.split(''))] };
      }
      return { type: N.LITERAL, value: tok.value };
    }
    if (tok.type === T.DOT) {
      advance();
      return { type: N.DOT };
    }
    if (tok.type === T.LPAREN) {
      advance();
      const inner = parseExpr();
      expect(T.RPAREN);
      return inner;
    }
    throw new Error(`Unexpected token: ${tok.type} at position ${pos}`);
  }

  const ast = parseExpr();
  if (peek().type !== T.EOF) {
    throw new Error(`Unexpected token after end of expression: ${peek().type}`);
  }
  return ast;
}

// ═══════════════════════════════════════════════
// THOMPSON NFA CONSTRUCTION
// ═══════════════════════════════════════════════

/**
 * @typedef {Object} NFA
 * @property {number} numStates - Total number of states.
 * @property {number} start - Start state.
 * @property {number} accept - Single accept state.
 * @property {Map<number, Map<string, Set<number>>>} transitions - δ(state, symbol) → Set<state>.
 * @property {Set<string>} alphabet - Input alphabet (excluding ε).
 */

let stateCounter = 0;
function newState() { return stateCounter++; }

/**
 * Build a Thompson NFA from an AST node.
 * @param {Object} ast - AST node.
 * @param {Set<string>} alphabet - Accumulated alphabet.
 * @returns {{ start: number, accept: number, transitions: Map<number, Map<string, Set<number>>> }}
 */
function buildNFA(ast, alphabet) {
  const transitions = new Map();

  function addTransition(from, symbol, to) {
    if (!transitions.has(from)) transitions.set(from, new Map());
    const fromMap = transitions.get(from);
    if (!fromMap.has(symbol)) fromMap.set(symbol, new Set());
    fromMap.get(symbol).add(to);
  }

  function build(node) {
    switch (node.type) {
      case N.EMPTY: {
        const s = newState();
        const a = newState();
        addTransition(s, EPSILON, a);
        return { start: s, accept: a };
      }
      case N.LITERAL: {
        const s = newState();
        const a = newState();
        alphabet.add(node.value);
        addTransition(s, node.value, a);
        return { start: s, accept: a };
      }
      case N.DOT: {
        // Dot matches any character in the alphabet; we defer this
        const s = newState();
        const a = newState();
        // We'll handle DOT during DFA construction by trying all alphabet symbols
        addTransition(s, '.', a);
        return { start: s, accept: a };
      }
      case N.CHAR_CLASS: {
        const s = newState();
        const a = newState();
        for (const ch of node.chars) {
          alphabet.add(ch);
          addTransition(s, ch, a);
        }
        return { start: s, accept: a };
      }
      case N.CONCAT: {
        const left = build(node.left);
        const right = build(node.right);
        addTransition(left.accept, EPSILON, right.start);
        return { start: left.start, accept: right.accept };
      }
      case N.ALT: {
        const s = newState();
        const a = newState();
        const left = build(node.left);
        const right = build(node.right);
        addTransition(s, EPSILON, left.start);
        addTransition(s, EPSILON, right.start);
        addTransition(left.accept, EPSILON, a);
        addTransition(right.accept, EPSILON, a);
        return { start: s, accept: a };
      }
      case N.STAR: {
        const s = newState();
        const a = newState();
        const inner = build(node.child);
        addTransition(s, EPSILON, inner.start);
        addTransition(s, EPSILON, a);
        addTransition(inner.accept, EPSILON, inner.start);
        addTransition(inner.accept, EPSILON, a);
        return { start: s, accept: a };
      }
      case N.PLUS: {
        // a+ = aa*
        const inner = build(node.child);
        const s = newState();
        const a = newState();
        addTransition(s, EPSILON, inner.start);
        addTransition(inner.accept, EPSILON, a);
        addTransition(inner.accept, EPSILON, inner.start);
        return { start: s, accept: a };
      }
      case N.QUESTION: {
        // a? = (a|ε)
        const s = newState();
        const a = newState();
        const inner = build(node.child);
        addTransition(s, EPSILON, inner.start);
        addTransition(s, EPSILON, a);
        addTransition(inner.accept, EPSILON, a);
        return { start: s, accept: a };
      }
      default:
        throw new Error(`Unknown AST node type: ${node.type}`);
    }
  }

  const result = build(ast);
  return { start: result.start, accept: result.accept, transitions };
}

// ═══════════════════════════════════════════════
// ε-CLOSURE & SUBSET CONSTRUCTION (NFA → DFA)
// ═══════════════════════════════════════════════

/**
 * Compute ε-closure of a set of NFA states using iterative BFS.
 * @param {Set<number>} states
 * @param {Map<number, Map<string, Set<number>>>} transitions
 * @returns {Set<number>}
 */
function epsilonClosure(states, transitions) {
  const closure = new Set(states);
  const stack = [...states];
  while (stack.length > 0) {
    const s = stack.pop();
    const sTransitions = transitions.get(s);
    if (sTransitions && sTransitions.has(EPSILON)) {
      for (const next of sTransitions.get(EPSILON)) {
        if (!closure.has(next)) {
          closure.add(next);
          stack.push(next);
        }
      }
    }
  }
  return closure;
}

/**
 * Compute move(states, symbol) — the set of states reachable from any state in `states` on `symbol`.
 * @param {Set<number>} states
 * @param {string} symbol
 * @param {Map<number, Map<string, Set<number>>>} transitions
 * @returns {Set<number>}
 */
function move(states, symbol, transitions) {
  const result = new Set();
  for (const s of states) {
    const sTransitions = transitions.get(s);
    if (sTransitions && sTransitions.has(symbol)) {
      for (const next of sTransitions.get(symbol)) {
        result.add(next);
      }
    }
  }
  return result;
}

/**
 * Convert a state set to a canonical string key for deduplication.
 * @param {Set<number>} stateSet
 * @returns {string}
 */
function stateSetKey(stateSet) {
  return [...stateSet].sort((a, b) => a - b).join(',');
}

/**
 * Subset construction: NFA → DFA.
 * @param {{ start: number, accept: number, transitions: Map }} nfa
 * @param {Set<string>} alphabet
 * @returns {{ states: number[], alphabet: Set<string>, transitions: Map<number, Map<string, number>>, start: number, accepting: Set<number> }}
 */
function subsetConstruction(nfa, alphabet) {
  const { start, accept, transitions: nfaTrans } = nfa;

  const startClosure = epsilonClosure(new Set([start]), nfaTrans);
  const startKey = stateSetKey(startClosure);

  /** @type {Map<string, number>} - Maps state-set key to DFA state id */
  const dfaStateMap = new Map();
  /** @type {Map<string, Set<number>>} - Maps DFA state key to NFA state set */
  const dfaStateSets = new Map();
  /** @type {Map<number, Map<string, number>>} - DFA transitions */
  const dfaTrans = new Map();
  /** @type {Set<number>} - DFA accepting states */
  const dfaAccepting = new Set();

  let dfaIdCounter = 0;
  const dfaStart = dfaIdCounter++;
  dfaStateMap.set(startKey, dfaStart);
  dfaStateSets.set(startKey, startClosure);

  if (startClosure.has(accept)) {
    dfaAccepting.add(dfaStart);
  }

  const worklist = [startKey];

  while (worklist.length > 0) {
    const currentKey = worklist.pop();
    const currentId = dfaStateMap.get(currentKey);
    const currentSet = dfaStateSets.get(currentKey);

    if (!dfaTrans.has(currentId)) dfaTrans.set(currentId, new Map());

    for (const symbol of alphabet) {
      const moved = move(currentSet, symbol, nfaTrans);
      if (moved.size === 0) continue;

      const closure = epsilonClosure(moved, nfaTrans);
      if (closure.size === 0) continue;

      const key = stateSetKey(closure);

      if (!dfaStateMap.has(key)) {
        const newId = dfaIdCounter++;
        dfaStateMap.set(key, newId);
        dfaStateSets.set(key, closure);
        if (closure.has(accept)) {
          dfaAccepting.add(newId);
        }
        worklist.push(key);
      }

      dfaTrans.get(currentId).set(symbol, dfaStateMap.get(key));
    }
  }

  const allStates = [];
  for (let i = 0; i < dfaIdCounter; i++) allStates.push(i);

  return {
    states: allStates,
    alphabet,
    transitions: dfaTrans,
    start: dfaStart,
    accepting: dfaAccepting
  };
}

// ═══════════════════════════════════════════════
// HOPCROFT MINIMIZATION
// ═══════════════════════════════════════════════

/**
 * Minimize a DFA using Hopcroft's algorithm.
 * @param {{ states: number[], alphabet: Set<string>, transitions: Map<number, Map<string, number>>, start: number, accepting: Set<number> }} dfa
 * @returns {{ states: number[], alphabet: Set<string>, transitions: Map<number, Map<string, number>>, start: number, accepting: Set<number> }}
 */
function hopcroftMinimize(dfa) {
  const { states, alphabet, transitions, start, accepting } = dfa;

  if (states.length === 0) {
    return dfa;
  }

  // Initial partition: accepting vs non-accepting
  const nonAccepting = new Set(states.filter(s => !accepting.has(s)));

  /** @type {Set<number>[]} */
  let P = [];
  if (accepting.size > 0) P.push(new Set(accepting));
  if (nonAccepting.size > 0) P.push(new Set(nonAccepting));

  if (P.length <= 1) return dfa;

  /** @type {Set<number>[]} */
  let W = [...P.map(s => new Set(s))];

  while (W.length > 0) {
    const A = W.pop();

    for (const c of alphabet) {
      // X = set of states that transition to A on symbol c
      const X = new Set();
      for (const s of states) {
        const sTrans = transitions.get(s);
        if (sTrans && sTrans.has(c) && A.has(sTrans.get(c))) {
          X.add(s);
        }
      }

      if (X.size === 0) continue;

      const newP = [];
      for (const Y of P) {
        const intersection = new Set([...Y].filter(s => X.has(s)));
        const difference = new Set([...Y].filter(s => !X.has(s)));

        if (intersection.size > 0 && difference.size > 0) {
          newP.push(intersection);
          newP.push(difference);

          // Update worklist
          const wIndex = W.findIndex(w => setsEqual(w, Y));
          if (wIndex !== -1) {
            W.splice(wIndex, 1);
            W.push(intersection);
            W.push(difference);
          } else {
            if (intersection.size <= difference.size) {
              W.push(intersection);
            } else {
              W.push(difference);
            }
          }
        } else {
          newP.push(Y);
        }
      }
      P = newP;
    }
  }

  // Build minimized DFA from partition
  const stateToPartition = new Map();
  const partitionIds = new Map();
  let partId = 0;

  for (const group of P) {
    const id = partId++;
    partitionIds.set(group, id);
    for (const s of group) {
      stateToPartition.set(s, group);
    }
  }

  const minStart = partitionIds.get(stateToPartition.get(start));
  const minAccepting = new Set();
  const minTrans = new Map();
  const minStates = [];

  for (const [group, id] of partitionIds) {
    minStates.push(id);
    const representative = [...group][0];

    if (accepting.has(representative)) {
      minAccepting.add(id);
    }

    const repTrans = transitions.get(representative);
    if (repTrans) {
      if (!minTrans.has(id)) minTrans.set(id, new Map());
      for (const [symbol, target] of repTrans) {
        const targetPartition = stateToPartition.get(target);
        if (targetPartition) {
          minTrans.get(id).set(symbol, partitionIds.get(targetPartition));
        }
      }
    }
  }

  return {
    states: minStates,
    alphabet,
    transitions: minTrans,
    start: minStart,
    accepting: minAccepting
  };
}

/**
 * Check if two sets are equal.
 * @param {Set} a
 * @param {Set} b
 * @returns {boolean}
 */
function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════

/**
 * Compile a regex pattern to a minimized DFA.
 * Returns an object with an `accepts` function for membership testing.
 *
 * @param {string} pattern - Regular expression pattern.
 * @returns {{ states: number[], alphabet: Set<string>, transitions: Map, start: number, accepting: Set<number>, accepts: (s: string) => boolean, meta: { nfaStates: number, dfaStates: number, minDfaStates: number } }}
 * @throws {Error} If the pattern is invalid.
 */
export function compileRegex(pattern) {
  if (!pattern || pattern.trim() === '') {
    // Empty pattern: accepts only the empty string
    return {
      states: [0, 1],
      alphabet: new Set(),
      transitions: new Map(),
      start: 0,
      accepting: new Set([0]),
      accepts: (s) => s === '',
      meta: { nfaStates: 2, dfaStates: 1, minDfaStates: 1 }
    };
  }

  // Reset state counter
  stateCounter = 0;

  // Phase 1: Lex
  const tokens = tokenize(pattern);

  // Phase 2: Parse
  const ast = parse(tokens);

  // Phase 3: Thompson NFA
  const alphabet = new Set();
  const nfa = buildNFA(ast, alphabet);
  const nfaStates = stateCounter;

  // Phase 4: Subset construction (NFA → DFA)
  const dfa = subsetConstruction(nfa, alphabet);

  // Phase 5: Hopcroft minimization
  const minDfa = hopcroftMinimize(dfa);

  // Build accepts function
  /**
   * Test if a string is accepted by this DFA.
   * @param {string} s
   * @returns {boolean}
   */
  function accepts(s) {
    let current = minDfa.start;
    for (const ch of s) {
      const trans = minDfa.transitions.get(current);
      if (!trans || !trans.has(ch)) return false;
      current = trans.get(ch);
    }
    return minDfa.accepting.has(current);
  }

  return {
    ...minDfa,
    accepts,
    meta: {
      nfaStates,
      dfaStates: dfa.states.length,
      minDfaStates: minDfa.states.length
    }
  };
}

/**
 * Extract the alphabet from a regex pattern string.
 * @param {string} pattern
 * @returns {string[]}
 */
export function extractAlphabet(pattern) {
  const chars = new Set();
  for (const ch of pattern) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      chars.add(ch);
    }
  }
  return [...chars].sort();
}
