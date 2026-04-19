/**
 * @fileoverview Built-in language template library for LemmaLab.
 * Provides 14 curated language examples spanning Regular and Context-Free languages.
 * Each template includes metadata for auto-populating the UI.
 * @module languages
 */

/**
 * @typedef {Object} LanguageTemplate
 * @property {string} name - Display name of the language.
 * @property {'REGULAR'|'CFL'} mode - Which pumping lemma mode to use.
 * @property {'REGEX'|'CFG'} type - Specification type.
 * @property {string|null} spec - The regex or CFG specification (null for irregular/non-CFL).
 * @property {number} p - Suggested pumping length.
 * @property {string} example - Canonical example string.
 * @property {boolean} [irregular] - True if the language is NOT in the claimed class.
 * @property {string} [note] - Educational note about the language.
 * @property {string} [alphabet] - Alphabet for generation (for irregular languages without spec).
 * @property {Function} [membership] - Manual membership test for languages without formal spec.
 */

/** @type {LanguageTemplate[]} */
export const LANGUAGE_TEMPLATES = [
  // ═══════════════════════════════════════
  // REGULAR LANGUAGES
  // ═══════════════════════════════════════
  {
    name: 'Σ* (all strings over {a,b})',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: '(a|b)*',
    p: 2,
    example: 'aabb',
    note: 'Trivially regular — every string is accepted. The Pumping Lemma cannot refute this.'
  },
  {
    name: 'a*b* (a\'s then b\'s)',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: 'a*b*',
    p: 3,
    example: 'aaabbb',
    note: 'Regular: any number of a\'s followed by any number of b\'s. Not to be confused with aⁿbⁿ.'
  },
  {
    name: '(ab)* (alternating ab pairs)',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: '(ab)*',
    p: 4,
    example: 'ababab',
    note: 'Regular: strings of the form abab...ab. Pumping within the pattern preserves membership.'
  },
  {
    name: 'Even-length strings over {a,b}',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: '((a|b)(a|b))*',
    p: 4,
    example: 'abab',
    note: 'Regular: accepted iff |w| is even. Pumping by an even-length y preserves membership.'
  },
  {
    name: 'Strings containing "aa"',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: '(a|b)*aa(a|b)*',
    p: 3,
    example: 'baaab',
    note: 'Regular: any string containing the substring "aa".'
  },
  {
    name: 'aⁿbⁿ (NOT regular)',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: null,
    p: 4,
    example: 'aaaabbbb',
    irregular: true,
    alphabet: 'ab',
    note: 'Classic irregular language. The Auto-Refuter will demonstrate that no valid decomposition survives all pump values.',
    membership: (s) => {
      if (s.length === 0) return true;
      const n = s.length;
      if (n % 2 !== 0) return false;
      const half = n / 2;
      for (let i = 0; i < half; i++) {
        if (s[i] !== 'a') return false;
      }
      for (let i = half; i < n; i++) {
        if (s[i] !== 'b') return false;
      }
      return true;
    }
  },
  {
    name: 'a* (only a\'s)',
    mode: 'REGULAR',
    type: 'REGEX',
    spec: 'a*',
    p: 2,
    example: 'aaaa',
    note: 'Regular: strings consisting entirely of a\'s, including the empty string.'
  },

  // ═══════════════════════════════════════
  // CONTEXT-FREE LANGUAGES
  // ═══════════════════════════════════════
  {
    name: 'aⁿbⁿ (CFL)',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> aSb | ε',
    p: 4,
    example: 'aaaabbbb',
    note: 'The canonical context-free language. Recognizable by a PDA but not a DFA.'
  },
  {
    name: 'Palindromes over {a,b}',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> aSa | bSb | a | b | ε',
    p: 4,
    example: 'ababa',
    note: 'Context-free: strings that read the same forwards and backwards.'
  },
  {
    name: 'Balanced parentheses',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> SS | (S) | ε',
    p: 4,
    example: '(()())',
    note: 'The Dyck language over one pair of brackets. Foundation of parsing theory.'
  },
  {
    name: 'Balanced brackets [ ]',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> SS | [S] | ε',
    p: 4,
    example: '[[[]]]',
    note: 'Dyck language variant using square brackets.'
  },
  {
    name: 'aⁿbⁿcⁿ (NOT context-free)',
    mode: 'CFL',
    type: 'CFG',
    spec: null,
    p: 4,
    example: 'aabbcc',
    irregular: true,
    alphabet: 'abc',
    note: 'Classic non-CFL. The CFL Pumping Lemma can show this is not context-free.',
    membership: (s) => {
      if (s.length === 0) return true;
      if (s.length % 3 !== 0) return false;
      const third = s.length / 3;
      for (let i = 0; i < third; i++) {
        if (s[i] !== 'a') return false;
      }
      for (let i = third; i < 2 * third; i++) {
        if (s[i] !== 'b') return false;
      }
      for (let i = 2 * third; i < s.length; i++) {
        if (s[i] !== 'c') return false;
      }
      return true;
    }
  },
  {
    name: 'wwᴿ (even palindromes)',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> aSa | bSb | ε',
    p: 4,
    example: 'abbaabba',
    note: 'Even-length palindromes: strings of the form wwᴿ where wᴿ is the reverse of w.'
  },
  {
    name: 'aⁿbᵐ where n ≤ m (CFL)',
    mode: 'CFL',
    type: 'CFG',
    spec: 'S -> aSb | B\nB -> bB | ε',
    p: 3,
    example: 'aabbb',
    note: 'Context-free: strings of a\'s followed by at least as many b\'s.'
  }
];

/**
 * Find a language template by name.
 * @param {string} name
 * @returns {LanguageTemplate|undefined}
 */
export function findTemplate(name) {
  return LANGUAGE_TEMPLATES.find(t => t.name === name);
}

/**
 * Get all templates for a given mode.
 * @param {'REGULAR'|'CFL'} mode
 * @returns {LanguageTemplate[]}
 */
export function getTemplatesForMode(mode) {
  return LANGUAGE_TEMPLATES.filter(t => t.mode === mode);
}
