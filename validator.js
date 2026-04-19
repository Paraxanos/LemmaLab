/**
 * @fileoverview Constraint validation, pumping logic, and decomposition enumeration.
 * @module validator
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether all constraints are satisfied.
 * @property {string[]} violations - List of violated constraint descriptions.
 * @property {{ yNonEmpty: boolean, xyBoundedByP: boolean, vyNonEmpty?: boolean, vxyBoundedByP?: boolean }} details
 */

/**
 * Validate cut positions against the pumping lemma constraints.
 *
 * Regular mode: w = xyz, cuts = [|x|, |x|+|y|]
 *   Constraints: |y| ≥ 1, |xy| ≤ p
 *
 * CFL mode: w = uvxyz, cuts = [|u|, |u|+|v|, |u|+|v|+|x|, |u|+|v|+|x|+|y|]
 *   Constraints: |vy| ≥ 1, |vxy| ≤ p
 *
 * @param {string} w - The input string.
 * @param {number[]} cuts - Cut positions (indices into w).
 * @param {number} p - The pumping length.
 * @param {'REGULAR'|'CFL'} mode
 * @returns {ValidationResult}
 */
export function validateCuts(w, cuts, p, mode) {
  const violations = [];
  const details = {};

  if (mode === 'REGULAR') {
    const [cut1, cut2] = cuts;
    const xLen = cut1;
    const yLen = cut2 - cut1;
    const xyLen = cut2;

    details.yNonEmpty = yLen >= 1;
    details.xyBoundedByP = xyLen <= p;

    if (!details.yNonEmpty) {
      violations.push(`|y| = ${yLen} < 1: The segment y must be non-empty.`);
    }
    if (!details.xyBoundedByP) {
      violations.push(`|xy| = ${xyLen} > p = ${p}: The combined length of x and y must not exceed p.`);
    }
  } else {
    // CFL mode: w = u v x y z
    const [c1, c2, c3, c4] = cuts;
    const vLen = c2 - c1;
    const xLen = c3 - c2;
    const yLen = c4 - c3;
    const vyLen = vLen + yLen;
    const vxyLen = vLen + xLen + yLen;

    details.vyNonEmpty = vyLen >= 1;
    details.vxyBoundedByP = vxyLen <= p;

    if (!details.vyNonEmpty) {
      violations.push(`|vy| = ${vyLen} < 1: At least one of v or y must be non-empty.`);
    }
    if (!details.vxyBoundedByP) {
      violations.push(`|vxy| = ${vxyLen} > p = ${p}: The combined length of v, x, and y must not exceed p.`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    details
  };
}

/**
 * Pump the string w with given decomposition and pump value i.
 *
 * Regular: w_i = x y^i z
 * CFL: w_i = u v^i x y^i z
 *
 * @param {string} w - The input string.
 * @param {number[]} cuts - Cut positions.
 * @param {number} i - Pump count (i ≥ 0).
 * @param {'REGULAR'|'CFL'} mode
 * @returns {string} The pumped string w_i.
 */
export function pumpString(w, cuts, i, mode) {
  if (mode === 'REGULAR') {
    const [cut1, cut2] = cuts;
    const x = w.substring(0, cut1);
    const y = w.substring(cut1, cut2);
    const z = w.substring(cut2);
    return x + y.repeat(i) + z;
  } else {
    const [c1, c2, c3, c4] = cuts;
    const u = w.substring(0, c1);
    const v = w.substring(c1, c2);
    const x = w.substring(c2, c3);
    const y = w.substring(c3, c4);
    const z = w.substring(c4);
    return u + v.repeat(i) + x + y.repeat(i) + z;
  }
}

/**
 * Check membership of a string in a compiled language.
 * @param {{ type: string, accepts: Function }} compiledLang
 * @param {string} s
 * @returns {boolean}
 */
export function checkMembership(compiledLang, s) {
  if (!compiledLang || typeof compiledLang.accepts !== 'function') {
    return false;
  }
  return compiledLang.accepts(s);
}

/**
 * Get the decomposition parts as named segments.
 * @param {string} w
 * @param {number[]} cuts
 * @param {'REGULAR'|'CFL'} mode
 * @returns {Object<string, string>}
 */
export function getSegments(w, cuts, mode) {
  if (mode === 'REGULAR') {
    const [cut1, cut2] = cuts;
    return {
      x: w.substring(0, cut1),
      y: w.substring(cut1, cut2),
      z: w.substring(cut2)
    };
  } else {
    const [c1, c2, c3, c4] = cuts;
    return {
      u: w.substring(0, c1),
      v: w.substring(c1, c2),
      x: w.substring(c2, c3),
      y: w.substring(c3, c4),
      z: w.substring(c4)
    };
  }
}

/**
 * Enumerate all valid decompositions of w for the given mode and p.
 *
 * Regular: enumerate all (cut1, cut2) such that 0 ≤ cut1 < cut2 ≤ |w|, cut2 ≤ p, cut2 > cut1 (|y|≥1)
 * CFL: enumerate all (c1,c2,c3,c4) such that |vy|≥1 and |vxy|≤p
 *
 * @param {string} w
 * @param {number} p
 * @param {'REGULAR'|'CFL'} mode
 * @returns {number[][]} Array of valid cut arrays.
 */
export function enumerateDecompositions(w, p, mode) {
  const n = w.length;
  const results = [];

  if (mode === 'REGULAR') {
    // w = xyz where |y| ≥ 1 and |xy| ≤ p
    // cut1 = |x|, cut2 = |x| + |y|
    // cut2 ≤ p, cut2 > cut1
    for (let cut1 = 0; cut1 <= Math.min(p - 1, n); cut1++) {
      for (let cut2 = cut1 + 1; cut2 <= Math.min(p, n); cut2++) {
        results.push([cut1, cut2]);
      }
    }
  } else {
    // w = uvxyz where |vy| ≥ 1 and |vxy| ≤ p
    // cuts = [c1, c2, c3, c4] where c1 ≤ c2 ≤ c3 ≤ c4
    // |v| = c2-c1, |x| = c3-c2, |y| = c4-c3
    // |vy| = (c2-c1)+(c4-c3) ≥ 1
    // |vxy| = c4-c1 ≤ p
    for (let c1 = 0; c1 <= n; c1++) {
      const maxC4 = Math.min(c1 + p, n);
      for (let c4 = c1; c4 <= maxC4; c4++) {
        for (let c2 = c1; c2 <= c4; c2++) {
          for (let c3 = c2; c3 <= c4; c3++) {
            const vLen = c2 - c1;
            const yLen = c4 - c3;
            if (vLen + yLen >= 1) {
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
 * Find decompositions where pumping produces a string NOT in the language.
 * Used by the auto-refuter.
 *
 * @param {string} w - A string in the language.
 * @param {number} p - Pumping length.
 * @param {'REGULAR'|'CFL'} mode
 * @param {(s: string) => boolean} oracle - Membership test function.
 * @param {number} [maxI=8] - Maximum pump value to test.
 * @returns {Array<{cuts: number[], i: number, wiString: string}>} Failing decompositions.
 */
export function findDecompositionsThatFail(w, p, mode, oracle, maxI = 8) {
  const decompositions = enumerateDecompositions(w, p, mode);
  const failures = [];

  for (const cuts of decompositions) {
    let foundFailure = false;
    for (let i = 0; i <= maxI; i++) {
      if (i === 1) continue; // i=1 is the original string (always in L)
      const wi = pumpString(w, cuts, i, mode);
      if (!oracle(wi)) {
        failures.push({ cuts, i, wiString: wi });
        foundFailure = true;
        break;
      }
    }
    if (!foundFailure) {
      // This decomposition survives all pump values — not a counterexample
      return []; // Return empty to indicate this w is NOT a counterexample
    }
  }

  return failures;
}

/**
 * Check if a string w is a valid counterexample:
 * w ∈ L, |w| ≥ p, and EVERY valid decomposition has some i that fails.
 *
 * @param {string} w
 * @param {number} p
 * @param {'REGULAR'|'CFL'} mode
 * @param {(s: string) => boolean} oracle
 * @returns {{ isCounterexample: boolean, failures: Array }}
 */
export function isCounterexample(w, p, mode, oracle) {
  if (w.length < p) return { isCounterexample: false, failures: [] };
  if (!oracle(w)) return { isCounterexample: false, failures: [] };

  const failures = findDecompositionsThatFail(w, p, mode, oracle);
  return {
    isCounterexample: failures.length > 0,
    failures
  };
}
