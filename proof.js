/**
 * @fileoverview Proof tree construction with LaTeX and Markdown serialization.
 * Generates step-by-step formal proofs for the Pumping Lemma.
 * @module proof
 */

import { getSegments, pumpString } from './validator.js';

/**
 * @typedef {Object} ProofStep
 * @property {string} id - Unique step identifier.
 * @property {'ASSUME'|'CHOOSE'|'SPLIT'|'PUMP'|'DERIVE'|'CONCLUDE'} type
 * @property {string} latex - LaTeX representation.
 * @property {string} markdown - Markdown representation.
 * @property {string} htmlSummary - Short HTML summary for UI display.
 */

/** Step type colors for UI rendering */
export const STEP_COLORS = Object.freeze({
  ASSUME: '#3B5BDB',
  CHOOSE: '#7048E8',
  SPLIT: '#E8590C',
  PUMP: '#2F9E44',
  DERIVE: '#E03131',
  CONCLUDE: '#868E96'
});

/**
 * Build a complete proof tree from the current application state.
 *
 * @param {Object} state - Application state snapshot.
 * @param {string} state.mode - 'REGULAR' or 'CFL'.
 * @param {string} state.w - The string w.
 * @param {number[]} state.cuts - Cut positions.
 * @param {number} state.p - Pumping length.
 * @param {number} state.i - Pump value.
 * @param {{ wiInLanguage: boolean|null }} state.constraints
 * @returns {ProofStep[]}
 */
export function buildProof(state) {
  const { mode, w, cuts, p, i, constraints } = state;
  const steps = [];

  if (!w || w.length === 0) return steps;

  const isRegular = mode === 'REGULAR';
  const lemmaName = isRegular ? 'Pumping Lemma for Regular Languages' : 'Pumping Lemma for Context-Free Languages';
  const classWord = isRegular ? 'regular' : 'context-free';
  const segments = getSegments(w, cuts, mode);
  const pumpedString = pumpString(w, cuts, i, mode);
  const wiInL = constraints.wiInLanguage;

  // Step 1: ASSUME
  steps.push({
    id: 'step-1',
    type: 'ASSUME',
    latex: `\\textbf{Step 1 (Assumption).} Assume for the sake of contradiction that $L$ is ${classWord}.`,
    markdown: `**Step 1 (Assumption).** Assume for the sake of contradiction that *L* is ${classWord}.`,
    htmlSummary: `Assume <em>L</em> is ${classWord}. By the ${lemmaName}, there exists a pumping length <em>p</em> ≥ 1.`
  });

  // Step 2: ASSUME (pumping length)
  steps.push({
    id: 'step-2',
    type: 'ASSUME',
    latex: `\\textbf{Step 2 (Pumping Length).} Let $p \\geq 1$ be the pumping length given by the ${lemmaName}. Here, $p = ${p}$.`,
    markdown: `**Step 2 (Pumping Length).** Let $p \\geq 1$ be the pumping length given by the ${lemmaName}. Here, $p = ${p}$.`,
    htmlSummary: `Let <em>p</em> = ${p} be the pumping length.`
  });

  // Step 3: CHOOSE
  const wDisplay = formatStringForDisplay(w);
  steps.push({
    id: 'step-3',
    type: 'CHOOSE',
    latex: `\\textbf{Step 3 (Choose String).} Choose the string $w = \\texttt{${escapeLatex(w)}}$. Note $|w| = ${w.length} \\geq p = ${p}$.`,
    markdown: `**Step 3 (Choose String).** Choose the string $w = \\texttt{${w}}$. Note $|w| = ${w.length} \\geq p = ${p}$.`,
    htmlSummary: `Choose <em>w</em> = <code>${wDisplay}</code>. Note |<em>w</em>| = ${w.length} ≥ <em>p</em> = ${p}.`
  });

  // Step 4: SPLIT
  if (isRegular) {
    const { x, y, z } = segments;
    steps.push({
      id: 'step-4',
      type: 'SPLIT',
      latex: `\\textbf{Step 4 (Decomposition).} Consider the decomposition $w = xyz$ where:\n` +
        `\\begin{align*}\n` +
        `  x &= \\texttt{${escapeLatex(x) || '\\varepsilon'}}, \\quad |x| = ${x.length} \\\\\n` +
        `  y &= \\texttt{${escapeLatex(y) || '\\varepsilon'}}, \\quad |y| = ${y.length} \\\\\n` +
        `  z &= \\texttt{${escapeLatex(z) || '\\varepsilon'}}, \\quad |z| = ${z.length}\n` +
        `\\end{align*}\n` +
        `Verify: $|y| = ${y.length} \\geq 1$ \\checkmark, $|xy| = ${x.length + y.length} \\leq p = ${p}$ \\checkmark.`,
      markdown: `**Step 4 (Decomposition).** Consider the decomposition $w = xyz$ where:\n` +
        `- $x = \\texttt{${x || 'ε'}}$, $|x| = ${x.length}$\n` +
        `- $y = \\texttt{${y || 'ε'}}$, $|y| = ${y.length}$\n` +
        `- $z = \\texttt{${z || 'ε'}}$, $|z| = ${z.length}$\n\n` +
        `Verify: $|y| = ${y.length} \\geq 1$ ✓, $|xy| = ${x.length + y.length} \\leq p = ${p}$ ✓.`,
      htmlSummary: `Decompose <em>w</em> = <em>xyz</em> where <em>x</em>=<code>${x || 'ε'}</code>, <em>y</em>=<code>${y || 'ε'}</code>, <em>z</em>=<code>${z || 'ε'}</code>. Constraints: |<em>y</em>|=${y.length}≥1, |<em>xy</em>|=${x.length + y.length}≤${p}.`
    });
  } else {
    const { u, v, x, y, z } = segments;
    steps.push({
      id: 'step-4',
      type: 'SPLIT',
      latex: `\\textbf{Step 4 (Decomposition).} Consider the decomposition $w = uvxyz$ where:\n` +
        `\\begin{align*}\n` +
        `  u &= \\texttt{${escapeLatex(u) || '\\varepsilon'}}, \\quad v = \\texttt{${escapeLatex(v) || '\\varepsilon'}} \\\\\n` +
        `  x &= \\texttt{${escapeLatex(x) || '\\varepsilon'}}, \\quad y = \\texttt{${escapeLatex(y) || '\\varepsilon'}} \\\\\n` +
        `  z &= \\texttt{${escapeLatex(z) || '\\varepsilon'}}\n` +
        `\\end{align*}\n` +
        `Verify: $|vy| = ${v.length + y.length} \\geq 1$ \\checkmark, $|vxy| = ${v.length + x.length + y.length} \\leq p = ${p}$ \\checkmark.`,
      markdown: `**Step 4 (Decomposition).** Consider $w = uvxyz$ where:\n` +
        `- $u = \\texttt{${u || 'ε'}}$, $v = \\texttt{${v || 'ε'}}$\n` +
        `- $x = \\texttt{${x || 'ε'}}$, $y = \\texttt{${y || 'ε'}}$\n` +
        `- $z = \\texttt{${z || 'ε'}}$\n\n` +
        `Verify: $|vy| = ${v.length + y.length} \\geq 1$ ✓, $|vxy| = ${v.length + x.length + y.length} \\leq p = ${p}$ ✓.`,
      htmlSummary: `Decompose <em>w</em> = <em>uvxyz</em>. Constraints: |<em>vy</em>|=${v.length + y.length}≥1, |<em>vxy</em>|=${v.length + x.length + y.length}≤${p}.`
    });
  }

  // Step 5: PUMP
  const pumpVar = isRegular ? 'xy^iz' : 'uv^ixy^iz';
  steps.push({
    id: 'step-5',
    type: 'PUMP',
    latex: `\\textbf{Step 5 (Pump).} Let $i = ${i}$. Then $w_i = ${pumpVar} = \\texttt{${escapeLatex(pumpedString)}}$.`,
    markdown: `**Step 5 (Pump).** Let $i = ${i}$. Then $w_i = ${pumpVar} = \\texttt{${pumpedString}}$.`,
    htmlSummary: `Pump with <em>i</em> = ${i}: <em>w</em><sub>${i}</sub> = <code>${formatStringForDisplay(pumpedString)}</code>.`
  });

  // Step 6: DERIVE
  if (wiInL === false) {
    steps.push({
      id: 'step-6',
      type: 'DERIVE',
      latex: `\\textbf{Step 6 (Contradiction).} $w_{${i}} = \\texttt{${escapeLatex(pumpedString)}} \\notin L$.`,
      markdown: `**Step 6 (Contradiction).** $w_{${i}} = \\texttt{${pumpedString}} \\notin L$.`,
      htmlSummary: `<em>w</em><sub>${i}</sub> = <code>${formatStringForDisplay(pumpedString)}</code> ∉ <em>L</em>. Membership fails!`
    });

    // Step 7: CONCLUDE
    steps.push({
      id: 'step-7',
      type: 'CONCLUDE',
      latex: `\\textbf{Step 7 (Conclusion).} This contradicts the ${lemmaName}. Therefore, $L$ is \\textbf{not} ${classWord}. \\qed`,
      markdown: `**Step 7 (Conclusion).** This contradicts the ${lemmaName}. Therefore, $L$ is **not** ${classWord}. □`,
      htmlSummary: `Contradiction! <em>L</em> is <strong>not</strong> ${classWord}. □`
    });
  } else if (wiInL === true) {
    steps.push({
      id: 'step-6',
      type: 'DERIVE',
      latex: `\\textbf{Step 6 (No Contradiction).} $w_{${i}} = \\texttt{${escapeLatex(pumpedString)}} \\in L$. This decomposition does not yield a contradiction with $i = ${i}$.`,
      markdown: `**Step 6 (No Contradiction).** $w_{${i}} = \\texttt{${pumpedString}} \\in L$. This decomposition does not yield a contradiction with $i = ${i}$.`,
      htmlSummary: `<em>w</em><sub>${i}</sub> = <code>${formatStringForDisplay(pumpedString)}</code> ∈ <em>L</em>. Try a different <em>i</em> or decomposition.`
    });
  } else {
    steps.push({
      id: 'step-6',
      type: 'DERIVE',
      latex: `\\textbf{Step 6.} Membership of $w_{${i}}$ has not been determined. Compile a language specification first.`,
      markdown: `**Step 6.** Membership of $w_{${i}}$ has not been determined.`,
      htmlSummary: `Membership of <em>w</em><sub>${i}</sub> is unknown. Compile a language to test.`
    });
  }

  return steps;
}

/**
 * Escape special LaTeX characters.
 * @param {string} s
 * @returns {string}
 */
function escapeLatex(s) {
  return s.replace(/[\\{}$&#^_%~]/g, ch => '\\' + ch);
}

/**
 * Format a string for HTML display (truncate if too long).
 * @param {string} s
 * @param {number} [maxLen=40]
 * @returns {string}
 */
function formatStringForDisplay(s, maxLen = 40) {
  if (s.length <= maxLen) return s || 'ε';
  return s.substring(0, maxLen - 3) + '…';
}

/**
 * Format proof steps as a complete LaTeX document.
 * @param {ProofStep[]} steps
 * @returns {string}
 */
export function formatLatex(steps) {
  const body = steps.map(step => `  \\item ${step.latex}`).join('\n');

  return `\\documentclass[12pt]{article}
\\usepackage{amsmath,amsthm,amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}

\\title{Pumping Lemma Proof --- Generated by LemmaLab}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{proof}
\\begin{enumerate}
${body}
\\end{enumerate}
\\end{proof}

\\end{document}
`;
}

/**
 * Format proof steps as Markdown.
 * @param {ProofStep[]} steps
 * @returns {string}
 */
export function formatMarkdown(steps) {
  const lines = [
    '# Pumping Lemma Proof',
    '',
    '*Generated by LemmaLab*',
    '',
    '---',
    ''
  ];

  for (const step of steps) {
    lines.push(`> **[${step.type}]** ${step.markdown}`);
    lines.push('');
  }

  lines.push('---');
  return lines.join('\n');
}
