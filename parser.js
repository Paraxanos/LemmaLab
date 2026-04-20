/**
 * @fileoverview CFG Parser → Chomsky Normal Form → CYK Membership Algorithm.
 * Complete pipeline for context-free language membership testing.
 * @module parser
 */

// ═══════════════════════════════════════════════
// CFG PARSER
// ═══════════════════════════════════════════════

/**
 * @typedef {Object} CFG
 * @property {string} start - Start symbol.
 * @property {Object<string, string[][]>} rules - Map from nonterminal to array of production right-hand sides.
 * @property {Set<string>} terminals - Terminal symbols.
 * @property {Set<string>} nonterminals - Nonterminal symbols.
 */

/**
 * Parse a BNF-style CFG text into a structured grammar object.
 * Supports formats:
 *   S -> aSb | ε
 *   S → AB
 *   A → a
 *
 * @param {string} text - The CFG specification text.
 * @returns {CFG}
 * @throws {Error} If the grammar is malformed.
 */
export function parseCFG(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
  const rules = {};
  const nonterminals = new Set();
  let start = null;

  // Pass 1: Identify all nonterminals from LHS
  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_']*)\s*(?:→|->)\s*(.+)$/);
    if (match) {
      const lhs = match[1].trim();
      if (start === null) start = lhs;
      nonterminals.add(lhs);
      if (!rules[lhs]) rules[lhs] = [];
    }
  }

  if (!start) {
    throw new Error("No production rules found. CFG must have at least one rule like 'S -> alpha'.");
  }

  // Pass 2: Tokenize using the full nonterminal set
  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z0-9_']*)\s*(?:→|->)\s*(.+)$/);
    if (!match) {
      throw new Error(`Malformed production rule: "${line}". Expected format: A -> α | β`);
    }
    const lhs = match[1].trim();
    const rhsText = match[2].trim();

    const alternatives = splitAlternatives(rhsText);

    for (const alt of alternatives) {
      const symbols = tokenizeProduction(alt.trim(), nonterminals);
      rules[lhs].push(symbols);
    }
  }

  // Second pass: identify all nonterminals from LHS, then re-tokenize
  // to properly categorize symbols
  const terminals = new Set();
  for (const lhs of Object.keys(rules)) {
    nonterminals.add(lhs);
  }

  for (const prods of Object.values(rules)) {
    for (const prod of prods) {
      for (const sym of prod) {
        if (sym !== '' && !nonterminals.has(sym)) {
          terminals.add(sym);
        }
      }
    }
  }

  return { start, rules, terminals, nonterminals };
}

/**
 * Split RHS alternatives by '|' respecting potential grouping.
 * @param {string} rhs
 * @returns {string[]}
 */
function splitAlternatives(rhs) {
  const alts = [];
  let current = '';
  let depth = 0;
  for (const ch of rhs) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === '|' && depth === 0) {
      alts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  alts.push(current);
  return alts;
}

/**
 * Tokenize a production RHS into individual symbols.
 * Uppercase letter sequences are nonterminals; lowercase/special chars are terminals.
 * 'ε' or 'epsilon' or empty string represents epsilon.
 * @param {string} rhs
 * @param {Set<string>} knownNonterminals
 * @returns {string[]}
 */
function tokenizeProduction(rhs, knownNonterminals) {
  if (rhs === 'ε' || rhs === 'epsilon' || rhs === 'ε' || rhs === '') return [''];

  const symbols = [];
  let i = 0;
  while (i < rhs.length) {
    // Skip whitespace
    if (rhs[i] === ' ') { i++; continue; }

    // Check for ε
    if (rhs[i] === 'ε') {
      symbols.push('');
      i++;
      continue;
    }

    // Try maximal munch for known nonterminals
    let longestMatch = '';
    for (const nt of knownNonterminals) {
      if (rhs.startsWith(nt, i) && nt.length > longestMatch.length) {
        longestMatch = nt;
      }
    }

    if (longestMatch) {
      symbols.push(longestMatch);
      i += longestMatch.length;
      continue;
    }

    // Fallback: Check for potential multi-char nonterminal (uppercase start)
    if (/[A-Z]/.test(rhs[i])) {
      let sym = rhs[i];
      i++;
      while (i < rhs.length && /[A-Z0-9_']/.test(rhs[i])) {
        sym += rhs[i];
        i++;
      }
      symbols.push(sym);
      continue;
    }

    // Terminal symbol (lowercase, digits, special chars)
    symbols.push(rhs[i]);
    i++;
  }
  return symbols;
}

// ═══════════════════════════════════════════════
// CHOMSKY NORMAL FORM CONVERSION
// ═══════════════════════════════════════════════

/**
 * Convert a CFG to Chomsky Normal Form.
 * Steps:
 *   1. Add new start symbol S₀ → S
 *   2. Eliminate ε-productions
 *   3. Eliminate unit productions (A → B)
 *   4. Convert long rules to binary form
 *   5. Separate terminals in mixed rules
 *
 * @param {CFG} cfg - The parsed CFG.
 * @returns {CFG} Grammar in CNF.
 */
export function toCNF(cfg) {
  let { start, rules, terminals, nonterminals } = cloneCFG(cfg);

  // Step 1: New start symbol
  const newStart = 'S0';
  rules[newStart] = [[start]];
  nonterminals.add(newStart);
  start = newStart;

  // Step 2: Eliminate ε-productions
  const nullable = findNullable(rules, nonterminals);
  rules = eliminateEpsilon(rules, nonterminals, nullable, start);

  // Step 3: Eliminate unit productions
  rules = eliminateUnitProductions(rules, nonterminals);

  // Step 4: Convert long rules to binary
  ({ rules, nonterminals } = binarizeRules(rules, nonterminals));

  // Step 5: Separate terminals in mixed rules
  ({ rules, nonterminals, terminals } = separateTerminals(rules, nonterminals, terminals));

  // Clean up: remove unreachable symbols
  ({ rules, nonterminals, terminals } = removeUnreachable(start, rules, nonterminals, terminals));

  return { start, rules, terminals, nonterminals };
}

/**
 * Deep clone a CFG.
 * @param {CFG} cfg
 * @returns {CFG}
 */
function cloneCFG(cfg) {
  const rules = {};
  for (const [lhs, prods] of Object.entries(cfg.rules)) {
    rules[lhs] = prods.map(p => [...p]);
  }
  return {
    start: cfg.start,
    rules,
    terminals: new Set(cfg.terminals),
    nonterminals: new Set(cfg.nonterminals)
  };
}

/**
 * Find all nullable nonterminals (those that can derive ε).
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @returns {Set<string>}
 */
function findNullable(rules, nonterminals) {
  const nullable = new Set();

  // Base case: A → ε
  for (const [lhs, prods] of Object.entries(rules)) {
    for (const prod of prods) {
      if (prod.length === 0 || (prod.length === 1 && prod[0] === '')) {
        nullable.add(lhs);
      }
    }
  }

  // Fixed-point iteration
  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, prods] of Object.entries(rules)) {
      if (nullable.has(lhs)) continue;
      for (const prod of prods) {
        if (prod.every(sym => sym === '' || nullable.has(sym))) {
          nullable.add(lhs);
          changed = true;
          break;
        }
      }
    }
  }

  return nullable;
}

/**
 * Eliminate ε-productions by generating all combinations.
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @param {Set<string>} nullable
 * @param {string} start
 * @returns {Object}
 */
function eliminateEpsilon(rules, nonterminals, nullable, start) {
  const newRules = {};

  for (const [lhs, prods] of Object.entries(rules)) {
    newRules[lhs] = [];

    for (const prod of prods) {
      // Skip pure epsilon production
      if (prod.length === 0 || (prod.length === 1 && prod[0] === '')) {
        continue;
      }

      // Generate all combinations of nullable symbols being present/absent
      const nullablePositions = [];
      for (let i = 0; i < prod.length; i++) {
        if (nullable.has(prod[i])) {
          nullablePositions.push(i);
        }
      }

      const combCount = 1 << nullablePositions.length;
      for (let mask = 0; mask < combCount; mask++) {
        const newProd = [];
        const removedPositions = new Set();

        for (let bit = 0; bit < nullablePositions.length; bit++) {
          if (mask & (1 << bit)) {
            removedPositions.add(nullablePositions[bit]);
          }
        }

        for (let i = 0; i < prod.length; i++) {
          if (!removedPositions.has(i)) {
            newProd.push(prod[i]);
          }
        }

        // Don't add empty production (unless for start symbol)
        if (newProd.length === 0) {
          if (lhs === start) {
            newRules[lhs].push(['']);
          }
          continue;
        }

        // Avoid duplicates
        const prodKey = newProd.join('\x00');
        const isDuplicate = newRules[lhs].some(p => p.join('\x00') === prodKey);
        if (!isDuplicate) {
          newRules[lhs].push(newProd);
        }
      }
    }
  }

  // If start is nullable, allow ε
  if (nullable.has(start) || nullable.has(start.replace('0', ''))) {
    const hasEpsilon = newRules[start]?.some(p => p.length === 1 && p[0] === '');
    if (!hasEpsilon) {
      if (!newRules[start]) newRules[start] = [];
      newRules[start].push(['']);
    }
  }

  return newRules;
}

/**
 * Eliminate unit productions (A → B where B is a single nonterminal).
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @returns {Object}
 */
function eliminateUnitProductions(rules, nonterminals) {
  // Build unit-pair closure for each nonterminal
  const unitPairs = {};
  for (const A of Object.keys(rules)) {
    unitPairs[A] = new Set([A]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const B of unitPairs[A]) {
        if (!rules[B]) continue;
        for (const prod of rules[B]) {
          if (prod.length === 1 && nonterminals.has(prod[0]) && !unitPairs[A].has(prod[0])) {
            unitPairs[A].add(prod[0]);
            changed = true;
          }
        }
      }
    }
  }

  const newRules = {};
  for (const A of Object.keys(rules)) {
    newRules[A] = [];
    for (const B of unitPairs[A]) {
      if (!rules[B]) continue;
      for (const prod of rules[B]) {
        // Skip unit productions
        if (prod.length === 1 && nonterminals.has(prod[0])) continue;

        const prodKey = prod.join('\x00');
        const isDuplicate = newRules[A].some(p => p.join('\x00') === prodKey);
        if (!isDuplicate) {
          newRules[A].push([...prod]);
        }
      }
    }
  }

  return newRules;
}

/**
 * Convert rules with 3+ symbols on RHS to binary rules.
 * A → B C D becomes A → B X₁, X₁ → C D
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @returns {{ rules: Object, nonterminals: Set<string> }}
 */
function binarizeRules(rules, nonterminals) {
  let freshCounter = 0;
  const newRules = {};
  const newNonterminals = new Set(nonterminals);

  function freshVar() {
    let name;
    do {
      name = `X${freshCounter++}`;
    } while (newNonterminals.has(name));
    newNonterminals.add(name);
    return name;
  }

  for (const [lhs, prods] of Object.entries(rules)) {
    newRules[lhs] = [];
    for (const prod of prods) {
      if (prod.length <= 2) {
        newRules[lhs].push([...prod]);
      } else {
        // Binarize: A → s1 s2 s3 ... sn
        // A → s1 X1, X1 → s2 X2, ..., X(n-2) → s(n-1) sn
        let current = lhs;
        for (let i = 0; i < prod.length - 2; i++) {
          const fresh = freshVar();
          if (!newRules[current]) newRules[current] = [];
          if (current === lhs) {
            newRules[lhs].push([prod[i], fresh]);
          } else {
            newRules[current] = [[prod[i], fresh]];
          }
          current = fresh;
        }
        // Last pair
        newRules[current] = [[prod[prod.length - 2], prod[prod.length - 1]]];
      }
    }
  }

  return { rules: newRules, nonterminals: newNonterminals };
}

/**
 * Separate terminal symbols in mixed rules.
 * A → aB becomes A → T_a B, T_a → a
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @param {Set<string>} terminals
 * @returns {{ rules: Object, nonterminals: Set<string>, terminals: Set<string> }}
 */
function separateTerminals(rules, nonterminals, terminals) {
  const terminalVars = new Map(); // terminal → nonterminal name
  const newNonterminals = new Set(nonterminals);
  const newRules = {};
  let counter = 0;

  function getTerminalVar(t) {
    if (terminalVars.has(t)) return terminalVars.get(t);
    let name;
    do {
      name = `T${counter++}`;
    } while (newNonterminals.has(name));
    terminalVars.set(t, name);
    newNonterminals.add(name);
    return name;
  }

  for (const [lhs, prods] of Object.entries(rules)) {
    newRules[lhs] = [];
    for (const prod of prods) {
      if (prod.length === 2) {
        // Check if any symbol is a terminal
        const newProd = prod.map(sym => {
          if (!newNonterminals.has(sym) && sym !== '' && terminals.has(sym)) {
            return getTerminalVar(sym);
          }
          return sym;
        });
        newRules[lhs].push(newProd);
      } else {
        newRules[lhs].push([...prod]);
      }
    }
  }

  // Add terminal variable rules
  for (const [terminal, varName] of terminalVars) {
    newRules[varName] = [[terminal]];
  }

  return { rules: newRules, nonterminals: newNonterminals, terminals };
}

/**
 * Remove unreachable nonterminals from the grammar.
 * @param {string} start
 * @param {Object} rules
 * @param {Set<string>} nonterminals
 * @param {Set<string>} terminals
 * @returns {{ rules: Object, nonterminals: Set<string>, terminals: Set<string> }}
 */
function removeUnreachable(start, rules, nonterminals, terminals) {
  const reachable = new Set([start]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const A of reachable) {
      if (!rules[A]) continue;
      for (const prod of rules[A]) {
        for (const sym of prod) {
          if (nonterminals.has(sym) && !reachable.has(sym)) {
            reachable.add(sym);
            changed = true;
          }
        }
      }
    }
  }

  const newRules = {};
  for (const A of reachable) {
    if (rules[A]) {
      newRules[A] = rules[A];
    }
  }

  const newNonterminals = new Set([...nonterminals].filter(n => reachable.has(n)));
  return { rules: newRules, nonterminals: newNonterminals, terminals };
}

// ═══════════════════════════════════════════════
// CYK ALGORITHM
// ═══════════════════════════════════════════════

/**
 * CYK membership algorithm.
 * Given a CNF grammar and a string, determines if the string is in the language.
 *
 * @param {CFG} cnf - Grammar in Chomsky Normal Form.
 * @param {string} w - Input string.
 * @returns {{ accepted: boolean, table: Set<string>[][] }}
 */
export function cykParse(cnf, w) {
  const { start, rules } = cnf;

  // Handle empty string
  if (w.length === 0) {
    // Check if start symbol can derive ε
    const hasEpsilon = rules[start]?.some(p => p.length === 1 && p[0] === '');
    return {
      accepted: hasEpsilon || false,
      table: []
    };
  }

  const n = w.length;

  // table[i][j] = set of nonterminals that can derive w[i..j]
  const table = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => new Set())
  );

  // Fill diagonal: single characters
  for (let i = 0; i < n; i++) {
    const ch = w[i];
    for (const [lhs, prods] of Object.entries(rules)) {
      for (const prod of prods) {
        if (prod.length === 1 && prod[0] === ch) {
          table[i][i].add(lhs);
        }
      }
    }
  }

  // Fill upper triangle (bottom-up by span length)
  for (let span = 2; span <= n; span++) {
    for (let i = 0; i <= n - span; i++) {
      const j = i + span - 1;
      for (let k = i; k < j; k++) {
        // Try all pairs of nonterminals from table[i][k] and table[k+1][j]
        for (const B of table[i][k]) {
          for (const C of table[k + 1][j]) {
            // Find rules A → B C
            for (const [A, prods] of Object.entries(rules)) {
              for (const prod of prods) {
                if (prod.length === 2 && prod[0] === B && prod[1] === C) {
                  table[i][j].add(A);
                }
              }
            }
          }
        }
      }
    }
  }

  return {
    accepted: table[0][n - 1].has(start),
    table
  };
}

/**
 * Compile a CFG specification text into a membership-testing oracle.
 *
 * @param {string} specText - CFG in BNF format.
 * @returns {{ type: 'CYK', accepts: (s: string) => boolean, meta: { cfg: CFG, cnf: CFG } }}
 * @throws {Error} If the grammar is malformed.
 */
export function compileCFG(specText) {
  const cfg = parseCFG(specText);
  const cnf = toCNF(cfg);

  /**
   * Membership test using CYK.
   * @param {string} s
   * @returns {boolean}
   */
  function accepts(s) {
    const result = cykParse(cnf, s);
    return result.accepted;
  }

  return {
    type: 'CYK',
    accepts,
    meta: {
      cfg: { ...cfg, terminals: [...cfg.terminals], nonterminals: [...cfg.nonterminals] },
      cnf: { ...cnf, terminals: [...cnf.terminals], nonterminals: [...cnf.nonterminals] },
      model: {
        start: cnf.start,
        rules: cnf.rules
      }
    }
  };
}
